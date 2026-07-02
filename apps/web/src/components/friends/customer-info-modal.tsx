'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import DateInput, { storedToDisplay, displayToStored } from './date-input'

interface Props {
  friendId: string
  /** 見出しに出す友だちの表示名（一覧が持っている値をそのまま渡す） */
  friendName: string
  onClose: () => void
  /** 保存成功時。呼び出し側で一覧の再読込やトースト表示を行う */
  onSaved: (message: string) => void
}

/** 契約1件の編集状態。契約名は自由入力、更新日は YYYY-MM-DD（未入力なら空）。 */
interface ContractRow {
  name: string
  renewal_date: string
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

/** metadata から契約リストを組み立てる（renewal_date は表示用 YYYY/MM/DD にして返す）。
 *  - contracts 配列があればそれを使う。
 *  - 無くて旧 renewal_date（単一キー）があれば、契約1行目（名前空）として移行表示する。 */
function loadContracts(meta: Record<string, unknown>): ContractRow[] {
  const raw = meta.contracts
  if (Array.isArray(raw)) {
    return raw
      .map((c) => {
        const obj = (c ?? {}) as Record<string, unknown>
        return { name: asString(obj.name), renewal_date: storedToDisplay(toDateInputValue(obj.renewal_date)) }
      })
      // 完全に空の行は読み込み時に落とす
      .filter((c) => c.name.trim() !== '' || c.renewal_date !== '')
  }
  const legacy = toDateInputValue(meta.renewal_date)
  if (legacy) return [{ name: '', renewal_date: storedToDisplay(legacy) }]
  return []
}

/**
 * 顧客情報（基本情報・契約・連絡先）を編集して friends.metadata に保存するモーダル。
 * 保存は既存の PUT /api/friends/:id/metadata（shallow merge）を利用する。
 * 連絡先（電話・メール）保存時は、既存の users API で友だち⇔ユーザーのUUIDリンクを
 * 自動実行する（LINE BAN 時の顧客データ再接続のための裏の保険）。
 */
export default function CustomerInfoModal({ friendId, friendName, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [birthday, setBirthday] = useState('') // 表示用 YYYY/MM/DD
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
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

  // 開いた時点の最新 metadata を取得して初期表示に反映する。
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.friends
      .get(friendId)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          const meta = (res.data.metadata ?? {}) as Record<string, unknown>
          setBirthday(storedToDisplay(toDateInputValue(meta.birthday)))
          setContracts(loadContracts(meta))
          setPhone(asString(meta.phone))
          setEmail(asString(meta.email))
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

  const addContract = () => setContracts((cs) => [...cs, { name: '', renewal_date: '' }])
  const removeContract = (idx: number) => setContracts((cs) => cs.filter((_, i) => i !== idx))
  const updateContract = (idx: number, patch: Partial<ContractRow>) =>
    setContracts((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)))

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)

    // 日付の検証（表示 YYYY/MM/DD → 保存 YYYY-MM-DD）。空は許容、不完全/不正はその場でエラー。
    const bd = displayToStored(birthday)
    if (!bd.ok) {
      setError('誕生日は YYYY/MM/DD の形式で正しく入力してください（例: 1985/07/02）')
      return
    }
    const contractResults = contracts.map((c) => ({ name: c.name.trim(), date: displayToStored(c.renewal_date) }))
    const badIdx = contractResults.findIndex((cr) => !cr.date.ok)
    if (badIdx >= 0) {
      setError(`契約 ${badIdx + 1} 件目の更新日を YYYY/MM/DD の形式で正しく入力してください（例: 2026/09/01）`)
      return
    }

    setSaving(true)
    setError('')
    try {
      // 契約: 完全に空の行は落として配列化。更新日は YYYY-MM-DD で保存。
      const contractsPayload = contractResults
        .map((cr) => ({ name: cr.name, renewal_date: cr.date.value }))
        .filter((c) => c.name !== '' || c.renewal_date !== '')

      const emailVal = email.trim()
      const phoneVal = phone.trim()

      // 1) metadata 保存。旧 renewal_date（単一キー）は contracts へ移行済みなので削除(null)。
      const res = await api.friends.updateMetadata(friendId, {
        birthday: bd.value || null,
        contracts: contractsPayload,
        renewal_date: null,
        phone: phoneVal || null,
        email: emailVal || null,
      })
      if (!res.success) {
        setError(res.error || '保存に失敗しました')
        return
      }

      // 2) 連絡先があれば UUID リンク（ベストエフォート）
      const linkOk = await ensureUuidLink(emailVal, phoneVal)

      onSaved(
        linkOk
          ? '顧客情報を保存しました'
          : '連絡先は保存しましたが、バックアップ用の紐付けに失敗しました',
      )
      onClose()
    } catch {
      setError('保存に失敗しました。通信状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">顧客情報を編集</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {friendName || '名前なし'} さんの情報
          </p>
        </div>

        <form onSubmit={handleSave} className="px-5 py-4 space-y-6">
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
                  何の保険か（自由に記入）と、更新日を登録できます。複数登録OK・空でも保存できます。
                </p>

                {contracts.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">まだ契約は登録されていません。</p>
                ) : (
                  <div className="space-y-2">
                    {contracts.map((c, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => updateContract(idx, { name: e.target.value })}
                          placeholder="例: ソニー生命の医療 / 自動車"
                          className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <DateInput
                          value={c.renewal_date}
                          onChange={(v) => updateContract(idx, { renewal_date: v })}
                          ariaLabel="更新日"
                          invalid={attempted && c.renewal_date.trim() !== '' && !displayToStored(c.renewal_date).ok}
                          className="w-[9.5rem] shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => removeContract(idx)}
                          aria-label="この契約を削除"
                          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addContract}
                  className="text-xs font-medium text-green-700 hover:text-green-800 flex items-center gap-1"
                >
                  <span className="text-sm leading-none">＋</span>契約を追加
                </button>
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#14283F' }}
            >
              {saving ? '保存中…' : '保存する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
