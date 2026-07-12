import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../index.js';

// 第26弾: 乗り換えルールAPIの権限・バリデーション(DB関数はモック)。
// - master行の編集(PUT)・削除(DELETE)は403
// - custom行は編集・削除できる
// - POSTの重複/バリデーション

vi.mock('@line-crm/db', () => ({
  getInsuranceCategories: vi.fn(),
  getInsuranceCompanies: vi.fn(),
  getInsuranceProducts: vi.fn(),
  getActiveInsuranceProducts: vi.fn(),
  getInsuranceSwitchRulesWithProducts: vi.fn(async () => []),
  getInsuranceSwitchRuleById: vi.fn(),
  findActiveSwitchRuleByPair: vi.fn(async () => null),
  createInsuranceSwitchRule: vi.fn(async () => undefined),
  updateInsuranceSwitchRule: vi.fn(async () => true),
  setInsuranceSwitchRuleActive: vi.fn(async () => true),
  deleteInsuranceSwitchRule: vi.fn(async () => true),
  findMissingInsuranceProductIds: vi.fn(async () => []),
}));

import {
  getInsuranceSwitchRuleById,
  deleteInsuranceSwitchRule,
  updateInsuranceSwitchRule,
  setInsuranceSwitchRuleActive,
  createInsuranceSwitchRule,
} from '@line-crm/db';
import { insurance } from './insurance.js';

const masterRule = {
  id: 'swr_master000001',
  old_product_id: 'prd_old',
  new_product_id: 'prd_new',
  memo: null,
  source: 'master',
  is_active: 1,
  created_at: 'x',
  updated_at: null,
};

const customRule = { ...masterRule, id: 'swr_custom000001', source: 'custom' };

function setupApp() {
  const app = new Hono<Env>();
  app.route('/', insurance);
  return app;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('乗り換えルールAPIの二層方式', () => {
  test('DELETE: master行は403(無効化を案内するメッセージ)で、削除は呼ばれない', async () => {
    vi.mocked(getInsuranceSwitchRuleById).mockResolvedValue(masterRule);
    const res = await setupApp().request(
      '/api/insurance/switch-rules/swr_master000001',
      jsonInit('DELETE'),
      {} as Env['Bindings'],
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('無効');
    expect(deleteInsuranceSwitchRule).not.toHaveBeenCalled();
  });

  test('DELETE: custom行は削除できる', async () => {
    vi.mocked(getInsuranceSwitchRuleById).mockResolvedValue(customRule);
    const res = await setupApp().request(
      '/api/insurance/switch-rules/swr_custom000001',
      jsonInit('DELETE'),
      {} as Env['Bindings'],
    );
    expect(res.status).toBe(200);
    expect(deleteInsuranceSwitchRule).toHaveBeenCalledWith(undefined, 'swr_custom000001');
  });

  test('PUT: master行は403で、更新は呼ばれない', async () => {
    vi.mocked(getInsuranceSwitchRuleById).mockResolvedValue(masterRule);
    const res = await setupApp().request(
      '/api/insurance/switch-rules/swr_master000001',
      jsonInit('PUT', { oldProductId: 'prd_a', newProductId: 'prd_b' }),
      {} as Env['Bindings'],
    );
    expect(res.status).toBe(403);
    expect(updateInsuranceSwitchRule).not.toHaveBeenCalled();
  });

  test('PUT: custom行は編集できる', async () => {
    vi.mocked(getInsuranceSwitchRuleById).mockResolvedValue(customRule);
    const res = await setupApp().request(
      '/api/insurance/switch-rules/swr_custom000001',
      jsonInit('PUT', { oldProductId: 'prd_a', newProductId: 'prd_b', memo: '更新' }),
      {} as Env['Bindings'],
    );
    expect(res.status).toBe(200);
    expect(updateInsuranceSwitchRule).toHaveBeenCalledWith(undefined, 'swr_custom000001', {
      oldProductId: 'prd_a',
      newProductId: 'prd_b',
      memo: '更新',
    });
  });

  test('PATCH active: master行でも無効化できる', async () => {
    vi.mocked(getInsuranceSwitchRuleById).mockResolvedValue(masterRule);
    const res = await setupApp().request(
      '/api/insurance/switch-rules/swr_master000001/active',
      jsonInit('PATCH', { isActive: false }),
      {} as Env['Bindings'],
    );
    expect(res.status).toBe(200);
    expect(setInsuranceSwitchRuleActive).toHaveBeenCalledWith(undefined, 'swr_master000001', false);
  });

  test('POST: old===new は400', async () => {
    const res = await setupApp().request(
      '/api/insurance/switch-rules',
      jsonInit('POST', { oldProductId: 'prd_same', newProductId: 'prd_same' }),
      {} as Env['Bindings'],
    );
    expect(res.status).toBe(400);
    expect(createInsuranceSwitchRule).not.toHaveBeenCalled();
  });

  test('POST: 同一ペアの既存有効ルールと重複は400', async () => {
    vi.mocked(getInsuranceSwitchRuleById).mockResolvedValue(masterRule); // 決定的IDが衝突
    const res = await setupApp().request(
      '/api/insurance/switch-rules',
      jsonInit('POST', { oldProductId: 'prd_old', newProductId: 'prd_new' }),
      {} as Env['Bindings'],
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('すでに');
    expect(createInsuranceSwitchRule).not.toHaveBeenCalled();
  });

  test('POST: 正常系は source=custom で作成され、IDが採番規則どおり', async () => {
    vi.mocked(getInsuranceSwitchRuleById).mockResolvedValue(null);
    const res = await setupApp().request(
      '/api/insurance/switch-rules',
      jsonInit('POST', { oldProductId: 'prd_3255af2f7a36', newProductId: 'prd_2ae2899e09d7', memo: 'test' }),
      {} as Env['Bindings'],
    );
    expect(res.status).toBe(201);
    // sha1('prd_3255af2f7a36->prd_2ae2899e09d7') 先頭12桁 = マスターと同じ採番規則
    expect(createInsuranceSwitchRule).toHaveBeenCalledWith(undefined, {
      id: 'swr_e70dbe8a80fb',
      oldProductId: 'prd_3255af2f7a36',
      newProductId: 'prd_2ae2899e09d7',
      memo: 'test',
    });
  });
});
