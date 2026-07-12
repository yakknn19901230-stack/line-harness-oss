import { jstNow } from './utils.js';

// 第21弾: 保険商品マスター (insurance_products / insurance_switch_rules)。
// マスターの単一の真実は hozenkun-assistant/master/products.json。
// 投入は scripts/seed-insurance-master.mjs が生成する upsert SQL で行うため、
// このモジュールは読み取り系が中心。

export interface InsuranceProduct {
  id: string;
  category_name: string;
  company_name: string;
  product_name: string;
  normalized_name: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface InsuranceSwitchRule {
  id: string;
  old_product_id: string;
  new_product_id: string;
  memo: string | null;
  /** 'master'=共通マスター投入分(seed管理) / 'custom'=管理画面で作成(第26弾) */
  source: string;
  /** 0で無効化(共通ルールは削除の代わりに無効化。seed再投入でも維持される) */
  is_active: number;
  created_at: string;
  updated_at: string | null;
}

/** 種類名の一覧(有効な商品を1件以上持つもの)。 */
export async function getInsuranceCategories(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT DISTINCT category_name
       FROM insurance_products
       WHERE is_active = 1
       ORDER BY category_name ASC`,
    )
    .all<{ category_name: string }>();
  return result.results.map((row) => row.category_name);
}

/** 指定した種類の有効な商品を持つ会社名の一覧。category 省略時は全会社。 */
export async function getInsuranceCompanies(
  db: D1Database,
  category?: string,
): Promise<string[]> {
  const sql = category
    ? `SELECT DISTINCT company_name FROM insurance_products
       WHERE is_active = 1 AND category_name = ? ORDER BY company_name ASC`
    : `SELECT DISTINCT company_name FROM insurance_products
       WHERE is_active = 1 ORDER BY company_name ASC`;
  const stmt = category ? db.prepare(sql).bind(category) : db.prepare(sql);
  const result = await stmt.all<{ company_name: string }>();
  return result.results.map((row) => row.company_name);
}

export interface InsuranceProductFilter {
  category?: string;
  company?: string;
}

/** 種類・会社で絞り込んだ有効な商品一覧。 */
export async function getInsuranceProducts(
  db: D1Database,
  filter: InsuranceProductFilter = {},
): Promise<InsuranceProduct[]> {
  const conditions = ['is_active = 1'];
  const binds: string[] = [];
  if (filter.category) {
    conditions.push('category_name = ?');
    binds.push(filter.category);
  }
  if (filter.company) {
    conditions.push('company_name = ?');
    binds.push(filter.company);
  }
  const result = await db
    .prepare(
      `SELECT * FROM insurance_products
       WHERE ${conditions.join(' AND ')}
       ORDER BY category_name ASC, company_name ASC, product_name ASC`,
    )
    .bind(...binds)
    .all<InsuranceProduct>();
  return result.results;
}

/** 名寄せ用: 有効な全商品(234件規模なので全件ロードで問題ない)。 */
export async function getActiveInsuranceProducts(
  db: D1Database,
): Promise<InsuranceProduct[]> {
  const result = await db
    .prepare(`SELECT * FROM insurance_products WHERE is_active = 1`)
    .all<InsuranceProduct>();
  return result.results;
}

export async function getInsuranceSwitchRules(
  db: D1Database,
): Promise<InsuranceSwitchRule[]> {
  const result = await db
    .prepare(`SELECT * FROM insurance_switch_rules ORDER BY created_at ASC`)
    .all<InsuranceSwitchRule>();
  return result.results;
}

/** 第23弾: insurance_products を2回JOINして新旧両側の名称を付けたルール行。 */
export interface InsuranceSwitchRuleWithProducts extends InsuranceSwitchRule {
  old_category_name: string | null;
  old_company_name: string | null;
  old_product_name: string | null;
  new_category_name: string | null;
  new_company_name: string | null;
  new_product_name: string | null;
}

/**
 * 乗り換え提案パネル用: 新旧の商品名称付きでルールを返す(233件規模の参照なので全件)。
 * 既定は is_active=1 のみ(判定・パネルは無効化ルールを見ない)。
 * includeInactive=true は設定画面用(無効化済みも一覧に出して再有効化できるように)。
 */
export async function getInsuranceSwitchRulesWithProducts(
  db: D1Database,
  opts: { includeInactive?: boolean } = {},
): Promise<InsuranceSwitchRuleWithProducts[]> {
  const where = opts.includeInactive ? '' : 'WHERE sr.is_active = 1';
  const result = await db
    .prepare(
      `SELECT sr.*,
              op.category_name AS old_category_name,
              op.company_name  AS old_company_name,
              op.product_name  AS old_product_name,
              np.category_name AS new_category_name,
              np.company_name  AS new_company_name,
              np.product_name  AS new_product_name
       FROM insurance_switch_rules sr
       LEFT JOIN insurance_products op ON op.id = sr.old_product_id
       LEFT JOIN insurance_products np ON np.id = sr.new_product_id
       ${where}
       ORDER BY sr.created_at ASC`,
    )
    .all<InsuranceSwitchRuleWithProducts>();
  return result.results;
}

export async function getInsuranceSwitchRuleById(
  db: D1Database,
  id: string,
): Promise<InsuranceSwitchRule | null> {
  return db.prepare(`SELECT * FROM insurance_switch_rules WHERE id = ?`).bind(id).first<InsuranceSwitchRule>();
}

/** 同一ペア(old→new)の有効ルールを引く(重複チェック用)。excludeId は自分自身の除外(PUT用)。 */
export async function findActiveSwitchRuleByPair(
  db: D1Database,
  oldProductId: string,
  newProductId: string,
  excludeId?: string,
): Promise<InsuranceSwitchRule | null> {
  const sql = excludeId
    ? `SELECT * FROM insurance_switch_rules WHERE old_product_id = ? AND new_product_id = ? AND is_active = 1 AND id != ?`
    : `SELECT * FROM insurance_switch_rules WHERE old_product_id = ? AND new_product_id = ? AND is_active = 1`;
  const stmt = excludeId
    ? db.prepare(sql).bind(oldProductId, newProductId, excludeId)
    : db.prepare(sql).bind(oldProductId, newProductId);
  return stmt.first<InsuranceSwitchRule>();
}

/** 管理画面からの自分ルール作成(source='custom')。第26弾。 */
export async function createInsuranceSwitchRule(
  db: D1Database,
  input: { id: string; oldProductId: string; newProductId: string; memo: string | null },
): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO insurance_switch_rules (id, old_product_id, new_product_id, memo, source, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'custom', 1, ?, ?)`,
    )
    .bind(input.id, input.oldProductId, input.newProductId, input.memo, now, now)
    .run();
}

