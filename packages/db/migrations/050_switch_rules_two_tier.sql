-- 050_switch_rules_two_tier.sql
-- 第26弾: 乗り換えルールの二層方式。
--   source='master' … hozenkun-assistant/master/switch-rules.json からのseed投入分。
--                      seed再投入(scripts/seed-switch-rules.mjs)で更新・削除される
--   source='custom' … 管理画面で作成したインスタンス独自ルール。seed再投入で消えない
-- is_active=0 で無効化(共通ルールはユーザー削除不可の代わりに無効化できる)。
-- 無効化状態はseed再投入でも維持される(seedは is_active を上書きしない)。

ALTER TABLE insurance_switch_rules ADD COLUMN source TEXT NOT NULL DEFAULT 'master';
ALTER TABLE insurance_switch_rules ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE insurance_switch_rules ADD COLUMN updated_at TEXT;
