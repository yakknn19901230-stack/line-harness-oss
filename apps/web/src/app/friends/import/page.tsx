'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { normalizeWidth, normalizeDate, normalizePhone } from '@line-crm/shared'
import { api } from '@/lib/api'
import type { ImportRowPayload, ImportResultData } from '@/lib/api'
import { useAllFriends } from '@/hooks/use-all-friends'
import { useAccount } from '@/contexts/account-context'

// 第25弾: CSV/Excelインポート。
// パース・正規化・検証はすべてこのページ(ブラウザ)で行い、確定時に
// 正規化済みJSONを POST /api/friends/import へ送る(ファイルはWorkerに送らない)。
// 列は固定日本語ヘッダーのテンプレート方式(insurance-assistantのUX踏襲)。
// 主用途はPCを想定(モバイルでも崩れないようテーブルは横スクロール)。

/** テンプレートの列(この順)。契約は1〜3の繰り返し。 */
const HEADERS = [
  '顧客名',
  'フリガナ',
  '生年月日',
  '電話番号',
  'メール',
  'メモ',
  '契約1_保険種類',
  '契約1_保険会社',
  '契約1_商品名',
  '契約1_更新日',
  '契約2_保険種類',
  '契約2_保険会社',
  '契約2_商品名',
  '契約2_更新日',
  '契約3_保険種類',
  '契約3_保険会社',
  '契約3_商品名',
  '契約3_更新日',
] as const

const TEMPLATE_EXAMPLE = [
  '山田太郎',
  'ヤマダタロウ',
  '1990-12-30',
  '090-1234-5678',
  'taro@example.com',
  'お子さんが小学校入学',
  '変額保険',
  'ソニー生命',
  'バリアブルライフ 変額保険（終身型/無配当）',
  '2027-08-01',
  '', '', '', '',
  '', '', '', '',
]

/** サーバー側と同じ上限(routes/friends-import.ts の IMPORT_MAX_ROWS)。 */
const MAX_ROWS = 500

interface SkippedRow {
  row: number // CSVの行番号(ヘッダー=1行目、データは2行目から)
  reason: string
}

interface ImportPreview {
  rows: ImportRowPayload[]
  /** rows[i] が元CSVの何行目か(サーバーのskip行番号をCSV行番号へ引き直す用) */
  csvRowNumbers: number[]
  newCount: number
  existingCount: number
  contractCount: number
  skipped: SkippedRow[]
  fileName: string
}

function toCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** テンプレートCSV(ヘッダー+記入例1行)をダウンロードさせる。 */
function downloadTemplate() {
  const lines = [HEADERS.join(','), TEMPLATE_EXAMPLE.map(toCsvCell).join(',')]
  // Excelで文字化けしないようUTF-8 BOMを付ける
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '顧客インポートテンプレート.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/** ファイルをヘッダー付きの文字列レコード配列にパースする(CSV=papaparse / xlsx=SheetJS)。 */
async function parseFile(file: File): Promise<Record<string, string>[]> {
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx')
  if (isXlsx) {
    // xlsxはバンドルが重いので動的import
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('xlsxファイルにシートがありません。')
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: '',
      raw: false,
    })
    return raw.map((r) => {
      const row: Record<string, string> = {}
      for (const h of HEADERS) row[h] = String(r[h] ?? '').trim()
      return row
    })
  }
  const Papa = (await import('papaparse')).default
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: (err) => reject(err),
    })
  })
}

