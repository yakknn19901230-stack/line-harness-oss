'use client'

import { useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useAllFriends } from '@/hooks/use-all-friends'
import MessageSendModal from './message-send-modal'
import PanelShell from './panel-shell'
import { parseFollowups, ymdToSlash } from './customer-notes'

interface Props {
  accountId: string | null
  refreshKey?: number
  onToast: (message: string) => void
}

interface DueFollowup {
  friendId: string
  name: string
  note: string
  /** 表示用 YYYY/MM/DD */
  dateLabel: string
  /** 今日からの日数（0=今日、負=超過） */
  days: number
  /** その友だちの followups 配列内でのインデックス（済み更新用） */
  index: number
}

/** "YYYY-MM-DD" と今日の日数差を返す（不正なら null）。0=今日、負=超過。 */
function daysFromToday(ymd: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Math.round((d.getTime() - t0.getTime()) / 86_400_000)
}

function dueLabel(days: number): string {
  if (days === 0) return '今日'
  return `${-days}日超過`
}

/**
 * 「📌 今日のフォロー予定」パネル。誕生日・更新パネルと同じ型
 * （useAllFriends + PanelShell）で、metadata.followups のうち
 * done=false かつ 期日が今日以前（超過含む）を集めて表示する。
 */
export default function FollowupPanel({ accountId, refreshKey, onToast }: Props) {
  const [localBump, setLocalBump] = useState(0)
  const combinedKey = (refreshKey ?? 0) + localBump
  const { friends, loading, error } = useAllFriends(accountId, combinedKey)
  const [sendTarget, setSendTarget] = useState<{ id: string; name: string } | null>(null)
  // 「済みにする」を押した項目をその場で消すための楽観的セット（key = friendId:index）。
  const [handled, setHandled] = useState<Set<string>>(new Set())

  const due = useMemo<DueFollowup[]>(() => {
    const today = new Date()
    const list: DueFollowup[] = []
    for (const f of friends) {
      const meta = (f.metadata ?? {}) as Record<string, unknown>
      const followups = parseFollowups(meta)
      followups.forEach((fu, index) => {
        if (fu.done) return
        const days = daysFromToday(fu.date, today)
        if (days === null || days > 0) return // 未来はまだ出さない
        if (handled.has(`${f.id}:${index}`)) return
        list.push({
          friendId: f.id,
          name: f.displayName,
          note: fu.note,
          dateLabel: ymdToSlash(fu.date),
          days,
          index,
        })
      })
    }
    // 超過が大きいものほど上（days 昇順＝より過去が先頭）。
    return list.sort((a, b) => a.days - b.days)
  }, [friends, handled])

  const overdueCount = due.filter((d) => d.days < 0).length

  /** その場で done=true にして永続化。楽観的に当日パネルから消す。 */
  const markDone = async (item: DueFollowup) => {
    const key = `${item.friendId}:${item.index}`
    setHandled((prev) => new Set(prev).add(key)) // 先に消す（楽観的）
    const friend = friends.find((f) => f.id === item.friendId)
    const current = parseFollowups((friend?.metadata ?? {}) as Record<string, unknown>)
    const next = current.map((f, i) => (i === item.index ? { ...f, done: true } : f))
    try {
      const res = await api.friends.updateMetadata(item.friendId, { followups: next })
      if (res.success) {
        onToast(`${item.name || 'この顧客'}のフォローを「済み」にしました`)
      } else {
        // 失敗したら楽観的除外を取り消す
        setHandled((prev) => { const s = new Set(prev); s.delete(key); return s })
        onToast('更新に失敗しました。もう一度お試しください。')
      }
    } catch {
      setHandled((prev) => { const s = new Set(prev); s.delete(key); return s })
      onToast('更新に失敗しました。通信状況をご確認ください。')
    }
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">📌 今日のフォロー予定</h2>
        <p className="text-xs text-gray-500">読み込みに失敗しました。時間をおいて再度お試しください。</p>
      </div>
    )
  }

  return (
    <PanelShell
      title="📌 今日のフォロー予定"
      loading={loading}
      count={due.length}
      unit="件"
      highlight={overdueCount > 0 ? `超過${overdueCount}件` : null}
      initialOpenMobile={due.length > 0}
      borderClass="border-2 border-accent/50"
    >
      {loading ? (
        <p className="text-sm text-gray-500">フォロー予定を確認しています…</p>
      ) : due.length === 0 ? (
        <p className="text-sm text-gray-500">今日のフォロー予定はありません</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {due.map((d) => (
            <div
              key={`${d.friendId}-${d.index}`}
              className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-b from-accent/10 to-white"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{d.name || '名前なし'}</p>
                <p className="text-xs text-gray-700 mt-0.5 break-words">{d.note || '（ひとことなし）'}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  期日 {d.dateLabel}
                  <span
                    className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                      d.days < 0 ? 'bg-red-100 text-red-700 font-semibold' : 'bg-accent/25 text-brand font-semibold'
                    }`}
                  >
                    {dueLabel(d.days)}
                  </span>
                </p>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSendTarget({ id: d.friendId, name: d.name })}
                  className="flex-1 px-3 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#14283F' }}
                >
                  メッセージを送る
                </button>
                <button
                  type="button"
                  onClick={() => markDone(d)}
                  className="shrink-0 min-h-[44px] px-3 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  済みにする
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sendTarget && (
        <MessageSendModal
          friendId={sendTarget.id}
          friendName={sendTarget.name}
          initialSceneId="reconnect"
          onClose={() => setSendTarget(null)}
          onSent={(message) => {
            onToast(message)
            setSendTarget(null)
          }}
        />
      )}
    </PanelShell>
  )
}
