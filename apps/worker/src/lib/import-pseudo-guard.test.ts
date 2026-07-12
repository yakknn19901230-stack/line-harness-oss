import { afterEach, describe, expect, test, vi } from 'vitest';
import { LineClient, IMPORT_PSEUDO_ID_PREFIX as SDK_PREFIX } from '@line-crm/line-sdk';
import { IMPORT_PSEUDO_ID_PREFIX, isImportPseudoId, makeImportPseudoId } from '@line-crm/shared';

// 第25弾: LINE未連携の疑似ID(import:...)への送信ガード。
// ガードの実体は line-sdk の pushMessage / multicast(全ての個別送信の必経路)。
// shared と line-sdk はプレフィックス文字列を重複定義しているため、同値性もここで担保する。

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  return calls;
}

describe('疑似ID送信ガード', () => {
  test('プレフィックスが shared と line-sdk で一致している', () => {
    expect(SDK_PREFIX).toBe(IMPORT_PSEUDO_ID_PREFIX);
    expect(isImportPseudoId(makeImportPseudoId())).toBe(true);
    expect(isImportPseudoId('U1234567890abcdef')).toBe(false);
  });

  test('pushMessage: 疑似ID宛てはLINE APIを呼ばずにスキップ', async () => {
    const calls = stubFetch();
    const client = new LineClient('test-token');
    const result = await client.pushMessage('import:00000000-0000-0000-0000-000000000000', [
      { type: 'text', text: 'こんにちは' },
    ]);
    expect(result).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  test('pushMessage: 通常のLINE IDは従来どおり送信される', async () => {
    const calls = stubFetch();
    const client = new LineClient('test-token');
    await client.pushMessage('U1234567890abcdef', [{ type: 'text', text: 'こんにちは' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/v2/bot/message/push');
  });

  test('multicast: 疑似IDだけ除外して残りに送る', async () => {
    const calls = stubFetch();
    const client = new LineClient('test-token');
    await client.multicast(
      ['U1111111111111111', 'import:aaaa', 'U2222222222222222'],
      [{ type: 'text', text: 'お知らせ' }],
    );
    expect(calls).toHaveLength(1);
    expect((calls[0].body as { to: string[] }).to).toEqual(['U1111111111111111', 'U2222222222222222']);
  });

  test('multicast: 全員疑似IDならLINE APIを呼ばない', async () => {
    const calls = stubFetch();
    const client = new LineClient('test-token');
    const result = await client.multicast(['import:aaaa', 'import:bbbb'], [{ type: 'text', text: 'x' }]);
    expect(result).toEqual({ data: undefined, requestId: null });
    expect(calls).toHaveLength(0);
  });
});
