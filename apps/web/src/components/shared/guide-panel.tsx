'use client'

import { useState, type ReactNode } from 'react'

interface GuidePanelProps {
  /** パネル見出し（例: 「あいさつメッセージって何？」） */
  title: string
  /** 本文。優しい説明文や手順を差し込む */
  children: ReactNode
  /** 初期表示で開いておくか。デフォルト: 開いた状態 */
  defaultOpen?: boolean
  /** ルート要素へ追加するクラス（主に余白調整用） */
  className?: string
}

/**
 * 折りたたみ式の説明パネル。
 * 初心者向けの使い方ガイドを画面上部に置くための共通UI。
 * 開閉状態はコンポーネント内 state で持つ（ブラウザストレージは使わない）。
 */
export default function GuidePanel({
  title,
  children,
  defaultOpen = true,
  className = '',
}: GuidePanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={`rounded-lg border border-green-200 bg-green-50/70 overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-green-100/60 transition-colors"
      >
        {/* 電球アイコン: 「ヒント」であることが一目で伝わるように */}
        <span
          className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white"
          aria-hidden="true"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </span>
        <span className="flex-1 text-sm font-semibold text-green-900">{title}</span>
        <span className="shrink-0 text-xs text-green-700 font-medium">
          {open ? '閉じる' : '開く'}
        </span>
        <svg
          className={`shrink-0 w-4 h-4 text-green-600 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 text-sm text-gray-700 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}
