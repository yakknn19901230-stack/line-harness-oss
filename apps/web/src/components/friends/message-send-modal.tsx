'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  MESSAGE_SCENES,
  DEFAULT_SCENE_ID,
  findScene,
  renderSceneMessage,
} from './message-scenes'

interface Props {
  friendId: string
  friendName: string
  /** 初期選択する場面ID（一覧からは apo_thanks、誕生日パネルからは birthday）。 */
  initialSceneId?: string
  onClose: () => void
  /** 送信成功時。呼び出し側でトーストを出す */
  onSent: (message: string) => void
}

/**
 * 場面別メッセージランチャー。
 * 場面チップを選ぶ→定型文({name}置換済)が textarea に入る→一言足して送信。
 * 送信は既存経路 api.chats.send(friendId, { content })（worker で id=friend_id として
 * resolveOrCreateChat される）をそのまま再利用する。
 */
export default function MessageSendModal({
  friendId,
  friendName,
  initialSceneId,
  onClose,
  onSent,
}: Props) {
  const firstScene = findScene(initialSceneId ?? DEFAULT_SCENE_ID)
  const [selectedSceneId, setSelectedSceneId] = useState(firstScene.id)
  const [message, setMessage] = useState(() => renderSceneMessage(firstScene.template, friendName))
  // textarea を手編集したか。チップ切替時に「破棄して差し替えるか」を確認するために使う。
  const [edited, setEdited] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // 背景スクロールを止める（他モーダルと同じ作法）
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const selectScene = (sceneId: string) => {
    if (sceneId === selectedSceneId) return
    // 手編集済みの内容がある状態で別の場面に切り替えるときは確認を挟む。
    if (edited && message.trim() !== '') {
      const ok = window.confirm('編集中の内容を破棄して差し替えますか？')
      if (!ok) return
    }
    const scene = findScene(sceneId)
    setMessage(renderSceneMessage(scene.template, friendName))
    setSelectedSceneId(scene.id)
    setEdited(false)
    setError('')
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) {
      setError('メッセージを入力してください')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await api.chats.send(friendId, { content: message.trim() })
      if (res.success) {
        onSent('送信しました')
        onClose()
      } else {
        setError((res as { error?: string }).error || '送信に失敗しました')
      }
    } catch {
      setError('送信に失敗しました。通信状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー: 誰に送るか */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">メッセージを送る</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {friendName || '名前なし'} さんへ
          </p>
        </div>

        <form onSubmit={handleSend} className="px-5 py-4 space-y-4">
          {/* 場面チップ */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">場面を選ぶ</p>
            <div className="flex flex-wrap gap-2">
              {MESSAGE_SCENES.map((scene) => {
                const active = scene.id === selectedSceneId
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => selectScene(scene.id)}
                    aria-pressed={active}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'text-white border-transparent'
                        : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                    style={active ? { backgroundColor: '#06C755' } : undefined}
                  >
                    {scene.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* メッセージ本文 */}
          <div>
            <label htmlFor="msg-body" className="block text-sm font-medium text-gray-800 mb-1">
              メッセージ本文
            </label>
            <textarea
              id="msg-body"
              rows={6}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                setEdited(true)
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              定型文はそのまま送れますが、相手のことを一言添えると、より気持ちが伝わります😊
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#06C755' }}
            >
              {sending ? '送信中…' : '送信'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
