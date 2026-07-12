'use client'

import { useRouter } from 'next/navigation'
import { isImportPseudoId } from '@line-crm/shared'
import type { FriendListItem } from '@/lib/api'
import TagBadge from './tag-badge'
import LineUnlinkedBadge from './line-unlinked-badge'
import { metaDate, getContracts, toSlashDate } from './friend-list-row'
import { latestNotePreview } from './customer-notes'

interface Props {
  friend: FriendListItem
  onTagEditClick: () => void
  onEditInfoClick: () => void
  onSendMessageClick: () => void
  // ── 選択モード（一括タグ付け）──
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

/**
 * スマホ幅用の友だちカード（1人=1カード）。
 * PC のテーブル行(FriendListRow)と同じ導線を、縦積み・親指操作しやすい形で提供する。
 * 上部の情報エリアをタップで /chats へ。下部のボタンは stopPropagation。
 */
export default function FriendCard({ friend, onTagEditClick, onEditInfoClick, onSendMessageClick, selectionMode = false, selected = false, onToggleSelect }: Props) {
  const router = useRouter()
  // LINE未連携(CSVインポート由来)はチャット遷移・メッセージ送信を無効化する(第25弾)
  const lineUnlinked = isImportPseudoId(friend.lineUserId)
  const navigateToChat = () => {
    if (lineUnlinked) return
    router.push(`/chats?friend=${friend.id}`)
  }
  const incoming = friend.latestIncomingMessage
  const meta = (friend.metadata ?? {}) as Record<string, unknown>
  const birthday = metaDate(meta.birthday)
  const contracts = getContracts(friend)
  const notePreview = latestNotePreview(meta)

  return (
    <div className={`border-b border-gray-100 p-4 ${selectionMode && selected ? 'bg-accent/10' : ''}`}>
      {/* 情報エリア（通常=タップで個別チャットへ / 選択モード=タップで選択トグル） */}
      <div
        role={selectionMode ? 'checkbox' : 'link'}
        aria-checked={selectionMode ? selected : undefined}
        tabIndex={0}
        onClick={selectionMode ? onToggleSelect : navigateToChat}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (selectionMode ? onToggleSelect : navigateToChat)?.() }
        }}
        className="cursor-pointer -m-1 p-1 rounded-lg focus:outline-none focus:bg-gray-50"
      >
        <div className="flex items-start gap-3">
          {selectionMode && (
            <span className="shrink-0 mt-0.5 flex items-center justify-center w-11 h-11 -ml-1">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect?.()}
                onClick={(e) => e.stopPropagation()}
                aria-label={`${friend.displayName} を選択`}
                className="w-6 h-6 accent-brand pointer-events-none"
              />
            </span>
          )}
          {friend.pictureUrl ? (
            <img src={friend.pictureUrl} alt={friend.displayName} className="w-11 h-11 rounded-full object-cover bg-gray-100 shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-base font-medium shrink-0">
              {friend.displayName?.charAt(0) ?? '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold text-gray-900 truncate flex-1">{friend.displayName}</p>
              {lineUnlinked && <LineUnlinkedBadge />}
              {friend.chatStatus === 'unread' ? (
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-700">未対応</span>
              ) : friend.chatStatus === 'in_progress' ? (
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-yellow-100 text-yellow-700">対応中</span>
              ) : null}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">登録: {friend.createdAt.slice(0, 10).replace(/-/g, '/')}</p>
            {!friend.isFollowing && <p className="text-xs text-red-400 mt-0.5">ブロック / 退会</p>}
          </div>
        </div>

        {/* タグ */}
        {friend.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {friend.tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)}
          </div>
        )}

        {/* 誕生日・契約 */}
        {(birthday || contracts.length > 0) && (
          <div className="text-xs text-gray-700 mt-2 space-y-0.5">
            {birthday && <p><span className="text-gray-500">誕生日：</span>{toSlashDate(birthday)}</p>}
            {contracts.slice(0, 3).map((c, i) => (
              <p key={i}>
                <span className="text-gray-500">契約：</span>
                {c.name ? `${c.name}${c.date ? `（${toSlashDate(c.date)}）` : ''}` : toSlashDate(c.date) || '—'}
              </p>
            ))}
            {contracts.length > 3 && <p className="text-gray-500">ほか{contracts.length - 3}件</p>}
          </div>
        )}

        {/* 最新メモ（あれば1行プレビュー） */}
        {notePreview && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-1 break-all">
            <span className="text-gray-400">📝 </span>{notePreview}
          </p>
        )}

        {/* 直近の受信メッセージ（あれば1行） */}
        {incoming && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-1 break-all">
            <span className="text-gray-400">受信：</span>
            {incoming.messageType === 'text' ? incoming.content : `[${incoming.messageType}]`}
          </p>
        )}
      </div>

      {/* 操作ボタン（親指サイズ 44px）。選択モード中は隠す（選択に集中）。 */}
      {!selectionMode && (
      <div className="flex items-center gap-2 mt-3">
        {lineUnlinked ? (
          <span className="flex-1 min-h-[44px] rounded-lg text-sm font-medium text-gray-400 bg-gray-100 flex items-center justify-center">
            LINE未連携のため送信不可
          </span>
        ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSendMessageClick() }}
          className="flex-1 min-h-[44px] rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#14283F' }}
        >
          メッセージを送る
        </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEditInfoClick() }}
          className="min-h-[44px] px-3 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          顧客情報
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTagEditClick() }}
          className="min-h-[44px] px-3 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          タグ
        </button>
      </div>
      )}
    </div>
  )
}
