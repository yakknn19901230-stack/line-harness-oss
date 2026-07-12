import { jstNow } from './utils.js';

// 第25弾: CSVインポート用のDB補助。
// LINE未連携の顧客は line_user_id に「import:」疑似ID(@line-crm/shared の
// makeImportPseudoId)を入れて friends に作成する(スキーマ変更なし)。
// 送信ガードは line-sdk 側(pushMessage/multicast)と配信対象集計側にある。

/** 重複検出(表示名+誕生日)に必要な最小列。 */
export interface FriendLiteForImport {
  id: string;
  line_user_id: string;
  display_name: string | null;
  metadata: string;
}

/** 全友だちの重複検出用ライト読み(数百〜数千件想定。metadataは誕生日参照のみに使う)。 */
export async function getFriendsLiteForImport(db: D1Database): Promise<FriendLiteForImport[]> {
  const result = await db
    .prepare(`SELECT id, line_user_id, display_name, metadata FROM friends`)
    .all<FriendLiteForImport>();
  return result.results;
}

export interface InsertImportFriendInput {
  id: string;
  lineUserId: string;
  displayName: string;
  /** JSON化済みのmetadata */
  metadataJson: string;
  /**
   * 所属アカウント。一覧・今日の保全は line_account_id で絞り込むため、
   * NULLのまま作ると選択中アカウントの画面に表示されない(第25弾修正)。
   */
  lineAccountId: string | null;
}

/** インポートでの新規友だちINSERT文(実行はしない。呼び出し側がchunkしてbatchする)。 */
export function buildInsertImportFriendStatement(
  db: D1Database,
  input: InsertImportFriendInput,
): D1PreparedStatement {
  const now = jstNow();
  return db
    .prepare(
      `INSERT INTO friends (id, line_user_id, display_name, is_following, metadata, line_account_id, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .bind(input.id, input.lineUserId, input.displayName, input.metadataJson, input.lineAccountId, now, now);
}

/** インポートでの既存友だちmetadata更新文(実行はしない)。 */
export function buildUpdateFriendMetadataStatement(
  db: D1Database,
  friendId: string,
  metadataJson: string,
): D1PreparedStatement {
  return db
    .prepare(`UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?`)
    .bind(metadataJson, jstNow(), friendId);
}
