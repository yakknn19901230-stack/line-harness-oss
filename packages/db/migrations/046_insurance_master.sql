-- 046_insurance_master.sql
-- 第21弾: 保険商品マスターの搭載。
-- 単一の真実は hozenkun-assistant/master/products.json(insurance-assistant の
-- seed.sql 由来)。scripts/seed-insurance-master.mjs が生成する upsert SQL で投入する。
-- 234件規模のため非正規化1テーブル(種類・会社は文字列のまま持つ)。

CREATE TABLE IF NOT EXISTS insurance_products (
  id TEXT PRIMARY KEY,
  category_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_insurance_products_normalized_name
  ON insurance_products(normalized_name);
CREATE INDEX IF NOT EXISTS idx_insurance_products_category_company
  ON insurance_products(category_name, company_name);

CREATE TABLE IF NOT EXISTS insurance_switch_rules (
  id TEXT PRIMARY KEY,
  old_product_id TEXT NOT NULL,
  new_product_id TEXT NOT NULL,
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_insurance_switch_rules_old_product
  ON insurance_switch_rules(old_product_id);
