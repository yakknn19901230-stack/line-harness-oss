'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { SwitchRuleItem } from '@/lib/api'

/**
 * 乗り換えルールの取得フック（第23弾）。ページ側で1回だけ呼び、
 * 乗り換え提案パネルと残り件数メーターに同じ結果を渡す（useAllFriends と同じ共有パターン）。
 * ルール未投入・取得失敗時は空配列のまま = 乗り換え0件として静かに動作し、
 * 他パネルに影響を与えない（エラーは表に出さない）。
 */
export function useSwitchRules() {
  const [rules, setRules] = useState<SwitchRuleItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.insurance
      .switchRules()
      .then((res) => {
        if (!cancelled && res.success) setRules(res.data)
      })
      .catch(() => {
        // 取得失敗は「ルールなし」と同じ扱い（乗り換え0件で静かに動く）
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { rules, loading }
}
