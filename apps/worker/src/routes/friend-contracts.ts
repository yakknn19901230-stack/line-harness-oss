import { Hono } from 'hono';
import {
  getFriendById,
  getContractsByFriendId,
  replaceFriendContracts,
  setContractNotifiedAt,
  findMissingInsuranceProductIds,
} from '@line-crm/db';
import type { FriendContractWithProduct, ReplaceContractInput } from '@line-crm/db';
import type { Env } from '../index.js';

// 第22弾: 契約リストの正規化API。
// friends.metadata.contracts の後継。読み取りは JOIN 済みの名称付き、
// 書き込みは「丸ごと差し替え」(PUT)と「対応済みトグル」(PATCH)のみ。

const friendContracts = new Hono<Env>();

export function serializeContract(row: FriendContractWithProduct) {
  return {
    id: row.id,
    productId: row.product_id,
    categoryName: row.category_name,
    companyName: row.company_name,
    productName: row.product_name,
    freeTextName: row.free_text_name,
    renewalDate: row.renewal_date,
    notifiedAt: row.notified_at,
    sortOrder: row.sort_order,
  };
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ContractBody {
  id?: string | null;
  productId?: string | null;
  freeTextName?: string | null;
  renewalDate?: string | null;
  notifiedAt?: string | null;
}

// GET /api/friends/:id/contracts - 契約一覧(sort_order順、照合済みは名称付き)
friendContracts.get('/api/friends/:id/contracts', async (c) => {
  try {
    const friendId = c.req.param('id');
    const friend = await getFriendById(c.env.DB, friendId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    const rows = await getContractsByFriendId(c.env.DB, friendId);
    return c.json({ success: true, data: rows.map(serializeContract) });
  } catch (err) {
    console.error('GET /api/friends/:id/contracts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/friends/:id/contracts - 丸ごと差し替え(DELETE→INSERT を batch で原子的に)
friendContracts.put('/api/friends/:id/contracts', async (c) => {
  try {
    const friendId = c.req.param('id');
    const friend = await getFriendById(c.env.DB, friendId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const body = await c.req.json<{ contracts?: ContractBody[] }>();
    if (!Array.isArray(body.contracts)) {
      return c.json({ success: false, error: 'contracts must be an array' }, 400);
    }

    // productId と freeTextName が両方空の行は保存しない
    const rows = body.contracts
      .map((raw): ReplaceContractInput => ({
        id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : null,
        product_id: typeof raw.productId === 'string' && raw.productId !== '' ? raw.productId : null,
        free_text_name:
          typeof raw.freeTextName === 'string' && raw.freeTextName.trim() !== ''
            ? raw.freeTextName.trim()
            : null,
        renewal_date:
          typeof raw.renewalDate === 'string' && raw.renewalDate !== '' ? raw.renewalDate : null,
        // undefined = 既存行から引き継ぐ / null = クリア / 文字列 = 明示指定
        notified_at: raw.notifiedAt === undefined ? undefined : raw.notifiedAt,
      }))
      .filter((row) => row.product_id !== null || row.free_text_name !== null);

    for (const row of rows) {
      if (row.renewal_date !== null && row.renewal_date !== undefined && !YMD_RE.test(row.renewal_date)) {
        return c.json({ success: false, error: 'renewalDate must be YYYY-MM-DD' }, 400);
      }
    }

    // productId は insurance_products に実在すること
    const productIds = rows
      .map((row) => row.product_id)
      .filter((id): id is string => id !== null && id !== undefined);
    const missing = await findMissingInsuranceProductIds(c.env.DB, productIds);
    if (missing.length > 0) {
      return c.json(
        { success: false, error: `Unknown productId: ${missing.join(', ')}` },
        400,
      );
    }

    await replaceFriendContracts(c.env.DB, friendId, rows);
    const saved = await getContractsByFriendId(c.env.DB, friendId);
    return c.json({ success: true, data: saved.map(serializeContract) });
  } catch (err) {
    console.error('PUT /api/friends/:id/contracts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/friends/:id/contracts/:contractId/notified - 対応済みトグル
friendContracts.patch('/api/friends/:id/contracts/:contractId/notified', async (c) => {
  try {
    const friendId = c.req.param('id');
    const contractId = c.req.param('contractId');
    const body = await c.req.json<{ notifiedAt?: string | null }>();
    const notifiedAt = body.notifiedAt ?? null;
    if (notifiedAt !== null && !YMD_RE.test(notifiedAt)) {
      return c.json({ success: false, error: 'notifiedAt must be YYYY-MM-DD or null' }, 400);
    }
    const updated = await setContractNotifiedAt(c.env.DB, friendId, contractId, notifiedAt);
    if (!updated) {
      return c.json({ success: false, error: 'Contract not found' }, 404);
    }
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PATCH /api/friends/:id/contracts/:contractId/notified error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { friendContracts };
