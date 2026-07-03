'use client'

/*
 * 数字入力を主役にした日付入力（YYYY/MM/DD）。
 * - 数字だけ打てば自動で / が入る（19850702 → 1985/07/02）
 * - 数字以外は入力不可、年4桁・月日各2桁まで
 * - 月・日の1桁は blur 時にゼロ埋め（7 → 07）
 * 保存形式(YYYY-MM-DD)との変換・検証はエクスポート関数で行い、保存側の形式は変えない。
 */

/** stored 'YYYY-MM-DD' → 表示 'YYYY/MM/DD'（不正なら ''） */
export function storedToDisplay(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '')
  return m ? `${m[1]}/${m[2]}/${m[3]}` : ''
}

/**
 * 表示文字列を検証して stored 'YYYY-MM-DD' に変換する。
 * - 空文字 → { ok: true, value: '' }（未入力は許容）
 * - 不完全 / 不正な日付（13月・2/30 等）→ { ok: false }
 */
export function displayToStored(display: string): { ok: boolean; value: string } {
  const s = (display || '').trim()
  if (s === '') return { ok: true, value: '' }
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s)
  if (!m) return { ok: false, value: '' }
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return { ok: false, value: '' }
  // 2/30 のような存在しない日付を弾く（Date が繰り上げないか往復チェック）
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return { ok: false, value: '' }
  }
  return { ok: true, value: `${m[1]}-${m[2]}-${m[3]}` }
}

/** onChange 用: 生入力を数字ストリームとして YYYY/MM/DD に整形する。 */
function formatStream(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`
}

/** onBlur 用: 月・日が1桁ならゼロ埋めする。 */
function padOnBlur(display: string): string {
  const parts = display.split('/')
  if (parts[1] && parts[1].length === 1) parts[1] = '0' + parts[1]
  if (parts[2] && parts[2].length === 1) parts[2] = '0' + parts[2]
  return parts.join('/')
}

interface DateInputProps {
  /** 表示文字列（YYYY/MM/DD、部分入力可） */
  value: string
  /** 整形後の表示文字列を返す */
  onChange: (value: string) => void
  id?: string
  ariaLabel?: string
  /** true で赤枠（保存時バリデーションエラーの明示に使う） */
  invalid?: boolean
  /** 幅など、呼び出し側で足すクラス（w-full / w-[9.5rem] 等） */
  className?: string
}

export default function DateInput({ value, onChange, id, ariaLabel, invalid, className }: DateInputProps) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="YYYY/MM/DD"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(formatStream(e.target.value))}
      onBlur={(e) => onChange(padOnBlur(e.target.value))}
      maxLength={10}
      // text-base (16px) は必須: iOS Safari はフォント16px未満の入力欄にフォーカスすると
      // 自動でズームしてしまい、操作感が大きく損なわれる。ここを16pxに保つ。
      className={`${className ?? ''} border rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 ${
        invalid ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-green-500'
      }`}
    />
  )
}
