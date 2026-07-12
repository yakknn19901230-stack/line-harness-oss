// 第25弾: CSV/Excelインポートの正規化関数。
// 移植元: insurance-assistant app/src/components/customers/customers-page.tsx(read-only参照)。
// 両製品で同じ揺れ(全角・和暦・記号)を同じ結果に正規化するため、挙動を変えないこと。
// 同値性テスト: packages/shared/src/import-normalize.test.ts(代表ケース)。

/** 全角英数字・記号を半角へ寄せる(移植元 normalizeWidth と同値)。 */
export function normalizeWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／]/g, '/')
    .replace(/[－−―]/g, '-')
    .replace(/[．]/g, '.')
    .replace(/　/g, ' ');
}

function toNormalizedYmd(year: number, month: number, day: number): string | null {
  if (year < 1000 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 日付表記を YYYY-MM-DD に正規化する(移植元 normalizeDate と同値。和暦対応)。
 * 対応: 19901230 / 1990-12-30 / 1990/12/30 / 1990.12.30 / 1990年12月30日 /
 *       H2.12.30 / R元.5.1 / 平成2年6月12日 / 令和元-4-1 など。不正は null。
 */
export function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // 19901230
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return toNormalizedYmd(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  }

  // 1990-12-30 / 1990/12/30 / 1990.12.30
  const western = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (western) {
    return toNormalizedYmd(Number(western[1]), Number(western[2]), Number(western[3]));
  }

  // 1990年12月30日
  const seirekiFull = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (seirekiFull) {
    return toNormalizedYmd(
      Number(seirekiFull[1]),
      Number(seirekiFull[2]),
      Number(seirekiFull[3]),
    );
  }

  // 和暦: H2.12.30 / S64.1.7 / R6-4-8 / R元.5.1
  const era = trimmed.match(/^([RrHhSsMmTt])\s*(元|\d{1,2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (era) {
    const eraCode = era[1].toUpperCase();
    const eraYear = era[2] === '元' ? 1 : Number(era[2]);
    const month = Number(era[3]);
    const day = Number(era[4]);
    if (eraYear < 1) return null;

    const eraBase: Record<string, number> = {
      R: 2018, // 令和1年 = 2019
      H: 1988, // 平成1年 = 1989
      S: 1925, // 昭和1年 = 1926
      T: 1911, // 大正1年 = 1912
      M: 1867, // 明治1年 = 1868
    };

    const base = eraBase[eraCode];
    if (!base) return null;
    return toNormalizedYmd(base + eraYear, month, day);
  }

  // 和暦漢字フル: 平成2年6月12日 / 昭和40年3月15日 / 令和元年4月1日
  const kanjiEra = trimmed.match(
    /^(明治|大正|昭和|平成|令和)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日$/,
  );
  if (kanjiEra) {
    const eraMap: Record<string, number> = {
      明治: 1867,
      大正: 1911,
      昭和: 1925,
      平成: 1988,
      令和: 2018,
    };
    const base = eraMap[kanjiEra[1]];
    const y = kanjiEra[2] === '元' ? 1 : Number(kanjiEra[2]);
    return toNormalizedYmd(base + y, Number(kanjiEra[3]), Number(kanjiEra[4]));
  }

  // 漢字年号+区切り: 平成2.6.12 / 令和元-4-1
  const kanjiEraDot = trimmed.match(
    /^(明治|大正|昭和|平成|令和)(元|\d{1,2})[.\-/](\d{1,2})[.\-/](\d{1,2})$/,
  );
  if (kanjiEraDot) {
    const eraMap: Record<string, number> = {
      明治: 1867,
      大正: 1911,
      昭和: 1925,
      平成: 1988,
      令和: 2018,
    };
    const base = eraMap[kanjiEraDot[1]];
    const y = kanjiEraDot[2] === '元' ? 1 : Number(kanjiEraDot[2]);
    return toNormalizedYmd(base + y, Number(kanjiEraDot[3]), Number(kanjiEraDot[4]));
  }

  return null;
}

/** 電話番号の正規化(移植元 normalizePhone と同値。ハイフン・空白・括弧を除去)。 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = normalizeWidth(raw.trim()).replace(/[\s\-()]/g, '');
  return trimmed || null;
}
