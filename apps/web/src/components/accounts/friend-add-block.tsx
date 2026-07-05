'use client'

import { useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

interface Props {
  /** LINE公式アカウントの basicId（@付き/なしどちらでも可・null は未取得）。 */
  basicId: string | null
}

/**
 * LINEアカウントカード内に置く「友だち追加」ブロック。
 * basicId から友だち追加URL（https://line.me/R/ti/p/@{id}）を組み立て、URLのコピーと
 * QRコード（クライアント側でローカル生成・外部QRサービスは使わない）を提供する。
 * basicId が無いときは manager.line.biz での発行を案内し、使い方ページへ誘導する。
 *
 * 表示は SIMPLE_MODE でも常に出す（友だち追加は基本機能のため）。
 */
export default function FriendAddBlock({ basicId }: Props) {
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // basicId の先頭 '@' の有無を吸収して URL を組み立てる。
  const addUrl = useMemo(() => {
    if (!basicId) return null
    const id = basicId.startsWith('@') ? basicId.slice(1) : basicId
    if (!id) return null
    return `https://line.me/R/ti/p/@${id}`
  }, [basicId])

  const copy = async () => {
    if (!addUrl) return
    try {
      await navigator.clipboard.writeText(addUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // クリップボード非対応環境では黙って何もしない（URLは画面に出ている）。
    }
  }

  // QR（canvas）を PNG としてダウンロード。名刺印刷・保存用。
  const downloadQr = () => {
    const canvas = wrapRef.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `line-friend-qr${basicId ? `-${basicId.replace(/^@/, '')}` : ''}.png`
    a.click()
  }

  // basicId 未取得（トークン未設定/失効/取得失敗）時のフォールバック。
  if (!addUrl) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-600 mb-1">友だち追加</p>
        <p className="text-xs text-gray-500">
          友だち追加URL・QRコードは
          <a
            href="https://manager.line.biz"
            target="_blank"
            rel="noreferrer"
            className="text-brand underline mx-0.5"
          >
            LINE公式アカウントの管理画面（manager.line.biz）
          </a>
          で発行できます。手順は
          <a href="/guide" className="text-brand underline mx-0.5">使い方</a>
          をご覧ください。
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-600 mb-2">友だち追加</p>
      <div className="flex items-start gap-3">
        {/* QRコード（クライアント側でローカル生成） */}
        <div ref={wrapRef} className="shrink-0 rounded-lg border border-gray-200 bg-white p-2">
          <QRCodeCanvas value={addUrl} size={96} level="M" marginSize={0} />
        </div>

        <div className="min-w-0 flex-1">
          {/* 友だち追加URL */}
          <p className="text-[11px] text-gray-500 mb-1">友だち追加URL</p>
          <p className="text-xs text-gray-800 font-mono break-all bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
            {addUrl}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={copy}
              className="min-h-[36px] px-3 rounded-lg text-xs font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              {copied ? '✓ コピーしました' : 'URLをコピー'}
            </button>
            <button
              type="button"
              onClick={downloadQr}
              className="min-h-[36px] px-3 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#14283F' }}
            >
              QRを保存
            </button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        短いURL（lin.ee）が必要な場合は、LINE公式アカウントの管理画面で発行できます。
      </p>
    </div>
  )
}