/** 1行を検証+正規化してAPIペイロードへ。不正はreasonを返す。 */
function convertRow(raw: Record<string, string>): { payload: ImportRowPayload } | { reason: string } {
  const displayName = normalizeWidth((raw['顧客名'] ?? '').trim())
  if (!displayName) return { reason: '顧客名が未入力です。' }

  const birthdayRaw = normalizeWidth((raw['生年月日'] ?? '').trim())
  const birthday = birthdayRaw ? normalizeDate(birthdayRaw) : null
  if (birthdayRaw && !birthday) return { reason: '生年月日の形式が不正です。' }

  const contracts: NonNullable<ImportRowPayload['contracts']> = []
  for (const n of [1, 2, 3] as const) {
    const categoryName = normalizeWidth((raw[`契約${n}_保険種類`] ?? '').trim())
    const companyName = normalizeWidth((raw[`契約${n}_保険会社`] ?? '').trim())
    const productName = normalizeWidth((raw[`契約${n}_商品名`] ?? '').trim())
    const renewalRaw = normalizeWidth((raw[`契約${n}_更新日`] ?? '').trim())
    if (!categoryName && !companyName && !productName && !renewalRaw) continue
    if (!productName) return { reason: `契約${n}: 商品名が必須です。` }
    const renewalDate = renewalRaw ? normalizeDate(renewalRaw) : null
    if (renewalRaw && !renewalDate) return { reason: `契約${n}: 更新日の形式が不正です。` }
    contracts.push({
      categoryName: categoryName || null,
      companyName: companyName || null,
      productName,
      renewalDate,
    })
  }

  const memo = (raw['メモ'] ?? '').trim()
  const furigana = normalizeWidth((raw['フリガナ'] ?? '').trim())
  const email = normalizeWidth((raw['メール'] ?? '').trim())
  return {
    payload: {
      displayName,
      furigana: furigana || null,
      birthday,
      phone: normalizePhone(raw['電話番号']),
      email: email || null,
      memo: memo || null,
      ...(contracts.length > 0 ? { contracts } : {}),
    },
  }
}

