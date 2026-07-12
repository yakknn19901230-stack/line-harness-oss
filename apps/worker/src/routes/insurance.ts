import { Hono } from 'hono';
import {
  getInsuranceCategories,
  getInsuranceCompanies,
  getInsuranceProducts,
  getActiveInsuranceProducts,
  getInsuranceSwitchRulesWithProducts,
  getInsuranceSwitchRuleById,
  findActiveSwitchRuleByPair,
  createInsuranceSwitchRule,
  updateInsuranceSwitchRule,
  setInsuranceSwitchRuleActive,
  deleteInsuranceSwitchRule,
  findMissingInsuranceProductIds,
} from '@line-crm/db';
import type { InsuranceProduct, InsuranceSwitchRuleWithProducts } from '@line-crm/db';
import { matchProducts } from '@line-crm/shared';
import type { Env } from '../index.js';

// 第21弾: 保険商品マスター参照API。
// マスターは hozenkun-assistant/master/products.json が単一の真実で、
// D1 の insurance_products には seed SQL で投入される(読み取り専用API)。

const insurance = new Hono<Env>();

function serializeProduct(row: InsuranceProduct) {
  return {
    id: row.id,
    categoryName: row.category_name,
    companyName: row.company_name,
    productName: row.product_name,
  };
}

