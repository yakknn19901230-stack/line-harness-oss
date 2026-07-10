/**
 * 保険商品の名寄せロジック。
 *
 * insurance-assistant の PostgreSQL 関数 `normalize_for_match_text`
 * (app/product-match-rpc.sql) の TypeScript 移植:
 * NFKC 正規化 → 空白類の除去 → 括弧・記号類の除去 → 小文字化。
 *
 * 原典との意図的な差分(第21弾の名寄せ不一致修正):
 * NFKC が全角記号を半角化する(！→! など)ため、原典の記号セット(全角のみ)
 * では NFKC 後の半角記号が除去されず「クリック定期！Neo」と「クリック定期Neo」が
 * 一致しない。TS 版では NFKC 後に現れる半角形 (! ? , . ~) も除去する。
 * 原典(PG側)にも同じ潜在バグがあり、insurance-assistant 側の修正は別フェーズの宿題。
 *
 * 保全くんの契約データは自由記述の商品名しか持たないため、matchProducts は
 * 1件に確定させず候補配列を返す。確定は第22弾のUIで人が行う。
 * 文字クラスは原典SQLと同じくコードポイントで表記する(不可視文字・
 * 文字クラス内の "]" 等の取り違えを防ぐため)。
 */

// \s + 全角スペース U+3000, ゼロ幅 U+200B-200D, BOM U+FEFF
const WHITESPACE_RE = new RegExp('[\\s　​‌‍﻿]+', 'g');

// normalize_for_match_text の記号セット + NFKC後の半角形(! ? , . ~):
// () [] {} 〈〉《》「」『』【】（）［］｛｝、。，．・･！？〜～ー‐‑‒–—―－-
const SYMBOL_RE = new RegExp(
  '[()\\[\\]{}' +
    '〈〉《》「」『』【】' +
    '（）［］｛｝' +
    '、。，．・･！？' +
    '〜～ー' +
    '‐‑‒–—―－' +
    // NFKC が全角記号を半角化するため、半角形も除去対象に含める(原典PGには無い)。
    // "-" は範囲指定と解釈されないようクラス末尾に置く。
    '!?,.~-' +
    ']',
  'g',
);

export function normalizeForMatch(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFKC')
    .replace(WHITESPACE_RE, '')
    .replace(SYMBOL_RE, '')
    .toLowerCase();
}

export interface InsuranceProductLike {
  id: string;
  product_name: string;
  /** 事前計算済みの正規化名。無ければ product_name から都度計算する。 */
  normalized_name?: string;
}

export type InsuranceMatchType = 'exact' | 'normalized' | 'partial';

export interface InsuranceProductMatch<T extends InsuranceProductLike> {
  product: T;
  matchType: InsuranceMatchType;
}

/**
 * 自由記述の商品名 `name` に対する候補を、確度の高い順に返す:
 * 完全一致 → 正規化一致 → 部分一致(正規化した上での包含、双方向)。
 * 同一商品は最初に一致した層にのみ現れる。正規化後が空文字になる入力は
 * 部分一致で全件に一致してしまうため、完全一致のみ評価する。
 */
export function matchProducts<T extends InsuranceProductLike>(
  name: string,
  products: T[],
): InsuranceProductMatch<T>[] {
  const normalizedQuery = normalizeForMatch(name);

  const exact: InsuranceProductMatch<T>[] = [];
  const normalized: InsuranceProductMatch<T>[] = [];
  const partial: InsuranceProductMatch<T>[] = [];

  for (const product of products) {
    if (product.product_name === name) {
      exact.push({ product, matchType: 'exact' });
      continue;
    }
    if (normalizedQuery === '') continue;

    const normalizedProduct =
      product.normalized_name ?? normalizeForMatch(product.product_name);
    if (normalizedProduct === normalizedQuery) {
      normalized.push({ product, matchType: 'normalized' });
    } else if (
      normalizedProduct.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedProduct)
    ) {
      partial.push({ product, matchType: 'partial' });
    }
  }

  return [...exact, ...normalized, ...partial];
}
