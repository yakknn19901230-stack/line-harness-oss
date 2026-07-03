'use client'

import { useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useAllFriends } from '@/hooks/use-all-friends'
import { useIsNarrow } from '@/hooks/use-is-narrow'
import { todayYmd } from './customer-notes'
import { isContractSuppressed, RENEWAL_WINDOW_DAYS } from './todays-work'
import MessageSendModal from './message-send-modal'
import PanelShell from './panel-shell'

/** スマホで一度に見せる最大件数（超過分は「もっと見る」で展開）。 */
const MOBILE_LIMIT = 5

interface Props {
  accountId: string | null
  refreshKey?: number
  onToast: (message: string) => void
  /** 対応済みにしたら親に通知（残り件数メーターの再集計用）。 */
  onChanged?: () => void
}

interface UpcomingRenewal {
  friendId: string
  name: string
  contractName: string
  /** その友だちの contracts 配列内でのインデックス（対応済み記録用） */
  contractIndex: number
  /** 表示用 YYYY/MM/DD */
  dateLabel: string
  /** 今日から更新日までの日数（0=今日） */
  daysUntil: number
}

const WINDOW_DAYS = RENEWAL_WINDOW_DAYS

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

export default function RenewalPanel({ accountId, refreshKey, onToast, onChanged }: Props) {
  const { friends, loading, error } = useAllFriends(accountId, refreshKey)
  const [sendTarget, setSendTarget] = useState<{ id: string; name: string; contractIndex: number } | null>(null)
  // 「対応済み」にした契約をその場で消すための楽観的セット（key = friendId:contractIndex）。
  const [handled, setHandled] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const narrow = useIsNarrow()

  const upcoming = useMemo<UpcomingRenewal[]>(() => {
    const today = new Date()
    const list: UpcomingRenewal[] = []
    for (const f of friends) {
      const meta = (f.metadata ?? {}) as Record<string, unknown>
      const contracts = Array.isArray(meta.contracts) ? meta.contracts : []
      contracts.forEach((c, contractIndex) => {
        const obj = (c ?? {}) as Record<string, unknown>
        const parsed = daysUntilDate(obj.renewal_date, today)
        if (!parsed) return
        if (isContractSuppressed(obj, today)) return // この更新は対応済み → 出さない
        if (handled.has(`${f.id}:${contractIndex}`)) return
        if (parsed.days >= 0 && parsed.days <= WINDOW_DAYS) {
          list.push({
            friendId: f.id,
            name: f.displayName,
            contractName: typeof obj.name === 'string' && obj.name ? obj.name : '契約',
            contractIndex,
            dateLabel: parsed.label,
            daysUntil: parsed.days,
          })
        }
      })
    }
    return list.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [friends, handled])

  const todayCount = upcoming.filter((r) => r.daysUntil === 0).length
  const visible = narrow && !showAll ? upcoming.slice(0, MOBILE_LIMIT) : upcoming
  const hiddenCount = upcoming.length - visible.length

  /** 該当契約を対応済みにする（contracts[i].notified_at=today）。楽観的に消す。 */
  const markDone = async (item: { friendId: string; contractIndex: number; name: string }) => {
    const key = `${item.friendId}:${item.contractIndex}`
    setHandled((prev) => new Set(prev).add(key))
    const friend = friends.find((f) => f.id === item.friendId)
    const meta = (friend?.metadata ?? {}) as Record<string, unknown>
    const contracts = Array.isArray(meta.contracts) ? meta.contracts : []
    // 対象契約に notified_at を付与（他の契約・キーはそのまま保持）。
    const next = contracts.map((c, i) =>
      i === item.contractIndex ? { ...(c as Record<string, unknown>), notified_at: todayYmd() } : c,
    )
    try {
      const res = await api.friends.updateMetadata(item.friendId, { contracts: next })
      if (res.success) {
        onChanged?.()
      } else {
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
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map((r) => (
              <div
                key={`${r.friendId}-${r.contractIndex}`}
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
                <div className="mt-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSendTarget({ id: r.friendId, name: r.name, contractIndex: r.contractIndex })}
                    className="flex-1 px-3 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#14283F' }}
                  >
                    ご案内を送る
                  </button>
                  <button
                    type="button"
                    onClick={() => markDone({ friendId: r.friendId, contractIndex: r.contractIndex, name: r.name })}
                    aria-label="対応済みにする"
                    className="shrink-0 min-h-[44px] px-3 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    ✓ 済み
                  </button>
                </div>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="lg:hidden w-full mt-3 min-h-[44px] text-sm font-medium text-brand border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              もっと見る（残り{hiddenCount}件）
            </button>
          )}
        </>
      )}

      {sendTarget && (
        <MessageSendModal
          friendId={sendTarget.id}
          friendName={sendTarget.name}
          initialSceneId="renewal_notice"
          onClose={() => setSendTarget(null)}
          onSent={(message) => {
            onToast(message)
            // 送れたら自動で対応済みにする。
            const t = sendTarget
            setSendTarget(null)
            void markDone({ friendId: t.id, contractIndex: t.contractIndex, name: t.name })
          }}
        />
      )}
    </PanelShell>
  )
}
