'use client'

import { useState } from 'react'
import type { Tag } from '@line-crm/shared'
import type { FriendListItem } from '@/lib/api'
import { api } from '@/lib/api'

type FriendTag = FriendListItem['tags'][number]

interface Props {
  friendId: string
  friendName: string
  /** 現在ついているタグ（一覧が持っている値） */
  friendTags: FriendTag[]
  /** 選択肢に出す全タグ */
  allTags: Tag[]
  onClose: () => void
  /** タグが変わるたびに親へ通知（一覧を楽観的に更新するため。friendId とその友だちの新タグ配列） */
  onTagsChanged: (friendId: string, tags: FriendTag[]) => void
  /** 新規タグを作成したとき（親でタグ一覧を再取得させる） */
  onTagCreated?: () => void
}

// 新規作成タグの色（ブランド濃紺〜琥珀の範囲でローテーション）。
const NEW_TAG_COLORS = ['#14283F', '#E8B44A', '#2f4f75', '#d59f2f', '#47688f']

/**
 * スマホでも確実に押せる、シート型のタグ編集モーダル。
 * 旧・インライン展開（20px の細いテキストリンク）は実機 iOS でタップし辛かったため、
 * 顧客情報モーダル等と同じ下からのシート＋44px タップ領域に置き換える。
 */
export default function TagEditModal({ friendId, friendName, friendTags, allTags, onClose, onTagsChanged, onTagCreated }: Props) {
  const [tags, setTags] = useState<FriendTag[]>(friendTags)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const available = allTags.filter((t) => !tags.some((ft) => ft.id === t.id))

  // 楽観的にチップを足し、API 失敗時のみ元に戻す。
  const addTag = async (tag: Tag) => {
    if (tags.some((t) => t.id === tag.id)) return
    const prev = tags
    const next = [...tags, tag]
    setTags(next)
    onTagsChanged(friendId, next)
    setError('')
    try {
      const r = await api.friends.addTag(friendId, tag.id)
      if (!r.success) throw new Error()
    } catch {
      setTags(prev)
      onTagsChanged(friendId, prev)
      setError('タグの追加に失敗しました。もう一度お試しください。')
    }
  }

  const removeTag = async (tagId: string) => {
    const prev = tags
    const next = tags.filter((t) => t.id !== tagId)
    setTags(next)
    onTagsChanged(friendId, next)
    setError('')
    try {
      const r = await api.friends.removeTag(friendId, tagId)
      if (!r.success) throw new Error()
    } catch {
      setTags(prev)
      onTagsChanged(friendId, prev)
      setError('タグの削除に失敗しました。もう一度お試しください。')
    }
  }

  const createAndAdd = async () => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    setError('')
    try {
      const color = NEW_TAG_COLORS[allTags.length % NEW_TAG_COLORS.length]
      const r = await api.tags.create({ name, color })
      if (!r.success || !r.data) throw new Error()
      setNewName('')
      onTagCreated?.()
      await addTag(r.data)
    } catch {
      setError('タグの作成に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">タグを編集</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{friendName || '名前なし'} さん</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* 現在のタグ */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ついているタグ</h3>
            {tags.length === 0 ? (
              <p className="text-sm text-gray-400">まだタグはありません。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => removeTag(tag.id)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: tag.color || '#14283F' }}
                    aria-label={`${tag.name} を外す`}
                  >
                    {tag.name}
                    <span className="text-white/90 text-base leading-none">×</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-400">タグをタップすると外せます。</p>
          </section>

          {/* 追加できるタグ */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">タグを付ける</h3>
            {available.length === 0 ? (
              <p className="text-sm text-gray-400">追加できるタグはありません。下で新規作成できます。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {available.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => addTag(tag)}
                    className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-full text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-brand text-base leading-none">＋</span>
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 新規タグ作成 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">新しいタグを作る</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: 一斉配信"
                className="w-full flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="button"
                onClick={createAndAdd}
                disabled={busy || newName.trim() === ''}
                className="shrink-0 min-h-[44px] px-4 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: '#14283F' }}
              >
                作成して付ける
              </button>
            </div>
          </section>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{error}</div>
          )}
        </div>

        <div className="shrink-0 flex px-5 py-3 border-t border-gray-100 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#14283F' }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
