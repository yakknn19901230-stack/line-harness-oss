'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Scenario, LineAccount } from '@line-crm/shared'
import { api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import GuidePanel from '@/components/shared/guide-panel'

type ScenarioWithCount = Scenario & {
  stepCount?: number
  /** Set when this scenario applies to all accounts (line_account_id = NULL in DB). */
  isGlobal?: boolean
}

interface AccountRow {
  account: LineAccount
  scenarios: ScenarioWithCount[]
  loadError: string | null
}

export default function FriendAddSettingsPage() {
  const router = useRouter()
  const { setSelectedAccountId } = useAccount()
  const [rows, setRows] = useState<AccountRow[]>([])
  const [orphanScenarios, setOrphanScenarios] = useState<ScenarioWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      // Use Promise.allSettled so a single failing account fetch doesn't blank the whole page.
      // Distinguish global scenarios (lineAccountId === null) from orphans (lineAccountId points
      // to a deleted account); orphans are dropped instead of being shown under every account.
      const accountsRes = await api.lineAccounts.list()
      if (!accountsRes.success) {
        setError('LINEアカウントの取得に失敗しました')
        setLoading(false)
        return
      }
      const accounts = accountsRes.data
      const knownAccountIds = new Set(accounts.map(a => a.id))

      const settled = await Promise.allSettled([
        api.scenarios.list(),
        ...accounts.map(a => api.scenarios.list({ accountId: a.id })),
      ])

      const allSettled = settled[0]
      const allRes = allSettled.status === 'fulfilled' ? allSettled.value : null
      if (allSettled.status === 'rejected' || (allRes && !allRes.success)) {
        // Surface this as a banner — silent failure here would hide globals/orphans and
        // make per-account active counts under-report.
        setError(
          'シナリオの全件取得に失敗しました。「全アカ共通」シナリオと孤児シナリオの検出が反映されていない可能性があります。',
        )
      }

      const accountScopedByAccount = new Map<string, ScenarioWithCount[]>()
      const accountErrors = new Map<string, string>()
      accounts.forEach((account, i) => {
        const slot = settled[i + 1]
        if (slot.status === 'rejected') {
          accountErrors.set(account.id, '読み込みに失敗しました')
          return
        }
        const res = slot.value
        if (!res.success) {
          accountErrors.set(account.id, res.error)
          return
        }
        accountScopedByAccount.set(
          account.id,
          res.data.filter(s => s.triggerType === 'friend_add'),
        )
      })

      const globalFriendAdd: ScenarioWithCount[] = allRes?.success
        ? allRes.data
            .filter(s => s.triggerType === 'friend_add' && s.lineAccountId === null)
            .map(s => ({ ...s, isGlobal: true }))
        : []

      // Orphans: account-bound scenarios whose owner account no longer exists.
      // Surface them at the bottom under a synthetic group so operators can clean them up.
      const orphans: ScenarioWithCount[] = allRes?.success
        ? allRes.data.filter(
            s =>
              s.triggerType === 'friend_add' &&
              s.lineAccountId !== null &&
              !knownAccountIds.has(s.lineAccountId),
          )
        : []

      const results: AccountRow[] = accounts.map(account => ({
        account,
        scenarios: [...(accountScopedByAccount.get(account.id) ?? []), ...globalFriendAdd],
        loadError: accountErrors.get(account.id) ?? null,
      }))
      setRows(results)
      setOrphanScenarios(orphans)
    } catch {
      setError('読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateForAccount = async (accountId: string, accountName: string) => {
    const name = window.prompt(
      `${accountName} の friend_add シナリオの名前を入力してください`,
      `${accountName} ウェルカム`,
    )
    if (!name || !name.trim()) return

    setError('')
    try {
      const res = await api.scenarios.create({
        name: name.trim(),
        description: null,
        triggerType: 'friend_add',
        triggerTagId: null,
        isActive: false,
        lineAccountId: accountId,
      })
      if (!res.success) {
        setError(`シナリオ作成に失敗しました: ${res.error}`)
        return
      }
      // Pre-select the account so the editor stays in the right context, then jump to the new scenario's editor.
      setSelectedAccountId(accountId)
      router.push(`/scenarios/detail?id=${res.data.id}`)
    } catch {
      setError('シナリオ作成に失敗しました')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleActive = async (scenarioId: string, current: boolean) => {
    if (togglingId) return
    setTogglingId(scenarioId)

    // Optimistic update — patch the scenario in BOTH rows (per-account list) and
    // orphanScenarios so the toggle reflects state regardless of which section it lives in.
    const patch = (target: boolean) => {
      setRows(prev =>
        prev.map(row => ({
          ...row,
          scenarios: row.scenarios.map(s => (s.id === scenarioId ? { ...s, isActive: target } : s)),
        })),
      )
      setOrphanScenarios(prev =>
        prev.map(s => (s.id === scenarioId ? { ...s, isActive: target } : s)),
      )
    }

    patch(!current)
    try {
      const res = await api.scenarios.update(scenarioId, { isActive: !current })
      if (!res.success) {
        patch(current)
        setError(`シナリオの更新に失敗しました: ${res.error}`)
      }
    } catch {
      patch(current)
      setError('シナリオの更新に失敗しました')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="友だち追加時設定"
        description="各 LINE アカウントに友だち追加した瞬間に何が配信されるかを管理します。アクティブなシナリオが0件のアカウントは新規友だちに何も届きません。"
      />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <GuidePanel title="あいさつメッセージって何？（はじめての方はこちら）">
          <p className="mb-3">
            <strong className="text-gray-900">あいさつメッセージ</strong>とは、あなたのLINEを
            「友だち追加」してもらった<strong className="text-gray-900">その瞬間に、自動で届く最初のメッセージ</strong>のことです。
            お店でいう「いらっしゃいませ！」のごあいさつを、24時間ずっと自動でやってくれるイメージです😊
          </p>
          <p className="mb-2 font-medium text-gray-900">設定はかんたん、3ステップだけでOKです：</p>
          <ol className="space-y-2">
            <li className="flex gap-2">
              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px] font-bold">1</span>
              <span><strong className="text-gray-900">この画面で「入口」を作ります</strong>。下のアカウントにある「作成」ボタンを押すだけです。</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px] font-bold">2</span>
              <span><strong className="text-gray-900">次の画面でメッセージ本文を書きます</strong>。届けたいあいさつ文を入力しましょう。</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px] font-bold">3</span>
              <span><strong className="text-gray-900">スイッチをONにして完成です</strong>。この画面の緑色のスイッチを入れると配信が始まります。</span>
            </li>
          </ol>
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            ⚠ 最後の「スイッチON」を忘れると、せっかく書いたメッセージが届きません。忘れずにONにしましょう。
          </p>
        </GuidePanel>

        {error && (
          <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-gray-500 text-center py-12">読み込み中…</div>
        ) : rows.length === 0 && orphanScenarios.length === 0 ? (
          <div className="text-gray-500 text-center py-12">LINE アカウントが登録されていません</div>
        ) : (
          <>
            {rows.length === 0 ? (
              <div className="text-gray-500 text-center py-6 text-sm">
                LINE アカウントは登録されていませんが、孤児シナリオが残っています。下の一覧からクリーンアップしてください。
              </div>
            ) : (
              rows.map(row => (
                <AccountSection
                  key={row.account.id}
                  row={row}
                  togglingId={togglingId}
                  onToggle={toggleActive}
                  onCreate={() => handleCreateForAccount(row.account.id, row.account.name)}
                />
              ))
            )}
            {orphanScenarios.length > 0 && (
              <OrphanSection
                scenarios={orphanScenarios}
                togglingId={togglingId}
                onToggle={toggleActive}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OrphanSection({
  scenarios,
  togglingId,
  onToggle,
}: {
  scenarios: ScenarioWithCount[]
  togglingId: string | null
  onToggle: (id: string, current: boolean) => void
}) {
  return (
    <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200 bg-amber-50">
        <h2 className="font-semibold text-amber-900">⚠ 孤児シナリオ (削除済みアカウント所属)</h2>
        <p className="text-xs text-amber-700 mt-1">
          所属していた LINE アカウントが削除されたシナリオです。webhook は元の line_account_id でしか発火しないため実質配信されません。残しておく理由がなければ削除推奨。
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {scenarios.map(scenario => (
          <li key={scenario.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link href={`/scenarios/detail?id=${scenario.id}`} className="block">
                <div className="font-medium text-gray-900 truncate">{scenario.name}</div>
                <div className="text-xs text-gray-400 mt-1">
                  元 line_account_id: {scenario.lineAccountId} ・ 更新 {scenario.updatedAt.slice(0, 10)}
                </div>
              </Link>
            </div>
            <Toggle
              value={scenario.isActive}
              disabled={togglingId === scenario.id}
              onClick={() => onToggle(scenario.id, scenario.isActive)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function AccountSection({
  row,
  togglingId,
  onToggle,
  onCreate,
}: {
  row: AccountRow
  togglingId: string | null
  onToggle: (id: string, current: boolean) => void
  onCreate: () => void
}) {
  const activeCount = row.scenarios.filter(s => s.isActive).length
  const isHealthy = activeCount > 0
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className={`px-4 py-3 flex items-center justify-between border-b ${isHealthy ? 'border-gray-200' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900">{row.account.name}</h2>
          <span className="text-xs text-gray-400">{row.account.channelId}</span>
        </div>
        {isHealthy ? (
          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
            設定ずみ ・ 配信中 {activeCount} 件
          </span>
        ) : (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
            まだあいさつメッセージが設定されていません
          </span>
        )}
      </div>

      {row.loadError && (
        <div className="px-4 py-3 text-sm text-red-600">読み込みエラー: {row.loadError}</div>
      )}

      {!row.loadError && !isHealthy && (
        <EmptyStateGuide hasScenarios={row.scenarios.length > 0} onCreate={onCreate} />
      )}

      {!row.loadError && row.scenarios.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {row.scenarios.map(scenario => (
            <li key={scenario.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/scenarios/detail?id=${scenario.id}`} className="block">
                  <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                    {scenario.name}
                    {scenario.isGlobal && (
                      <span
                        title="このシナリオは line_account_id=NULL のため全アカウント共通で発火します"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium"
                      >
                        全アカ共通
                      </span>
                    )}
                  </div>
                  {scenario.description && (
                    <div className="text-xs text-gray-500 truncate">{scenario.description}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {(scenario.stepCount ?? 0)} ステップ ・ 更新 {scenario.updatedAt.slice(0, 10)}
                  </div>
                </Link>
              </div>
              <Toggle
                value={scenario.isActive}
                disabled={togglingId === scenario.id}
                onClick={() => onToggle(scenario.id, scenario.isActive)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * アクティブなあいさつが0件のアカウントに出す、前向きな手順ガイド。
 * まだ入口すら無い場合 (hasScenarios=false) と、作ったがOFFのままの場合 (true) で
 * 文言を出し分ける。「まず作りましょう」という応援トーンにする。
 */
function EmptyStateGuide({
  hasScenarios,
  onCreate,
}: {
  hasScenarios: boolean
  onCreate: () => void
}) {
  return (
    <div className="px-4 py-4 bg-amber-50/40 border-b border-amber-100">
      {hasScenarios ? (
        <div className="text-sm text-gray-700">
          <p className="font-medium text-gray-900 mb-1">あと少しで完成です！</p>
          <p>
            メッセージはもう作られています。あとは下の一覧にある
            <span className="mx-1 inline-flex items-center align-middle">
              <span className="inline-block h-4 w-7 rounded-full bg-gray-300 relative">
                <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white" />
              </span>
            </span>
            スイッチをONにするだけで、新しい友だちにあいさつが届くようになります😊
          </p>
        </div>
      ) : (
        <div className="text-sm text-gray-700">
          <p className="font-medium text-gray-900 mb-2">まずは、あいさつメッセージを作りましょう✨</p>
          <ol className="space-y-1.5 mb-3">
            <li className="flex gap-2">
              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px] font-bold">1</span>
              <span>下の「作成」ボタンを押して、あいさつの<strong className="text-gray-900">入口</strong>を作ります。</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px] font-bold">2</span>
              <span>開いた画面で、<strong className="text-gray-900">届けたいメッセージ</strong>を書きます。</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[11px] font-bold">3</span>
              <span>この画面に戻って<strong className="text-gray-900">スイッチをON</strong>にすれば完成です。</span>
            </li>
          </ol>
          <button
            type="button"
            onClick={onCreate}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#14283F' }}
          >
            ＋ このアカウントであいさつメッセージを作る
          </button>
        </div>
      )}
    </div>
  )
}

function Toggle({
  value,
  disabled,
  onClick,
}: {
  value: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        value ? 'bg-green-500' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
      aria-label={value ? '無効化' : '有効化'}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
