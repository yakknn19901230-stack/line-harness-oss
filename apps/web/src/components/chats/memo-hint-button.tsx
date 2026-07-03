'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { parseNotes, ymdToSlash, type CustomerNote } from '@/components/friends/customer-notes'

interface Props {
  /** 表示中の顧客ID（面談メモ metadata.notes の取得に使う）。 */
  friendId: string
}

/** ヒントとして見せる直近件数。 */
const HINT_LIMIT = 3

/**
 * 個別チャットの入力欄近くに置く「📝 面談メモ」ボタン。
 * タップすると、その顧客の面談メモ（第8弾・日付つき追記式）の直近3件を開いて見られる。
 * 場面文面を挿入した後に、メモを見ながら手で一言添えるための「参照専用」表示。
 * この画面からのメモ編集はしない（既存の編集動線＝顧客カルテはそのまま）。
 */
export default function MemoHintButton({ friendId }: Props) {
  const [open, setOpen] = useState(false)
  // notes=null は「未取得」、[] は「取得済みで0件」を区別する。
  const [notes, setNotes] = useState<CustomerNote[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // 顧客が切り替わったら閉じて取得済みメモを捨てる（前の顧客のメモを見せない）。
  useEffect(() => {
    setOpen(false)
    setNotes(null)
    setError(false)
  }, [friendId])

  // 初回に開いたときだけ取得する（全チャットを先読みしない）。
  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && notes === null && !loading) {
      setLoading(true)
      setError(false)
      try {
        const res = await api.friends.get(friendId)
        if (res.success && res.data) {
          const meta = (res.data as { metadata?: Record<string, unknown> }).metadata ?? {}
          setNotes(parseNotes(meta))
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
  }

  const recent = notes ? notes.slice(0, HINT_LIMIT) : []

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        📝 面談メモ
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        // flex-wrap 親の中で全幅の行を作る（ボタン群の下に展開される）。
        <div className="w-full mt-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
          {loading ? (
            <p className="text-xs text-gray-500">メモを読み込んでいます…</p>
          ) : error ? (
            <p className="text-xs text-gray-500">メモを読み込めませんでした。時間をおいて再度お試しください。</p>
          ) : recent.length === 0 ? (
            <p className="text-xs text-gray-500">メモはまだありません</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((n, i) => (
                <li key={i} className="text-xs">
                  <span className="inline-block text-[11px] font-medium text-gray-400 mb-0.5">
                    {ymdToSlash(n.date) || '日付なし'}
                  </span>
                  <p className="text-gray-700 whitespace-pre-wrap break-words">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-gray-400 mt-2">直近{HINT_LIMIT}件を表示しています（編集は顧客カルテから）</p>
        </div>
      )}
    </>
  )
}
