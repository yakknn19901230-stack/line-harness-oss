import { Hono } from 'hono';
import {
  getFriendById,
  getContractsByFriendId,
  getInsuranceSwitchRulesWithProducts,
} from '@line-crm/db';
import { buildAiDraftContext } from '../services/ai-draft-context.js';
import type { Env } from '../index.js';

// 第24弾: AIメッセージ下書きAPI(中継ゲートウェイ方式)。
// Anthropic APIキーはこのWorkerには置かず、hozenkun-ai-gateway だけが持つ。
// このWorkerは D1 から最小限データ(ai-draft-context.ts)を組み立てて
// env.AI_GATEWAY_URL の /v1/draft に env.AI_GATEWAY_TOKEN 付きで転送するだけ。
// 顧客データを外部に渡す経路はこのルートが唯一 — 渡す項目は buildAiDraftContext に閉じる。

const aiDraft = new Hono<Env>();

/** ゲートウェイ呼び出しのタイムアウト。ゲートウェイ側のAnthropic 10秒+余裕。 */
const GATEWAY_TIMEOUT_MS = 15_000;

// POST /api/friends/:id/ai-draft - body: { scene: string }
aiDraft.post('/api/friends/:id/ai-draft', async (c) => {
  try {
    const gatewayUrl = c.env.AI_GATEWAY_URL;
    const gatewayToken = c.env.AI_GATEWAY_TOKEN;
    if (!gatewayUrl || !gatewayToken) {
      return c.json(
        {
          success: false,
          error: 'AI下書きは未設定です(AI_GATEWAY_URL / AI_GATEWAY_TOKEN を設定してください)',
        },
        503,
      );
    }

    const body = await c.req.json<{ scene?: unknown }>().catch(() => ({}) as { scene?: unknown });
    if (typeof body.scene !== 'string' || body.scene.trim() === '') {
      return c.json({ success: false, error: 'scene is required' }, 400);
    }
    const scene = body.scene.trim();

    const friendId = c.req.param('id');
    const friend = await getFriendById(c.env.DB, friendId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    let metadata: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(friend.metadata || '{}');
      if (parsed !== null && typeof parsed === 'object') metadata = parsed as Record<string, unknown>;
    } catch {
      // 壊れたmetadataは空扱い(下書きは名前と契約だけでも作れる)
    }

    const [contracts, switchRules] = await Promise.all([
      getContractsByFriendId(c.env.DB, friendId),
      getInsuranceSwitchRulesWithProducts(c.env.DB),
    ]);

    const context = buildAiDraftContext({
      displayName: friend.display_name,
      scene,
      contracts,
      switchRules,
      metadata,
    });

    const res = await fetch(`${gatewayUrl.replace(/\/+$/, '')}/v1/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({ scene, context }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`ai-gateway error: status=${res.status}`);
      return c.json({ success: false, error: 'AI draft failed' }, 502);
    }
    const data = (await res.json()) as { text?: unknown; model?: unknown };
    if (typeof data.text !== 'string' || data.text.trim() === '') {
      return c.json({ success: false, error: 'AI draft failed' }, 502);
    }
    return c.json({
      success: true,
      data: { text: data.text, model: typeof data.model === 'string' ? data.model : '' },
    });
  } catch (err) {
    // ゲートウェイへの到達失敗・タイムアウトも502(呼び出し側は定型文へフォールバック)
    console.error('POST /api/friends/:id/ai-draft error:', err);
    return c.json({ success: false, error: 'AI draft failed' }, 502);
  }
});

export { aiDraft };
