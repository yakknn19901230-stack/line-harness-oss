'use client'

import { useMemo, useState } from 'react'
import { useAllFriends } from '@/hooks/use-all-friends'
import MessageSendModal from './message-send-modal'
import PanelShell from './panel-shell'

interface Props {
  accountId: string | null
  refreshKey?: number
  onToast: (message: string) => void
}

interface UpcomingRenewal {
  friendId: string
  name: string
  contractName: string
  /** 表示用 YYYY/MM/DD */
  dateLabel: string
  /** 今日から更新日までの日数（0=今日） */
  daysUntil: number
}

const WINDOW_DAYS = 60

/** "YYYY-MM-DD" から今日までの日数差を返す（不正なら null）。 */
function daysUntilDate(ymd: unknown, today: Date): { days: number; label: string } | null {
  if (typeof ymd !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.slice(0, 10))
  if (!m) return null
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const days = Math.round((d.getTime() - t0.getTime()) / 86_400_000)
  return { days, label: `${m[1]}/${m[2]}/${m[3]}` }
}

function relativeLabel(days: number): string {
  if (days === 0) return '今日'
  return `あと${days}日`
}

export default function RenewalPanel({ accountId, refreshKey, onToast }: Props) {
  const { friends, loading, error } = useAllFriends(accountId, refreshKey)
  const [sendTarget, setSendTarget] = useState<{ id: string; name: string } | null>(null)

  const upcoming = useMemo<UpcomingRenewal[]>(() => {
    const today = new Date()
    const list: UpcomingRenewal[] = []
    for (const f of friends) {
      const meta = (f.metadata ?? {}) as Record<string, unknown>
      const contracts = Array.isArray(meta.contracts) ? meta.contracts : []
      for (const c of contracts) {
        const obj = (c ?? {}) as Record<string, unknown>
        const parsed = daysUntilDate(obj.renewal_date, today)
        if (!parsed) continue
        if (parsed.days >= 0 && parsed.days <= WINDOW_DAYS) {
          list.push({
            friendId: f.id,
            name: f.displayName,
            contractName: typeof obj.name === 'string' && obj.name ? obj.name : '契約',
            dateLabel: parsed.label,
            daysUntil: parsed.days,
          })
        }
      }
    }
    return list.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [friends])

  const todayCount = upcoming.filter((r) => r.daysUntil === 0).length

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">🔔 契約更新が近い顧客</h2>
        <p className="text-xs text-gray-500">読み込みに失敗しました。時間をおいて再度お試しください。</p>
      </div>
    )
  }

  return (
    <PanelShell
      title="🔔 契約更新が近い顧客"
      loading={loading}
      count={upcoming.length}
      unit="件"
      highlight={todayCount > 0 ? `今日${todayCount}件` : null}
      initialOpenMobile={todayCount > 0}
      borderClass="border-2 border-brand/30"
    >
      {loading ? (
        <p className="text-sm text-gray-500">契約更新を確認しています…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-gray-500">60日以内に更新を迎える契約はありません</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {upcoming.map((r, i) => (
            <div
              key={`${r.friendId}-${i}`}
              className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-b from-brand/5 to-white"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.name || '名前なし'}</p>
                <p className="text-xs text-gray-600 mt-0.5 truncate">{r.contractName}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  更新 {r.dateLabel}
                  <span
                    className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                      r.daysUntil <= 14 ? 'bg-accent/25 text-brand font-semibold' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {relativeLabel(r.daysUntil)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSendTarget({ id: r.friendId, name: r.name })}
                className="mt-auto px-3 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#14283F' }}
              >
                ご案内を送る
              </button>
            </div>
          ))}
        </div>
      )}

      {sendTarget && (
        <MessageSendModal
          friendId={sendTarget.id}
          friendName={sendTarget.name}
          initialSceneId="renewal_notice"
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
