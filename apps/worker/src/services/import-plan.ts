import type { FriendLiteForImport, InsuranceProduct, ReplaceContractInput } from '@line-crm/db';
import { matchProducts } from '@line-crm/shared';

// 第25弾: CSVインポートの計画(純ロジック)。
// 行の検証・「表示名+誕生日」での重複検出・商品照合(メモリ)・metadataマージを
// D1に触らずに行い、ルート(routes/friends-import.ts)は計画の実行だけを担う。

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ImportContractInput {
  categoryName?: string | null;
  companyName?: string | null;
  productName?: unknown;
  renewalDate?: unknown;
}

export interface ImportRowInput {
  displayName?: unknown;
  furigana?: unknown;
  birthday?: unknown;
  phone?: unknown;
  email?: unknown;
  memo?: unknown;
  contracts?: unknown;
}

export interface ImportPlan {
  skipped: Array<{ row: number; reason: string }>;
  /** INSERTする新規友だち(lineUserIdの採番は実行側で行う) */
  newFriends: Array<{ id: string; displayName: string; metadataJson: string }>;
  /** metadata更新が必要な既存友だち */
  updates: Array<{ friendId: string; metadataJson: string }>;
  /** friendId -> 追記する契約(既存行の保持は実行側の replaceFriendContracts が担う) */
  contractsToAdd: Map<string, ReplaceContractInput[]>;
  /** 新規作成した友だちのID集合(契約追記時に既存行フェッチを省くため) */
  newFriendIds: Set<string>;
  created: number;
  updated: number;
  contractsAdded: number;
  unmatchedProducts: string[];
}

const optionalString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

