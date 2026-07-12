import { describe, expect, it } from 'vitest'
import type { FriendContractItem, FriendListItem, SwitchRuleItem } from '@/lib/api'
import { countTodaysWork, switchTargets } from './todays-work'

// 第23弾: 乗り換え提案の対象判定（switchTargets）とメーター集計（countTodaysWork.switch）。
// 判定は todays-work に一元化されているので、ここを通せばパネルとメーターの両方を検証したことになる。

const TODAY = new Date(2026, 6, 12) // 2026-07-12

function makeContract(overrides: Partial<FriendContractItem> = {}): FriendContractItem {
  return {
    id: 'fc_test1',
    productId: 'prd_old000001',
    categoryName: '変額保険',
    companyName: 'ソニー生命',
    productName: 'バリアブルライフ',
    freeTextName: null,
    renewalDate: null,
    notifiedAt: null,
    switchNotifiedAt: null,
    sortOrder: 0,
    ...overrides,
  }
}

function makeFriend(contracts: FriendContractItem[]): FriendListItem {
  // 判定に使うのは id / displayName / metadata / contracts のみ。
  return {
    id: 'friend-1',
    displayName: 'テスト顧客',
    metadata: {},
    tags: [],
    contracts,
  } as unknown as FriendListItem
}

function makeRule(overrides: Partial<SwitchRuleItem> = {}): SwitchRuleItem {
  return {
    id: 'swr_test0000001',
    oldProductId: 'prd_old000001',
    newProductId: 'prd_new000001',
    memo: 'テストルール',
    oldCategoryName: '変額保険',
    oldCompanyName: 'ソニー生命',
    oldProductName: 'バリアブルライフ',
    newCategoryName: '変額保険',
    newCompanyName: 'マニュライフ生命',
    newProductName: 'こだわり変額保険v2',
    ...overrides,
  }
}

describe('switchTargets', () => {
  it('契約の productId がルールの oldProductId に一致すると対象になる', () => {
    const friends = [makeFriend([makeContract()])]
    const rules = [makeRule()]

    const targets = switchTargets(friends, rules, TODAY)
    expect(targets).toHaveLength(1)
    expect(targets[0].contract.id).toBe('fc_test1')
    expect(targets[0].rule.id).toBe('swr_test0000001')

    // 一致しない productId・未照合(null)は対象外
    expect(switchTargets([makeFriend([makeContract({ productId: 'prd_other' })])], rules, TODAY)).toHaveLength(0)
    expect(switchTargets([makeFriend([makeContract({ productId: null })])], rules, TODAY)).toHaveLength(0)

    // メーターも同じ判定で 1 件と数える
    const counts = countTodaysWork(friends, rules, TODAY)
    expect(counts.switch).toBe(1)
    expect(counts.total).toBe(1)
  })

  it('switch_notified_at から300日以内は抑止される（notified_at とは独立）', () => {
    const rules = [makeRule()]

    // 30日前に対応済み → 抑止
    const suppressed = [makeFriend([makeContract({ switchNotifiedAt: '2026-06-12' })])]
    expect(switchTargets(suppressed, rules, TODAY)).toHaveLength(0)
    expect(countTodaysWork(suppressed, rules, TODAY).switch).toBe(0)

    // 301日以上前なら再び出る（年次サイクルの再表示）
    const expired = [makeFriend([makeContract({ switchNotifiedAt: '2025-01-01' })])]
    expect(switchTargets(expired, rules, TODAY)).toHaveLength(1)

    // 更新パネル用の notified_at が入っていても乗り換えは抑止されない（別カラム・別イベント）
    const renewalOnly = [makeFriend([makeContract({ notifiedAt: '2026-06-12' })])]
    expect(switchTargets(renewalOnly, rules, TODAY)).toHaveLength(1)
  })

  it('rules が空（未投入・取得失敗）なら常に0件で静かに動く', () => {
    const friends = [makeFriend([makeContract()])]

    expect(switchTargets(friends, [], TODAY)).toHaveLength(0)

    const counts = countTodaysWork(friends, [], TODAY)
    expect(counts.switch).toBe(0)
    // 他パネルの集計に影響しない（この friend は誕生日・更新・フォロー該当なし）
    expect(counts.total).toBe(0)
  })
})
