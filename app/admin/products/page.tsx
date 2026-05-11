'use client'
// app/(admin)/products/page.tsx

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Plus, Fish, ToggleLeft,
  ToggleRight, Pencil, Trash2, X, Loader2, AlertCircle, Search
} from 'lucide-react'
import Link from 'next/link'

type Product = {
  id: string
  product_name: string
  sku: string
  category: string | null
  price: number | null
  cost_price: number | null
  active_status: boolean
  created_at: string
}

type FormState = {
  product_name: string
  sku: string
  category: string
  price: string
  cost_price: string
  active_status: boolean
}

const EMPTY_FORM: FormState = {
  product_name: '', sku: '', category: '', price: '', cost_price: '', active_status: true
}

const CATEGORIES = ['Nigiri', 'Roll', 'Maki', 'Premium', 'Set', 'Other']

const CATEGORY_COLORS: Record<string, string> = {
  Nigiri:  'bg-orange-50 text-orange-600 border-orange-200',
  Roll:    'bg-blue-50 text-blue-600 border-blue-200',
  Maki:    'bg-purple-50 text-purple-600 border-purple-200',
  Premium: 'bg-amber-50 text-amber-600 border-amber-200',
  Set:     'bg-teal-50 text-teal-600 border-teal-200',
  Other:   'bg-gray-100 text-gray-500 border-gray-200',
}

