import { Hono } from 'hono';
import {
  getInsuranceCategories,
  getInsuranceCompanies,
  getInsuranceProducts,
  getActiveInsuranceProducts,
  getInsuranceSwitchRulesWithProducts,
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
    oldCategoryName: row.old_category_name,
    oldCompanyName: row.old_company_name,
    oldProductName: row.old_product_name,
    newCategoryName: row.new_category_name,
    newCompanyName: row.new_company_name,
    newProductName: row.new_product_name,
  };
}

// GET /api/insurance/switch-rules - 乗り換えルール一覧(第23弾)。
// 新旧両側の名称付き。マスターは hozenkun-assistant/master/switch-rules.json が
// 単一の真実で、D1 へは scripts/seed-switch-rules.mjs の生成SQLで投入される(読み取り専用)。
insurance.get('/api/insurance/switch-rules', async (c) => {
  try {
    const rules = await getInsuranceSwitchRulesWithProducts(c.env.DB);
    return c.json({ success: true, data: rules.map(serializeSwitchRule) });
  } catch (err) {
    console.error('GET /api/insurance/switch-rules error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { insurance };
