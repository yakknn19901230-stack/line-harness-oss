import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeForMatch } from '../packages/shared/src/insurance';

/**
 * 第21弾: seeds/insurance-master.sql の normalized_name が
 * packages/shared の normalizeForMatch(単一の実装)の出力と全件一致することを保証する。
 * seed 生成(scripts/seed-insurance-master.mjs)と Worker の名寄せが別の正規化に
 * ならないためのガード。マスター更新後に seed の再生成を忘れた場合もここで検知できる。
 */

const SEED_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'db',
  'seeds',
  'insurance-master.sql',
);

interface SeedRow {
  id: string;
  productName: string;
  normalizedName: string;
}

const unquote = (value: string) => value.replace(/''/g, "'");

function parseSeedRows(sql: string): SeedRow[] {
  // INSERT の VALUES 行:
  // VALUES ('id', 'category', 'company', 'product_name', 'normalized_name', 1, strftime(...), strftime(...))
  const re =
    /VALUES \('((?:[^']|'')*)', '(?:[^']|'')*', '(?:[^']|'')*', '((?:[^']|'')*)', '((?:[^']|'')*)', 1, strftime/g;
  const rows: SeedRow[] = [];
  for (const m of sql.matchAll(re)) {
    rows.push({
      id: unquote(m[1]),
      productName: unquote(m[2]),
      normalizedName: unquote(m[3]),
    });
  }
  return rows;
}

describe('seeds/insurance-master.sql', () => {
  const rows = parseSeedRows(readFileSync(SEED_PATH, 'utf8'));

  it('233商品ぶんのupsertを含む', () => {
    expect(rows.length).toBe(233);
  });

  it('normalized_name が normalizeForMatch(product_name) と全件一致する', () => {
    const mismatches = rows
      .filter((row) => row.normalizedName !== normalizeForMatch(row.productName))
      .map((row) => ({
        id: row.id,
        productName: row.productName,
        seed: row.normalizedName,
        expected: normalizeForMatch(row.productName),
      }));
    expect(mismatches).toEqual([]);
  });
});

describe('normalizeForMatch', () => {
  it('NFKC後の半角記号(!?,.~)も除去する(第21弾 名寄せ不一致の回帰テスト)', () => {
    // 全角！は NFKC で半角!になるため、半角形も除去しないと
    // 「クリック定期！Neo」と「クリック定期Neo」が一致しない
    expect(normalizeForMatch('クリック定期！Neo')).toBe('クリック定期neo');
    expect(normalizeForMatch('クリック定期！Neo')).toBe(
      normalizeForMatch('クリック定期Neo'),
    );
    expect(normalizeForMatch('a!b?c,d.e~f')).toBe('abcdef');
  });

  it('従来の除去対象(全角括弧・中点・長音・空白)は変わらない', () => {
    expect(normalizeForMatch('あ（い）[う]｛え｝・ー-')).toBe('あいうえ');
    expect(normalizeForMatch('ＦＷＤ医療Ⅱ＜Ｗｅｂ専用＞')).toBe('fwd医療ii<web専用>');
  });
});
