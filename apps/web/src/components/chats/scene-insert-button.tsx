'use client'

import { useState } from 'react'
import {
  MESSAGE_SCENES,
  renderSceneMessage,
  hasVariants,
  type MessageScene,
} from '@/components/friends/message-scenes'

interface Props {
  /** 現在開いている顧客の表示名（{name} 差し込みに使う） */
  friendName: string
  /** 選んだ場面（バリアント）の文面（名前差し込み済み）を入力欄へ渡す */
  onInsert: (text: string) => void
}

/**
 * 個別チャットの入力欄近くに置く「場面から選ぶ」ボタン。
 * 押すと message-scenes.ts の場面をシート型で提示し、選ぶと名前差し込み済みの
 * 文面を入力欄へ挿入する。バリアントを持つ場面は、場面選択後に枝分かれ選択肢を出す。
 * 文面マスターは message-scenes.ts のまま（複製しない）。
 */
export default function SceneInsertButton({ friendName, onInsert }: Props) {
  const [open, setOpen] = useState(false)
  // バリアント選択中の場面（null なら場面一覧を表示）。
  const [variantScene, setVariantScene] = useState<MessageScene | null>(null)

  const close = () => { setOpen(false); setVariantScene(null) }
  const pick = (text: string) => { onInsert(text); close() }

  const onSceneClick = (scene: MessageScene) => {
    if (hasVariants(scene)) {
      setVariantScene(scene) // 枝分かれを出す
    } else {
      pick(renderSceneMessage(scene.template ?? '', friendName))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        💬 場面から選ぶ
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
          onClick={close}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 py-4 border-b border-gray-100">
              {variantScene ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVariantScene(null)}
                    aria-label="場面一覧に戻る"
                    className="shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                  >
                    ‹
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 truncate">{variantScene.label}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">状況を選んでください</p>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-base font-semibold text-gray-900">場面から選ぶ</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    選ぶと文面が入力欄に入ります（そのまま編集して送信できます）
                  </p>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {variantScene
                ? variantScene.variants!.map((v) => {
                    const rendered = renderSceneMessage(v.template, friendName)
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => pick(rendered)}
                        className="w-full text-left min-h-[44px] px-4 py-3 rounded-lg border border-gray-200 hover:border-brand/40 hover:bg-gray-50 transition-colors"
                      >
                        <span className="block text-sm font-medium text-gray-900">{v.label}</span>
                        <span className="block text-xs text-gray-500 mt-0.5 line-clamp-1 break-all">
                          {rendered.split('\n')[0]}
                        </span>
                      </button>
                    )
                  })
                : MESSAGE_SCENES.map((scene) => {
                    const variants = hasVariants(scene)
                    const preview = variants
                      ? '状況を選んで挿入します'
                      : renderSceneMessage(scene.template ?? '', friendName).split('\n')[0]
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => onSceneClick(scene)}
                        className="w-full text-left min-h-[44px] px-4 py-3 rounded-lg border border-gray-200 hover:border-brand/40 hover:bg-gray-50 transition-colors flex items-center gap-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900">{scene.label}</span>
                          <span className="block text-xs text-gray-500 mt-0.5 line-clamp-1 break-all">{preview}</span>
                        </span>
                        {variants && <span className="shrink-0 text-gray-400 text-lg leading-none">›</span>}
                      </button>
                    )
                  })}
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={close}
                className="w-full min-h-[44px] rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
