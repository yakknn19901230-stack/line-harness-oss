'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Tag } from '@line-crm/shared'
import { api } from '@/lib/api'
import type { FriendListItem } from '@/lib/api'
import Header from '@/components/layout/header'
import FriendListTable from '@/components/friends/friend-list-table'
import BulkTagModal from '@/components/friends/bulk-tag-modal'
import BirthdayPanel from '@/components/friends/birthday-panel'
import RenewalPanel from '@/components/friends/renewal-panel'
import FollowupPanel from '@/components/friends/followup-panel'
import CcPromptButton from '@/components/cc-prompt-button'
import { useAccount } from '@/contexts/account-context'
import { useAllFriends } from '@/hooks/use-all-friends'

const ccPrompts = [
  {
    title: '友だちのセグメント分析',
    prompt: `友だち一覧のデータを分析してください。
1. タグ別の友だち数を集計
2. アクティブ率の高いセグメントを特定
3. エンゲージメントが低い層への施策を提案
レポート形式で出力してください。`,
  },
  {
    title: 'タグ一括管理',
    prompt: `友だちのタグを一括管理してください。
1. 未タグの友だちを特定
2. 行動履歴に基づいたタグ付け提案
3. 不要タグの整理
作業手順を示してください。`,
  },
]

const PAGE_SIZE = 20

type SortMode = 'recent' | 'oldest'
type ResponseFilter = 'all' | 'unhandled'