export default function FriendsImportPage() {
  // 取り込み先アカウント(未指定だと一覧・今日の保全のアカウント絞り込みに表示されない)
  const { selectedAccountId } = useAccount()
  // 新規/既存の内訳プレビュー用に全友だちを1回取得(サーバー側と同じ「表示名+誕生日」キー)
  const allFriends = useAllFriends(selectedAccountId)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<(ImportResultData & { skippedAll: SkippedRow[] }) | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const existingKeys = useMemo(() => {
    const set = new Set<string>()
    for (const f of allFriends.friends) {
      const name = (f.displayName ?? '').trim()
      if (!name) continue
      const meta = (f.metadata ?? {}) as Record<string, unknown>
      const birthday = typeof meta.birthday === 'string' ? meta.birthday : ''
      set.add(`${name}||${birthday}`)
    }
    return set
  }, [allFriends.friends])

  const onFileSelected = async (file: File | null) => {
    if (!file) return
    setError('')
    setResult(null)
    setPreview(null)
    setParsing(true)
    try {
      const records = await parseFile(file)
      if (records.length === 0) throw new Error('データ行がありません。テンプレートに沿って入力してください。')

      const rows: ImportRowPayload[] = []
      const csvRowNumbers: number[] = []
      const skipped: SkippedRow[] = []
      const seenKeys = new Set<string>()
      let newCount = 0
      let existingCount = 0
      let contractCount = 0

      records.forEach((raw, index) => {
        const csvRow = index + 2 // 1行目はヘッダー
        const converted = convertRow(raw)
        if ('reason' in converted) {
          skipped.push({ row: csvRow, reason: converted.reason })
          return
        }
        const p = converted.payload
        rows.push(p)
        csvRowNumbers.push(csvRow)
        contractCount += p.contracts?.length ?? 0
        const key = `${p.displayName}||${p.birthday ?? ''}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          if (existingKeys.has(key)) existingCount += 1
          else newCount += 1
        }
      })

      if (rows.length === 0) {
        throw new Error('取り込める行がありません。スキップ理由をご確認ください。')
      }
      if (rows.length > MAX_ROWS) {
        throw new Error(`一度に取り込めるのは${MAX_ROWS}行までです(有効${rows.length}行)。ファイルを分割してください。`)
      }

      setPreview({ rows, csvRowNumbers, newCount, existingCount, contractCount, skipped, fileName: file.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ファイルの解析に失敗しました。')
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const runImport = async () => {
    if (!preview || importing) return
    setImporting(true)
    setError('')
    try {
      const res = await api.friends.import(preview.rows, selectedAccountId)
      if (!res.success) throw new Error(res.error || 'インポートに失敗しました。')
      // サーバー側skipの行番号(送信配列の1始まり)を元CSVの行番号へ引き直す
      const serverSkipped = res.data.skipped.map((s) => ({
        row: preview.csvRowNumbers[s.row - 1] ?? s.row,
        reason: s.reason,
      }))
      setResult({ ...res.data, skippedAll: [...preview.skipped, ...serverSkipped] })
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'インポートに失敗しました。通信状況をご確認ください。')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">顧客リストのインポート</h1>
        <p className="text-sm text-gray-500 mt-1">
          CSV / Excel(.xlsx)から顧客と契約をまとめて取り込みます。取り込んだ顧客は「LINE未連携」として作成されます
        </p>
        <Link href="/friends" className="text-sm text-brand underline mt-1 inline-block">← 友だち管理へ戻る</Link>
      </div>

      {/* 手順1: テンプレート */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">1. テンプレートに記入する</h2>
        <p className="text-xs text-gray-500 mb-3">
          列の並びはテンプレートのとおりにしてください(顧客名は必須。契約は1人につき3件まで。
          日付は「1990-12-30」「H2.12.30」「平成2年12月30日」などの表記に対応)
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          テンプレートCSVをダウンロード
        </button>
      </div>

      {/* 手順2: ファイル選択 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">2. ファイルを選ぶ</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          disabled={parsing || importing}
          onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          className="block text-sm text-gray-700 file:mr-3 file:min-h-[44px] file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:text-white file:bg-brand file:cursor-pointer"
        />
        {parsing && <p className="text-sm text-gray-500 mt-2">ファイルを解析しています…</p>}
        {allFriends.loading && <p className="text-xs text-gray-400 mt-2">既存顧客の照合データを読み込み中…(プレビューの内訳に使います)</p>}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* 手順3: プレビュー → 実行 */}
      {preview && (
        <div className="bg-white rounded-lg border-2 border-brand/30 p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">3. 内容を確認して実行する</h2>
          <p className="text-xs text-gray-500 mb-3">{preview.fileName}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{preview.newCount}</p>
              <p className="text-xs text-gray-500">新規のお客様</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{preview.existingCount}</p>
              <p className="text-xs text-gray-500">既存への追記</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{preview.contractCount}</p>
              <p className="text-xs text-gray-500">契約</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{preview.skipped.length}</p>
              <p className="text-xs text-gray-500">スキップ行</p>
            </div>
          </div>

          {preview.skipped.length > 0 && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-800 mb-1">スキップされる行(取り込まれません)</p>
              <ul className="text-xs text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">
                {preview.skipped.map((s, i) => (
                  <li key={i}>{s.row}行目: {s.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 先頭数件の中身プレビュー(横スクロール) */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg mb-3">
            <table className="text-xs whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">顧客名</th>
                  <th className="px-3 py-2 text-left">生年月日</th>
                  <th className="px-3 py-2 text-left">電話</th>
                  <th className="px-3 py-2 text-left">契約</th>
                  <th className="px-3 py-2 text-left">メモ</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2">{r.displayName}</td>
                    <td className="px-3 py-2">{r.birthday ?? '—'}</td>
                    <td className="px-3 py-2">{r.phone ?? '—'}</td>
                    <td className="px-3 py-2">{r.contracts?.map((ct) => ct.productName).join(' / ') || '—'}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate">{r.memo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 5 && (
            <p className="text-xs text-gray-400 mb-3">…ほか{preview.rows.length - 5}行</p>
          )}

          <button
            type="button"
            onClick={runImport}
            disabled={importing}
            className="min-h-[44px] px-6 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#14283F' }}
          >
            {importing ? 'インポート中…' : `インポート実行(${preview.rows.length}行)`}
          </button>
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div className="bg-white rounded-lg border-2 border-accent/50 p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">✅ インポートが完了しました</h2>
          <p className="text-sm text-gray-700 mb-2">
            新規 {result.created}人 / 既存への追記 {result.updated}人 / 契約 {result.contractsAdded}件
            {result.skippedAll.length > 0 && ` / スキップ ${result.skippedAll.length}行`}
          </p>
          {result.unmatchedProducts.length > 0 && (
            <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-medium text-blue-800 mb-1">
                商品マスターと照合できなかった商品({result.unmatchedProducts.length}件)は「未照合」で取り込みました。
                顧客情報の契約欄で選び直せます。
              </p>
              <p className="text-xs text-blue-800">{result.unmatchedProducts.join(' / ')}</p>
            </div>
          )}
          {result.skippedAll.length > 0 && (
            <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-800 mb-1">スキップした行</p>
              <ul className="text-xs text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">
                {result.skippedAll.map((s, i) => (
                  <li key={i}>{s.row}行目: {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <Link
            href="/friends"
            className="inline-flex items-center min-h-[44px] px-4 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            友だち管理で確認する
          </Link>
        </div>
      )}
    </div>
  )
}
