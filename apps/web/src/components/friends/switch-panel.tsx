'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, contractDisplayName } from '@/lib/api'
import type { FriendListItem, SwitchRuleItem } from '@/lib/api'
import { useIsNarrow } from '@/hooks/use-is-narrow'
import { todayYmd } from './customer-notes'
import { switchTargets } from './todays-work'
import { switchProposalFills } from './message-scenes'
import MessageSendModal from './message-send-modal'
import PanelShell from './panel-shell'

/** スマホで一度に見せる最大件数（超過分は「もっと見る」で展開）。 */
const MOBILE_LIMIT = 5

interface Props {
  /** ページ側で1回だけ取得した全友だち（誕生日/更新/フォロー/乗り換えで共有）。 */
  friends: FriendListItem[]
  /** ページ側で1回だけ取得した乗り換えルール（メーターと共有）。空なら0件表示。 */
  rules: SwitchRuleItem[]
  loading: boolean
  error?: boolean
  onToast: (message: string) => void
  /** 対応済みにしたら親に通知（残り件数メーターの再集計用）。 */
  onChanged?: () => void
}

interface SwitchProposal {
  friendId: string
  name: string
  /** 現契約の表示名（会社名 商品名） */
  currentName: string
  /** 乗り換え先の表示名（会社名 商品名） */
  proposedName: string
  memo: string | null
  /** friend_contracts.id（対応済み記録は PATCH /contracts/:id/switch-notified で行う） */
  contractId: string
}

/**
 * 「🔄 乗り換え提案の候補」パネル（第23弾・4枚目）。
 * 契約の productId が乗り換えルールの oldProductId に一致する顧客が自動で出る。
 * 対象判定は todays-work の switchTargets（メーターと同一）を使い、ここには書かない。
 */
export default function SwitchPanel({ friends, rules, loading, error, onToast, onChanged }: Props) {
  const router = useRouter()
  const [sendTarget, setSendTarget] = useState<SwitchProposal | null>(null)
  // 「対応済み」にした契約をその場で消すための楽観的セット（key = friendId:contractId）。
  const [handled, setHandled] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const narrow = useIsNarrow()

  const proposals = useMemo<SwitchProposal[]>(() => {
    const today = new Date()
    return switchTargets(friends, rules, today)
      .filter((t) => !handled.has(`${t.friend.id}:${t.contract.id}`))
      .map((t) => ({
        friendId: t.friend.id,
        name: t.friend.displayName,
        currentName: contractDisplayName(t.contract) || '契約',
        proposedName: `${t.rule.newCompanyName ?? ''} ${t.rule.newProductName ?? ''}`.trim() || '新商品',
        memo: t.rule.memo,
        contractId: t.contract.id,
      }))
  }, [friends, rules, handled])

  const visible = narrow && !showAll ? proposals.slice(0, MOBILE_LIMIT) : proposals
  const hiddenCount = proposals.length - visible.length

  /** 該当契約を対応済みにする（friend_contracts.switch_notified_at=today）。楽観的に消す。 */
  const markDone = async (item: { friendId: string; contractId: string }) => {
    const key = `${item.friendId}:${item.contractId}`
    setHandled((prev) => new Set(prev).add(key))
    try {
      const res = await api.friends.contracts.setSwitchNotified(item.friendId, item.contractId, todayYmd())
      if (res.success) {
        onChanged?.()
      } else {
        setHandled((prev) => { const s = new Set(prev); s.delete(key); return s })
        onToast('更新に失敗しました。もう一度お試しください。')
      }
    } catch {
      setHandled((prev) => { const s = new Set(prev); s.delete(key); return s })
      onToast('更新に失敗しました。通信状況をご確認ください。')
    }
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">🔄 乗り換え提案の候補</h2>
        <p className="text-xs text-gray-500">読み込みに失敗しました。時間をおいて再度お試しください。</p>
      </div>
    )
  }

  return (
    <PanelShell
      title="🔄 乗り換え提案の候補"
      description="乗り換えルールに当てはまる契約が自動で出ます。ご案内を送ると消えます"
      loading={loading}
      count={proposals.length}
      unit="件"
      borderClass="border-2 border-brand/30"
    >
      {loading ? (
        <p className="text-sm text-gray-500">乗り換え候補を確認しています…</p>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-gray-500">乗り換え提案の候補はありません</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map((p) => (
              <div
                key={`${p.friendId}-${p.contractId}`}
                className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-b from-brand/5 to-white"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      // fillCurrent/fillProposed はチャット側の文面プリセットで商品名を穴埋めする
                      router.push(
                        `/chats?friend=${p.friendId}&scene=switch_proposal&` +
                          new URLSearchParams({ fillCurrent: p.currentName, fillProposed: p.proposedName }).toString(),
                      )
                    }
                    className="text-sm font-medium text-gray-900 hover:text-brand hover:underline truncate max-w-full text-left"
                    title="チャットを開く（乗り換え提案文面をプリセット）"
                  >
                    {p.name || '名前なし'}
                  </button>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{p.currentName}</p>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">
                    <span className="text-brand font-medium">→ {p.proposedName}</span>
                  </p>
                  {p.memo && <p className="text-xs text-gray-500 mt-1">{p.memo}</p>}
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSendTarget(p)}
                    className="flex-1 px-3 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#14283F' }}
                  >
                    ご案内を送る
                  </button>
                  <button
                    type="button"
                    onClick={() => markDone({ friendId: p.friendId, contractId: p.contractId })}
                    aria-label="対応済みにする"
                    className="shrink-0 min-h-[44px] px-3 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    ✓ 済み
                  </button>
                </div>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="lg:hidden w-full mt-3 min-h-[44px] text-sm font-medium text-brand border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              もっと見る（残り{hiddenCount}件）
            </button>
          )}
        </>
      )}

      {sendTarget && (
        <MessageSendModal
          friendId={sendTarget.friendId}
          friendName={sendTarget.name}
          initialSceneId="switch_proposal"
          sceneFills={switchProposalFills(sendTarget.currentName, sendTarget.proposedName)}
          onClose={() => setSendTarget(null)}
          onSent={(message) => {
            onToast(message)
            // 送れたら自動で対応済みにする。
            const t = sendTarget
            setSendTarget(null)
            void markDone({ friendId: t.friendId, contractId: t.contractId })
          }}
        />
      )}
    </PanelShell>
  )
}
