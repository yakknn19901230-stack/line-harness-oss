'use client'

import { useState } from 'react'
import PromptModal, { type PromptTemplate } from '@/components/prompt-modal'
import { isSimpleMode } from '@/lib/simple-mode'

interface CcPromptButtonProps {
  prompts: PromptTemplate[]
}

export default function CcPromptButton({ prompts }: CcPromptButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  // 保全くんモード（SIMPLE_MODE）では開発者向けの「CCに依頼」ボタンを出さない。
  // 機能・依存は残し、描画だけ抑止（フラグでいつでも復帰可能）。モバイルの送信ボタンに
  // 覆いかぶさる実害を回避する目的。
  if (isSimpleMode()) return null

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 min-h-[48px] bg-gray-900 text-white text-sm font-medium rounded-full shadow-lg hover:bg-gray-800 transition-colors"
        aria-label="CCに依頼"
      >
        <span className="text-base leading-none">📋</span>
        <span className="hidden sm:inline">CCに依頼</span>
      </button>

      <PromptModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        prompts={prompts}
      />
    </>
  )
}
