'use client'

import { useMemo } from 'react'
import type { FriendListItem, SwitchRuleItem } from '@/lib/api'
import { countTodaysWork } from './todays-work'

interface Props {
  /** ページ側で1回だけ取得した全友だちを共有（各パネルと同一データ）。 */
  friends: FriendListItem[]
  /** ページ側で1回だけ取得した乗り換えルール（乗り換え提案パネルと同一データ）。 */
  rules: SwitchRuleItem[]
  loading: boolean
}

/**
 * 「今日の保全：残り◯件（誕生日◯・更新◯・フォロー◯・乗り換え◯）」の1行メーター。
 * 誕生日/更新/フォロー/乗り換えの各パネルと同じ判定（todays-work）・同じ共有データで数える。
 * すべて捌けたら控えめに「今日の保全は完了です！」を出す。
 */
export default function TodaysWorkMeter({ friends, rules, loading }: Props) {
  const counts = useMemo(() => countTodaysWork(friends, rules, new Date()), [friends, rules])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
        <p className="text-sm text-gray-400">今日の保全を集計しています…</p>
      </div>
    )
  }

  if (counts.total === 0) {
    return (
      <div className="bg-brand/5 rounded-lg border border-brand/20 p-3 mb-4">
        <p className="text-sm font-medium text-brand">🎉 今日の保全は完了です！</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border-2 border-accent/50 p-3 mb-4">
      <p className="text-sm font-semibold text-gray-800">
        📋 今日の保全：残り{counts.total}件
        <span className="ml-2 text-xs font-normal text-gray-500">
          （誕生日{counts.birthday}・更新{counts.renewal}・フォロー{counts.followup}・乗り換え{counts.switch}）
        </span>
      </p>
    </div>
  )
}