/** 自分ルール(custom)の編集。source/is_activeは変更しない。IDは安定(採番し直さない)。 */
export async function updateInsuranceSwitchRule(
  db: D1Database,
  id: string,
  input: { oldProductId: string; newProductId: string; memo: string | null },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE insurance_switch_rules
       SET old_product_id = ?, new_product_id = ?, memo = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.oldProductId, input.newProductId, input.memo, jstNow(), id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** 有効/無効の切り替え(master行もcustom行も可)。無効化はseed再投入でも維持される。 */
export async function setInsuranceSwitchRuleActive(
  db: D1Database,
  id: string,
  isActive: boolean,
): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE insurance_switch_rules SET is_active = ?, updated_at = ? WHERE id = ?`)
    .bind(isActive ? 1 : 0, jstNow(), id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** 自分ルール(custom)の削除。master行の保護は呼び出し側(ルート)で行う。 */
export async function deleteInsuranceSwitchRule(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM insurance_switch_rules WHERE id = ?`).bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

export interface UpsertInsuranceProductInput {
  id: string;
  category_name: string;
  company_name: string;
  product_name: string;
  normalized_name: string;
  is_active?: number;
}

/** マスター再投入用の冪等 upsert(単体)。一括投入は seed SQL を使う。 */
export async function upsertInsuranceProduct(
  db: D1Database,
  input: UpsertInsuranceProductInput,
): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO insurance_products
         (id, category_name, company_name, product_name, normalized_name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         category_name = excluded.category_name,
         company_name = excluded.company_name,
         product_name = excluded.product_name,
         normalized_name = excluded.normalized_name,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.id,
      input.category_name,
      input.company_name,
      input.product_name,
      input.normalized_name,
      input.is_active ?? 1,
      now,
      now,
    )
    .run();
}
