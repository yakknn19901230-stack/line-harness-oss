import { jstNow } from './utils.js';

// 第22弾: 契約リストの正規化 (friend_contracts)。
// 旧 friends.metadata.contracts の後継。product_id は insurance_products への
// 参照(未照合は NULL + free_text_name)。書き込みは「friend 単位で丸ごと差し替え」
// (replaceFriendContracts) と「対応済み記録の単独更新」(setContractNotifiedAt) の2経路のみ。

export interface FriendContract {
  id: string;
  friend_id: string;
  product_id: string | null;
  free_text_name: string | null;
  renewal_date: string | null;
  notified_at: string | null;
  /** 第23弾: 乗り換え提案パネル「対応済み」記録(YYYY-MM-DD)。notified_at と同じ思想の別カラム。 */
  switch_notified_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** insurance_products をJOINした表示用の行。未照合は名称3列が NULL。 */
export interface FriendContractWithProduct extends FriendContract {
  category_name: string | null;
  company_name: string | null;
  product_name: string | null;
}

const JOINED_SELECT = `
  SELECT fc.*, ip.category_name, ip.company_name, ip.product_name
  FROM friend_contracts fc
  LEFT JOIN insurance_products ip ON ip.id = fc.product_id
`;

export async function getContractsByFriendId(
  db: D1Database,
  friendId: string,
): Promise<FriendContractWithProduct[]> {
  const result = await db
    .prepare(`${JOINED_SELECT} WHERE fc.friend_id = ? ORDER BY fc.sort_order ASC, fc.created_at ASC`)
    .bind(friendId)
    .all<FriendContractWithProduct>();
  return result.results;
}

/** 一覧表示用の一括取得(friends リストAPIのレスポンス同梱用)。 */
export async function getContractsByFriendIds(
  db: D1Database,
  friendIds: string[],
): Promise<FriendContractWithProduct[]> {
  if (friendIds.length === 0) return [];
  const placeholders = friendIds.map(() => '?').join(',');
  const result = await db
    .prepare(
      `${JOINED_SELECT} WHERE fc.friend_id IN (${placeholders})
       ORDER BY fc.friend_id, fc.sort_order ASC, fc.created_at ASC`,
    )
    .bind(...friendIds)
    .all<FriendContractWithProduct>();
  return result.results;
}

export interface ReplaceContractInput {
  /** 既存行のID。指定されていれば created_at / notified_at を引き継ぐ。 */
  id?: string | null;
  product_id?: string | null;
  free_text_name?: string | null;
  renewal_date?: string | null;
  /** 明示指定があれば優先。undefined なら既存行(id一致)から引き継ぐ。 */
  notified_at?: string | null;
  /** 明示指定があれば優先。undefined なら既存行(id一致)から引き継ぐ(notified_at と同様)。 */
  switch_notified_at?: string | null;
}

/**
 * friend の契約を丸ごと差し替える(DELETE→INSERT を D1 の batch で原子的に)。
 * 送られてきた id が既存行と一致する場合は created_at と(未指定時の) notified_at を
 * 引き継ぐ。sort_order は配列順。
 */
export async function replaceFriendContracts(
  db: D1Database,
  friendId: string,
  contracts: ReplaceContractInput[],
): Promise<void> {
  const now = jstNow();
  const existing = await getContractsByFriendId(db, friendId);
  const existingById = new Map(existing.map((row) => [row.id, row]));

  const statements = [
    db.prepare(`DELETE FROM friend_contracts WHERE friend_id = ?`).bind(friendId),
  ];

  contracts.forEach((input, index) => {
    const prev = input.id ? existingById.get(input.id) : undefined;
    const id = prev ? prev.id : crypto.randomUUID();
    const notifiedAt =
      input.notified_at !== undefined ? input.notified_at : (prev?.notified_at ?? null);
    const switchNotifiedAt =
      input.switch_notified_at !== undefined
        ? input.switch_notified_at
        : (prev?.switch_notified_at ?? null);
    statements.push(
      db
        .prepare(
          `INSERT INTO friend_contracts
             (id, friend_id, product_id, free_text_name, renewal_date, notified_at, switch_notified_at, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          friendId,
          input.product_id ?? null,
          input.free_text_name ?? null,
          input.renewal_date ?? null,
          notifiedAt,
          switchNotifiedAt,
          index,
          prev?.created_at ?? now,
          now,
        ),
    );
  });

  await db.batch(statements);
}

/** 更新パネル「対応済み」トグル。行が無ければ false。 */
export async function setContractNotifiedAt(
  db: D1Database,
  friendId: string,
  contractId: string,
  notifiedAt: string | null,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE friend_contracts SET notified_at = ?, updated_at = ?
       WHERE id = ? AND friend_id = ?`,
    )
    .bind(notifiedAt, jstNow(), contractId, friendId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** 乗り換え提案パネル「対応済み」トグル(第23弾)。行が無ければ false。 */
export async function setContractSwitchNotifiedAt(
  db: D1Database,
  friendId: string,
  contractId: string,
  switchNotifiedAt: string | null,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE friend_contracts SET switch_notified_at = ?, updated_at = ?
       WHERE id = ? AND friend_id = ?`,
    )
    .bind(switchNotifiedAt, jstNow(), contractId, friendId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** productId 群が insurance_products に実在するか検証し、存在しないIDを返す。 */
export async function findMissingInsuranceProductIds(
  db: D1Database,
  productIds: string[],
): Promise<string[]> {
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => '?').join(',');
  const result = await db
    .prepare(`SELECT id FROM insurance_products WHERE id IN (${placeholders})`)
    .bind(...unique)
    .all<{ id: string }>();
  const found = new Set(result.results.map((row) => row.id));
  return unique.filter((id) => !found.has(id));
}
