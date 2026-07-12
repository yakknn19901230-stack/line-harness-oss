'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { SwitchRuleItem } from '@/lib/api'

// 第26弾: 乗り換えルールの管理画面編集(二層方式)。
// - 共通ルール(source='master'): マスター投入分。削除不可、無効化のみ
// - 自分ルール(source='custom'): ここで作成。seed再投入でも消えない
// 変更は保存時に再取得。ダッシュボードの乗り換えパネルは表示時にルールを
// 取り直す(useSwitchRules)ので、戻れば即反映される。

/** 種類→会社→商品の3段階セレクト(第22弾の契約編集と同じ流儀)。 */
function ProductSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: { productId: string; display: string } | null
  onChange: (v: { productId: string; display: string } | null) => void
}) {
  const [categories, setCategories] = useState<string[]>([])
  const [companies, setCompanies] = useState<string[]>([])
  const [products, setProducts] = useState<Array<{ id: string; companyName: string; productName: string }>>([])
  const [category, setCategory] = useState('')
  const [company, setCompany] = useState('')

  useEffect(() => {
    api.insurance.categories().then((res) => {
      if (res.success) setCategories(res.data)
    }).catch(() => undefined)
  }, [])

  const onCategoryChange = async (next: string) => {
    setCategory(next)
    setCompany('')
    setProducts([])
    onChange(null)
    if (!next) { setCompanies([]); return }
    const res = await api.insurance.companies(next).catch(() => null)
    setCompanies(res?.success ? res.data : [])
  }

  const onCompanyChange = async (next: string) => {
    setCompany(next)
    onChange(null)
    if (!next) { setProducts([]); return }
    const res = await api.insurance.products(category, next).catch(() => null)
    setProducts(res?.success ? res.data : [])
  }

  const selectClass =
    'w-full min-h-[44px] text-base border border-gray-300 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500'

  return (
    <div>
      <p className="text-sm font-medium text-gray-800 mb-1">{label}</p>
      {value ? (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50">{value.display}</p>
          <button
            type="button"
            onClick={() => { onChange(null); setCategory(''); setCompany(''); setCompanies([]); setProducts([]) }}
            className="shrink-0 min-h-[44px] px-3 rounded-lg text-sm text-gray-600 border border-gray-300 hover:bg-gray-50"
          >
            選び直す
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={category} onChange={(e) => onCategoryChange(e.target.value)} className={selectClass} aria-label={`${label}: 保険種類`}>
            <option value="">種類を選ぶ</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={company} onChange={(e) => onCompanyChange(e.target.value)} disabled={!category} className={selectClass} aria-label={`${label}: 保険会社`}>
            <option value="">会社を選ぶ</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value=""
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value)
              if (p) onChange({ productId: p.id, display: `${p.companyName} ${p.productName}` })
            }}
            disabled={!company}
            className={selectClass}
            aria-label={`${label}: 商品`}
          >
            <option value="">商品を選ぶ</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.productName}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

