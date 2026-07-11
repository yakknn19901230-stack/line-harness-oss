'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { FriendContractItem, InsuranceProductItem } from '@/lib/api'
import DateInput, { storedToDisplay, displayToStored } from './date-input'
import {
  parseNotes,
  parseFollowups,
  todayYmd,
  ymdToSlash,
  type CustomerNote,
  type Followup,
} from './customer-notes'

interface Props {
  friendId: string
  /** 見出しに出す友だちの表示名（一覧が持っている値をそのまま渡す） */
  friendName: string
  onClose: () => void
  /** 保存成功時。呼び出し側で一覧の再読込やトースト表示を行う */
  onSaved: (message: string) => void
  /** 保存失敗時（楽観的クローズ後）。呼び出し側でトースト表示し、必要なら元に戻す */
  onSaveError?: (message: string) => void
}

/**
 * 契約1件の編集状態（第22弾から friend_contracts テーブル由来）。
 * 商品は「種類→会社→商品」の3段階セレクトで商品マスターと照合するのが基本で、
 * マスターにない商品は freeMode（自由記述）で登録する。更新日は表示用 YYYY/MM/DD。
 */
interface ContractRow {
  /** React用のローカルキー */
  key: string
  /** 既存行の friend_contracts.id（新規行は undefined）。保存時に渡すと notified_at を引き継ぐ */
  id?: string
  productId: string | null
  categoryName: string | null
  companyName: string | null
  productName: string | null
  /** 自由記述（未照合時の表示名。照合済みでも元表記として保持） */
  freeTextName: string
  renewal_date: string
  /** 更新パネルの「対応済み」記録。UI では触らず素通しで保持する。 */
  notifiedAt?: string | null
  /** 3段階セレクトを開いているか（未照合の既存行と新規行は初期 true） */
  picking: boolean
  /** 「マスターにない商品」トグル（自由記述モード） */
  freeMode: boolean
  selCategory: string
  selCompany: string
}

let contractKeySeq = 0
const nextContractKey = () => `c${++contractKeySeq}`

function fromApiContract(c: FriendContractItem): ContractRow {
  return {
    key: nextContractKey(),
    id: c.id,
    productId: c.productId,
    categoryName: c.categoryName,
    companyName: c.companyName,
    productName: c.productName,
    freeTextName: c.freeTextName ?? '',
    renewal_date: storedToDisplay(toDateInputValue(c.renewalDate)),
    notifiedAt: c.notifiedAt,
    picking: c.productId === null,
    freeMode: false,
    selCategory: '',
    selCompany: '',
  }
}

/** metadata の値を <input type="date"> 用の YYYY-MM-DD に整える。
 *  "1980-05-15" でも "1980-05-15T00:00:00+09:00" でも先頭10文字を採用。
 *  日付として妥当でなければ空文字（未入力扱い）にする。 */
function toDateInputValue(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const head = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : ''
}