// GET /api/insurance/categories - 種類一覧
insurance.get('/api/insurance/categories', async (c) => {
  try {
    const categories = await getInsuranceCategories(c.env.DB);
    return c.json({ success: true, data: categories });
  } catch (err) {
    console.error('GET /api/insurance/categories error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/insurance/companies?category= - その種類の商品を持つ会社一覧
insurance.get('/api/insurance/companies', async (c) => {
  try {
    const category = c.req.query('category');
    const companies = await getInsuranceCompanies(c.env.DB, category);
    return c.json({ success: true, data: companies });
  } catch (err) {
    console.error('GET /api/insurance/companies error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/insurance/products?category=&company= - 絞り込んだ商品一覧
insurance.get('/api/insurance/products', async (c) => {
  try {
    const category = c.req.query('category');
    const company = c.req.query('company');
    const products = await getInsuranceProducts(c.env.DB, { category, company });
    return c.json({ success: true, data: products.map(serializeProduct) });
  } catch (err) {
    console.error('GET /api/insurance/products error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/insurance/match?name= - 自由記述の商品名に対する名寄せ候補
// 1件確定ではなく候補配列(exact → normalized → partial の順)を返す。
insurance.get('/api/insurance/match', async (c) => {
  try {
    const name = c.req.query('name');
    if (!name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }
    const products = await getActiveInsuranceProducts(c.env.DB);
    const candidates = matchProducts(name, products).map((m) => ({
      ...serializeProduct(m.product),
      matchType: m.matchType,
    }));
    return c.json({ success: true, data: candidates });
  } catch (err) {
    console.error('GET /api/insurance/match error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

function serializeSwitchRule(row: InsuranceSwitchRuleWithProducts) {
  return {
    id: row.id,
    oldProductId: row.old_product_id,
    newProductId: row.new_product_id,
    memo: row.memo,
    // 第26弾 二層方式: 'master'=共通(seed管理・削除不可) / 'custom'=自分ルール
    source: row.source,
    isActive: row.is_active === 1,
    oldCategoryName: row.old_category_name,
    oldCompanyName: row.old_company_name,
    oldProductName: row.old_product_name,
    newCategoryName: row.new_category_name,
    newCompanyName: row.new_company_name,
    newProductName: row.new_product_name,
  };
}

/** swr_ + sha1(old + "->" + new) 先頭12桁。scripts/seed-switch-rules.mjs と同じ採番規則。 */
async function computeSwitchRuleId(oldProductId: string, newProductId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(`${oldProductId}->${newProductId}`),
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `swr_${hex.slice(0, 12)}`;
}

/** POST/PUT共通のペア検証。エラー文言を返す(問題なければnull)。 */
async function validateRulePair(
  db: D1Database,
  oldProductId: unknown,
  newProductId: unknown,
): Promise<string | null> {
  if (typeof oldProductId !== 'string' || oldProductId === '') return 'oldProductId is required';
  if (typeof newProductId !== 'string' || newProductId === '') return 'newProductId is required';
  if (oldProductId === newProductId) return '旧商品と新商品に同じ商品は指定できません';
  const missing = await findMissingInsuranceProductIds(db, [oldProductId, newProductId]);
  if (missing.length > 0) return `Unknown productId: ${missing.join(', ')}`;
  return null;
}

// GET /api/insurance/switch-rules - 乗り換えルール一覧(第23弾)。
// 新旧両側の名称付き。既定は is_active=1 のみ(既存挙動維持)。
// ?all=1 は無効化済みも含めて返す(第26弾: 設定画面用)。
insurance.get('/api/insurance/switch-rules', async (c) => {
  try {
    const includeInactive = c.req.query('all') === '1';
    const rules = await getInsuranceSwitchRulesWithProducts(c.env.DB, { includeInactive });
    return c.json({ success: true, data: rules.map(serializeSwitchRule) });
  } catch (err) {
    console.error('GET /api/insurance/switch-rules error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/insurance/switch-rules - 自分ルール(source='custom')の作成(第26弾)
insurance.post('/api/insurance/switch-rules', async (c) => {
  try {
    const body = await c.req
      .json<{ oldProductId?: unknown; newProductId?: unknown; memo?: unknown }>()
      .catch(() => ({}) as { oldProductId?: unknown; newProductId?: unknown; memo?: unknown });
    const pairError = await validateRulePair(c.env.DB, body.oldProductId, body.newProductId);
    if (pairError) return c.json({ success: false, error: pairError }, 400);
    const oldProductId = body.oldProductId as string;
    const newProductId = body.newProductId as string;
    const memo = typeof body.memo === 'string' && body.memo.trim() !== '' ? body.memo.trim() : null;

    // IDは決定的採番(同一ペア=同一ID)。既存行があれば重複として扱う
    const id = await computeSwitchRuleId(oldProductId, newProductId);
    const existing = await getInsuranceSwitchRuleById(c.env.DB, id);
    if (existing) {
      return c.json(
        {
          success: false,
          error:
            existing.is_active === 1
              ? '同じ組み合わせのルールがすでにあります'
              : '同じ組み合わせの無効化済みルールがあります。一覧から有効に戻してください',
        },
        400,
      );
    }
    // 編集でペアが変わった行はIDが採番規則とズレうるので、ペアでも重複チェック
    const dupByPair = await findActiveSwitchRuleByPair(c.env.DB, oldProductId, newProductId);
    if (dupByPair) {
      return c.json({ success: false, error: '同じ組み合わせのルールがすでにあります' }, 400);
    }

    await createInsuranceSwitchRule(c.env.DB, { id, oldProductId, newProductId, memo });
    const rules = await getInsuranceSwitchRulesWithProducts(c.env.DB, { includeInactive: true });
    const created = rules.find((r) => r.id === id);
    return c.json({ success: true, data: created ? serializeSwitchRule(created) : { id } }, 201);
  } catch (err) {
    console.error('POST /api/insurance/switch-rules error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/insurance/switch-rules/:id - 自分ルール(custom)のみ編集可(第26弾)
insurance.put('/api/insurance/switch-rules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const rule = await getInsuranceSwitchRuleById(c.env.DB, id);
    if (!rule) return c.json({ success: false, error: 'Rule not found' }, 404);
    if (rule.source !== 'custom') {
      return c.json({ success: false, error: '共通ルールは編集できません(無効化は可能です)' }, 403);
    }
    const body = await c.req
      .json<{ oldProductId?: unknown; newProductId?: unknown; memo?: unknown }>()
      .catch(() => ({}) as { oldProductId?: unknown; newProductId?: unknown; memo?: unknown });
    const pairError = await validateRulePair(c.env.DB, body.oldProductId, body.newProductId);
    if (pairError) return c.json({ success: false, error: pairError }, 400);
    const oldProductId = body.oldProductId as string;
    const newProductId = body.newProductId as string;
    const memo = typeof body.memo === 'string' && body.memo.trim() !== '' ? body.memo.trim() : null;

    const dupByPair = await findActiveSwitchRuleByPair(c.env.DB, oldProductId, newProductId, id);
    if (dupByPair) {
      return c.json({ success: false, error: '同じ組み合わせのルールがすでにあります' }, 400);
    }

    await updateInsuranceSwitchRule(c.env.DB, id, { oldProductId, newProductId, memo });
    const rules = await getInsuranceSwitchRulesWithProducts(c.env.DB, { includeInactive: true });
    const updated = rules.find((r) => r.id === id);
    return c.json({ success: true, data: updated ? serializeSwitchRule(updated) : { id } });
  } catch (err) {
    console.error('PUT /api/insurance/switch-rules/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/insurance/switch-rules/:id/active - 有効/無効の切り替え(master/customとも可)
insurance.patch('/api/insurance/switch-rules/:id/active', async (c) => {
  try {
    const id = c.req.param('id');
    const rule = await getInsuranceSwitchRuleById(c.env.DB, id);
    if (!rule) return c.json({ success: false, error: 'Rule not found' }, 404);
    const body = await c.req
      .json<{ isActive?: unknown }>()
      .catch(() => ({}) as { isActive?: unknown });
    if (typeof body.isActive !== 'boolean') {
      return c.json({ success: false, error: 'isActive must be a boolean' }, 400);
    }
    await setInsuranceSwitchRuleActive(c.env.DB, id, body.isActive);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PATCH /api/insurance/switch-rules/:id/active error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/insurance/switch-rules/:id - 自分ルール(custom)のみ削除可(第26弾)
insurance.delete('/api/insurance/switch-rules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const rule = await getInsuranceSwitchRuleById(c.env.DB, id);
    if (!rule) return c.json({ success: false, error: 'Rule not found' }, 404);
    if (rule.source !== 'custom') {
      return c.json(
        { success: false, error: '共通ルールは削除できません。無効にすると表示されなくなります' },
        403,
      );
    }
    await deleteInsuranceSwitchRule(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/insurance/switch-rules/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { insurance };
