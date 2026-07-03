'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** 見出し（絵文字込み。例: "🎂 今週の誕生日"） */
  title: string
  /** 見出し直下に常時表示する1行説明（薄いグレー・小さめ）。折りたたみ時も表示。 */
  description?: string
  loading?: boolean
  /** 件数（>0 でピル表示）。unit と組み合わせて "5 人" 等 */
  count?: number
  unit?: string
  /** 折りたたみ時に強調表示する一言（例: "今日1人"）。null で非表示 */
  highlight?: string | null
  /** スマホでの初期開閉。PC は常に開いている。 */
  initialOpenMobile?: boolean
  /** ルートの枠線クラス（例: "border-2 border-accent/50"） */
  borderClass?: string
  children: ReactNode
}

/**
 * ダッシュボード/一覧の上部パネル共通シェル。
 * - スマホ幅: 見出し行がトグルになり、初期は閉じる（当日該当があれば初期展開）。
 * - PC幅: 常に開いた状態（従来どおり）。
 */
export default function PanelShell({
  title,
  description,
  loading = false,
  count = 0,
  unit = '人',
  highlight,
  initialOpenMobile = false,
  borderClass = 'border border-gray-200',
  children,
}: Props) {
  const [openMobile, setOpenMobile] = useState(initialOpenMobile)
  // データが非同期で届いて「当日該当あり」に変わったら自動展開する。
  // ただしユーザーが一度手で開閉したら以降は尊重する（勝手に開き直さない）。
  const userToggled = useRef(false)
  useEffect(() => {
    if (!userToggled.current && initialOpenMobile) setOpenMobile(true)
  }, [initialOpenMobile])
  const toggle = () => {
    userToggled.current = true
    setOpenMobile((v) => !v)
  }

  const spinner = (
    <span className="inline-block w-4 h-4 border-2 border-gray-200 border-t-brand rounded-full animate-spin" aria-label="読み込み中" />
  )
  const pill = count > 0 ? (
    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-brand font-semibold">{count} {unit}</span>
  ) : null

  return (
    <div className={`bg-white rounded-lg ${borderClass} p-4 mb-4`}>
      {/* スマホ: トグル見出し */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={openMobile}
        className="lg:hidden w-full flex items-center gap-2 min-h-[44px] text-left"
      >
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {loading ? spinner : pill}
        {!loading && highlight && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-brand font-bold">{highlight}</span>
        )}
        <svg
          className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${openMobile ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* PC: 固定見出し */}
      <div className={`hidden lg:flex items-center gap-2 ${description ? 'mb-1' : 'mb-3'}`}>
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {loading ? spinner : pill}
      </div>

      {/* 見出し直下の説明（常時表示・折りたたみに影響されない）。 */}
      {description && (
        <p className="text-xs text-gray-500 mt-1 lg:mt-0 lg:mb-3">{description}</p>
      )}

      {/* 中身: スマホは開いている時のみ / PC は常時 */}
      <div className={`${openMobile ? 'block mt-3' : 'hidden'} lg:block lg:mt-0`}>
        {children}
      </div>
    </div>
  )
}
