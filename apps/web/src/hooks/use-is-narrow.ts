'use client'

import { useEffect, useState } from 'react'

/**
 * スマホ幅（既定: Tailwind lg 未満 = 1024px 未満）かどうかを返す。
 * SSR とのハイドレーション不一致を避けるため初期値は false、マウント後に判定。
 */
export function useIsNarrow(query = '(max-width: 1023px)'): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return narrow
}
