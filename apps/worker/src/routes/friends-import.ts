import { Hono } from 'hono';
import {
  getFriendsLiteForImport,
  buildInsertImportFriendStatement,
  buildUpdateFriendMetadataStatement,
  getContractsByFriendId,
  replaceFriendContracts,
  getActiveInsuranceProducts,
} from '@line-crm/db';
import { makeImportPseudoId } from '@line-crm/shared';
import { planImport } from '../services/import-plan.js';
import type { Env } from '../index.js';

// 第25弾: CSV/Excelインポートの確定API。
// パース・正規化・検証はブラウザ側(apps/webのインポートUI)で済ませ、
// ここは正規化済みJSONを受けてD1へ書き込む。計画(検証・重複検出・商品照合)は
// services/import-plan.ts の純ロジックに閉じ、このルートは実行だけを担う。

const friendsImport = new Hono<Env>();

/** 1リクエストの最大行数(超過は400)。 */
export const IMPORT_MAX_ROWS = 500;
/** db.batch のチャンクサイズ(1文あたり最大6バインド × 12 = 72 < 100)。 */
const BATCH_CHUNK = 12;

/** JSTの今日(YYYY-MM-DD)。memoをnotesに積むときの日付。 */
function jstTodayYmd(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

// POST /api/friends/import - body: { rows: ImportRowInput[] }
friendsImport.post('/api/friends/import', async (c) => {
  try {
    const body = await c.req.json<{ rows?: unknown }>().catch(() => ({}) as { rows?: unknown });
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return c.json({ success: false, error: 'rows must be a non-empty array' }, 400);
    }
    if (body.rows.length > IMPORT_MAX_ROWS) {
      return c.json(
        { success: false, error: `rows must be at most ${IMPORT_MAX_ROWS} (got ${body.rows.length})` },
        400,
      );
    }

    const db = c.env.DB;

    // 1回だけロード(行ごとの外部呼び出し禁止 — 商品照合はメモリで行う)
    const [existingFriends, products] = await Promise.all([
      getFriendsLiteForImport(db),
      getActiveInsuranceProducts(db),
    ]);

    const plan = planImport({
      rows: body.rows,
      existingFriends,
      products,
      today: jstTodayYmd(),
    });

    // ── friends本体: INSERT(疑似IDはここで採番)+ metadata UPDATE をchunkしてbatch ──
    const statements = [
      ...plan.newFriends.map((f) =>
        buildInsertImportFriendStatement(db, {
          id: f.id,
          lineUserId: makeImportPseudoId(),
          displayName: f.displayName,
          metadataJson: f.metadataJson,
        }),
      ),
      ...plan.updates.map((u) => buildUpdateFriendMetadataStatement(db, u.friendId, u.metadataJson)),
    ];
    for (let i = 0; i < statements.length; i += BATCH_CHUNK) {
      await db.batch(statements.slice(i, i + BATCH_CHUNK));
    }

    // ── 契約: 既存行を保持したまま末尾追加(丸ごと差し替えの入力に既存+新規を渡す) ──
    for (const [friendId, additions] of plan.contractsToAdd) {
      const existing = plan.newFriendIds.has(friendId)
        ? []
        : await getContractsByFriendId(db, friendId);
      await replaceFriendContracts(db, friendId, [
        ...existing.map((row) => ({
          id: row.id, // idを渡すと created_at / notified_at / switch_notified_at を引き継ぐ
          product_id: row.product_id,
          free_text_name: row.free_text_name,
          renewal_date: row.renewal_date,
        })),
        ...additions,
      ]);
    }

    return c.json({
      success: true,
      data: {
        created: plan.created,
        updated: plan.updated,
        contractsAdded: plan.contractsAdded,
        unmatchedProducts: plan.unmatchedProducts,
        skipped: plan.skipped,
      },
    });
  } catch (err) {
    console.error('POST /api/friends/import error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { friendsImport };
