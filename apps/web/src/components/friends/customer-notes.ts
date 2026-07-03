// 顧客カルテ（面談メモ・次回フォロー）の metadata スキーマと共通パーサ。
// friends.metadata に下記キーで保存する（worker は shallow merge なので他キーは壊さない）:
//   notes:     Array<{ date: 'YYYY-MM-DD'; text: string }>   … 追記式・新しい順で保持
//   followups: Array<{ date: 'YYYY-MM-DD'; note: string; done: boolean }>
//
// 既存キー（birthday, contracts, phone, email）には一切触れない。

export interface CustomerNote {
  /** 追記した日（YYYY-MM-DD） */
  date: string
  text: string
}

export interface Followup {
  /** 期日（YYYY-MM-DD） */
  date: string
  note: string
  done: boolean
}

/** ブラウザのローカル日付で今日の YYYY-MM-DD を返す（追記日・フォロー既定日に使う）。 */
export function todayYmd(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function asYmd(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const head = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : ''
}

/** metadata から面談メモ配列を安全に取り出す。壊れた要素は落とす。保存順（新しい順）を維持。 */
export function parseNotes(meta: Record<string, unknown> | null | undefined): CustomerNote[] {
  const raw = meta?.notes
  if (!Array.isArray(raw)) return []
  return raw
    .map((n) => {
      const o = (n ?? {}) as Record<string, unknown>
      return { date: asYmd(o.date), text: typeof o.text === 'string' ? o.text : '' }
    })
    .filter((n) => n.text.trim() !== '')
}

/** metadata から次回フォロー配列を安全に取り出す。 */
export function parseFollowups(meta: Record<string, unknown> | null | undefined): Followup[] {
  const raw = meta?.followups
  if (!Array.isArray(raw)) return []
  return raw
    .map((f) => {
      const o = (f ?? {}) as Record<string, unknown>
      return { date: asYmd(o.date), note: typeof o.note === 'string' ? o.note : '', done: o.done === true }
    })
    .filter((f) => f.date !== '' || f.note.trim() !== '')
}

/** 一覧行・カードに出す「最新メモ」の1行プレビュー（無ければ null）。 */
export function latestNotePreview(meta: Record<string, unknown> | null | undefined): string | null {
  const notes = parseNotes(meta)
  return notes.length > 0 ? notes[0].text : null
}

/** YYYY-MM-DD → 表示用 YYYY/MM/DD（不正なら空）。 */
export function ymdToSlash(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  return m ? `${m[1]}/${m[2]}/${m[3]}` : ''
}