export function planImport(params: {
  rows: unknown[];
  existingFriends: FriendLiteForImport[];
  products: InsuranceProduct[];
  /** notes追記に使う日付(YYYY-MM-DD) */
  today: string;
}): ImportPlan {
  const { rows, existingFriends, products, today } = params;

  // 重複検出キー: 表示名+誕生日(insurance-assistantの流儀)
  const keyOf = (name: string, birthday: string | null) => `${name.trim()}||${birthday ?? ''}`;
  const friendByKey = new Map<string, string>();
  const metadataById = new Map<string, Record<string, unknown>>();
  for (const f of existingFriends) {
    let meta: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(f.metadata || '{}');
      if (parsed !== null && typeof parsed === 'object') meta = parsed as Record<string, unknown>;
    } catch {
      // 壊れたmetadataは空扱い
    }
    metadataById.set(f.id, meta);
    const name = (f.display_name ?? '').trim();
    if (name === '') continue;
    const birthday = typeof meta.birthday === 'string' ? meta.birthday : null;
    const key = keyOf(name, birthday);
    if (!friendByKey.has(key)) friendByKey.set(key, f.id);
  }

  const skipped: ImportPlan['skipped'] = [];
  const newFriendNames = new Map<string, string>(); // id -> displayName
  const dirtyExisting = new Set<string>();
  const contractsToAdd = new Map<string, ReplaceContractInput[]>();
  const touchedExisting = new Set<string>();
  const unmatchedProducts = new Set<string>();
  let contractsAdded = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 1;
    const raw = rows[i] as ImportRowInput;

    const displayName = optionalString(raw.displayName);
    if (!displayName) {
      skipped.push({ row: rowNumber, reason: '顧客名が未入力です。' });
      continue;
    }
    const birthday = optionalString(raw.birthday);
    if (birthday !== null && !YMD_RE.test(birthday)) {
      skipped.push({ row: rowNumber, reason: '生年月日はYYYY-MM-DD形式で送信してください。' });
      continue;
    }

    // 契約の検証と商品照合(1回ロード済みのproductsに対するメモリ照合のみ)
    const rowContracts: ReplaceContractInput[] = [];
    let contractError: string | null = null;
    if (raw.contracts !== undefined) {
      if (!Array.isArray(raw.contracts)) {
        contractError = 'contractsは配列で送信してください。';
      } else {
        for (const entry of raw.contracts as ImportContractInput[]) {
          const productName = optionalString(entry?.productName);
          if (!productName) {
            contractError = '契約には商品名が必須です。';
            break;
          }
          const renewalDate = optionalString(entry?.renewalDate);
          if (renewalDate !== null && !YMD_RE.test(renewalDate)) {
            contractError = '更新日はYYYY-MM-DD形式で送信してください。';
            break;
          }
          const companyName = optionalString(entry?.companyName);

          // exact/normalized のみ productId 確定(第22弾の移行と同じ基準)。会社名があれば候補を絞る
          let candidates = matchProducts(productName, products).filter(
            (m) => m.matchType === 'exact' || m.matchType === 'normalized',
          );
          if (companyName && candidates.length > 1) {
            const byCompany = candidates.filter((m) => m.product.company_name === companyName);
            if (byCompany.length > 0) candidates = byCompany;
          }
          const uniqueIds = new Set(candidates.map((m) => m.product.id));
          const productId = uniqueIds.size === 1 ? candidates[0].product.id : null;
          if (productId === null) {
            unmatchedProducts.add(productName);
          }
          rowContracts.push({
            product_id: productId,
            // 未照合はもちろん、照合済みでも元表記を保持する(friend_contractsのスキーマ方針)
            free_text_name: [companyName, productName].filter(Boolean).join(' '),
            renewal_date: renewalDate,
          });
        }
      }
    }
    if (contractError) {
      skipped.push({ row: rowNumber, reason: contractError });
      continue;
    }

    // 友だちの解決(既存 or 新規)。同一CSV内の同名+同誕生日は同じ友だちに畳む
    const key = keyOf(displayName, birthday);
    let friendId = friendByKey.get(key);
    const isNew = friendId === undefined ? true : newFriendNames.has(friendId);
    if (friendId === undefined) {
      friendId = crypto.randomUUID();
      friendByKey.set(key, friendId);
      metadataById.set(friendId, {});
      newFriendNames.set(friendId, displayName);
    }

    // metadata: 指定されたフィールドだけ上書き(shallow mergeの流儀)。memoはnotesへ追記
    const meta = metadataById.get(friendId)!;
    let dirty = false;
    const fields: Array<[string, string | null]> = [
      ['birthday', birthday],
      ['furigana', optionalString(raw.furigana)],
      ['phone', optionalString(raw.phone)],
      ['email', optionalString(raw.email)],
    ];
    for (const [k, v] of fields) {
      if (v !== null && meta[k] !== v) {
        meta[k] = v;
        dirty = true;
      }
    }
    const memo = optionalString(raw.memo);
    if (memo !== null) {
      const notes = Array.isArray(meta.notes) ? (meta.notes as unknown[]) : [];
      meta.notes = [{ date: today, text: memo }, ...notes];
      dirty = true;
    }
    if (dirty && !isNew) {
      dirtyExisting.add(friendId);
    }
    if (!isNew) {
      touchedExisting.add(friendId);
    }

    if (rowContracts.length > 0) {
      const list = contractsToAdd.get(friendId) ?? [];
      list.push(...rowContracts);
      contractsToAdd.set(friendId, list);
      contractsAdded += rowContracts.length;
      if (!isNew) touchedExisting.add(friendId);
    }
  }

  const newFriendIds = new Set(newFriendNames.keys());
  return {
    skipped,
    newFriends: [...newFriendNames.entries()].map(([id, displayName]) => ({
      id,
      displayName,
      metadataJson: JSON.stringify(metadataById.get(id) ?? {}),
    })),
    updates: [...dirtyExisting].map((friendId) => ({
      friendId,
      metadataJson: JSON.stringify(metadataById.get(friendId) ?? {}),
    })),
    contractsToAdd,
    newFriendIds,
    created: newFriendIds.size,
    updated: touchedExisting.size,
    contractsAdded,
    unmatchedProducts: [...unmatchedProducts],
  };
}
