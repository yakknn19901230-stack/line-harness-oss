'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  friendId: string
  /** 見出しに出す友だちの表示名（一覧が持っている値をそのまま渡す） */
  friendName: string
  onClose: () => void
  /** 保存成功時。呼び出し側で一覧の再読込やトースト表示を行う */
  onSaved: (message: string) => void
}

/** metadata の値を <input type="date"> 用の YYYY-MM-DD に整える。
 *  "1980-05-15" でも "1980-05-15T00:00:00+09:00" でも先頭10文字を採用。
 *  日付として妥当でなければ空文字（未入力扱い）にする。 */
function toDateInputValue(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const head = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : ''
}

/**
 * 顧客情報（誕生日・契約更新日）を手入力して friends.metadata に保存するモーダル。
 * 保存は既存の PUT /api/friends/:id/metadata（shallow merge）を利用するため、
 * ここで触らない他の metadata キーはそのまま保持される。
 */
export default function CustomerInfoModal({ friendId, friendName, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [birthday, setBirthday] = useState('')
  const [renewalDate, setRenewalDate] = useState('')

  // 背景スクロールを止める（他モーダルと同じ作法）
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // 開いた時点の最新 metadata を取得して初期表示に反映する。
  // 一覧アイテムの metadata に依存せず、常に現在値を出せるよう get で取り直す。
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
          setBirthday(toDateInputValue(meta.birthday))
          setRenewalDate(toDateInputValue(meta.renewal_date))
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      // 空欄は null で送る＝「未設定」にする（後の誕生日配信・更新日一覧では
      // 値が入っているものだけを対象にできる）。入力済みは YYYY-MM-DD で保存。
      const res = await api.friends.updateMetadata(friendId, {
        birthday: birthday || null,
        renewal_date: renewalDate || null,
      })
      if (res.success) {
        onSaved('顧客情報を保存しました')
        onClose()
      } else {
        setError(res.error || '保存に失敗しました')
      }
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

        <form onSubmit={handleSave} className="px-5 py-4 space-y-5">
          <p className="text-xs text-gray-500 leading-relaxed bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            誕生日や契約更新日を登録しておくと、あとで「誕生日のお祝いメッセージ」や
            「更新が近いお客さまの一覧」に活用できます。どちらも空のままでも保存できます😊
          </p>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">読み込み中…</div>
          ) : (
            <>
              {/* 誕生日 */}
              <div>
                <label htmlFor="ci-birthday" className="block text-sm font-medium text-gray-800 mb-1">
                  誕生日
                </label>
                <input
                  id="ci-birthday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  例: 1980-05-15 ／ この日にお祝いメッセージを自動で送る土台になります。
                </p>
              </div>

              {/* 契約更新日 */}
              <div>
                <label htmlFor="ci-renewal" className="block text-sm font-medium text-gray-800 mb-1">
                  契約更新日
                </label>
                <input
                  id="ci-renewal"
                  type="date"
                  value={renewalDate}
                  onChange={(e) => setRenewalDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  例: 2026-09-01 ／ この日が近づくと、あとで一覧でお知らせできます。
                </p>
              </div>
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
              style={{ backgroundColor: '#06C755' }}
            >
              {saving ? '保存中…' : '保存する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
