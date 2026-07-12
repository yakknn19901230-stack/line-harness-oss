import { describe, expect, test } from 'vitest';
import { planImport } from './import-plan.js';
import type { FriendLiteForImport, InsuranceProduct } from '@line-crm/db';

// 第25弾: インポート計画(重複検出・商品照合・metadataマージ)の純ロジックテスト。

const TODAY = '2026-07-12';

function friendLite(overrides: Partial<FriendLiteForImport> = {}): FriendLiteForImport {
  return {
    id: 'friend-existing-1',
    line_user_id: 'U1234567890abcdef',
    display_name: '山田太郎',
    metadata: JSON.stringify({ birthday: '1990-12-30', phone: '09000000000' }),
    ...overrides,
  };
}

function product(overrides: Partial<InsuranceProduct> = {}): InsuranceProduct {
  return {
    id: 'prd_aaa',
    category_name: '変額保険',
    company_name: 'ソニー生命',
    product_name: 'バリアブルライフ',
    normalized_name: 'バリアブルライフ',
    is_active: 1,
    created_at: 'x',
    updated_at: 'x',
    ...overrides,
  };
}

describe('planImport — 重複検出', () => {
  test('同名+同誕生日の既存友だちには追記(updated)、別人(誕生日違い)は新規(created)', () => {
    const plan = planImport({
      rows: [
        { displayName: '山田太郎', birthday: '1990-12-30', memo: '追記メモ' }, // 既存一致
        { displayName: '山田太郎', birthday: '1985-01-01' }, // 同名でも誕生日違い → 新規
        { displayName: '佐藤花子' }, // 新規
      ],
      existingFriends: [friendLite()],
      products: [],
      today: TODAY,
    });

    expect(plan.created).toBe(2);
    expect(plan.updated).toBe(1);
    expect(plan.skipped).toEqual([]);
    // 既存一致はmetadata更新(notesにメモが積まれる)
    expect(plan.updates).toHaveLength(1);
    const meta = JSON.parse(plan.updates[0].metadataJson) as {
      notes: Array<{ date: string; text: string }>;
      phone: string;
    };
    expect(meta.notes[0]).toEqual({ date: TODAY, text: '追記メモ' });
    expect(meta.phone).toBe('09000000000'); // 既存キーは保持(shallow merge)
  });

  test('CSV内の同名+同誕生日は同じ新規友だちに畳まれる', () => {
    const plan = planImport({
      rows: [
        { displayName: '新規一郎', birthday: '2000-01-01' },
        { displayName: '新規一郎', birthday: '2000-01-01', memo: '2行目' },
      ],
      existingFriends: [],
      products: [],
      today: TODAY,
    });
    expect(plan.created).toBe(1);
    expect(plan.updated).toBe(0);
  });

  test('顧客名欠落・不正な誕生日は行単位でskip(理由つき)', () => {
    const plan = planImport({
      rows: [
        { displayName: '' },
        { displayName: '正常太郎', birthday: '1990/12/30' }, // 未正規化(不正形式)
        { displayName: '正常次郎' },
      ],
      existingFriends: [],
      products: [],
      today: TODAY,
    });
    expect(plan.created).toBe(1);
    expect(plan.skipped).toEqual([
      { row: 1, reason: '顧客名が未入力です。' },
      { row: 2, reason: '生年月日はYYYY-MM-DD形式で送信してください。' },
    ]);
  });
});

describe('planImport — 商品照合', () => {
  test('exact一致はproductId確定、マスターにない商品はfreeTextName保持で未照合', () => {
    const plan = planImport({
      rows: [
        {
          displayName: '契約者A',
          contracts: [
            { companyName: 'ソニー生命', productName: 'バリアブルライフ' }, // exact
            { companyName: '架空生命', productName: '存在しない商品X' }, // 未照合
          ],
        },
      ],
      existingFriends: [],
      products: [product()],
      today: TODAY,
    });

    expect(plan.contractsAdded).toBe(2);
    const additions = [...plan.contractsToAdd.values()][0];
    expect(additions[0].product_id).toBe('prd_aaa');
    expect(additions[0].free_text_name).toBe('ソニー生命 バリアブルライフ');
    // 未照合: product_id は null、freeTextName に元表記を保持(第22弾UIで選び直せる)
    expect(additions[1].product_id).toBeNull();
    expect(additions[1].free_text_name).toBe('架空生命 存在しない商品X');
    expect(plan.unmatchedProducts).toEqual(['存在しない商品X']);
  });

  test('同名商品が複数社にあるとき、会社名で絞れれば確定・絞れなければ未照合', () => {
    const products = [
      product({ id: 'prd_sony', company_name: 'ソニー生命', product_name: '終身保険', normalized_name: '終身保険' }),
      product({ id: 'prd_meiji', company_name: '明治安田生命', product_name: '終身保険', normalized_name: '終身保険' }),
    ];
    const plan = planImport({
      rows: [
        {
          displayName: '契約者B',
          contracts: [
            { companyName: 'ソニー生命', productName: '終身保険' }, // 会社で確定
            { productName: '終身保険' }, // 会社なし・曖昧 → 未照合
          ],
        },
      ],
      existingFriends: [],
      products,
      today: TODAY,
    });
    const additions = [...plan.contractsToAdd.values()][0];
    expect(additions[0].product_id).toBe('prd_sony');
    expect(additions[1].product_id).toBeNull();
    expect(plan.unmatchedProducts).toEqual(['終身保険']);
  });
});
