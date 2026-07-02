'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { FriendListItem } from '@/lib/api'

// 全件取得の設定。1ページを大きめに取り、hasNextPage を辿って全ページ集める。
// 常識的な安全上限（打ち切り）を入れて、異常に多い環境でも暴走しないようにする。
const FETCH_PAGE_SIZE = 200
const MAX_FRIENDS = 5000

/**
 * 誕生日パネル・更新パネルなど「全友だちを母集団に判定する」UI 共通の取得フック。
 * メインの一覧のページング状態には依存せず、自前で全ページをループ取得する。
 * includeTags/includeChatStatus は付けない（判定に不要で取得を軽くするため）。
 */
export function useAllFriends(accountId: string | null, refreshKey?: number) {
  const [friends, setFriends] = useState<FriendListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    const fetchAll = async () => {
      const all: FriendListItem[] = []
      let offset = 0
      while (all.length < MAX_FRIENDS) {
        const res = await api.friends.list({
          limit: FETCH_PAGE_SIZE,
          offset: String(offset),
          accountId: accountId || undefined,
          includeTags: false,
        })
        if (!res.success) throw new Error(res.error)
        const got = res.data.items.length
        all.push(...res.data.items)
        // サーバが要求未満を返しても取りこぼさないよう、実際に受け取った件数で進める。
        if (!res.data.hasNextPage || got === 0) break
        offset += got
      }
      return all
    }

    fetchAll()
      .then((all) => { if (!cancelled) setFriends(all) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [accountId, refreshKey])

  return { friends, loading, error }
}
