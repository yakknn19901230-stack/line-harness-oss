import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInsertImportFriendStatement } from '../src/import-friends';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

// 第25弾修正: インポートで作った友だちが一覧・今日の保全に表示されない不具合の回帰テスト。
// 一覧(GET /api/friends)と今日の保全(useAllFriends経由の同API)は
// `f.line_account_id = ?` で絞り込むため、line_account_id を設定して作成することを保証する。

/** 本番の唯一のアカウントID(migrations-data/049_fix_import_account.sql と一致させる)。 */
const PROD_ACCOUNT_ID = '0dead79c-e7e0-4321-800a-6bb2f4f64bd4';

/** better-sqlite3 を D1Database 風に見せる最小シム(prepare().bind().run/all/first)。 */
function d1Shim(db: Database.Database): D1Database {
  const makeStatement = (sql: string, params: unknown[]): unknown => ({
    bind: (...p: unknown[]) => makeStatement(sql, p),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...(params as never[])).changes } }),
    all: async () => ({ results: db.prepare(sql).all(...(params as never[])) }),
    first: async () => db.prepare(sql).get(...(params as never[])) ?? null,
  });
  return {
    prepare: (sql: string) => makeStatement(sql, []),
    batch: async (stmts: Array<{ run(): Promise<unknown> }>) => Promise.all(stmts.map((s) => s.run())),
  } as unknown as D1Database;
}

function loadDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(PKG_ROOT, 'bootstrap.sql'), 'utf8'));
  db.prepare(
    `INSERT INTO line_accounts (id, channel_id, name, channel_access_token, channel_secret)
     VALUES (?, 'ch-test', 'LINE Harness', 'token', 'secret')`,
  ).run(PROD_ACCOUNT_ID);
  return db;
}

/** 一覧APIと同じアカウント絞り込み(apps/worker/src/routes/friends.ts の条件)。 */
const listByAccount = (db: Database.Database, accountId: string) =>
  db.prepare(`SELECT f.id, f.display_name FROM friends f WHERE f.line_account_id = ?`).all(accountId) as Array<{ id: string }>;

describe('インポート友だちのアカウント帰属(第25弾修正)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = loadDb();
  });

  it('修正後のINSERTは line_account_id 付きで、一覧・検索のアカウント絞り込みに表示される', async () => {
    const stmt = buildInsertImportFriendStatement(d1Shim(db), {
      id: 'friend-import-1',
      lineUserId: 'import:00000000-0000-0000-0000-000000000001',
      displayName: 'インポート試験太郎',
      metadataJson: JSON.stringify({ birthday: '1990-12-30' }),
      lineAccountId: PROD_ACCOUNT_ID,
    });
    await (stmt as unknown as { run(): Promise<unknown> }).run();

    // 一覧(=今日の保全のuseAllFriendsも同じAPI・同じ絞り込み)
    expect(listByAccount(db, PROD_ACCOUNT_ID).map((r) => r.id)).toContain('friend-import-1');
    // 検索(display_name LIKE)+アカウント絞り込みの併用
    const searched = db
      .prepare(`SELECT f.id FROM friends f WHERE f.line_account_id = ? AND f.display_name LIKE ?`)
      .all(PROD_ACCOUNT_ID, '%インポート試験%') as Array<{ id: string }>;
    expect(searched.map((r) => r.id)).toContain('friend-import-1');
  });

  it('不具合の再現: line_account_id が NULL だとアカウント絞り込みの一覧に出ない', async () => {
    const stmt = buildInsertImportFriendStatement(d1Shim(db), {
      id: 'friend-import-null',
      lineUserId: 'import:00000000-0000-0000-0000-000000000002',
      displayName: '表示されない花子',
      metadataJson: '{}',
      lineAccountId: null,
    });
    await (stmt as unknown as { run(): Promise<unknown> }).run();

    expect(listByAccount(db, PROD_ACCOUNT_ID).map((r) => r.id)).not.toContain('friend-import-null');
  });

  it('補正SQL(049)でNULLの疑似友だちが埋まり、一覧に出る。冪等で本物の友だちには触れない', async () => {
    // 修正前に入ってしまった疑似友だち(NULL)と、本物のLINE友だち(別アカウント想定でNULL)
    for (const [id, lineUserId, name] of [
      ['friend-import-old', 'import:00000000-0000-0000-0000-000000000003', '山田太郎'],
      ['friend-real', 'U1234567890abcdef', '本物の友だち'],
    ] as const) {
      db.prepare(
        `INSERT INTO friends (id, line_user_id, display_name, is_following, metadata, created_at, updated_at)
         VALUES (?, ?, ?, 1, '{}', '2026-07-12T00:00:00.000', '2026-07-12T00:00:00.000')`,
      ).run(id, lineUserId, name);
    }

    const fixSql = readFileSync(join(PKG_ROOT, '..', '..', 'migrations-data', '049_fix_import_account.sql'), 'utf8');
    db.exec(fixSql);

    const ids = listByAccount(db, PROD_ACCOUNT_ID).map((r) => r.id);
    expect(ids).toContain('friend-import-old');
    expect(ids).not.toContain('friend-real'); // import:以外は補正対象外

    // 冪等: もう一度流しても変化なし
    db.exec(fixSql);
    expect(listByAccount(db, PROD_ACCOUNT_ID).map((r) => r.id)).toEqual(ids);
  });
});
