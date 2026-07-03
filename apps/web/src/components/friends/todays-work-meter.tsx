'use client'

import { useMemo } from 'react'
import { useAllFriends } from '@/hooks/use-all-friends'
import { countTodaysWork } from './todays-work'

interface Props {
  accountId: string | null
  /** パネルで対応済みにしたら親から increment して再集計させる。 */
  refreshKey?: number
}

/**
 * 「今日の保全：残り◯件（誕生日◯・更新◯・フォロー◯）」の1行メーター。
 * 誕生日/更新/フォローの各パネルと同じ判定（todays-work）で数える。
 * すべて捌けたら控えめに「今日の保全は完了です！」を出す。
 */
export default function TodaysWorkMeter({ accountId, refreshKey }: Props) {
  const { friends, loading } = useAllFriends(accountId, refreshKey)
  const counts = useMemo(() => countTodaysWork(friends, new Date()), [friends])

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
          （誕生日{counts.birthday}・更新{counts.renewal}・フォロー{counts.followup}）
        </span>
      </p>
    </div>
  )
}
