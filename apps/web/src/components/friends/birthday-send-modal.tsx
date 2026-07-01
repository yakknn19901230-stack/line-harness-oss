'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  friendId: string
  friendName: string
  onClose: () => void
  /** 送信成功時。呼び出し側でトーストを出す */
  onSent: (message: string) => void
}

// 暫定のお祝い文面（v2 で差し替え前提）。{name} は友だちの表示名に置換する。
function buildDefaultMessage(name: string): string {
  const n = name || 'お客'
  return `${n}様お誕生日おめでとうございます。${n}様にとって、この一年が健やかで実り多い年になりますようお祈りしています。`
}

/**
 * 誕生日お祝いメッセージの送信モーダル。
 * 既存の送信経路 api.chats.send(friendId, { content })（POST /api/chats/:id/send。
 * worker 側で id=friend_id として resolveOrCreateChat される）をそのまま再利用する。
 */
export default function BirthdaySendModal({ friendId, friendName, onClose, onSent }: Props) {
  const [message, setMessage] = useState(() => buildDefaultMessage(friendName))
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
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">🎂 お祝いメッセージを送る</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {friendName || '名前なし'} さんへ
          </p>
        </div>

        <form onSubmit={handleSend} className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            下の文章はそのまま送れますが、自由に書き換えても大丈夫です。内容を確認して「送信」を押してください😊
          </p>

          <div>
            <label htmlFor="bd-message" className="block text-sm font-medium text-gray-800 mb-1">
              メッセージ本文
            </label>
            <textarea
              id="bd-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
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
