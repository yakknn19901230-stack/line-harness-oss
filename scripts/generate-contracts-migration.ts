#!/usr/bin/env tsx
/**
 * 第22弾: friends.metadata.contracts → friend_contracts のデータ移行SQL生成。
 *
 * 本番D1から metadata.contracts を読み取り(読み取りのみ・書き込みはしない)、
 * 各契約名を packages/shared の matchProducts で商品マスターと照合して、
 * migrations-data/047_contracts_data.sql に INSERT 文を出力する。
 *
 * 照合ルール:
 *   - exact / normalized 一致のみ product_id を確定する
 *   - partial・不一致は product_id NULL + free_text_name に元の記述を保持
 *     (第22弾UIの「未照合」バッジから人が選び直す)
 *
 * 冪等性: 行IDは friend_id+位置+内容から決定的に採番し、INSERT は
 * ON CONFLICT(id) DO NOTHING。同じ入力なら何度流しても同じ結果になる。
 * 出力SQLは人がレビューしてから wrangler d1 execute --remote で適用する前提。
 *
 * 使い方(リポジトリルートで):
 *   npx tsx scripts/generate-contracts-migration.ts [--db line-harness] [-o 出力先.sql]
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchProducts } from '../packages/shared/src/insurance';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_DIR = join(REPO_ROOT, 'apps', 'worker');
const DEFAULT_OUTPUT = join(REPO_ROOT, 'migrations-data', '047_contracts_data.sql');
const JST_NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%f','now','+9 hours')";

interface LegacyContract {
  name?: unknown;
  renewal_date?: unknown;
  notified_at?: unknown;
}

function parseArgs(argv: string[]) {
  let dbName = 'line-harness';
  let output = DEFAULT_OUTPUT;
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === '--db') dbName = rest.shift() ?? dbName;
    else if (arg === '-o' || arg === '--output') output = resolve(rest.shift() ?? output);
    else if (arg === '-h' || arg === '--help') {
      console.log('usage: npx tsx scripts/generate-contracts-migration.ts [--db line-harness] [-o out.sql]');
      process.exit(0);
    }
  }
  return { dbName, output };
}

/** wrangler d1 execute --json の結果から results 配列を取り出す。 */
function d1Query<T>(dbName: string, sql: string): T[] {
  // 同梱 wrangler 4.77.0 はD1認証エラーになる実績があるため wrangler@latest を使う
  const stdout = execSync(
    `npx wrangler@latest d1 execute ${dbName} --remote --json --command "${sql.replace(/"/g, '\\"')}"`,
    { cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const jsonStart = stdout.indexOf('[');
  if (jsonStart < 0) throw new Error(`wrangler output has no JSON: ${stdout.slice(0, 200)}`);
  const parsed = JSON.parse(stdout.slice(jsonStart)) as Array<{ results: T[] }>;
  return parsed.flatMap((entry) => entry.results ?? []);
}

const sqlQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlValue = (value: string | null) => (value === null ? 'NULL' : sqlQuote(value));

const asString = (raw: unknown): string => (typeof raw === 'string' ? raw : '');
const asYmd = (raw: unknown): string | null => {
  const head = asString(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
};

const { dbName, output } = parseArgs(process.argv.slice(2));

// 1) 本番の契約データ(読み取りのみ)
const friendRows = d1Query<{ friend_id: string; contracts: string }>(
  dbName,
  `SELECT id AS friend_id, json_extract(metadata,'$.contracts') AS contracts FROM friends WHERE json_extract(metadata,'$.contracts') IS NOT NULL`,
);

// 2) 商品マスター(照合対象)
const products = d1Query<{ id: string; product_name: string; normalized_name: string }>(
  dbName,
  `SELECT id, product_name, normalized_name FROM insurance_products WHERE is_active = 1`,
);
if (products.length === 0) {
  throw new Error('insurance_products が空です。第21弾のマスター投入が先です。');
}

interface OutRow {
  id: string;
  friendId: string;
  productId: string | null;
  freeTextName: string | null;
  renewalDate: string | null;
  notifiedAt: string | null;
  sortOrder: number;
  matchType: 'exact' | 'normalized' | 'unmatched';
  originalName: string;
}

const rows: OutRow[] = [];
for (const friend of friendRows) {
  let entries: LegacyContract[];
  try {
    const parsed = JSON.parse(friend.contracts);
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    entries = [];
  }
  entries.forEach((entry, index) => {
    const name = asString(entry?.name).trim();
    const renewalDate = asYmd(entry?.renewal_date);
    const notifiedAt = asYmd(entry?.notified_at);
    if (name === '' && renewalDate === null) return; // 完全に空の行は移行しない

    // exact / normalized のみ確定。partial・不一致は未照合として自由記述を保持。
    const candidates = name === '' ? [] : matchProducts(name, products);
    const top = candidates[0];
    const confirmed = top && (top.matchType === 'exact' || top.matchType === 'normalized');

    const id =
      'fc_' +
      createHash('sha1')
        .update(['contract', friend.friend_id, String(index), name, renewalDate ?? ''].join(''), 'utf8')
        .digest('hex')
        .slice(0, 16);

    rows.push({
      id,
      friendId: friend.friend_id,
      productId: confirmed ? top.product.id : null,
      freeTextName: name || null,
      renewalDate,
      notifiedAt,
      sortOrder: index,
      matchType: confirmed ? top.matchType : 'unmatched',
      originalName: name,
    });
  });
}

const matched = rows.filter((r) => r.productId !== null).length;
const statements = rows.map(
  (r) =>
    `-- ${r.matchType}: ${r.originalName || '(名称なし)'}\n` +
    `INSERT INTO friend_contracts (id, friend_id, product_id, free_text_name, renewal_date, notified_at, sort_order, created_at, updated_at)\n` +
    `VALUES (${sqlQuote(r.id)}, ${sqlQuote(r.friendId)}, ${sqlValue(r.productId)}, ${sqlValue(r.freeTextName)}, ${sqlValue(r.renewalDate)}, ${sqlValue(r.notifiedAt)}, ${r.sortOrder}, ${JST_NOW_SQL}, ${JST_NOW_SQL})\n` +
    `ON CONFLICT(id) DO NOTHING;`,
);

const header = [
  '-- Generated by scripts/generate-contracts-migration.ts — 人がレビューしてから適用する。',
  `-- 入力: 本番D1 (${dbName}) の friends.metadata.contracts / 照合対象: insurance_products ${products.length}件`,
  `-- 契約 ${rows.length} 件 (照合済み ${matched} / 未照合 ${rows.length - matched})。metadata.contracts 自体は消さない(化石として残置)。`,
  '-- 冪等: 行IDは内容から決定的に採番し ON CONFLICT(id) DO NOTHING。',
  '',
].join('\n');

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${header}${statements.join('\n\n')}\n`, 'utf8');
console.log(`written: ${output}`);
console.log(`friends: ${friendRows.length}, contracts: ${rows.length}, matched: ${matched}, unmatched: ${rows.length - matched}`);
