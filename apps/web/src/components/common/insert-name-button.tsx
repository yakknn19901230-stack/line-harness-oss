'use client'

import { type RefObject } from 'react'

interface Props {
  /** 挿入先の textarea 参照。カーソル位置に {{name}} を差し込む。 */
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** 現在の入力値（controlled component の state） */
  value: string
  /** 値更新コールバック（controlled component の setter） */
  onChange: (next: string) => void
}

/**
 * メッセージ入力欄に「👤 お名前を挿入」ボタンと説明を出す共通パーツ。
 *
 * 押すとカーソル位置（未フォーカスなら末尾）に `{{name}}` を差し込む。
 * このボタンは、送信時に worker 側の expandVariables で {{name}} が実際に
 * 置換される経路（シナリオ配信・あいさつ / テンプレート）だけに置く。
 * 一斉配信・リマインダ・個別チャット送信のように置換されない経路には
 * 付けない（利用者を誤解させないため）。
 */
export default function InsertNameButton({ textareaRef, value, onChange }: Props) {
  const insert = () => {
    const el = textareaRef.current
    const token = '{{name}}'
    // フォーカスが無い / 参照できない場合は末尾に足す。
    const start = el ? el.selectionStart : value.length
    const end = el ? el.selectionEnd : value.length
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    // 挿入直後のカーソルをトークンの後ろへ戻す（続けて入力できるように）。
    if (el) {
      const caret = start + token.length
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(caret, caret)
      })
    }
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={insert}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors"
      >
        👤 お名前を挿入
      </button>
      <p className="text-xs text-gray-400 mt-1">
        {'{{name}}'} は送信時にお客様のLINE名に置き換わります
      </p>
    </div>
  )
}
