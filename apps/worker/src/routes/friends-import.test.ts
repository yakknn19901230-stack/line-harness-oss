import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import { friendsImport, IMPORT_MAX_ROWS } from './friends-import.js';
import type { Env } from '../index.js';

// 第25弾: インポートAPIの入口バリデーション(rows必須・500行上限)。
// 上限チェックはDBに触る前に行われるため、D1モックなしで検証できる。

function setupApp() {
  const app = new Hono<Env>();
  app.route('/', friendsImport);
  return app;
}

function postImport(app: Hono<Env>, body: unknown) {
  return app.request(
    '/api/friends/import',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    {} as Env['Bindings'],
  );
}

describe('POST /api/friends/import', () => {
  test('rowsなしは400', async () => {
    const res = await postImport(setupApp(), {});
    expect(res.status).toBe(400);
  });

  test('rows空配列は400', async () => {
    const res = await postImport(setupApp(), { rows: [] });
    expect(res.status).toBe(400);
  });

  test(`${IMPORT_MAX_ROWS}行を超えると400`, async () => {
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ({
      displayName: `顧客${i}`,
    }));
    const res = await postImport(setupApp(), { rows });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain(String(IMPORT_MAX_ROWS));
  });
});
