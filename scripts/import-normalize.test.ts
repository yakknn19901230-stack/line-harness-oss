import { describe, expect, it } from 'vitest';
import {
  normalizeWidth,
  normalizeDate,
  normalizePhone,
} from '../packages/shared/src/import-normalize';

/**
 * 第25弾: CSVインポート正規化関数の同値性テスト。
 * 移植元は insurance-assistant の customers-page.tsx(read-only)。
 * ここの期待値は移植元の実装で同じ入力を評価した結果と一致させている。
 * 挙動を変える変更は「両製品で同値」の約束を壊すため、このテストが落ちたら
 * 移植元との差分を必ず確認すること。
 */

describe('normalizeWidth', () => {
  it('全角数字・英字を半角にする', () => {
    expect(normalizeWidth('０１２３４５６７８９')).toBe('0123456789');
    expect(normalizeWidth('ＡＢＣａｂｃ')).toBe('ABCabc');
  });

  it('全角記号(／－．)と全角空白を半角にする', () => {
    expect(normalizeWidth('１９９０／１２／３０')).toBe('1990/12/30');
    expect(normalizeWidth('０９０－１２３４')).toBe('090-1234');
    expect(normalizeWidth('Ｈ２．１２．３０')).toBe('H2.12.30');
    expect(normalizeWidth('山田　太郎')).toBe('山田 太郎');
  });

  it('長音符系(−―)もハイフンへ寄せる', () => {
    expect(normalizeWidth('090−1234―5678')).toBe('090-1234-5678');
  });
});

describe('normalizeDate(和暦対応)', () => {
  it('19901230(8桁圧縮)', () => {
    expect(normalizeDate('19901230')).toBe('1990-12-30');
  });

  it('西暦の区切りゆれ(- / .)', () => {
    expect(normalizeDate('1990-12-30')).toBe('1990-12-30');
    expect(normalizeDate('1990/12/30')).toBe('1990-12-30');
    expect(normalizeDate('1990.12.30')).toBe('1990-12-30');
    expect(normalizeDate('1990/1/5')).toBe('1990-01-05');
  });

  it('1990年12月30日(西暦漢字)', () => {
    expect(normalizeDate('1990年12月30日')).toBe('1990-12-30');
  });

  it('和暦イニシャル: H2.12.30 / S64.1.7 / R6-4-8 / R元.5.1', () => {
    expect(normalizeDate('H2.12.30')).toBe('1990-12-30');
    expect(normalizeDate('S64.1.7')).toBe('1989-01-07');
    expect(normalizeDate('R6-4-8')).toBe('2024-04-08');
    expect(normalizeDate('R元.5.1')).toBe('2019-05-01');
  });

  it('和暦漢字フル: 令和元年4月1日 / 平成2年6月12日 / 昭和40年3月15日', () => {
    expect(normalizeDate('令和元年4月1日')).toBe('2019-04-01');
    expect(normalizeDate('平成2年6月12日')).toBe('1990-06-12');
    expect(normalizeDate('昭和40年3月15日')).toBe('1965-03-15');
  });

  it('漢字年号+区切り: 平成2.6.12 / 令和元-4-1', () => {
    expect(normalizeDate('平成2.6.12')).toBe('1990-06-12');
    expect(normalizeDate('令和元-4-1')).toBe('2019-04-01');
  });

  it('存在しない日付・不正な形式は null', () => {
    expect(normalizeDate('1990-02-30')).toBeNull();
    expect(normalizeDate('30/12/1990')).toBeNull();
    expect(normalizeDate('あした')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });

  it('全角入力は normalizeWidth と組み合わせて通る(CSV実データの想定経路)', () => {
    expect(normalizeDate(normalizeWidth('１９９０／１２／３０'))).toBe('1990-12-30');
    expect(normalizeDate(normalizeWidth('Ｈ２．１２．３０'))).toBe('1990-12-30');
  });
});

describe('normalizePhone', () => {
  it('ハイフン・空白・括弧を除去し、全角も半角にする', () => {
    expect(normalizePhone('090-1234-5678')).toBe('09012345678');
    expect(normalizePhone('０９０－１２３４－５６７８')).toBe('09012345678');
    expect(normalizePhone('(03) 1234 5678')).toBe('0312345678');
  });

  it('空・null は null', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});
