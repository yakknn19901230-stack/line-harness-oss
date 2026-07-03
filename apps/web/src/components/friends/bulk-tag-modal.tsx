'use client'

import { useState } from 'react'
import type { Tag } from '@line-crm/shared'
import { api } from '@/lib/api'

interface SelFriend {
  id: string
  name: string
}

interface Props {
  mode: 'add' | 'remove'
  /** 対象の友だち（全選択で全件・ページまたぎ） */
  friends: SelFriend[]
  allTags: Tag[]
  onClose: () => void
  /** 完了時。成功で一覧を更新させる（付けた/外したタグIDと対象ID群を渡す）。 */
  onDone: (result: { tagIds: string[]; friendIds: string[]; failedNames: string[] }) => void
  onTagCreated?: () => void
}

const NEW_TAG_COLORS = ['#14283F', '#E8B44A', '#2f4f75', '#d59f2f', '#47688f']
const CONCURRENCY = 5

/**
 * 選択中の友だちにタグをまとめて付ける/外す。
 * 手順: タグ選択 → 確認1回 → 進捗表示 → 完了（失敗は名前を列挙）。
 * API は既存の per-friend タグ付与/削除を CONCURRENCY 並列で順次呼ぶ（新APIなし）。
 */
export default function BulkTagModal({ mode, friends, allTags, onClose, onDone, onTagCreated }: Props) {
  const [step, setStep] = useState<'pick' | 'confirm' | 'running' | 'done'>('pick')
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [failedNames, setFailedNames] = useState<string[]>([])

  const isAdd = mode === 'add'
  const total = friends.length
  const availableTags = allTags // 付ける/外すとも全タグから選ばせる（外す側は付いてなければ何もしないだけ）

  const toggleTag = (tag: Tag) => {
    setSelectedTags((prev) =>
      prev.some((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag],
    )
  }

  const createAndSelect = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    setError('')
    try {
      const color = NEW_TAG_COLORS[allTags.length % NEW_TAG_COLORS.length]
      const r = await api.tags.create({ name, color })
      if (!r.success || !r.data) throw new Error()
      setNewName('')
      onTagCreated?.()
      setSelectedTags((prev) => [...prev, r.data as Tag])
    } catch {
      setError('タグの作成に失敗しました。')
    } finally {
      setCreating(false)
    }
  }

  // CONCURRENCY 並列で friends を順次処理。各友だちに選択タグを付与/削除する。
  const execute = async () => {
    setStep('running')
    setProgress(0)
    const tagIds = selectedTags.map((t) => t.id)
    const failed: SelFriend[] = []
    let done = 0
    let idx = 0
    const runNext = async (): Promise<void> => {
      const i = idx++
      if (i >= friends.length) return
      const f = friends[i]
      try {
        for (const tagId of tagIds) {
          const r = isAdd ? await api.friends.addTag(f.id, tagId) : await api.friends.removeTag(f.id, tagId)
          if (!r.success) throw new Error()
        }
      } catch {
        failed.push(f)
      }
      done++
      setProgress(done)
      return runNext()
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, friends.length) }, () => runNext()))
    setFailedNames(failed.map((f) => f.name))
    setStep('done')
    onDone({ tagIds, friendIds: friends.map((f) => f.id), failedNames: failed.map((f) => f.name) })
  }

  const tagLabels = selectedTags.map((t) => `「${t.name}」`).join('・')

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={step === 'running' ? undefined : onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isAdd ? 'タグを付ける' : 'タグを外す'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{total}人が対象</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === 'pick' && (
            <>
              <p className="text-xs text-gray-500">
                {isAdd ? '付けるタグを選んでください（複数可）。' : '外すタグを選んでください（複数可）。'}
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const on = selectedTags.some((t) => t.id === tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`inline-flex items-center gap-1 min-h-[44px] px-3 rounded-full text-sm font-medium border transition-colors ${
                        on ? 'text-white border-transparent' : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                      style={on ? { backgroundColor: tag.color || '#14283F' } : undefined}
                    >
                      {on ? '✓ ' : ''}{tag.name}
                    </button>
                  )
                })}
                {availableTags.length === 0 && (
                  <p className="text-sm text-gray-400">タグがありません。{isAdd ? '下で作成できます。' : ''}</p>
                )}
              </div>

              {isAdd && (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-gray-500 mb-1">新しいタグを作る</p>
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
                      onClick={createAndSelect}
                      disabled={creating || newName.trim() === ''}
                      className="shrink-0 min-h-[44px] px-4 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                      style={{ backgroundColor: '#14283F' }}
                    >
                      作成
                    </button>
                  </div>
                </div>
              )}
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{error}</div>}
            </>
          )}

          {step === 'confirm' && (
            <div className="py-4 text-center space-y-2">
              <p className="text-sm text-gray-800">
                <span className="font-semibold">{total}人</span>に{tagLabels}を
                {isAdd ? '付けます' : '外します'}。よろしいですか？
              </p>
            </div>
          )}

          {step === 'running' && (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-gray-800">{progress}/{total}人 処理中…</p>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-brand h-2 transition-all" style={{ width: `${total ? (progress / total) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-4 space-y-2 text-center">
              <p className="text-sm font-medium text-brand">
                {isAdd ? '付与' : '解除'}が完了しました（{total - failedNames.length}/{total}人）。
              </p>
              {failedNames.length > 0 && (
                <div className="text-left mt-2 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <p className="font-semibold mb-1">{failedNames.length}人失敗しました:</p>
                  <p className="break-words">{failedNames.join('、')}</p>
                  <p className="mt-1 text-red-500">成功した分はそのまま有効です。</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-gray-100 bg-white">
          {step === 'pick' && (
            <>
              <button type="button" onClick={onClose} className="flex-1 min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={selectedTags.length === 0}
                className="flex-1 min-h-[44px] px-4 rounded-lg text-white text-sm font-medium disabled:opacity-40"
                style={{ backgroundColor: '#14283F' }}
              >
                確認へ
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button type="button" onClick={() => setStep('pick')} className="flex-1 min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">
                戻る
              </button>
              <button type="button" onClick={execute} className="flex-1 min-h-[44px] px-4 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#14283F' }}>
                {isAdd ? '付ける' : '外す'}
              </button>
            </>
          )}
          {step === 'running' && (
            <button type="button" disabled className="flex-1 min-h-[44px] px-4 rounded-lg text-white text-sm font-medium opacity-60" style={{ backgroundColor: '#14283F' }}>
              処理中…
            </button>
          )}
          {step === 'done' && (
            <button type="button" onClick={onClose} className="flex-1 min-h-[44px] px-4 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#14283F' }}>
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
