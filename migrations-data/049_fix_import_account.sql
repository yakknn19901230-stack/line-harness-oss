-- 049_fix_import_account.sql — 人がレビューしてから適用する。
-- 第25弾修正: CSVインポートで作成した疑似ID友だちの line_account_id 補正。
--
-- 原因: 第25弾初版のインポートINSERTが line_account_id を設定していなかった(NULL)。
-- 一覧(GET /api/friends)と今日の保全は line_account_id で絞り込むため、
-- 選択中アカウントの画面に表示されなかった。コード側は修正済みで、このSQLは
-- 修正前に本番へ入った3件(山田太郎・インポート試験太郎・インポート試験花子)の補正。
--
-- '0dead79c-e7e0-4321-800a-6bb2f4f64bd4' は本番D1 line_accounts の唯一の
-- アカウント「LINE Harness」(2026-07-12 実測。アカウントが増えた後に流す場合は再確認すること)。
-- 冪等: 対象は line_user_id LIKE 'import:%' かつ line_account_id IS NULL のみ。
-- 2回目以降は0行更新。本物のLINE友だちには一切触れない。

UPDATE friends
SET line_account_id = '0dead79c-e7e0-4321-800a-6bb2f4f64bd4',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE line_user_id LIKE 'import:%'
  AND line_account_id IS NULL;
