import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import { aiDraft } from './ai-draft.js';
import type { Env } from '../index.js';

// 第24弾: ai-draftルートの入口バリデーション。
// ゲートウェイ未設定(503)とscene必須(400)はDBに触る前に判定されるため、
// D1のモックなしでルート単体を検証できる。

function setupApp() {
  const app = new Hono<Env>();
  app.route('/', aiDraft);
  return app;
}

function postDraft(app: Hono<Env>, bindings: Partial<Env['Bindings']>, body: unknown) {
  return app.request(
    '/api/friends/friend-1/ai-draft',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    bindings as Env['Bindings'],
  );
}

describe('POST /api/friends/:id/ai-draft', () => {
  test('ゲートウェイ未設定(URL/トークン空)は503+わかるメッセージ', async () => {
    const app = setupApp();
    const res = await postDraft(app, {}, { scene: '契約更新のご案内' });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('AI_GATEWAY_URL');
  });

  test('トークンだけ未設定でも503', async () => {
    const app = setupApp();
    const res = await postDraft(
      app,
      { AI_GATEWAY_URL: 'https://gateway.example' },
      { scene: '契約更新のご案内' },
    );
    expect(res.status).toBe(503);
  });

  test('scene欠落は400', async () => {
    const app = setupApp();
    const res = await postDraft(
      app,
      { AI_GATEWAY_URL: 'https://gateway.example', AI_GATEWAY_TOKEN: 'tok' },
      {},
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.error).toBe('scene is required');
  });

  test('sceneが空文字でも400', async () => {
    const app = setupApp();
    const res = await postDraft(
      app,
      { AI_GATEWAY_URL: 'https://gateway.example', AI_GATEWAY_TOKEN: 'tok' },
      { scene: '   ' },
    );
    expect(res.status).toBe(400);
  });
});
