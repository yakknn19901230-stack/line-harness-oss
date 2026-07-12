'use client'

import { useRouter } from 'next/navigation'
import { isImportPseudoId } from '@line-crm/shared'
import type { FriendListItem } from '@/lib/api'
import { contractDisplayName } from '@/lib/api'
import TagBadge from './tag-badge'
import LineUnlinkedBadge from './line-unlinked-badge'
import { latestNotePreview } from './customer-notes'

interface Props {
  friend: FriendListItem
  // Toggles the inline tag-management section underneath the row. Wired up
  // to a discrete button (with stopPropagation) inside this component, NOT
  // to the row body — the row body navigates to /chats and we don't want
  // the tag-edit affordance to compete with that primary click target.
  onTagEditClick?: () => void
  // Opens the 顧客情報 (誕生日・契約更新日) edit modal. Same stopPropagation
  // treatment as onTagEditClick so it doesn't trigger the row's chat nav.
  onEditInfoClick?: () => void
  // Opens the 場面別メッセージ送信モーダル. Same stopPropagation treatment.
  onSendMessageClick?: () => void
  // ── 選択モード（一括タグ付け）──
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

// Single row of the L-step style friend list. Renders 5 columns:
// 対応マーク / 名前 / シナリオ / 受信メッセージ / ★つきタグ・友だち情報
// Clicking the row navigates to the per-friend chat view at
// `/chats?friend=<id>` so the operator can read history / reply / mark as
// resolved without leaving the list. The "タグ" button at the end of the
// last column opens an inline tag editor (handled by the parent table).
export default function FriendListRow({ friend, onTagEditClick, onEditInfoClick, onSendMessageClick, selectionMode = false, selected = false, onToggleSelect }: Props) {
  const router = useRouter()
  // LINE未連携(CSVインポート由来)はチャット遷移・メッセージ送信を無効化する(第25弾)
  const lineUnlinked = isImportPseudoId(friend.lineUserId)
  const navigateToChat = () => {
    if (lineUnlinked) return
    router.push(`/chats?friend=${friend.id}`)
  }
  const incoming = friend.latestIncomingMessage
  const scenario = friend.activeScenario
  const isFollowing = friend.isFollowing
  // 顧客情報 (誕生日・契約更新日) は metadata に入っている。一覧レスポンスに
  // metadata が含まれない場合もあるので存在チェックしてから表示する。
  const meta = (friend.metadata ?? {}) as Record<string, unknown>
  const birthday = metaDate(meta.birthday)
  const contracts = getContracts(friend)
  const notePreview = latestNotePreview(meta)

  return (
    <div
      onClick={selectionMode ? onToggleSelect : navigateToChat}
      role={selectionMode ? 'checkbox' : 'link'}
      aria-checked={selectionMode ? selected : undefined}
      tabIndex={0}
      onKeyDown={(e) => {
        // Only react when the row itself is the keyboard target. Otherwise
        // an Enter/Space pressed on a nested button (e.g. タグ編集) would
        // bubble up here and override the button's own click handler,
        // navigating away instead of toggling the tag editor.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ;(selectionMode ? onToggleSelect : navigateToChat)?.()
        }
      }}
      className={`grid grid-cols-[80px_220px_120px_1fr_280px] gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer items-start focus:outline-none focus:bg-gray-50 ${selectionMode && selected ? 'bg-accent/10' : ''}`}
    >
      {/* 対応マーク — chats.status 由来 (unread / in_progress / resolved). */}
      <div className="pt-1 flex items-start gap-2">
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${friend.displayName} を選択`}
            className="w-5 h-5 accent-brand mt-0.5 shrink-0"
          />
        )}
        {friend.chatStatus === 'unread' ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-700">
            未対応
          </span>
        ) : friend.chatStatus === 'in_progress' ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-yellow-100 text-yellow-700">
            対応中
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500">
            対応済み
          </span>
        )}
      </div>

      {/* 名前 + アバター + 登録日 */}
      <div className="flex items-start gap-2">
        {friend.pictureUrl ? (
          <img
            src={friend.pictureUrl}
            alt={friend.displayName}
            className="w-9 h-9 rounded-full object-cover bg-gray-100 flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium flex-shrink-0">
            {friend.displayName?.charAt(0) ?? '?'}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{friend.displayName}</p>
          {lineUnlinked && <LineUnlinkedBadge className="mt-0.5" />}
          <p className="text-[10px] text-gray-500 mt-0.5">登録: {formatJstDate(friend.createdAt)}</p>
          {!isFollowing && (
            <p className="text-[10px] text-red-500 mt-0.5">ブロック / 退会</p>
          )}
        </div>
      </div>

      {/* シナリオ */}
      <div className="pt-1">
        {scenario ? (
          <div>
            <p className="text-xs font-medium text-blue-700 truncate" title={scenario.name}>
              {scenario.name}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {scenario.status === 'active' ? '配信中' : scenario.status === 'delivering' ? '配信処理中' : scenario.status}
            </p>
          </div>
        ) : (
          <span className="text-xs text-gray-400">停止中</span>
        )}
      </div>

      {/* 受信メッセージ */}
      <div className="min-w-0">
        {incoming ? (
          <>
            <p className="text-xs text-gray-700 line-clamp-2 break-all">
              {incoming.messageType === 'text' ? incoming.content : `[${incoming.messageType}]`}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              ({formatJstTimestamp(incoming.createdAt)})
            </p>
          </>
        ) : (
          <span className="text-xs text-gray-400">受信なし</span>
        )}
        {notePreview && (
          <p className="text-[11px] text-gray-500 mt-1 line-clamp-1 break-all">
            <span className="text-gray-400">📝 </span>{notePreview}
          </p>
        )}
      </div>

      {/* ★つきタグ・友だち情報 */}
      <div className="space-y-1">
        {friend.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {friend.tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
          </div>
        )}
        {friend.firstTrackedLinkName && (
          <p className="text-[10px] text-gray-500">
            <span className="text-gray-400">ASP_LP名：</span>
            {friend.firstTrackedLinkName}
          </p>
        )}
        {friend.refCode && !friend.firstTrackedLinkName && (
          <p className="text-[10px] text-gray-500">
            <span className="text-gray-400">流入：</span>
            {friend.refCode}
          </p>
        )}
        {friend.tags.length === 0 && !friend.firstTrackedLinkName && !friend.refCode && (
          <span className="text-[10px] text-gray-300">—</span>
        )}
        {/* 顧客情報 (誕生日・契約) — 登録済みなら値を表示する。契約は最大3件＋他N件。 */}
        {(birthday || contracts.length > 0) && (
          <div className="text-[11px] text-gray-700 space-y-0.5 mt-0.5">
            {birthday && (
              <p><span className="text-gray-500">誕生日：</span>{toSlashDate(birthday)}</p>
            )}
            {contracts.slice(0, 3).map((c, i) => (
              <p key={i}>
                <span className="text-gray-500">契約：</span>
                {c.name ? `${c.name}${c.date ? `（${toSlashDate(c.date)}）` : ''}` : toSlashDate(c.date) || '—'}
              </p>
            ))}
            {contracts.length > 3 && (
              <p className="text-gray-500">ほか{contracts.length - 3}件</p>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 mt-0.5">
          {onSendMessageClick && !lineUnlinked && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSendMessageClick() }}
              className="text-[10px] text-green-700 hover:text-green-800 underline font-medium"
            >
              メッセージを送る
            </button>
          )}
          {onTagEditClick && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTagEditClick() }}
              className="text-[10px] text-blue-600 hover:text-blue-800 underline"
            >
              タグ編集
            </button>
          )}
          {onEditInfoClick && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEditInfoClick() }}
              className="text-[10px] text-green-700 hover:text-green-800 underline"
            >
              顧客情報を編集
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Format ISO ts to "YYYY-MM-DD HH:MM:SS" in JST. The DB stores values
// already in JST (`+09:00` strftime), so we render as-is — using the
// browser's locale formatter would re-interpret as UTC and shift 9h.
function formatJstTimestamp(iso: string): string {
  // Accept both `2026-05-08T13:45:00.000+09:00` and `2026-05-08T13:45:00`.
  // Slice off the timezone suffix and the millisecond decimals to land on
  // the 19-char canonical form, then swap T → space.
  const trimmed = iso.replace(/(\.\d+)?(Z|[+\-]\d{2}:?\d{2})?$/, '')
  return trimmed.replace('T', ' ').slice(0, 19)
}

// Date-only variant for the registration column. Same JST-as-stored
// rationale — slice off everything after the date portion.
function formatJstDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '/')
}

// 表示用: "YYYY-MM-DD" を "YYYY/MM/DD" に統一（既にスラッシュ/空はそのまま）。
// 保存形式(YYYY-MM-DD)は変えず、画面表示だけを統一する。
export function toSlashDate(s: string): string {
  return s ? s.replace(/-/g, '/') : s
}

// metadata の日付値を "YYYY-MM-DD" として安全に取り出す。文字列でなければ、
// または日付形式でなければ空文字（＝未設定）を返す。
export function metaDate(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const head = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : ''
}

// 一覧行に出す契約リスト。第22弾から friend_contracts テーブル由来
// (friends 一覧APIが同梱する friend.contracts)を読む。照合済みは
// 「会社名 商品名」、未照合は自由記述を表示名にする。空エントリは除外。
// 旧 metadata.contracts はもう読まない(データは化石として残置)。
export function getContracts(friend: FriendListItem): { name: string; date: string }[] {
  return (friend.contracts ?? [])
    .map((c) => ({ name: contractDisplayName(c), date: metaDate(c.renewalDate) }))
    .filter((c) => c.name !== '' || c.date !== '')
}