function asString(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

// 契約は第22弾から friend_contracts テーブル(GET /api/friends/:id/contracts)で読む。
// 旧 metadata.contracts はもう読まない(データは化石として残置)。

/**
 * 顧客情報（基本情報・契約・連絡先）を編集して friends.metadata に保存するモーダル。
 * 保存は既存の PUT /api/friends/:id/metadata（shallow merge）を利用する。
 * 連絡先（電話・メール）保存時は、既存の users API で友だち⇔ユーザーのUUIDリンクを
 * 自動実行する（LINE BAN 時の顧客データ再接続のための裏の保険）。
 */
export default function CustomerInfoModal({ friendId, friendName, onClose, onSaved, onSaveError }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [birthday, setBirthday] = useState('') // 表示用 YYYY/MM/DD
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  // 面談メモ（追記式・新しい順）と、その入力欄
  const [notes, setNotes] = useState<CustomerNote[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  // 次回フォロー予定と、その入力欄（日付は表示用 YYYY/MM/DD）
  const [followups, setFollowups] = useState<Followup[]>([])
  const [fuDate, setFuDate] = useState('')
  const [fuNote, setFuNote] = useState('')
  const [fuError, setFuError] = useState('')
  // 保存を試みたか。日付の赤枠（不正時）を出すのは保存試行後だけにする。
  const [attempted, setAttempted] = useState(false)
  // 開いた時点で friend が既にリンク済みの user_id（あれば）。二重リンクを避けるため。
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null)

  // 背景スクロールを止める（他モーダルと同じ作法）
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // 開いた時点の最新 metadata と契約(friend_contracts)を取得して初期表示に反映する。
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([api.friends.get(friendId), api.friends.contracts.list(friendId)])
      .then(([res, contractsRes]) => {
        if (cancelled) return
        if (res.success && res.data && contractsRes.success) {
          const meta = (res.data.metadata ?? {}) as Record<string, unknown>
          setBirthday(storedToDisplay(toDateInputValue(meta.birthday)))
          setContracts((contractsRes.data ?? []).map(fromApiContract))
          setPhone(asString(meta.phone))
          setEmail(asString(meta.email))
          setNotes(parseNotes(meta))
          setFollowups(parseFollowups(meta))
          setLinkedUserId(res.data.userId ?? null)
        } else {
          setError('顧客情報の読み込みに失敗しました')
        }
      })
      .catch(() => {
        if (!cancelled) setError('顧客情報の読み込みに失敗しました')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [friendId])

  // ── 商品マスター(3段階セレクトの選択肢)。null=読み込み中、[]=該当なし ──
  const [categories, setCategories] = useState<string[] | null>(null)
  const [companiesByCat, setCompaniesByCat] = useState<Record<string, string[] | null>>({})
  const [productsByKey, setProductsByKey] = useState<Record<string, InsuranceProductItem[] | null>>({})
  const productKey = (category: string, company: string) => category + '|' + company

  useEffect(() => {
    let cancelled = false
    api.insurance
      .categories()
      .then((res) => {
        if (!cancelled) setCategories(res.success ? (res.data ?? []) : [])
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadCompanies = (category: string) => {
    if (category === '' || companiesByCat[category] !== undefined) return
    setCompaniesByCat((m) => ({ ...m, [category]: null }))
    api.insurance
      .companies(category)
      .then((res) => setCompaniesByCat((m) => ({ ...m, [category]: res.success ? (res.data ?? []) : [] })))
      .catch(() => setCompaniesByCat((m) => ({ ...m, [category]: [] })))
  }

  const loadProducts = (category: string, company: string) => {
    const k = productKey(category, company)
    if (category === '' || company === '' || productsByKey[k] !== undefined) return
    setProductsByKey((m) => ({ ...m, [k]: null }))
    api.insurance
      .products(category, company)
      .then((res) => setProductsByKey((m) => ({ ...m, [k]: res.success ? (res.data ?? []) : [] })))
      .catch(() => setProductsByKey((m) => ({ ...m, [k]: [] })))
  }

  const addContract = () =>
    setContracts((cs) => [
      ...cs,
      {
        key: nextContractKey(),
        productId: null,
        categoryName: null,
        companyName: null,
        productName: null,
        freeTextName: '',
        renewal_date: '',
        picking: true,
        freeMode: false,
        selCategory: '',
        selCompany: '',
      },
    ])
  const removeContract = (key: string) => setContracts((cs) => cs.filter((c) => c.key !== key))
  const updateContract = (key: string, patch: Partial<ContractRow>) =>
    setContracts((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))

  /** 照合済み行の「変更」— セレクトを現在の種類・会社を初期値にして開く。 */
  const startPicking = (c: ContractRow) => {
    updateContract(c.key, {
      picking: true,
      freeMode: false,
      selCategory: c.categoryName ?? '',
      selCompany: c.companyName ?? '',
    })
    if (c.categoryName) {
      loadCompanies(c.categoryName)
      if (c.companyName) loadProducts(c.categoryName, c.companyName)
    }
  }

  /** 3段目(商品)を選んだら照合を確定してコンパクト表示へ戻す。 */
  const pickProduct = (key: string, category: string, company: string, productId: string) => {
    const options = productsByKey[productKey(category, company)]
    const product = (options ?? []).find((p) => p.id === productId)
    if (!product) return
    updateContract(key, {
      productId: product.id,
      categoryName: product.categoryName,
      companyName: product.companyName,
      productName: product.productName,
      picking: false,
      freeMode: false,
    })
  }

  // 面談メモを追記（日付つきで先頭＝新しい順に積む）。保存は「保存する」で確定。
  const addNote = () => {
    const text = noteDraft.trim()
    if (text === '') return
    setNotes((ns) => [{ date: todayYmd(), text }, ...ns])
    setNoteDraft('')
  }
  const removeNote = (idx: number) => setNotes((ns) => ns.filter((_, i) => i !== idx))

  // 次回フォローを追加（日付は必須・妥当性チェック、ひとことは任意）。
  const addFollowup = () => {
    const parsed = displayToStored(fuDate)
    if (!parsed.ok || parsed.value === '') {
      setFuError('日付を YYYY/MM/DD の形式で入力してください（例: 2026/12/01）')
      return
    }
    setFollowups((fs) => [...fs, { date: parsed.value, note: fuNote.trim(), done: false }])
    setFuDate('')
    setFuNote('')
    setFuError('')
  }
  const removeFollowup = (idx: number) => setFollowups((fs) => fs.filter((_, i) => i !== idx))
  const toggleFollowupDone = (idx: number) =>
    setFollowups((fs) => fs.map((f, i) => (i === idx ? { ...f, done: !f.done } : f)))

  /**
   * 連絡先から UUID リンクを張る（ベストエフォート）。
   * 失敗しても throw せず false を返す（保存全体は失敗させない）。
   */
  const ensureUuidLink = async (emailVal: string, phoneVal: string): Promise<boolean> => {
    if (!emailVal && !phoneVal) return true // 連絡先なし → リンク不要（成功扱い）
    try {
      // 1) 既存ユーザーをメール→電話の順で検索（未発見時は worker が 404 → throw）
      let user: { id: string } | null = null
      try {
        const m = await api.users.match({ email: emailVal || null, phone: phoneVal || null })
        if (m.success && m.data) user = m.data
      } catch {
        user = null // 404 等は「未発見」として扱う
      }
      // 2) 見つからなければ新規作成（displayName は友だちの表示名）
      if (!user) {
        const created = await api.users.create({
          email: emailVal || null,
          phone: phoneVal || null,
          displayName: friendName || null,
        })
        if (!created.success || !created.data) return false
        user = created.data
      }
      // 3) 既に同じユーザーにリンク済みなら何もしない
      if (linkedUserId && user.id === linkedUserId) return true
      // 4) この友だちをユーザーにリンク
      const linked = await api.users.link(user.id, friendId)
      if (linked.success) {
        setLinkedUserId(user.id)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)

    // 日付の検証（表示 YYYY/MM/DD → 保存 YYYY-MM-DD）。空は許容、不完全/不正はその場で
    // エラー表示してモーダルを閉じない（＝この時点では楽観クローズしない）。
    const bd = displayToStored(birthday)
    if (!bd.ok) {
      setError('誕生日は YYYY/MM/DD の形式で正しく入力してください（例: 1985/07/02）')
      return
    }
    const contractResults = contracts.map((c) => ({ row: c, date: displayToStored(c.renewal_date) }))
    const badIdx = contractResults.findIndex((cr) => !cr.date.ok)
    if (badIdx >= 0) {
      setError(`契約 ${badIdx + 1} 件目の更新日を YYYY/MM/DD の形式で正しく入力してください（例: 2026/09/01）`)
      return
    }

    // 契約は friend_contracts へ「丸ごと差し替え」保存(PUT /api/friends/:id/contracts)。
    // - 自由記述モード(freeMode)の行は productId を付けない
    // - productId と自由記述が両方空の行は落とす(サーバ側でも同じルールで弾く)
    // - notifiedAt は送らない: 既存行の id を渡せばサーバが素通しで引き継ぐ
    const contractsPayload = contractResults
      .map((cr) => ({
        ...(cr.row.id ? { id: cr.row.id } : {}),
        productId: cr.row.freeMode ? null : cr.row.productId,
        freeTextName: cr.row.freeTextName.trim() || null,
        renewalDate: cr.date.value || null,
      }))
      .filter((c) => c.productId !== null || c.freeTextName !== null)

    const emailVal = email.trim()
    const phoneVal = phone.trim()

    // 未確定の入力欄（メモ・フォロー）が残っていれば取りこぼさず保存に含める。
    const notesPayload =
      noteDraft.trim() !== '' ? [{ date: todayYmd(), text: noteDraft.trim() }, ...notes] : notes
    let followupsPayload = followups
    const pendingFu = displayToStored(fuDate)
    if (pendingFu.ok && pendingFu.value !== '') {
      followupsPayload = [...followups, { date: pendingFu.value, note: fuNote.trim(), done: false }]
    }

    // metadata には契約を含めない(第22弾で friend_contracts へ移行。書き込みは全廃)。
    // 旧 renewal_date(単一キー)の掃除ロジックだけ残す。
    const payload = {
      birthday: bd.value || null,
      renewal_date: null,
      phone: phoneVal || null,
      email: emailVal || null,
      notes: notesPayload,
      followups: followupsPayload,
    }

    // ── 楽観的更新 ──
    // 押した瞬間にモーダルを閉じる（体感ゼロ）。保存API と UUIDリンクは裏で実行し、
    // 成功したら一覧を更新、失敗したらトーストで知らせる（付随のリンクは並行・ベストエフォート）。
    onClose()
    void (async () => {
      try {
        // 契約(friend_contracts) → metadata の順で保存。どちらか失敗ならトースト。
        const contractsRes = await api.friends.contracts.replace(friendId, contractsPayload)
        const res = await api.friends.updateMetadata(friendId, payload)
        if (!contractsRes.success || !res.success) {
          onSaveError?.('保存に失敗しました。もう一度お試しください。')
          return
        }
        onSaved('顧客情報を保存しました')
        // 連絡先があれば UUID リンク（裏で並行・失敗しても保存は成立済み）
        ensureUuidLink(emailVal, phoneVal).catch(() => {})
      } catch {
        onSaveError?.('保存に失敗しました。通信状況をご確認ください。')
      }
    })()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー（固定） */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">顧客情報を編集</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {friendName || '名前なし'} さんの情報
          </p>
        </div>

        <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">読み込み中…</div>
          ) : (
            <>
              {/* === 基本情報 === */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">基本情報</h3>
                <div>
                  <label htmlFor="ci-birthday" className="block text-sm font-medium text-gray-800 mb-1">
                    誕生日
                  </label>
                  <DateInput
                    id="ci-birthday"
                    value={birthday}
                    onChange={setBirthday}
                    invalid={attempted && birthday.trim() !== '' && !displayToStored(birthday).ok}
                    className="w-full"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    例: 1985/07/02 ／ 数字を続けて入力すると自動で「/」が入ります。この日にお祝いメッセージを自動で送る土台になります。
                  </p>
                </div>
              </section>

              {/* === 契約 === */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">契約</h3>
                <p className="text-[11px] text-gray-400">
                  種類→会社→商品の順に選ぶと商品マスターと紐づきます。マスターにない商品は自由記述でも登録できます。複数登録OK・空でも保存できます。
                </p>

                {contracts.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">まだ契約は登録されていません。</p>
                ) : (
                  <div className="space-y-3">
                    {contracts.map((c) => {
                      const companyOptions = c.selCategory ? companiesByCat[c.selCategory] : undefined
                      const productOptions =
                        c.selCategory && c.selCompany ? productsByKey[productKey(c.selCategory, c.selCompany)] : undefined
                      return (
                        <div key={c.key} className="border border-gray-200 rounded-lg p-3 space-y-2">
                          {c.productId && !c.picking ? (
                            /* A) 照合済み: コンパクト表示 + 変更ボタン */
                            <div className="flex items-center gap-2">
                              <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                                {`${c.companyName ?? ''} ${c.productName ?? ''}`.trim()}
                              </p>
                              <button
                                type="button"
                                onClick={() => startPicking(c)}
                                className="shrink-0 min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
                              >
                                変更
                              </button>
                            </div>
                          ) : (
                            /* B) 未照合/新規: 3段階セレクト or 自由記述 */
                            <div className="space-y-2">
                              {c.id && !c.productId && c.freeTextName !== '' && (
                                <p className="text-xs text-gray-600">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 mr-1.5">
                                    未照合
                                  </span>
                                  現在の表記: {c.freeTextName}
                                </p>
                              )}
                              {c.freeMode ? (
                                <input
                                  type="text"
                                  value={c.freeTextName}
                                  onChange={(e) => updateContract(c.key, { freeTextName: e.target.value })}
                                  placeholder="例: ○○生命の医療保険 / 自動車"
                                  className="w-full min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <select
                                    value={c.selCategory}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      updateContract(c.key, { selCategory: v, selCompany: '' })
                                      loadCompanies(v)
                                    }}
                                    aria-label="保険の種類"
                                    className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                  >
                                    <option value="">
                                      {categories === null
                                        ? '種類を読み込み中…'
                                        : categories.length === 0
                                          ? '種類の登録がありません'
                                          : '種類を選択'}
                                    </option>
                                    {(categories ?? []).map((cat) => (
                                      <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={c.selCompany}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      updateContract(c.key, { selCompany: v })
                                      loadProducts(c.selCategory, v)
                                    }}
                                    disabled={c.selCategory === ''}
                                    aria-label="保険会社"
                                    className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                                  >
                                    <option value="">
                                      {c.selCategory === ''
                                        ? '先に種類を選択'
                                        : companyOptions === null || companyOptions === undefined
                                          ? '会社を読み込み中…'
                                          : companyOptions.length === 0
                                            ? '該当する会社がありません'
                                            : '会社を選択'}
                                    </option>
                                    {(companyOptions ?? []).map((company) => (
                                      <option key={company} value={company}>{company}</option>
                                    ))}
                                  </select>
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) pickProduct(c.key, c.selCategory, c.selCompany, e.target.value)
                                    }}
                                    disabled={c.selCompany === ''}
                                    aria-label="商品"
                                    className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                                  >
                                    <option value="">
                                      {c.selCompany === ''
                                        ? '先に会社を選択'
                                        : productOptions === null || productOptions === undefined
                                          ? '商品を読み込み中…'
                                          : productOptions.length === 0
                                            ? '該当する商品がありません'
                                            : '商品を選択'}
                                    </option>
                                    {(productOptions ?? []).map((p) => (
                                      <option key={p.id} value={p.id}>{p.productName}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <label className="flex items-center gap-2 text-xs text-gray-600 min-h-[44px] sm:min-h-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={c.freeMode}
                                  onChange={(e) => updateContract(c.key, { freeMode: e.target.checked })}
                                  className="w-5 h-5 sm:w-4 sm:h-4 accent-brand"
                                />
                                マスターにない商品（自由記述で登録）
                              </label>
                            </div>
                          )}
                          {/* 更新日 + 削除（現状維持） */}
                          <div className="flex items-center gap-2">
                            <DateInput
                              value={c.renewal_date}
                              onChange={(v) => updateContract(c.key, { renewal_date: v })}
                              ariaLabel="更新日"
                              invalid={attempted && c.renewal_date.trim() !== '' && !displayToStored(c.renewal_date).ok}
                              className="flex-1 sm:flex-none sm:w-[9.5rem]"
                            />
                            <button
                              type="button"
                              onClick={() => removeContract(c.key)}
                              aria-label="この契約を削除"
                              className="shrink-0 w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addContract}
                  className="min-h-[44px] px-1 text-sm font-medium text-green-700 hover:text-green-800 flex items-center gap-1"
                >
                  <span className="text-lg leading-none">＋</span>契約を追加
                </button>
              </section>

              {/* === 面談メモ === */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">メモ</h3>
                <p className="text-[11px] text-gray-400">
                  面談で聞いた話やライフイベントを残せます。追記すると日付つきで下に積まれます（新しい順）。
                </p>
                <div className="flex items-start gap-2">
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="例: お子さんが生まれる予定（秋ごろ）"
                    rows={2}
                    className="w-full flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                  />
                  <button
                    type="button"
                    onClick={addNote}
                    disabled={noteDraft.trim() === ''}
                    className="shrink-0 min-h-[44px] px-4 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-opacity"
                    style={{ backgroundColor: '#14283F' }}
                  >
                    追記
                  </button>
                </div>
                {notes.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">まだメモはありません。</p>
                ) : (
                  <ul className="space-y-2">
                    {notes.map((n, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-gray-400">{ymdToSlash(n.date) || '日付なし'}</p>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{n.text}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeNote(idx)}
                          aria-label="このメモを削除"
                          className="shrink-0 w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* === 次回フォロー === */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">次回フォロー</h3>
                <p className="text-[11px] text-gray-400">
                  「いつ・何をするか」を予定として残せます。期日が来たらダッシュボードの「今日のフォロー予定」に出ます。
                </p>
                <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                  <DateInput
                    value={fuDate}
                    onChange={setFuDate}
                    ariaLabel="フォロー予定日"
                    className="w-full sm:w-[9.5rem]"
                  />
                  <input
                    type="text"
                    value={fuNote}
                    onChange={(e) => setFuNote(e.target.value)}
                    placeholder="例: 点検の連絡"
                    className="w-full sm:flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={addFollowup}
                    className="shrink-0 min-h-[44px] px-4 rounded-lg text-sm font-medium text-white transition-opacity"
                    style={{ backgroundColor: '#14283F' }}
                  >
                    追加
                  </button>
                </div>
                {fuError && <p className="text-xs text-red-600">{fuError}</p>}
                {followups.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">まだフォロー予定はありません。</p>
                ) : (
                  <ul className="space-y-2">
                    {followups.map((f, idx) => (
                      <li key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <input
                          type="checkbox"
                          checked={f.done}
                          onChange={() => toggleFollowupDone(idx)}
                          aria-label="済みにする"
                          className="shrink-0 w-5 h-5 accent-brand"
                        />
                        <div className={`min-w-0 flex-1 ${f.done ? 'opacity-50' : ''}`}>
                          <p className={`text-sm ${f.done ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                            {ymdToSlash(f.date) || '日付なし'}
                            {f.note ? <span className="text-gray-600">　{f.note}</span> : null}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFollowup(idx)}
                          aria-label="このフォロー予定を削除"
                          className="shrink-0 w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* === 連絡先 === */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">連絡先</h3>
                <p className="text-[11px] text-gray-500 bg-green-50 border border-green-100 rounded-lg px-3 py-2 leading-relaxed">
                  電話・メールを登録しておくと、万一 LINE アカウントが使えなくなった場合も顧客データを新アカウントに引き継げます。
                </p>
                <div>
                  <label htmlFor="ci-phone" className="block text-sm font-medium text-gray-800 mb-1">
                    電話番号
                  </label>
                  <input
                    id="ci-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="例: 090-1234-5678"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label htmlFor="ci-email" className="block text-sm font-medium text-gray-800 mb-1">
                    メールアドレス
                  </label>
                  <input
                    id="ci-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="例: tanaka@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </section>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {error}
            </div>
          )}
          </div>

          {/* フッター（下部固定） */}
          <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-gray-100 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-none min-h-[44px] px-6 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#14283F' }}
            >
              保存する
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
