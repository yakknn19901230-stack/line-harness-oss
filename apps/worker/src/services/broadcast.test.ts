import { describe, expect, it } from 'vitest';
import {
  hasExpandableVariables,
  sendTagBroadcastPerFriend,
  processBroadcastSend,
  VARIABLE_BROADCAST_MAX_RECIPIENTS,
} from './broadcast.js';

// ---- Fakes ------------------------------------------------------------------
//
// Fake D1 が SQL fingerprint でルーティングする方式は dedup-broadcast.test.ts に倣う。
// bind パラメータは基本無視し、テストが用意した canned 行を返す。ただし
// UPDATE broadcasts の status/counts だけは検証したいので bind を覗く。

interface FakeFriend {
  id: string;
  line_user_id: string;
  display_name: string | null;
  user_id: string | null;
  ref_code: string | null;
  metadata: string | null;
  is_following: number;
}

interface FakeState {
  broadcast: Record<string, unknown>;
  friends: FakeFriend[];
  account: Record<string, unknown> | null;
  // observed
  status: string;
  finalTotal?: number;
  finalSuccess?: number;
  logBatchSizes: number[];
}

function makeFakeDb(state: FakeState): D1Database {
  const db = {
    async batch(stmts: unknown[]) {
      state.logBatchSizes.push(stmts.length);
      return stmts.map(() => ({ success: true }));
    },
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async run() {
          if (sql.startsWith('UPDATE broadcasts SET')) {
            // status は必ず先頭フィールド。id は末尾。'sent' 時は
            // [status, sent_at, total_count, success_count, id] の並び。
            state.status = bound[0] as string;
            state.broadcast.status = bound[0];
            if (sql.includes('total_count = ?') && sql.includes('success_count = ?')) {
              state.finalTotal = bound[bound.length - 3] as number;
              state.finalSuccess = bound[bound.length - 2] as number;
            }
          }
          return { meta: { changes: 1 }, success: true };
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes('FROM broadcasts b')) return state.broadcast as unknown as T;
          if (sql.includes('FROM broadcast_insights WHERE broadcast_id')) {
            // 既存 insight 行がある体にして createBroadcastInsight の INSERT を skip。
            return { id: 'insight-existing' } as unknown as T;
          }
          if (sql.includes('FROM line_accounts WHERE id')) return state.account as unknown as T;
          return null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          if (sql.includes('FROM friends f') && sql.includes('friend_tags')) {
            return { results: state.friends as unknown as T[] };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1Database;
}

function mkFriend(id: string, name: string | null): FakeFriend {
  return {
    id,
    line_user_id: `U_${id}`,
    display_name: name,
    user_id: null,
    ref_code: null,
    metadata: null,
    is_following: 1,
  };
}

function baseBroadcast(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'b1',
    target_type: 'tag',
    target_tag_id: 't1',
    message_type: 'text',
    message_content: 'こんにちは、{{name}}さん',
    line_account_id: null,
    alt_text: null,
    status: 'sending',
    ...overrides,
  };
}

// ---- hasExpandableVariables --------------------------------------------------

describe('hasExpandableVariables', () => {
  it('returns true for per-friend variables', () => {
    expect(hasExpandableVariables('hi {{name}}')).toBe(true);
    expect(hasExpandableVariables('{{uid}}')).toBe(true);
    expect(hasExpandableVariables('{{friend_id}}')).toBe(true);
    expect(hasExpandableVariables('{{ref}}')).toBe(true);
    expect(hasExpandableVariables('{{#if_ref}}x{{/if_ref}}')).toBe(true);
    expect(hasExpandableVariables('{{metadata.birthday}}')).toBe(true);
    expect(hasExpandableVariables('{{#if_metadata.birthday}}x{{/if_metadata.birthday}}')).toBe(true);
    expect(hasExpandableVariables('{{auth_url:12345}}')).toBe(true);
  });

  it('returns false for plain text and {{liff_id}}-only content', () => {
    expect(hasExpandableVariables('ただのお知らせです')).toBe(false);
    expect(hasExpandableVariables('')).toBe(false);
    // {{liff_id}} は per-account 置換なので変数レーンに入れない。
    expect(hasExpandableVariables('登録は {{liff_id}} から')).toBe(false);
  });
});

// ---- sendTagBroadcastPerFriend ----------------------------------------------

describe('sendTagBroadcastPerFriend', () => {
  it('expands {{name}} per friend and pushes to each recipient', async () => {
    const state: FakeState = {
      broadcast: baseBroadcast(),
      friends: [mkFriend('f1', '田中'), mkFriend('f2', '鈴木')],
      account: null,
      status: 'sending',
      logBatchSizes: [],
    };
    const pushed: Array<{ to: string; text: string }> = [];
    const lineClient = {
      async pushMessage(to: string, messages: Array<{ type: string; text: string }>) {
        pushed.push({ to, text: messages[0].text });
      },
    } as unknown as import('@line-crm/line-sdk').LineClient;

    await sendTagBroadcastPerFriend(makeFakeDb(state), lineClient, 'b1');

    expect(pushed).toEqual([
      { to: 'U_f1', text: 'こんにちは、田中さん' },
      { to: 'U_f2', text: 'こんにちは、鈴木さん' },
    ]);
    expect(state.status).toBe('sent');
    expect(state.finalTotal).toBe(2);
    expect(state.finalSuccess).toBe(2);
    // 成功2件ぶんのログが1バッチにまとまる。
    expect(state.logBatchSizes.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('replaces {{name}} with empty string when display_name is null', async () => {
    const state: FakeState = {
      broadcast: baseBroadcast(),
      friends: [mkFriend('f1', null)],
      account: null,
      status: 'sending',
      logBatchSizes: [],
    };
    const pushed: string[] = [];
    const lineClient = {
      async pushMessage(_to: string, messages: Array<{ type: string; text: string }>) {
        pushed.push(messages[0].text);
      },
    } as unknown as import('@line-crm/line-sdk').LineClient;

    await sendTagBroadcastPerFriend(makeFakeDb(state), lineClient, 'b1');

    expect(pushed).toEqual(['こんにちは、さん']);
    expect(state.status).toBe('sent');
  });

  it('throws VARIABLE_BROADCAST_LIMIT and pushes nothing when over the cap', async () => {
    const many = Array.from({ length: VARIABLE_BROADCAST_MAX_RECIPIENTS + 1 }, (_v, i) =>
      mkFriend(`f${i}`, `名前${i}`),
    );
    const state: FakeState = {
      broadcast: baseBroadcast(),
      friends: many,
      account: null,
      status: 'sending',
      logBatchSizes: [],
    };
    let pushCount = 0;
    const lineClient = {
      async pushMessage() {
        pushCount++;
      },
    } as unknown as import('@line-crm/line-sdk').LineClient;

    await expect(
      sendTagBroadcastPerFriend(makeFakeDb(state), lineClient, 'b1'),
    ).rejects.toThrow(/VARIABLE_BROADCAST_LIMIT/);
    expect(pushCount).toBe(0);
    // 失敗時は draft に戻して再送可能にする。
    expect(state.status).toBe('draft');
  });
});

// ---- processBroadcastSend routing (regression) ------------------------------

describe('processBroadcastSend variable routing', () => {
  it('routes variable tag broadcasts to per-friend push (not multicast)', async () => {
    const state: FakeState = {
      broadcast: baseBroadcast({ message_content: 'やあ {{name}}' }),
      friends: [mkFriend('f1', '佐藤')],
      account: null,
      status: 'sending',
      logBatchSizes: [],
    };
    let multicastCalls = 0;
    let pushCalls = 0;
    const lineClient = {
      async multicast() {
        multicastCalls++;
        return { data: null, requestId: 'r' };
      },
      async pushMessage() {
        pushCalls++;
      },
    } as unknown as import('@line-crm/line-sdk').LineClient;

    await processBroadcastSend(makeFakeDb(state), lineClient, 'b1');

    expect(pushCalls).toBe(1);
    expect(multicastCalls).toBe(0);
  });

  it('keeps plain tag broadcasts on the multicast path (unchanged)', async () => {
    const state: FakeState = {
      broadcast: baseBroadcast({ message_content: '一律のお知らせです' }),
      friends: [mkFriend('f1', '高橋')],
      account: null,
      status: 'sending',
      logBatchSizes: [],
    };
    let multicastCalls = 0;
    let pushCalls = 0;
    const lineClient = {
      async multicast() {
        multicastCalls++;
        return { data: null, requestId: 'r' };
      },
      async pushMessage() {
        pushCalls++;
      },
    } as unknown as import('@line-crm/line-sdk').LineClient;

    await processBroadcastSend(makeFakeDb(state), lineClient, 'b1');

    expect(multicastCalls).toBe(1);
    expect(pushCalls).toBe(0);
  });
});