export default function FriendsPage() {
  const { selectedAccountId } = useAccount()
  const [friends, setFriends] = useState<FriendListItem[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchSubmitted, setSearchSubmitted] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [responseFilter, setResponseFilter] = useState<ResponseFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 顧客情報の保存トースト。テーブルは再読込で一時的にアンマウントされるため、
  // 消えないようページ側で保持する。数秒で自動的に閉じる。
  const [toast, setToast] = useState('')
  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }
  // 誕生日パネルは全友だちを自前取得する。顧客情報(誕生日)が保存されたら
  // このキーを増やしてパネルに再取得を促す。
  const [birthdayRefreshKey, setBirthdayRefreshKey] = useState(0)
  // 誕生日/更新/フォローの3パネルは、この1回の全件取得を共有する
  // （従来は各パネルが個別に全件取得＝3往復。1回に集約して体感を軽くする）。
  const panelData = useAllFriends(selectedAccountId, birthdayRefreshKey)

  // ── 選択モード（一括タグ付け）──
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [nameById, setNameById] = useState<Record<string, string>>({})
  const [selectAllBusy, setSelectAllBusy] = useState(false)
  const [bulkMode, setBulkMode] = useState<'add' | 'remove' | null>(null)

  // 名前の逆引きを、表示中の一覧から随時ためておく（一括処理の失敗列挙で使う）。
  useEffect(() => {
    if (friends.length === 0) return
    setNameById((prev) => {
      const next = { ...prev }
      for (const f of friends) next[f.id] = f.displayName
      return next
    })
  }, [friends])

  const toggleSelectionMode = () => {
    setSelectionMode((on) => {
      if (on) setSelectedIds(new Set()) // 抜けるときは選択クリア
      return !on
    })
  }
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  // 現在の検索・フィルタ結果の「全件」をページまたぎで取得して全選択する。
  const selectAllMatching = async () => {
    setSelectAllBusy(true)
    try {
      const ids: string[] = []
      const names: Record<string, string> = {}
      let offset = 0
      const LIMIT = 200
      while (ids.length < 5000) {
        const res = await api.friends.list({
          offset: String(offset),
          limit: LIMIT,
          tagId: selectedTagId || undefined,
          accountId: selectedAccountId || undefined,
          search: searchSubmitted || undefined,
          sort: sortMode,
          handled: responseFilter === 'unhandled' ? 'unhandled' : undefined,
        })
        if (!res.success) break
        for (const f of res.data.items) { ids.push(f.id); names[f.id] = f.displayName }
        if (!res.data.hasNextPage || res.data.items.length === 0) break
        offset += res.data.items.length
      }
      setNameById((prev) => ({ ...prev, ...names }))
      setSelectedIds(new Set(ids))
    } catch {
      showToast('全選択に失敗しました。もう一度お試しください。')
    } finally {
      setSelectAllBusy(false)
    }
  }

  // 単体タグ編集モーダル / 一括処理の結果を一覧タグへ楽観的に反映する。
  const patchFriendTags = (friendId: string, tags: FriendListItem['tags']) => {
    setFriends((prev) => prev.map((f) => (f.id === friendId ? { ...f, tags } : f)))
  }
  const selectedFriendsForBulk = () =>
    Array.from(selectedIds).map((id) => ({ id, name: nameById[id] ?? id }))

  const loadTags = useCallback(async () => {
    try {
      const res = await api.tags.list()
      if (res.success) setAllTags(res.data)
    } catch {
      // Non-blocking — tags used for filter
    }
  }, [])

  const loadFriends = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.friends.list({
        offset: String((page - 1) * PAGE_SIZE),
        limit: PAGE_SIZE,
        tagId: selectedTagId || undefined,
        accountId: selectedAccountId || undefined,
        search: searchSubmitted || undefined,
        includeChatStatus: true,
        sort: sortMode,
        handled: responseFilter === 'unhandled' ? 'unhandled' : undefined,
      })
      if (res.success) {
        setFriends(res.data.items)
        setTotal(res.data.total)
        setHasNextPage(res.data.hasNextPage)
      } else {
        setError(res.error)
      }
    } catch {
      setError('友だちの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [page, selectedTagId, selectedAccountId, searchSubmitted, sortMode, responseFilter])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  // Reset the URL-style account context to page 1 in a separate effect.
  // For user-driven filter changes (search/sort/handled/tag) we reset
  // page synchronously inside the handlers below — that avoids the
  // double-fetch race where the old `page` request resolves after the
  // new `page=1` request and overwrites the correct page-1 rows.
  useEffect(() => {
    setPage(1)
  }, [selectedAccountId])

  useEffect(() => {
    loadFriends()
  }, [loadFriends])

  // Fan-out helpers: changing a filter also resets pagination synchronously,
  // so React batches both state updates into one re-render and `loadFriends`
  // fires exactly once with the new filter + page=1.
  const updateAndResetPage = (cb: () => void) => {
    cb()
    setPage(1)
  }
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateAndResetPage(() => setSearchSubmitted(searchInput.trim()))
  }
  // Clearing the input clears the active search even if the user doesn't
  // press 検索 again. Without this, "search Alice → clear input → change
  // tag" would keep filtering by Alice while the input box looks empty —
  // see codex feedback. Keeping a non-empty input that doesn't match
  // searchSubmitted is fine: the user is mid-edit, hasn't applied yet.
  const handleSearchInputChange = (v: string) => {
    setSearchInput(v)
    if (v.trim() === '' && searchSubmitted !== '') {
      updateAndResetPage(() => setSearchSubmitted(''))
    }
  }
  const handleSortChange = (v: SortMode) => updateAndResetPage(() => setSortMode(v))
  const handleResponseFilterChange = (v: ResponseFilter) => updateAndResetPage(() => setResponseFilter(v))
  const handleTagFilterChange = (v: string) => updateAndResetPage(() => setSelectedTagId(v))

  return (
    <div>
      <Header
        title="友だちリスト"
        description="友だちの検索や、詳細情報の確認ができます。"
      />

      {/* 今週の誕生日パネル — メインの一覧のページングに依存せず、全友だちを
          共有取得(panelData)して算出する。該当者ゼロなら静かに案内する。 */}
      <BirthdayPanel
        friends={panelData.friends}
        loading={panelData.loading}
        error={panelData.error}
        onToast={showToast}
      />

      {/* 契約更新が近い顧客（誕生日パネルと同じ共有データで判定） */}
      <RenewalPanel
        friends={panelData.friends}
        loading={panelData.loading}
        error={panelData.error}
        onToast={showToast}
      />

      {/* 今日のフォロー予定（次回フォローの期日到来分） */}
      <FollowupPanel
        friends={panelData.friends}
        loading={panelData.loading}
        error={panelData.error}
        onToast={showToast}
      />

      {/* Search + sort bar — L-step style */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            placeholder="友だち名を検索"
            className="flex-1 min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <select
            value={sortMode}
            onChange={(e) => handleSortChange(e.target.value as SortMode)}
            className="min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="recent">友だち追加の新しい順</option>
            <option value="oldest">友だち追加の古い順</option>
          </select>
          <button
            type="submit"
            className="min-h-[44px] px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#14283F' }}
          >
            検索
          </button>
        </form>

        {/* Secondary filters — タグ + 対応マーク */}
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 font-medium whitespace-nowrap">タグ:</label>
            <select
              className="text-sm border border-gray-300 rounded-lg px-2 py-2 min-h-[40px] bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              value={selectedTagId}
              onChange={(e) => handleTagFilterChange(e.target.value)}
            >
              <option value="">すべて</option>
              {allTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 font-medium whitespace-nowrap">対応マーク:</label>
            <select
              className="text-sm border border-gray-300 rounded-lg px-2 py-2 min-h-[40px] bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              value={responseFilter}
              onChange={(e) => handleResponseFilterChange(e.target.value as ResponseFilter)}
            >
              <option value="all">すべて</option>
              <option value="unhandled">未対応のみ</option>
            </select>
          </div>
          <span className="text-xs text-gray-500 ml-auto">
            {loading ? '読み込み中...' : `${total.toLocaleString('ja-JP')} 件`}
          </span>
        </div>
      </div>

      {/* 選択モードの操作行（複数選択→一括タグ付け） */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {!selectionMode ? (
          <button
            type="button"
            onClick={toggleSelectionMode}
            className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            選択
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleSelectionMode}
              className="min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={selectAllMatching}
              disabled={selectAllBusy}
              className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {selectAllBusy ? '取得中…' : `全選択（${total.toLocaleString('ja-JP')}件）`}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              選択解除
            </button>
            <span className="text-sm font-semibold text-gray-800 ml-auto">{selectedIds.size}人選択中</span>
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 grid grid-cols-[80px_220px_120px_1fr_280px] gap-3 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-16" />
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-gray-200" />
                <div className="h-3 bg-gray-200 rounded w-24" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-20" />
              <div className="space-y-2">
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-2 bg-gray-100 rounded w-20" />
              </div>
              <div className="h-5 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <FriendListTable
          friends={friends}
          allTags={allTags}
          onRefresh={loadFriends}
          onCustomerInfoSaved={(message) => {
            showToast(message)
            // 誕生日を編集した可能性があるので、パネルの母集団を取り直す
            setBirthdayRefreshKey((k) => k + 1)
          }}
          onCustomerInfoError={showToast}
          onMessageSent={showToast}
          onTagsChanged={patchFriendTags}
          onTagCreated={loadTags}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}

      {!loading && total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4">
          <p className="text-sm text-gray-500">
            {((page - 1) * PAGE_SIZE) + 1}〜{Math.min(page * PAGE_SIZE, total)} 件 / 全{total.toLocaleString('ja-JP')}件
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-2 min-h-[44px] text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              前へ
            </button>
            <span className="text-sm text-gray-600 px-1">{page} ページ</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
              className="px-3 py-2 min-h-[44px] text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              次へ
            </button>
          </div>
        </div>
      )}

      {/* 一括操作バー（選択中のみ）。スマホは下部固定、PCは通常フロー。 */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-lg p-3 lg:static lg:border lg:rounded-lg lg:shadow-none lg:mt-4">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">{selectedIds.size}人</span>
            <button
              type="button"
              onClick={() => setBulkMode('add')}
              className="flex-1 min-h-[44px] px-3 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#14283F' }}
            >
              タグを付ける
            </button>
            <button
              type="button"
              onClick={() => setBulkMode('remove')}
              className="flex-1 min-h-[44px] px-3 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              タグを外す
            </button>
          </div>
        </div>
      )}
      {/* 下部固定バーに隠れないよう、スマホは余白を足す */}
      {selectionMode && selectedIds.size > 0 && <div className="h-20 lg:hidden" />}

      {bulkMode && (
        <BulkTagModal
          mode={bulkMode}
          friends={selectedFriendsForBulk()}
          allTags={allTags}
          onClose={() => setBulkMode(null)}
          onDone={({ failedNames }) => {
            const okCount = selectedIds.size - failedNames.length
            showToast(
              failedNames.length === 0
                ? `${okCount}人に反映しました`
                : `${okCount}人に反映（${failedNames.length}人失敗）`,
            )
            loadFriends()
            loadTags()
          }}
          onTagCreated={loadTags}
        />
      )}

      <CcPromptButton prompts={ccPrompts} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm shadow-lg flex items-center gap-2">
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  )
}
