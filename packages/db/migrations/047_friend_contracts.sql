-- 047_friend_contracts.sql
-- 第22弾: 契約リストの正規化。friends.metadata.contracts(JSON配列)を
-- 専用テーブルに移す。product_id は insurance_products(第21弾)への参照で、
-- マスターと照合できていない契約は product_id NULL + free_text_name に元の
-- 自由記述を保持する。既存の metadata.contracts は移行後も消さない(化石として放置)。

CREATE TABLE IF NOT EXISTS friend_contracts (
  id TEXT PRIMARY KEY,
  friend_id TEXT NOT NULL,
  product_id TEXT,              -- insurance_products.id。未照合は NULL
  free_text_name TEXT,          -- 自由記述(未照合時の表示名。照合済みでも元表記保持に使ってよい)
  renewal_date TEXT,            -- YYYY-MM-DD。未設定は NULL
  notified_at TEXT,             -- 更新パネル「対応済み」記録(YYYY-MM-DD)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now','+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now','+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_friend_contracts_friend_id
  ON friend_contracts(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_contracts_renewal_date
  ON friend_contracts(renewal_date);
CREATE INDEX IF NOT EXISTS idx_friend_contracts_product_id
  ON friend_contracts(product_id);
