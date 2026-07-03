'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { FriendListItem } from '@/lib/api'
import { useIsNarrow } from '@/hooks/use-is-narrow'
import { todayYmd } from './customer-notes'
import { isBirthdaySuppressed, BIRTHDAY_WINDOW_DAYS } from './todays-work'
import MessageSendModal from './message-send-modal'
import PanelShell from './panel-shell'

/** スマホで一度に見せる最大件数（超過分は「もっと見る」で展開）。 */
const MOBILE_LIMIT = 5

interface Props {
  /** ページ側で1回だけ取得した全友だち（誕生日/更新/フォローで共有）。 */
  friends: FriendListItem[]
  loading: boolean
  error?: boolean
  /** 送信成功トーストはページ側で出す */
  onToast: (message: string) => void
  /** 対応済みにしたら親に通知（残り件数メーターの再集計用）。 */
  onChanged?: () => void
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

export default function BirthdayPanel({ friends, loading, error, onToast, onChanged }: Props) {
  const router = useRouter()
  const [sendTarget, setSendTarget] = useState<{ id: string; name: string } | null>(null)
  // 「対応済み」にした友だちをその場で消すための楽観的セット（key = friendId）。
  const [handled, setHandled] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const narrow = useIsNarrow()

  const upcoming = useMemo<UpcomingBirthday[]>(() => {
    const today = new Date()
    const list: UpcomingBirthday[] = []
    for (const f of friends) {
      const meta = (f.metadata ?? {}) as Record<string, unknown>
      const md = parseMonthDay(meta.birthday)
      if (!md) continue
      if (isBirthdaySuppressed(meta, today)) continue // 今年は対応済み → 出さない
      if (handled.has(f.id)) continue
      const daysUntil = daysUntilBirthday(md.month, md.day, today)
      if (daysUntil >= 0 && daysUntil <= BIRTHDAY_WINDOW_DAYS) {
        list.push({ id: f.id, name: f.displayName, month: md.month, day: md.day, daysUntil })
      }
    }
    return list.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [friends, handled])

  const todayCount = upcoming.filter((b) => b.daysUntil === 0).length
  // スマホは上位 MOBILE_LIMIT 件のみ、超過は「もっと見る」で展開。PC は常に全件。
  const visible = narrow && !showAll ? upcoming.slice(0, MOBILE_LIMIT) : upcoming
  const hiddenCount = upcoming.length - visible.length

  /** 今年の誕生日を対応済みにする（birthday_notified_at=today を記録）。楽観的に消す。 */
  const markDone = async (id: string) => {
    setHandled((prev) => new Set(prev).add(id))
    try {
      const res = await api.friends.updateMetadata(id, { birthday_notified_at: todayYmd() })
      if (res.success) {
        onChanged?.()
      } else {
        setHandled((prev) => { const s = new Set(prev); s.delete(id); return s })
        onToast('更新に失敗しました。もう一度お試しください。')
      }
    } catch {
      setHandled((prev) => { const s = new Set(prev); s.delete(id); return s })
      onToast('更新に失敗しました。通信状況をご確認ください。')
    }
  }

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
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map((b) => (
              <div
                key={b.id}
                className="border border-accent/40 rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-b from-accent/10 to-white"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => router.push(`/chats?friend=${b.id}&scene=birthday`)}
                    className="text-sm font-medium text-gray-900 hover:text-brand hover:underline truncate max-w-full text-left"
                    title="チャットを開く（お祝い文面をプリセット）"
                  >
                    {b.name || '名前なし'}
                  </button>
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
                <div className="mt-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSendTarget({ id: b.id, name: b.name })}
                    className="flex-1 px-3 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#14283F' }}
                  >
                    お祝いを送る
                  </button>
                  <button
                    type="button"
                    onClick={() => markDone(b.id)}
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
          initialSceneId="birthday"
          onClose={() => setSendTarget(null)}
          onSent={(message) => {
            onToast(message)
            // 送れたら自動で対応済みにする（送ったのに残り続けるのを防ぐ）。
            const id = sendTarget.id
            setSendTarget(null)
            void markDone(id)
          }}
        />
      )}
    </PanelShell>
  )
}
