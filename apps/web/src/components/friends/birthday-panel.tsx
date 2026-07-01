'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { FriendListItem } from '@/lib/api'
import BirthdaySendModal from './birthday-send-modal'

interface Props {
  /** 対象アカウント（null=全アカウント）。メインの一覧と同じスコープに合わせる。 */
  accountId: string | null
  /** 親で顧客情報が保存された等、パネルの再取得を促したいときに増やすキー。 */
  refreshKey?: number
  /** 送信成功トーストはページ側で出す */
  onToast: (message: string) => void
}

interface UpcomingBirthday {
  id: string
  name: string
  month: number
  day: number
  /** 今日から誕生日までの日数（0=今日） */
  daysUntil: number
}

// 全件取得の設定。1ページを大きめに取り、hasNextPage を辿って全ページ集める。
// 常識的な安全上限（打ち切り）を入れて、異常に多い環境でも暴走しないようにする。
const FETCH_PAGE_SIZE = 200
const MAX_FRIENDS = 5000

/** metadata の birthday("YYYY-MM-DD") から月・日を取り出す。妥当でなければ null。 */
function parseMonthDay(raw: unknown): { month: number; day: number } | null {
  if (typeof raw !== 'string') return null
  const m = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { month, day }
}

/** 年を無視して、今日から次の誕生日（当日含む）までの日数を返す。年またぎも考慮。 */
function daysUntilBirthday(month: number, day: number, today: Date): number {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = new Date(today.getFullYear(), month - 1, day)
  let diff = Math.round((next.getTime() - t0.getTime()) / 86_400_000)
  if (diff < 0) {
    // 今年の誕生日は過ぎている → 来年の同月日で測る（12月→1月の年またぎもこれで正しく出る）
    next = new Date(today.getFullYear() + 1, month - 1, day)
    diff = Math.round((next.getTime() - t0.getTime()) / 86_400_000)
  }
  return diff
}

function relativeLabel(daysUntil: number): string {
  if (daysUntil === 0) return '今日！'
  return `あと${daysUntil}日`
}

export default function BirthdayPanel({ accountId, refreshKey, onToast }: Props) {
  // 全友だち（誕生日判定の母集団）。パネルが自前で取得する。
  const [friends, setFriends] = useState<FriendListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // 誕生日を送る対象の友だち（モーダル制御）
  const [sendTarget, setSendTarget] = useState<{ id: string; name: string } | null>(null)

  // 全ページをループ取得。メインの一覧のページング状態には依存しない。
  // includeTags/includeChatStatus は付けない（誕生日判定に不要で、取得を軽くするため）。
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    const fetchAll = async () => {
      const all: FriendListItem[] = []
      let offset = 0
      // 無限ループ保険: MAX_FRIENDS に達したら打ち切る
      while (all.length < MAX_FRIENDS) {
        const res = await api.friends.list({
          limit: FETCH_PAGE_SIZE,
          offset: String(offset),
          accountId: accountId || undefined,
          includeTags: false,
        })
        if (!res.success) throw new Error(res.error)
        const got = res.data.items.length
        all.push(...res.data.items)
        // サーバが要求未満を返しても取りこぼさないよう、実際に受け取った件数で進める。
        // 0件が返ったら（想定外だが）無限ループを避けて打ち切る。
        if (!res.data.hasNextPage || got === 0) break
        offset += got
      }
      return all
    }

    fetchAll()
      .then((all) => {
        if (cancelled) return
        setFriends(all)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accountId, refreshKey])

  const upcoming = useMemo<UpcomingBirthday[]>(() => {
    // Date.now 相当をレンダー時に1回だけ確定させる。
    const today = new Date()
    const list: UpcomingBirthday[] = []
    for (const f of friends) {
      const meta = (f.metadata ?? {}) as Record<string, unknown>
      const md = parseMonthDay(meta.birthday)
      if (!md) continue
      const daysUntil = daysUntilBirthday(md.month, md.day, today)
      if (daysUntil >= 0 && daysUntil <= 7) {
        list.push({ id: f.id, name: f.displayName, month: md.month, day: md.day, daysUntil })
      }
    }
    // 近い順（今日→7日後）に並べる
    return list.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [friends])

  // 取得失敗時はページを壊さず、小さなエラー表示にとどめる。
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">🎂 今週の誕生日</h2>
        <p className="text-xs text-gray-400">誕生日の読み込みに失敗しました。時間をおいて再度お試しください。</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">🎂 今週の誕生日</h2>
        {loading ? (
          <span
            className="inline-block w-4 h-4 border-2 border-gray-200 border-t-green-500 rounded-full animate-spin"
            aria-label="読み込み中"
          />
        ) : (
          upcoming.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-medium">
              {upcoming.length} 人
            </span>
          )
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">誕生日を確認しています…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-gray-400">今週、誕生日の友だちはいません</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {upcoming.map((b) => (
            <div
              key={b.id}
              className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-b from-pink-50/40 to-white"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{b.name || '名前なし'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {b.month}月{b.day}日
                  <span
                    className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                      b.daysUntil === 0 ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {relativeLabel(b.daysUntil)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSendTarget({ id: b.id, name: b.name })}
                className="mt-auto px-3 py-2 min-h-[40px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#06C755' }}
              >
                お祝いメッセージを送る
              </button>
            </div>
          ))}
        </div>
      )}

      {sendTarget && (
        <BirthdaySendModal
          friendId={sendTarget.id}
          friendName={sendTarget.name}
          onClose={() => setSendTarget(null)}
          onSent={(message) => {
            onToast(message)
            setSendTarget(null)
          }}
        />
      )}
    </div>
  )
}
