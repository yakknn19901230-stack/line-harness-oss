// 「今日の保全」の対応済み判定・件数集計を一元化する共通ロジック。
// 誕生日/更新/フォローの各パネルと、残り件数メーターが同じ定義を使うことで、
// 「パネルから消えたのにメーターが減らない」といったズレを防ぐ。
//
// 対応済みの記録は friend.metadata に持つ（既存の更新API・shallow merge を利用）:
//   - 誕生日:  metadata.birthday_notified_at = 'YYYY-MM-DD'
//   - 更新:    contracts[i].notified_at       = 'YYYY-MM-DD'
// どちらも「対応してから SUPPRESS_DAYS 日以内はパネルに出さない」= 同サイクルを抑止。
// 年に一度のイベント（誕生日・年次更新）なら、翌年（約365日後）は再び出る。

import type { FriendListItem } from '@/lib/api'
import { parseFollowups } from './customer-notes'

export const BIRTHDAY_WINDOW_DAYS = 7
export const RENEWAL_WINDOW_DAYS = 60
/** 対応済み記録からこの日数以内は抑止（年次イベントの翌サイクルは再表示）。 */
const SUPPRESS_DAYS = 300

function toYmd(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const h = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : ''
}

/** today − ymd（日数）。未来なら負。不正なら null。 */
export function daysSinceYmd(ymd: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Math.round((t0.getTime() - d.getTime()) / 86_400_000)
}

/** ymd − today（日数）。0=今日、負=過去。不正なら null。 */
export function daysUntilYmd(ymd: string, today: Date): number | null {
  const s = daysSinceYmd(ymd, today)
  return s === null ? null : -s
}

/** notified_at 系の値が「最近（SUPPRESS_DAYS 日以内）」なら抑止対象。 */
function suppressedByNotifiedAt(notifiedRaw: unknown, today: Date): boolean {
  const ymd = toYmd(notifiedRaw)
  if (!ymd) return false
  const since = daysSinceYmd(ymd, today)
  return since !== null && since >= 0 && since <= SUPPRESS_DAYS
}

export function isBirthdaySuppressed(meta: Record<string, unknown>, today: Date): boolean {
  return suppressedByNotifiedAt(meta.birthday_notified_at, today)
}

export function isContractSuppressed(contract: Record<string, unknown>, today: Date): boolean {
  return suppressedByNotifiedAt(contract.notified_at, today)
}

/** metadata.birthday("YYYY-MM-DD") から月日を取り出す。妥当でなければ null。 */
export function parseMonthDay(raw: unknown): { month: number; day: number } | null {
  const ymd = toYmd(raw)
  if (!ymd) return null
  const month = Number(ymd.slice(5, 7))
  const day = Number(ymd.slice(8, 10))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { month, day }
}

/** 年を無視して、今日から次の誕生日（当日含む）までの日数。年またぎ考慮。 */
export function daysUntilBirthday(month: number, day: number, today: Date): number {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = new Date(today.getFullYear(), month - 1, day)
  let diff = Math.round((next.getTime() - t0.getTime()) / 86_400_000)
  if (diff < 0) {
    next = new Date(today.getFullYear() + 1, month - 1, day)
    diff = Math.round((next.getTime() - t0.getTime()) / 86_400_000)
  }
  return diff
}

export interface TodaysWorkCounts {
  birthday: number
  renewal: number
  followup: number
  total: number
}

/**
 * ダッシュボードの残り件数メーター用。誕生日/更新/フォローの「今日やる分」を
 * 各パネルと同じ窓・同じ抑止ルールで数える。
 */
export function countTodaysWork(friends: FriendListItem[], today: Date): TodaysWorkCounts {
  let birthday = 0
  let renewal = 0
  let followup = 0
  for (const f of friends) {
    const meta = (f.metadata ?? {}) as Record<string, unknown>

    const md = parseMonthDay(meta.birthday)
    if (md && !isBirthdaySuppressed(meta, today)) {
      const d = daysUntilBirthday(md.month, md.day, today)
      if (d >= 0 && d <= BIRTHDAY_WINDOW_DAYS) birthday++
    }

    const contracts = Array.isArray(meta.contracts) ? meta.contracts : []
    for (const c of contracts) {
      const obj = (c ?? {}) as Record<string, unknown>
      const du = daysUntilYmd(toYmd(obj.renewal_date), today)
      if (du !== null && du >= 0 && du <= RENEWAL_WINDOW_DAYS && !isContractSuppressed(obj, today)) renewal++
    }

    for (const fu of parseFollowups(meta)) {
      if (fu.done) continue
      const du = daysUntilYmd(fu.date, today)
      if (du !== null && du <= 0) followup++
    }
  }
  return { birthday, renewal, followup, total: birthday + renewal + followup }
}
