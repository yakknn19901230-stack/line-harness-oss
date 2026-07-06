'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import {
  MESSAGE_SCENES,
  DEFAULT_SCENE_ID,
  findScene,
  renderSceneMessage,
  hasVariants,
  isSceneText,
  type MessageScene,
  type SceneVariant,
} from './message-scenes'

// セッション内の送信記録（当日のみ有効・ページ再読込で消える。二重送信抑止用）。
// サーバー側の送信履歴は作らない方針のため、フロントの簡易メモに留める。
const sentLog: Record<string, { date: string; time: string }> = {}
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
function hhmm(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 「自由に書く」用の擬似場面ID（MESSAGE_SCENES には含めない）。
const FREE_ID = 'free'

interface Props {
  friendId: string
  friendName: string
  /** 初期選択する場面ID（一覧からは apo_thanks、誕生日パネルからは birthday）。 */
  initialSceneId?: string
  /** 開いた直後に「自由に書く」を選択状態にする（フォロー予定からの送信で使用）。 */
  defaultFree?: boolean
  /** 本文欄の上に参考表示するメモ（本文には入れない）。フォロー予定のメモ等。 */
  referenceNote?: string
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
  defaultFree = false,
  referenceNote,
  onClose,
  onSent,
}: Props) {
  const firstScene = findScene(initialSceneId ?? DEFAULT_SCENE_ID)
  const [selectedSceneId, setSelectedSceneId] = useState(defaultFree ? FREE_ID : firstScene.id)
  // バリアントを持つ場面を選んだとき、枝分かれ選択肢を出す対象の場面ID（null で非表示）。
  // 初期選択がバリアント場面（例: アポ後お礼）なら、最初から枝分かれを見せる。
  const [variantSceneId, setVariantSceneId] = useState<string | null>(
    !defaultFree && hasVariants(firstScene) ? firstScene.id : null,
  )
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [message, setMessage] = useState(() =>
    defaultFree ? '' : renderSceneMessage(firstScene.template ?? '', friendName),
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // 2段階送信: 1回目のクリックで確定待ちにし、2回目で実送信。
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 当日この友だちに送信済みなら、その時刻（二重送信の注意書き用）
  const alreadySentTime = sentLog[friendId]?.date === todayKey() ? sentLog[friendId].time : null

  const cancelConfirm = () => {
    setConfirming(false)
    if (confirmTimer.current) { clearTimeout(confirmTimer.current); confirmTimer.current = null }
  }

  // 背景スクロールを止める（他モーダルと同じ作法）
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  // チップ選択時の置き換え可否。空 or 未編集（いずれかの定型文と一致）なら黙って
  // 置き換え、ユーザーが編集した内容が入っているときだけ確認する（追記はしない）。
  const confirmReplace = () => {
    if (message.trim() !== '' && !isSceneText(message, friendName)) {
      return window.confirm('入力中の文面を置き換えますか？')
    }
    return true
  }

  const selectScene = (scene: MessageScene) => {
    // バリアントを持つ場面: 本文は変えず、枝分かれ選択肢を出す（実挿入はバリアント選択時）。
    if (hasVariants(scene)) {
      setSelectedSceneId(scene.id)
      setVariantSceneId(scene.id)
      setError('')
      cancelConfirm()
      return
    }
    if (scene.id === selectedSceneId && variantSceneId === null) return
    if (!confirmReplace()) return
    setMessage(renderSceneMessage(scene.template ?? '', friendName))
    setSelectedSceneId(scene.id)
    setSelectedVariantId(null)
    setVariantSceneId(null)
    setError('')
    cancelConfirm()
  }

  const selectVariant = (scene: MessageScene, variant: SceneVariant) => {
    if (!confirmReplace()) return
    setMessage(renderSceneMessage(variant.template, friendName))
    setSelectedSceneId(scene.id)
    setSelectedVariantId(variant.id)
    setError('')
    cancelConfirm()
  }

  // 「自由に書く」: 本文を空にして自由入力にする。
  const selectFree = () => {
    if (selectedSceneId === FREE_ID) return
    if (!confirmReplace()) return
    setMessage('')
    setSelectedSceneId(FREE_ID)
    setSelectedVariantId(null)
    setVariantSceneId(null)
    setError('')
    cancelConfirm()
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) {
      setError('メッセージを入力してください')
      return
    }
    // 1回目: 確定待ちに切り替える（数秒放置で自動的に戻す）。実送信は2回目。
    if (!confirming) {
      setError('')
      setConfirming(true)
      confirmTimer.current = setTimeout(() => setConfirming(false), 4000)
      return
    }
    cancelConfirm()
    setSending(true)
    setError('')
    try {
      const res = await api.chats.send(friendId, { content: message.trim() })
      if (res.success) {
        sentLog[friendId] = { date: todayKey(), time: hhmm() }
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
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー: 誰に送るか（固定） */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">メッセージを送る</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {friendName || '名前なし'} さんへ
          </p>
        </div>

        <form onSubmit={handleSend} className="flex-1 flex flex-col min-h-0">
          {/* 本文エリア（スクロール可能） */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* 当日すでに送っている場合の注意（二重送信の抑止） */}
            {alreadySentTime && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                ⚠ この方には <strong>今日 {alreadySentTime}</strong> に送信済みです。重複にご注意ください。
              </div>
            )}
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
                      onClick={() => selectScene(scene)}
                      aria-pressed={active}
                      className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                        active
                          ? 'text-white border-transparent'
                          : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                      }`}
                      style={active ? { backgroundColor: '#14283F' } : undefined}
                    >
                      {scene.label}{hasVariants(scene) ? ' ›' : ''}
                    </button>
                  )
                })}
                {/* 自由に書く（場面チップ列の最後） */}
                <button
                  type="button"
                  onClick={selectFree}
                  aria-pressed={selectedSceneId === FREE_ID}
                  className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                    selectedSceneId === FREE_ID
                      ? 'text-white border-transparent'
                      : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                  style={selectedSceneId === FREE_ID ? { backgroundColor: '#14283F' } : undefined}
                >
                  自由に書く
                </button>
              </div>

              {/* バリアント（枝分かれ）選択肢。バリアントを持つ場面を選んだときのみ表示。 */}
              {(() => {
                const vScene = variantSceneId ? findScene(variantSceneId) : null
                if (!vScene || !hasVariants(vScene)) return null
                return (
                  <div className="mt-2 pl-2 border-l-2 border-accent/50">
                    <p className="text-[11px] text-gray-500 mb-1.5">「{vScene.label}」の状況を選ぶ</p>
                    <div className="flex flex-wrap gap-2">
                      {vScene.variants!.map((v) => {
                        const vActive = selectedVariantId === v.id && selectedSceneId === vScene.id
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => selectVariant(vScene, v)}
                            aria-pressed={vActive}
                            className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                              vActive
                                ? 'text-brand border-accent bg-accent/20'
                                : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {v.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* メッセージ本文 */}
            <div>
              <label htmlFor="msg-body" className="block text-sm font-medium text-gray-800 mb-1">
                メッセージ本文
              </label>
              {/* フォロー予定などのメモを参考表示（本文には入れない） */}
              {referenceNote && referenceNote.trim() !== '' && (
                <div className="mb-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2">
                  <p className="text-[11px] font-medium text-brand mb-0.5">📌 フォロー予定のメモ（参考）</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{referenceNote}</p>
                </div>
              )}
              <textarea
                id="msg-body"
                rows={6}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value)
                  cancelConfirm()
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
              {/* 「自由に書く」選択時は定型文向けの注意書きを出さない。 */}
              {selectedSceneId !== FREE_ID && (
                <p className="text-[11px] text-gray-400 mt-1">
                  定型文はそのまま送れますが、相手のことを一言添えると、より気持ちが伝わります😊
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* フッター（下部固定・キーボードでも隠れないよう常時表示） */}
          <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-gray-100 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={sending}
              aria-live="polite"
              className={`flex-1 min-h-[44px] px-6 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${
                confirming ? 'text-brand border-2 border-accent' : 'text-white border-2 border-transparent'
              }`}
              style={confirming ? { backgroundColor: '#E8B44A' } : { backgroundColor: '#14283F' }}
            >
              {sending
                ? '送信中…'
                : confirming
                  ? `${friendName || 'この方'}さんに送信する（もう一度）`
                  : '送信'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
