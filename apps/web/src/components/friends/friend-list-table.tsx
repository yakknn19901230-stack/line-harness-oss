'use client'

import { useState } from 'react'
import type { Tag } from '@line-crm/shared'
import type { FriendListItem } from '@/lib/api'
import { api } from '@/lib/api'
import FriendListRow from './friend-list-row'
import FriendCard from './friend-card'
import TagBadge from './tag-badge'
import CustomerInfoModal from './customer-info-modal'
import MessageSendModal from './message-send-modal'
import TagEditModal from './tag-edit-modal'
import { DEFAULT_SCENE_ID } from './message-scenes'

interface Props {
  friends: FriendListItem[]
  allTags: Tag[]
  onRefresh: () => void
  /** 顧客情報の保存に成功したとき。トーストはページ側で出す
   *  （一覧再読込でこのテーブルが一時的にアンマウントされてもトーストが消えないように）。 */
  onCustomerInfoSaved?: (message: string) => void
  /** 顧客情報の保存に失敗したとき（楽観クローズ後）。ページ側でトースト表示。 */
  onCustomerInfoError?: (message: string) => void
  /** メッセージ送信成功時のトースト（再読込を伴わない）。ページ側で出す。 */
  onMessageSent?: (message: string) => void
  /** スマホのタグ編集モーダルでタグが変わったとき、一覧を楽観的に更新する。 */
  onTagsChanged?: (friendId: string, tags: FriendListItem['tags']) => void
  /** 新規タグ作成時、ページ側でタグ一覧を再取得する。 */
  onTagCreated?: () => void
  // ── 選択モード（一括タグ付け）──
  selectionMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (friendId: string) => void
}

export default function FriendListTable({ friends, allTags, onRefresh, onCustomerInfoSaved, onCustomerInfoError, onMessageSent, onTagsChanged, onTagCreated, selectionMode = false, selectedIds, onToggleSelect }: Props) {
  // Inline tag-management expander. The row's primary click navigates to
  // /chats; tag editing stays available here as a secondary action because
  // the chats page's FriendInfoSidebar currently only displays tags (no
  // add/remove). Without this expander operators would lose the only path
  // to mutate friend tags from the admin UI.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // 顧客情報 (誕生日・契約更新日) 編集モーダルの対象。null で閉じている。
  const [editingFriend, setEditingFriend] = useState<{ id: string; name: string } | null>(null)
  // 場面別メッセージ送信モーダルの対象。null で閉じている。
  const [messageFriend, setMessageFriend] = useState<{ id: string; name: string } | null>(null)
  // スマホのタグ編集モーダルの対象（シート型・44px）。null で閉じている。
  const [tagEditFriend, setTagEditFriend] = useState<FriendListItem | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
    setError('')
  }

  const handleRemoveTag = async (friendId: string, tagId: string) => {
    setLoading(true)
    setError('')
    try {
      await api.friends.removeTag(friendId, tagId)
      onRefresh()
    } catch {
      setError('タグの削除に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (friends.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500">友だちが見つかりません</p>
      </div>
    )
  }

  // タグ管理の展開部（PC 行の下で利用）。タグの追加/新規作成/削除は、スマホと
  // 同じシート型モーダル(TagEditModal)を開いて行う（既存タグからの選択＋新規作成が
  // 両方できる／PCで「追加UIが無い」問題を解消）。
  const renderTagEditor = (friend: FriendListItem) => {
    return (
      <div className="bg-gray-50 px-4 sm:px-6 py-4 border-b border-gray-100 space-y-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">LINE ユーザーID</p>
          <p className="text-xs text-gray-600 font-mono break-all select-all">{friend.lineUserId}</p>
        </div>
        <p className="text-xs font-semibold text-gray-500 mb-2">タグ管理</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {friend.tags.length > 0 ? (
            friend.tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} onRemove={() => handleRemoveTag(friend.id, tag.id)} />
            ))
          ) : (
            <span className="text-xs text-gray-400">まだタグはありません。</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setTagEditFriend(friend)}
          className="min-h-[40px] px-3 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 flex items-center gap-1 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          タグを追加・新規作成
        </button>
      </div>
    )
  }

  return (
    <>
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ── PC: テーブル表示（lg 以上） ── */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[80px_220px_120px_1fr_280px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            <div>対応マーク</div>
            <div>名前</div>
            <div>シナリオ</div>
            <div>受信メッセージ</div>
            <div>★つきタグ・友だち情報</div>
          </div>
          {friends.map((friend) => (
            <div key={friend.id}>
              <FriendListRow
                friend={friend}
                onTagEditClick={() => toggleExpand(friend.id)}
                onEditInfoClick={() => setEditingFriend({ id: friend.id, name: friend.displayName })}
                onSendMessageClick={() => setMessageFriend({ id: friend.id, name: friend.displayName })}
                selectionMode={selectionMode}
                selected={selectedIds?.has(friend.id) ?? false}
                onToggleSelect={() => onToggleSelect?.(friend.id)}
              />
              {expandedId === friend.id && renderTagEditor(friend)}
            </div>
          ))}
        </div>
      </div>

      {/* ── スマホ: カード表示（lg 未満）。横スクロールなし ── */}
      <div className="lg:hidden">
        {friends.map((friend) => (
          <div key={friend.id}>
            <FriendCard
              friend={friend}
              // スマホは実機で押しにくかったインライン展開をやめ、シート型モーダルを開く。
              onTagEditClick={() => setTagEditFriend(friend)}
              onEditInfoClick={() => setEditingFriend({ id: friend.id, name: friend.displayName })}
              onSendMessageClick={() => setMessageFriend({ id: friend.id, name: friend.displayName })}
              selectionMode={selectionMode}
              selected={selectedIds?.has(friend.id) ?? false}
              onToggleSelect={() => onToggleSelect?.(friend.id)}
            />
          </div>
        ))}
      </div>
    </div>

    {editingFriend && (
      <CustomerInfoModal
        friendId={editingFriend.id}
        friendName={editingFriend.name}
        onClose={() => setEditingFriend(null)}
        onSaved={(message) => {
          onCustomerInfoSaved?.(message)
          onRefresh()
        }}
        onSaveError={(message) => onCustomerInfoError?.(message)}
      />
    )}

    {messageFriend && (
      <MessageSendModal
        friendId={messageFriend.id}
        friendName={messageFriend.name}
        initialSceneId={DEFAULT_SCENE_ID}
        onClose={() => setMessageFriend(null)}
        onSent={(message) => {
          onMessageSent?.(message)
          setMessageFriend(null)
        }}
      />
    )}

    {tagEditFriend && (
      <TagEditModal
        friendId={tagEditFriend.id}
        friendName={tagEditFriend.displayName}
        friendTags={tagEditFriend.tags}
        allTags={allTags}
        onClose={() => setTagEditFriend(null)}
        onTagsChanged={(fid, tags) => {
          // モーダル内の楽観状態と一覧を同期。開いているモーダルの対象タグも更新。
          setTagEditFriend((cur) => (cur && cur.id === fid ? { ...cur, tags } : cur))
          onTagsChanged?.(fid, tags)
        }}
        onTagCreated={onTagCreated}
      />
    )}
    </>
  )
}
