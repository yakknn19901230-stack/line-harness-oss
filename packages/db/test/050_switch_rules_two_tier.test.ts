import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInsuranceSwitchRule,
  updateInsuranceSwitchRule,
  setInsuranceSwitchRuleActive,
  deleteInsuranceSwitchRule,
  getInsuranceSwitchRuleById,
  getInsuranceSwitchRulesWithProducts,
  findActiveSwitchRuleByPair,
} from '../src/insurance';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const SEED_PATH = join(PKG_ROOT, '..', '..', 'migrations-data', '048_switch_rules_data.sql');

// 第26弾: 乗り換えルール二層方式の要のテスト。
// 「seed再投入(048_switch_rules_data.sql)で custom行と無効化状態が保持される」を
// 実際に生成されたseed SQLそのものを2回流して検証する。

/** better-sqlite3 を D1Database 風に見せる最小シム(049のテストと同型)。 */
function d1Shim(db: Database.Database): D1Database {
  const makeStatement = (sql: string, params: unknown[]): unknown => ({
    bind: (...p: unknown[]) => makeStatement(sql, p),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...(params as never[])).changes } }),
    all: async () => ({ results: db.prepare(sql).all(...(params as never[])) }),
    first: async () => db.prepare(sql).get(...(params as never[])) ?? null,
  });
  return {
    prepare: (sql: string) => makeStatement(sql, []),
    batch: async (stmts: Array<{ run(): Promise<unknown> }>) => Promise.all(stmts.map((s) => s.run())),
  } as unknown as D1Database;
}

/** seedに含まれるmasterルール(migrations-data/048と一致させる)。 */
const MASTER_ID = 'swr_e70dbe8a80fb';

function loadDb(): { raw: Database.Database; db: D1Database } {
  const raw = new Database(':memory:');
  raw.exec(readFileSync(join(PKG_ROOT, 'bootstrap.sql'), 'utf8'));
  return { raw, db: d1Shim(raw) };
}

const applySeed = (raw: Database.Database) => raw.exec(readFileSync(SEED_PATH, 'utf8'));

describe('二層方式 — seed再投入での保持(最重要)', () => {
  let raw: Database.Database;
  let db: D1Database;

  beforeEach(() => {
    ({ raw, db } = loadDb());
    applySeed(raw);
  });

  it('seedはmaster行を source=master / is_active=1 で投入する', async () => {
    const master = await getInsuranceSwitchRuleById(db, MASTER_ID);
    expect(master?.source).toBe('master');
    expect(master?.is_active).toBe(1);
  });

  it('seed再投入で custom行が消えない(マスター外削除は source=master 限定)', async () => {
    await createInsuranceSwitchRule(db, {
      id: 'swr_custom000001',
      oldProductId: 'prd_custom_old',
      newProductId: 'prd_custom_new',
      memo: '自分ルール',
    });

    applySeed(raw); // seed再投入

    const custom = await getInsuranceSwitchRuleById(db, 'swr_custom000001');
    expect(custom).not.toBeNull();
    expect(custom?.source).toBe('custom');
    expect(custom?.memo).toBe('自分ルール');
  });

  it('seed再投入で 無効化状態(is_active=0)が復活しない', async () => {
    await setInsuranceSwitchRuleActive(db, MASTER_ID, false);

    applySeed(raw); // seed再投入(upsertは is_active を上書きしない)

    const master = await getInsuranceSwitchRuleById(db, MASTER_ID);
    expect(master?.is_active).toBe(0);
    // memo等のマスター側更新は反映される(source='master'のまま)
    expect(master?.source).toBe('master');
  });

  it('無効化ルールは既定の取得(判定・パネル用)から除外され、all指定なら見える', async () => {
    await setInsuranceSwitchRuleActive(db, MASTER_ID, false);

    const active = await getInsuranceSwitchRulesWithProducts(db);
    expect(active.map((r) => r.id)).not.toContain(MASTER_ID);

    const all = await getInsuranceSwitchRulesWithProducts(db, { includeInactive: true });
    expect(all.map((r) => r.id)).toContain(MASTER_ID);
  });
});

describe('二層方式 — customルールのCRUD(DB層)', () => {
  let raw: Database.Database;
  let db: D1Database;

  beforeEach(() => {
    ({ raw, db } = loadDb());
    applySeed(raw);
  });

  it('作成→編集→無効化→削除が一巡する', async () => {
    await createInsuranceSwitchRule(db, {
      id: 'swr_crud00000001',
      oldProductId: 'prd_a',
      newProductId: 'prd_b',
      memo: null,
    });
    expect((await getInsuranceSwitchRuleById(db, 'swr_crud00000001'))?.source).toBe('custom');

    await updateInsuranceSwitchRule(db, 'swr_crud00000001', {
      oldProductId: 'prd_a',
      newProductId: 'prd_c',
      memo: '編集後',
    });
    const updated = await getInsuranceSwitchRuleById(db, 'swr_crud00000001');
    expect(updated?.new_product_id).toBe('prd_c');
    expect(updated?.memo).toBe('編集後');
    expect(updated?.source).toBe('custom'); // 編集でsourceは変わらない

    await setInsuranceSwitchRuleActive(db, 'swr_crud00000001', false);
    expect((await getInsuranceSwitchRuleById(db, 'swr_crud00000001'))?.is_active).toBe(0);

    expect(await deleteInsuranceSwitchRule(db, 'swr_crud00000001')).toBe(true);
    expect(await getInsuranceSwitchRuleById(db, 'swr_crud00000001')).toBeNull();
  });

  it('findActiveSwitchRuleByPair は有効な同一ペアだけを返す(excludeIdで自分を除外)', async () => {
    // seedのmasterルールと同一ペア
    expect(await findActiveSwitchRuleByPair(db, 'prd_3255af2f7a36', 'prd_2ae2899e09d7')).not.toBeNull();
    // 自分自身を除外すると重複なし
    expect(
      await findActiveSwitchRuleByPair(db, 'prd_3255af2f7a36', 'prd_2ae2899e09d7', MASTER_ID),
    ).toBeNull();
    // 無効化したペアは重複扱いしない
    await setInsuranceSwitchRuleActive(db, MASTER_ID, false);
    expect(await findActiveSwitchRuleByPair(db, 'prd_3255af2f7a36', 'prd_2ae2899e09d7')).toBeNull();
  });
});
