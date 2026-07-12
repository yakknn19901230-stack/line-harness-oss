import { describe, expect, test } from 'vitest';
import { claimSixHourlySlot, SIX_HOURLY_KEY } from './cron-gate.js';

// account_settings の system 行だけを持つ最小スタブ。
// UNIQUE(line_account_id, key) の upsert を Map で模倣する。
function stubDB(initialValue?: string) {
  const store = new Map<string, string>();
  if (initialValue !== undefined) store.set(SIX_HOURLY_KEY, initialValue);
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async first() {
          if (sql.includes('SELECT value FROM account_settings')) {
            const value = store.get(String(bound[0]));
            return value === undefined ? null : { value };
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO account_settings')) {
            // bind順: id, key, value, created_at, updated_at, value, updated_at
            store.set(String(bound[1]), String(bound[2]));
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, store };
}

const NOW = new Date('2026-07-13T06:00:00Z');

describe('claimSixHourlySlot', () => {
  test('記録なしなら実行を許可し最終実行時刻を記録する', async () => {
    const { db, store } = stubDB();
    expect(await claimSixHourlySlot(db, NOW)).toBe(true);
    expect(store.get(SIX_HOURLY_KEY)).toBeTruthy();
  });

  test('6時間未満なら実行しない', async () => {
    const { db } = stubDB();
    await claimSixHourlySlot(db, NOW);
    // 5分後(次のcron tick)
    expect(await claimSixHourlySlot(db, new Date(NOW.getTime() + 5 * 60_000))).toBe(false);
    // 5時間59分後でもまだ実行しない
    expect(
      await claimSixHourlySlot(db, new Date(NOW.getTime() + (6 * 60 - 1) * 60_000)),
    ).toBe(false);
  });

  test('6時間経過したら実行を許可し時刻を更新する', async () => {
    const { db, store } = stubDB();
    await claimSixHourlySlot(db, NOW);
    const first = store.get(SIX_HOURLY_KEY);
    const later = new Date(NOW.getTime() + 6 * 60 * 60_000);
    expect(await claimSixHourlySlot(db, later)).toBe(true);
    expect(store.get(SIX_HOURLY_KEY)).not.toBe(first);
    // 更新直後の次tickはまた止まる
    expect(await claimSixHourlySlot(db, new Date(later.getTime() + 5 * 60_000))).toBe(false);
  });

  test('記録値がJSTオフセット表記(+09:00)でも正しく比較する', async () => {
    // duplicate-detect と同じ表記: UTC 06:00 = JST 15:00+09:00
    const { db } = stubDB('2026-07-13T15:00:00.000+09:00');
    expect(await claimSixHourlySlot(db, new Date(NOW.getTime() + 60_000))).toBe(false);
    expect(
      await claimSixHourlySlot(db, new Date(NOW.getTime() + 6 * 60 * 60_000)),
    ).toBe(true);
  });

  test('記録値が壊れている場合は実行を許可する(フェイルオープン)', async () => {
    const { db } = stubDB('not-a-date');
    expect(await claimSixHourlySlot(db, NOW)).toBe(true);
  });
});
