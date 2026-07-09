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
  created_at: string;
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