export default function ProductsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [products, setProducts]   = useState<Product[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [catFilter, setCat]       = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Product | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('sushi_products')
      .select('*')
      .order('category', { ascending: true })
    setProducts(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    async function loadInitialProducts() {
      const { data } = await supabase
        .from('sushi_products')
        .select('*')
        .order('category', { ascending: true })
      if (cancelled) return
      setProducts(data ?? [])
      setLoading(false)
    }
    void loadInitialProducts()
    return () => { cancelled = true }
  }, [supabase])

  const filtered = useMemo(() => {
    let f = products
    if (catFilter !== 'all') f = f.filter(p => p.category === catFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      f = f.filter(p =>
        p.product_name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category?.toLowerCase().includes(q) ?? false)
      )
    }
    return f
  }, [search, catFilter, products])

  function openAdd() {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setShowModal(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      product_name: p.product_name,
      sku: p.sku,
      category: p.category ?? '',
      price: String(p.price ?? ''),
      cost_price: String(p.cost_price ?? ''),
      active_status: p.active_status,
    })
    setError(''); setShowModal(true)
  }

  async function handleSave() {
    setError('')
    if (!form.product_name.trim()) { setError('Product name is required.'); return }
    if (!form.sku.trim())          { setError('SKU is required.'); return }
    if (!form.price || isNaN(Number(form.price))) { setError('Valid price is required.'); return }
    if (form.cost_price && isNaN(Number(form.cost_price))) { setError('Valid making cost is required.'); return }
    if (Number(form.cost_price || 0) > Number(form.price)) { setError('Making cost should not be higher than selling price.'); return }
    setSaving(true)

    const payload = {
      product_name:  form.product_name,
      sku:           form.sku.toUpperCase(),
      category:      form.category,
      price:         Number(form.price),
      cost_price:    Number(form.cost_price || 0),
      active_status: form.active_status,
    }

    const response = await fetch('/api/admin/products', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to save product.')
      setSaving(false)
      return
    }

    await load(); setSaving(false); setShowModal(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this product? This may affect existing shipment data.')) return
    setError('')
    setDeleting(id)
    const response = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to delete product.')
      setDeleting(null)
      return
    }

    await load()
    setDeleting(null)
  }

  async function toggleStatus(p: Product) {
    setError('')
    const response = await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: p.id,
        product_name: p.product_name,
        sku: p.sku,
        category: p.category,
        price: p.price,
        cost_price: p.cost_price,
        active_status: !p.active_status,
      }),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to update product status.')
      return
    }

    await load()
  }

  const activeCount = products.filter(p => p.active_status).length
  const categories  = [...new Set(products.map(p => p.category).filter((c): c is string => Boolean(c)))]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.04),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)] text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-sm font-semibold text-slate-950">Product management</h1>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 bg-slate-950 text-white text-xs font-medium px-3 py-2 rounded-xl hover:bg-slate-800 transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5" /> Add Product
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {error && !showModal && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-100 rounded-2xl p-4">
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{products.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total products</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">{activeCount}</p>
            <p className="text-xs text-emerald-500 mt-0.5">Active</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
            <p className="text-2xl font-bold text-gray-400 tabular-nums">{products.length - activeCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">Inactive</p>
          </div>
        </div>

        {/* Search + Category filter */}
        <div className="flex gap-2">
          <div className="flex items-center gap-2 bg-white border border-slate-200/70 rounded-2xl px-3 py-2 flex-1 shadow-sm">
            <Search className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <input
              type="text" placeholder="Search products..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* Category chips */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCat('all')}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
              ${catFilter === 'all' ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
            All
          </button>
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
                ${catFilter === c
                  ? 'bg-slate-950 text-white border-slate-950'
                  : `${CATEGORY_COLORS[c] ?? 'bg-white text-slate-500 border-slate-200'} hover:opacity-80`}`}>
              {c}
            </button>
          ))}
        </div>

        {/* Product grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-24 bg-white rounded-3xl border border-slate-200/70 animate-pulse shadow-sm" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/70 flex flex-col items-center justify-center py-16 gap-3 shadow-sm">
            <Fish className="w-8 h-8 text-slate-200" />
            <p className="text-sm text-slate-400">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(p => (
              <div key={p.id}
                className={`bg-white border rounded-3xl p-4 transition-all hover:shadow-md shadow-sm
                  ${p.active_status ? 'border-slate-200/70' : 'border-slate-200/70 opacity-70'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center
                      ${p.active_status ? 'bg-slate-950' : 'bg-slate-100'}`}>
                      <Fish className={`w-3.5 h-3.5 ${p.active_status ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{p.product_name}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                    </div>
                  </div>
                  {/* Toggle active */}
                  <button onClick={() => toggleStatus(p)} title={p.active_status ? 'Deactivate' : 'Activate'}
                    className="text-slate-300 hover:text-slate-600 transition-colors">
                    {p.active_status
                      ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                      : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  {p.category && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                      ${CATEGORY_COLORS[p.category] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {p.category}
                    </span>
                  )}
                  <div className="ml-auto text-right">
                    <p className="text-sm font-bold text-slate-950">${p.price?.toFixed(2)}</p>
                    <p className="text-[11px] text-slate-400">cost ${Number(p.cost_price ?? 0).toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(p)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 py-2 rounded-xl border border-slate-200/70 hover:border-slate-300 hover:bg-slate-50 transition-all">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-red-400 hover:text-red-600 py-2 rounded-xl border border-red-100 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50">
                    {deleting === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <p className="text-xs text-slate-400 text-center">
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
            {catFilter !== 'all' || search ? ' matching filters' : ' total'}
          </p>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              {/* Product name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Product Name *</label>
                <input type="text" value={form.product_name} placeholder="e.g. Salmon Nigiri"
                  onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))}
                  className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                />
              </div>

              {/* SKU + Price row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">SKU *</label>
                  <input type="text" value={form.sku} placeholder="SNI-001"
                    onChange={e => setForm(p => ({ ...p, sku: e.target.value }))}
                    className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Price (SGD) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <input type="text" inputMode="decimal" pattern="[0-9.]*" step="0.01" min="0" value={form.price} placeholder="0.00"
                      onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                      className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl pl-6 pr-3 py-2.5 outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Making Cost (SGD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <input type="text" inputMode="decimal" pattern="[0-9.]*" step="0.01" min="0" value={form.cost_price} placeholder="0.00"
                    onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))}
                    className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl pl-6 pr-3 py-2.5 outline-none focus:border-gray-300 focus:bg-white transition-all placeholder:text-gray-300"
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-400">Used in reports to calculate net profit after ingredient/prep cost.</p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, category: c }))}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
                        ${form.category === c
                          ? 'bg-gray-900 text-white border-gray-900'
                          : `${CATEGORY_COLORS[c] ?? 'bg-white text-gray-500 border-gray-200'} hover:opacity-80`}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="text-xs font-medium text-gray-700">Active Status</p>
                  <p className="text-xs text-gray-400 mt-0.5">Inactive products will not appear in shipments</p>
                </div>
                <button onClick={() => setForm(p => ({ ...p, active_status: !p.active_status }))}>
                  {form.active_status
                    ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                    : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200/70 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : editing ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
