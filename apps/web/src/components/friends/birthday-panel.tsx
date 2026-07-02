'use client'

import { useMemo, useState } from 'react'
import type { FriendListItem } from '@/lib/api'
import { useAllFriends } from '@/hooks/use-all-friends'
import MessageSendModal from './message-send-modal'
import PanelShell from './panel-shell'

interface Props {
  /** 対象アカウント（null=全アカウント）。メインの一覧と同じスコープに合わせる。 */
  accountId: string | null
  /** 親で顧客情報が保存された等、パネルの再取得を促したいときに増やすキー。 */
  refreshKey?: number
  /** 送信成功トーストはページ側で出す */
  onToast: (message: string) => void
}

interface UpcomingBirthday {
  id: string
  name: string
  month: number
  day: number
  /** 今日から誕生日までの日数（0=今日） */
  daysUntil: number
}

/** metadata の birthday("YYYY-MM-DD") から月・日を取り出す。妥当でなければ null。 */
function parseMonthDay(raw: unknown): { month: number; day: number } | null {
  if (typeof raw !== 'string') return null
  const m = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { month, day }
}

/** 年を無視して、今日から次の誕生日（当日含む）までの日数を返す。年またぎも考慮。 */
function daysUntilBirthday(month: number, day: number, today: Date): number {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = new Date(today.getFullYear(), month - 1, day)
  let diff = Math.round((next.getTime() - t0.getTime()) / 86_400_000)
  if (diff < 0) {
    next = new Date(today.getFullYear() + 1, month - 1, day)
    diff = Math.round((next.getTime() - t0.getTime()) / 86_400_000)
  }
  return diff
}

function relativeLabel(daysUntil: number): string {
  if (daysUntil === 0) return '今日！'
  return `あと${daysUntil}日`
}

export default function BirthdayPanel({ accountId, refreshKey, onToast }: Props) {
  const { friends, loading, error } = useAllFriends(accountId, refreshKey)
  const [sendTarget, setSendTarget] = useState<{ id: string; name: string } | null>(null)

  const upcoming = useMemo<UpcomingBirthday[]>(() => {
    const today = new Date()
    const list: UpcomingBirthday[] = []
    for (const f of friends) {
      const meta = (f.metadata ?? {}) as Record<string, unknown>
      const md = parseMonthDay(meta.birthday)
      if (!md) continue
      const daysUntil = daysUntilBirthday(md.month, md.day, today)
      if (daysUntil >= 0 && daysUntil <= 7) {
        list.push({ id: f.id, name: f.displayName, month: md.month, day: md.day, daysUntil })
      }
    }
    return list.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [friends])

  const todayCount = upcoming.filter((b) => b.daysUntil === 0).length

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">🎂 今週の誕生日</h2>
        <p className="text-xs text-gray-500">誕生日の読み込みに失敗しました。時間をおいて再度お試しください。</p>
      </div>
    )
  }

  return (
    <PanelShell
      title="🎂 今週の誕生日"
      loading={loading}
      count={upcoming.length}
      unit="人"
      highlight={todayCount > 0 ? `今日${todayCount}人` : null}
      initialOpenMobile={todayCount > 0}
      borderClass="border-2 border-accent/50"
    >
      {loading ? (
        <p className="text-sm text-gray-500">誕生日を確認しています…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-gray-500">今週、誕生日の友だちはいません</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {upcoming.map((b) => (
            <div
              key={b.id}
              className="border border-accent/40 rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-b from-accent/10 to-white"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{b.name || '名前なし'}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {b.month}月{b.day}日
                  <span
                    className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                      b.daysUntil === 0 ? 'bg-accent/25 text-brand font-semibold' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {relativeLabel(b.daysUntil)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSendTarget({ id: b.id, name: b.name })}
                className="mt-auto px-3 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#14283F' }}
              >
                お祝いメッセージを送る
              </button>
            </div>
          ))}
        </div>
      )}

      {sendTarget && (
        <MessageSendModal
          friendId={sendTarget.id}
          friendName={sendTarget.name}
          initialSceneId="birthday"
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
