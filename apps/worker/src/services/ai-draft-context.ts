import type { FriendContractWithProduct, InsuranceSwitchRuleWithProducts } from '@line-crm/db';

// 第24弾: AIメッセージ下書き用のcontext組み立て。
// ★AI(中継ゲートウェイ経由でAnthropic)に渡してよいのは、ここで組み立てる
//   最小限のデータだけ。LINE ID・電話・メール・タグは絶対に含めない。
//   項目を増やすときは integration-design.md の第24弾設計要点も更新すること。

export interface AiDraftContext {
  /** 顧客の表示名 */
  customerName: string;
  /** 場面(UIの場面ラベル等。ゲートウェイはそのままプロンプト材料にする) */
  scene: string;
  /** 契約リスト(会社名・商品名・更新日のみ) */
  contracts: Array<{ company: string | null; product: string | null; renewalDate: string | null }>;
  /** 乗り換え情報(該当時のみ: 現契約→提案先とmemo) */
  switchProposals: Array<{ current: string; proposed: string; memo: string | null }>;
  /** 面談メモ 直近3件 */
  recentNotes: Array<{ date: string; text: string }>;
  /** 次回フォロー予定(未完了の直近1件) */
  nextFollowup: { date: string; note: string } | null;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** metadata.notes(顧客カルテ。新しい順で保持)から直近3件。 */
function pickRecentNotes(metadata: Record<string, unknown>): AiDraftContext['recentNotes'] {
  const raw = metadata.notes;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (n): n is { date: string; text: string } =>
        n !== null &&
        typeof n === 'object' &&
        typeof (n as { date?: unknown }).date === 'string' &&
        typeof (n as { text?: unknown }).text === 'string',
    )
    .slice(0, 3)
    .map((n) => ({ date: n.date, text: n.text }));
}

/** metadata.followups から未完了で期日が最も近い1件。 */
function pickNextFollowup(metadata: Record<string, unknown>): AiDraftContext['nextFollowup'] {
  const raw = metadata.followups;
  if (!Array.isArray(raw)) return null;
  const pending = raw
    .filter(
      (f): f is { date: string; note: string; done?: boolean } =>
        f !== null &&
        typeof f === 'object' &&
        typeof (f as { date?: unknown }).date === 'string' &&
        YMD_RE.test((f as { date: string }).date) &&
        typeof (f as { note?: unknown }).note === 'string' &&
        (f as { done?: unknown }).done !== true,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return pending.length > 0 ? { date: pending[0].date, note: pending[0].note } : null;
}

/**
 * AIに渡す最小限のcontextを組み立てる。
 * 判定・整形はすべてこの関数に閉じる(渡す項目の一覧がここで一望できるように)。
 */
export function buildAiDraftContext(params: {
  displayName: string | null;
  scene: string;
  contracts: FriendContractWithProduct[];
  switchRules: InsuranceSwitchRuleWithProducts[];
  metadata: Record<string, unknown>;
}): AiDraftContext {
  const { displayName, scene, contracts, switchRules, metadata } = params;

  const rulesByOldProduct = new Map<string, InsuranceSwitchRuleWithProducts[]>();
  for (const rule of switchRules) {
    const list = rulesByOldProduct.get(rule.old_product_id) ?? [];
    list.push(rule);
    rulesByOldProduct.set(rule.old_product_id, list);
  }

  const switchProposals: AiDraftContext['switchProposals'] = [];
  for (const contract of contracts) {
    if (!contract.product_id) continue;
    for (const rule of rulesByOldProduct.get(contract.product_id) ?? []) {
      switchProposals.push({
        current: `${contract.company_name ?? ''} ${contract.product_name ?? ''}`.trim(),
        proposed: `${rule.new_company_name ?? ''} ${rule.new_product_name ?? ''}`.trim(),
        memo: rule.memo,
      });
    }
  }

  return {
    customerName: displayName ?? '',
    scene,
    contracts: contracts.map((c) => ({
      company: c.company_name,
      // 未照合(product_id NULL)は自由記述を商品名として渡す
      product: c.product_name ?? c.free_text_name,
      renewalDate: c.renewal_date,
    })),
    switchProposals,
    recentNotes: pickRecentNotes(metadata),
    nextFollowup: pickNextFollowup(metadata),
  };
}
