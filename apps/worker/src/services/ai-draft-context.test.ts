import { describe, expect, test } from 'vitest';
import { buildAiDraftContext } from './ai-draft-context.js';
import type { FriendContractWithProduct, InsuranceSwitchRuleWithProducts } from '@line-crm/db';

// 第24弾: AIに渡すcontextの最小化を保証する。
// 「LINE ID・電話・メール・タグを渡さない」はプロダクトの約束なので、
// metadataに紛れ込んでいてもcontextへ漏れないことをここで検証する。

function makeContract(overrides: Partial<FriendContractWithProduct> = {}): FriendContractWithProduct {
  return {
    id: 'fc_1',
    friend_id: 'friend-1',
    product_id: 'prd_old000001',
    free_text_name: null,
    renewal_date: '2027-08-01',
    notified_at: null,
    switch_notified_at: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000',
    updated_at: '2026-01-01T00:00:00.000',
    category_name: '変額保険',
    company_name: 'ソニー生命',
    product_name: 'バリアブルライフ',
    ...overrides,
  };
}

function makeRule(): InsuranceSwitchRuleWithProducts {
  return {
    id: 'swr_test1',
    old_product_id: 'prd_old000001',
    new_product_id: 'prd_new000001',
    memo: 'テストルール',
    created_at: '2026-01-01T00:00:00.000',
    old_category_name: '変額保険',
    old_company_name: 'ソニー生命',
    old_product_name: 'バリアブルライフ',
    new_category_name: '変額保険',
    new_company_name: 'マニュライフ生命',
    new_product_name: 'こだわり変額保険v2',
  };
}

describe('buildAiDraftContext', () => {
  test('渡してよい項目だけで構成される(名前・場面・契約・乗り換え・メモ・フォロー)', () => {
    const context = buildAiDraftContext({
      displayName: '山田太郎',
      scene: '契約更新のご案内',
      contracts: [makeContract()],
      switchRules: [makeRule()],
      metadata: {
        notes: [
          { date: '2026-07-01', text: 'お子さんが小学校入学' },
          { date: '2026-06-01', text: '保障の見直しに前向き' },
          { date: '2026-05-01', text: '3件目' },
          { date: '2026-04-01', text: '4件目(直近3件に入らない)' },
        ],
        followups: [
          { date: '2026-08-01', note: '更新の意向確認', done: false },
          { date: '2026-07-20', note: '済みの予定', done: true },
        ],
      },
    });

    expect(context.customerName).toBe('山田太郎');
    expect(context.scene).toBe('契約更新のご案内');
    expect(context.contracts).toEqual([
      { company: 'ソニー生命', product: 'バリアブルライフ', renewalDate: '2027-08-01' },
    ]);
    expect(context.switchProposals).toEqual([
      { current: 'ソニー生命 バリアブルライフ', proposed: 'マニュライフ生命 こだわり変額保険v2', memo: 'テストルール' },
    ]);
    expect(context.recentNotes).toHaveLength(3);
    expect(context.recentNotes[0].text).toBe('お子さんが小学校入学');
    // done=true は除外し、未完了で期日が最も近い1件
    expect(context.nextFollowup).toEqual({ date: '2026-08-01', note: '更新の意向確認' });
    // トップレベルのキー構成が増えていないこと(項目追加時はこのテストと設計要点を更新する)
    expect(Object.keys(context).sort()).toEqual(
      ['contracts', 'customerName', 'nextFollowup', 'recentNotes', 'scene', 'switchProposals'].sort(),
    );
  });

  test('渡してはいけない項目(LINE ID・電話・メール・タグ)はmetadataにあってもcontextに含まれない', () => {
    const context = buildAiDraftContext({
      displayName: '山田太郎',
      scene: 'テスト',
      contracts: [],
      switchRules: [],
      metadata: {
        // 実データでmetadataに入りうる連絡先系キー(customer-info-modal の phone / email)
        phone: '090-0000-0000',
        email: 'taro@example.com',
        line_user_id: 'U1234567890abcdef',
        tags: ['VIP', '既契約'],
        birthday: '1990-01-01',
      },
    });

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('090-0000-0000');
    expect(serialized).not.toContain('taro@example.com');
    expect(serialized).not.toContain('U1234567890abcdef');
    expect(serialized).not.toContain('VIP');
    expect(serialized).not.toContain('1990-01-01');
  });

  test('未照合契約は自由記述を商品名として渡す・metadata欠損でも壊れない', () => {
    const context = buildAiDraftContext({
      displayName: null,
      scene: 'テスト',
      contracts: [makeContract({ product_id: null, product_name: null, company_name: null, free_text_name: 'ソニー' })],
      switchRules: [],
      metadata: {},
    });
    expect(context.customerName).toBe('');
    expect(context.contracts[0].product).toBe('ソニー');
    expect(context.switchProposals).toEqual([]);
    expect(context.recentNotes).toEqual([]);
    expect(context.nextFollowup).toBeNull();
  });
});