export default function SwitchRulesPage() {
  const [rules, setRules] = useState<SwitchRuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  // 追加/編集フォーム(editingId=null は新規追加)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [oldProduct, setOldProduct] = useState<{ productId: string; display: string } | null>(null)
  const [newProduct, setNewProduct] = useState<{ productId: string; display: string } | null>(null)
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.insurance.switchRulesAll()
      if (res.success) {
        setRules(res.data)
        setError('')
      } else {
        setError(res.error || 'ルールの読み込みに失敗しました')
      }
    } catch {
      setError('ルールの読み込みに失敗しました。通信状況をご確認ください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const resetForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setOldProduct(null)
    setNewProduct(null)
    setMemo('')
  }

  const startEdit = (rule: SwitchRuleItem) => {
    setEditingId(rule.id)
    setOldProduct({ productId: rule.oldProductId, display: `${rule.oldCompanyName ?? ''} ${rule.oldProductName ?? ''}`.trim() })
    setNewProduct({ productId: rule.newProductId, display: `${rule.newCompanyName ?? ''} ${rule.newProductName ?? ''}`.trim() })
    setMemo(rule.memo ?? '')
    setFormOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    if (!oldProduct || !newProduct || saving) return
    setSaving(true)
    try {
      const payload = { oldProductId: oldProduct.productId, newProductId: newProduct.productId, memo: memo.trim() || null }
      const res = editingId
        ? await api.insurance.updateSwitchRule(editingId, payload)
        : await api.insurance.createSwitchRule(payload)
      if (res.success) {
        showToast(editingId ? 'ルールを更新しました' : 'ルールを追加しました')
        resetForm()
        await reload()
      } else {
        showToast(res.error || '保存に失敗しました')
      }
    } catch {
      showToast('保存に失敗しました。通信状況をご確認ください。')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (rule: SwitchRuleItem) => {
    // 楽観的更新(失敗したら再取得で戻る)
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: !rule.isActive } : r)))
    try {
      const res = await api.insurance.setSwitchRuleActive(rule.id, !rule.isActive)
      if (!res.success) {
        showToast(res.error || '切り替えに失敗しました')
        await reload()
      }
    } catch {
      showToast('切り替えに失敗しました。通信状況をご確認ください。')
      await reload()
    }
  }

  const remove = async (rule: SwitchRuleItem) => {
    if (!window.confirm(`「${rule.oldProductName ?? ''} → ${rule.newProductName ?? ''}」のルールを削除しますか？`)) return
    try {
      const res = await api.insurance.deleteSwitchRule(rule.id)
      if (res.success) {
        showToast('ルールを削除しました')
        await reload()
      } else {
        showToast(res.error || '削除に失敗しました')
      }
    } catch {
      showToast('削除に失敗しました。通信状況をご確認ください。')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">乗り換えルール</h1>
        <p className="text-sm text-gray-500 mt-1">
          ここで有効なルールが「今日の保全」の乗り換え提案パネルに使われます。
          共通ルールは削除できません。無効にすると表示されなくなります(いつでも戻せます)
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* 追加/編集フォーム */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        {!formOpen ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: '#14283F' }}
          >
            ＋ 自分のルールを追加
          </button>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">
              {editingId ? 'ルールを編集' : '自分のルールを追加'}
            </h2>
            <ProductSelect label="旧商品(乗り換え元)" value={oldProduct} onChange={setOldProduct} />
            <ProductSelect label="新商品(乗り換え先)" value={newProduct} onChange={setNewProduct} />
            <div>
              <label htmlFor="rule-memo" className="block text-sm font-medium text-gray-800 mb-1">メモ(提案理由など)</label>
              <input
                id="rule-memo"
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="例: 保障を維持したまま保険料を抑えられる"
                className="w-full min-h-[44px] text-base border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={!oldProduct || !newProduct || saving}
                className="min-h-[44px] px-6 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#14283F' }}
              >
                {saving ? '保存中…' : editingId ? '更新する' : '追加する'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 一覧 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">ルール一覧{!loading && `(${rules.length}件)`}</h2>
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-gray-500">ルールがありません。「自分のルールを追加」から作成できます</p>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`border rounded-lg p-3 ${rule.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-70'}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                      rule.source === 'master' ? 'bg-blue-100 text-blue-700' : 'bg-accent/25 text-brand'
                    }`}
                  >
                    {rule.source === 'master' ? '共通' : '自分'}
                  </span>
                  {!rule.isActive && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-200 text-gray-600">無効</span>
                  )}
                </div>
                <p className="text-sm text-gray-900 break-words">
                  {`${rule.oldCompanyName ?? ''} ${rule.oldProductName ?? ''}`.trim() || rule.oldProductId}
                  <span className="text-brand font-medium mx-1.5">→</span>
                  {`${rule.newCompanyName ?? ''} ${rule.newProductName ?? ''}`.trim() || rule.newProductId}
                </p>
                {rule.memo && <p className="text-xs text-gray-500 mt-1">{rule.memo}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(rule)}
                    aria-pressed={rule.isActive}
                    className={`min-h-[44px] px-4 rounded-lg text-sm font-medium border transition-colors ${
                      rule.isActive
                        ? 'text-brand border-accent bg-accent/10 hover:bg-accent/20'
                        : 'text-gray-600 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {rule.isActive ? '有効(タップで無効化)' : '無効(タップで有効化)'}
                  </button>
                  {rule.source === 'custom' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(rule)}
                        className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-brand border border-gray-300 hover:bg-gray-50"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(rule)}
                        className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-red-600 border border-gray-300 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">共通ルールは削除できません。無効にすると表示されなくなります</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
