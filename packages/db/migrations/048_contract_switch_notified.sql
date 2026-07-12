-- 048_contract_switch_notified.sql
-- 第23弾: 乗り換え提案の「対応済み」記録。
-- 更新パネルの notified_at と同じ思想(YYYY-MM-DD / NULL=未対応)の別カラム。
-- 更新案内と乗り換え提案は独立したイベントなので、記録も混ぜない。

ALTER TABLE friend_contracts ADD COLUMN switch_notified_at TEXT;
