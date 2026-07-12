// Gate for 6-hourly work running inside the single 5-minute cron.
// Workers cron triggers count against a per-account limit (Free=5 / Paid=250),
// so each instance keeps one cron and derives the 6-hour cadence from a
// last-run timestamp instead of a second trigger. The timestamp lives in the
// same account_settings 'system' rows that duplicate-detect uses.
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const SIX_HOURLY_KEY = 'six_hourly_expirer_last_run';

export async function claimSixHourlySlot(
  db: D1Database,
  now: Date = new Date(),
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT value FROM account_settings WHERE line_account_id = 'system' AND key = ?`,
    )
    .bind(SIX_HOURLY_KEY)
    .first<{ value: string }>();
  if (row) {
    const last = Date.parse(row.value);
    if (Number.isFinite(last) && now.getTime() - last < SIX_HOURS_MS) {
      return false;
    }
  }
  const jstNow = new Date(now.getTime() + 9 * 60 * 60_000)
    .toISOString()
    .replace('Z', '+09:00');
  await db
    .prepare(
      `INSERT INTO account_settings (id, line_account_id, key, value, created_at, updated_at)
       VALUES (?, 'system', ?, ?, ?, ?)
       ON CONFLICT (line_account_id, key) DO UPDATE SET value = ?, updated_at = ?`,
    )
    .bind(crypto.randomUUID(), SIX_HOURLY_KEY, jstNow, jstNow, jstNow, jstNow, jstNow)
    .run();
  return true;
}
