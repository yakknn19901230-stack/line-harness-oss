// 「今日の保全」の対応済み判定・件数集計を一元化する共通ロジック。
// 誕生日/更新/フォロー/乗り換えの各パネルと、残り件数メーターが同じ定義を使うことで、
// 「パネルから消えたのにメーターが減らない」といったズレを防ぐ。
//
// 対応済みの記録:
//   - 誕生日:  friend.metadata.birthday_notified_at = 'YYYY-MM-DD'（従来どおり）
//   - 更新:    friend_contracts.notified_at（第22弾で専用テーブルへ移行。
//              一覧APIが同梱する friend.contracts[i].notifiedAt を読む）
//   - 乗り換え: friend_contracts.switch_notified_at（第23弾。同 friend.contracts[i].switchNotifiedAt）
// いずれも「対応してから SUPPRESS_DAYS 日以内はパネルに出さない」= 同サイクルを抑止。
// 年に一度のイベント（誕生日・年次更新）なら、翌年（約365日後）は再び出る。

import type { FriendContractItem, FriendListItem, SwitchRuleItem } from '@/lib/api'
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

/** friend_contracts.notified_at(camelCaseでAPIから来る値)による抑止判定。 */
export function isContractSuppressed(notifiedAt: unknown, today: Date): boolean {
  return suppressedByNotifiedAt(notifiedAt, today)
}

/** friend_contracts.switch_notified_at による乗り換え提案の抑止判定(更新と同じ SUPPRESS_DAYS を共用)。 */
export function isContractSwitchSuppressed(switchNotifiedAt: unknown, today: Date): boolean {
  return suppressedByNotifiedAt(switchNotifiedAt, today)
}

/** 乗り換え提案の対象1件（契約×ルールの組）。 */
export interface SwitchTarget {
  friend: FriendListItem
  contract: FriendContractItem
  rule: SwitchRuleItem
}

/**
 * 乗り換え提案の対象を抽出する（第23弾）。
 * 契約の productId がルールの oldProductId に一致するものが対象。
 * switch_notified_at から SUPPRESS_DAYS 日以内は抑止（更新パネルと同じ定数）。
 * rules が空（未投入・取得失敗）なら常に0件 = パネルは静かに空になる。
 * パネルとメーターの両方がこの関数を使うこと（判定をここ以外に書かない）。
 */
export function switchTargets(
  friends: FriendListItem[],
  rules: SwitchRuleItem[],
  today: Date,
): SwitchTarget[] {
  if (rules.length === 0) return []
  const rulesByOldProduct = new Map<string, SwitchRuleItem[]>()
  for (const rule of rules) {
    const list = rulesByOldProduct.get(rule.oldProductId) ?? []
    list.push(rule)
    rulesByOldProduct.set(rule.oldProductId, list)
  }
  const targets: SwitchTarget[] = []
  for (const f of friends) {
    for (const c of f.contracts ?? []) {
      if (!c.productId) continue
      const matched = rulesByOldProduct.get(c.productId)
      if (!matched) continue
      if (isContractSwitchSuppressed(c.switchNotifiedAt, today)) continue
      for (const rule of matched) {
        targets.push({ friend: f, contract: c, rule })
      }
    }
  }
  return targets
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
  switch: number
  total: number
}

/**
 * ダッシュボードの残り件数メーター用。誕生日/更新/フォロー/乗り換えの「今日やる分」を
 * 各パネルと同じ窓・同じ抑止ルールで数える。rules は乗り換え提案パネルと共有の
 * 取得結果を渡す（空なら乗り換え0件）。
 */
export function countTodaysWork(
  friends: FriendListItem[],
  rules: SwitchRuleItem[],
  today: Date,
): TodaysWorkCounts {
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

    for (const c of f.contracts ?? []) {
      const du = daysUntilYmd(toYmd(c.renewalDate), today)
      if (du !== null && du >= 0 && du <= RENEWAL_WINDOW_DAYS && !isContractSuppressed(c.notifiedAt, today)) renewal++
    }

    for (const fu of parseFollowups(meta)) {
      if (fu.done) continue
      const du = daysUntilYmd(fu.date, today)
      if (du !== null && du <= 0) followup++
    }
  }
  // 乗り換えはパネルと同じ switchTargets を使う（判定の二重実装を作らない）。
  const switchCount = switchTargets(friends, rules, today).length
  return {
    birthday,
    renewal,
    followup,
    switch: switchCount,
    total: birthday + renewal + followup + switchCount,
  }
}
