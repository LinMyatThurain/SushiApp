'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildShipmentSuggestions, type ShipmentSuggestion } from '@/lib/shipments/planning'
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, Clock, Fish, Loader2, Package, Pencil, Store, Trash2, User, X } from 'lucide-react'

type ShipmentStatus = 'pending' | 'confirmed'

type ShipmentDetail = {
  id: string
  shipment_code: string
  shipment_date: string
  status: ShipmentStatus
  created_at: string
  updated_at: string | null
  created_by: string
  store_id: string
  store_name: string
  store_location: string | null
  manager_name: string | null
}

type ShipmentItem = {
  id: string
  product_id: string
  product_name: string
  sku: string
  category: string | null
  quantity_sent: number
  unit_price: number
  item_cost: number | null
}

type ShipmentItemData = {
  id: string
  product_id: string
  quantity_sent: number | null
  unit_price: number | null
  item_cost: number | null
  sushi_products: {
    product_name: string | null
    sku: string | null
    category: string | null
  } | null
}

type Confirmation = {
  confirmed_at: string
  confirmer_email: string
  signer_name: string | null
  signature_data: string | null
}

type StoreRow = {
  id: string
  name: string
  location: string | null
}

type ProductRow = {
  id: string
  product_name: string
  sku: string
  category: string | null
  price: number | null
}

type EditForm = {
  store_id: string
  shipment_date: string
  status: ShipmentStatus
  quantities: Record<string, number>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
    confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  }
  const current = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock }
  const Icon = current.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${current.cls}`}>
      <Icon className="w-3.5 h-3.5" />
      {current.label}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>()
  const shipmentId = Array.isArray(params?.id) ? params.id[0] : params?.id
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null)
  const [items, setItems] = useState<ShipmentItem[]>([])
  const [stores, setStores] = useState<StoreRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [suggestions, setSuggestions] = useState<Record<string, ShipmentSuggestion>>({})

  const load = useCallback(async () => {
    if (!shipmentId) {
      setError('Missing shipment id.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [
      { data: shipmentData, error: shipmentError },
      { data: storeData },
      { data: productData },
      { data: reportData },
    ] = await Promise.all([
      supabase
        .from('daily_shipments')
        .select('id, shipment_code, shipment_date, status, created_at, updated_at, created_by, store_id, stores(name, location, manager_name)')
        .eq('id', shipmentId)
        .single(),
      supabase.from('stores').select('id, name, location').eq('status', 'active').order('name'),
      supabase.from('sushi_products').select('id, product_name, sku, category, price').eq('active_status', true).order('product_name'),
      supabase.from('v_daily_sales').select('*').gte('submission_date', formatLocalDate(new Date(Date.now() - 1000 * 60 * 60 * 24 * 56))),
    ])

    if (shipmentError || !shipmentData) {
      setError(shipmentError?.message ?? 'Shipment not found.')
      setLoading(false)
      return
    }

    setShipment({
      id: shipmentData.id,
      shipment_code: shipmentData.shipment_code,
      shipment_date: shipmentData.shipment_date,
      status: (shipmentData.status === 'pending' ? 'pending' : 'confirmed') as ShipmentStatus,
      created_at: shipmentData.created_at,
      updated_at: shipmentData.updated_at ?? null,
      created_by: shipmentData.created_by,
      store_id: shipmentData.store_id,
      store_name: shipmentData.stores?.name ?? '-',
      store_location: shipmentData.stores?.location ?? null,
      manager_name: shipmentData.stores?.manager_name ?? null,
    })

    setStores(storeData ?? [])
    setProducts(productData ?? [])

    const nextSuggestions = buildShipmentSuggestions(reportData ?? [], new Date(shipmentData.shipment_date))
    setSuggestions(
      nextSuggestions.reduce<Record<string, ShipmentSuggestion>>((acc, suggestion) => {
        acc[`${suggestion.store_id}::${suggestion.product_id}`] = suggestion
        return acc
      }, {})
    )

    const [{ data: itemData }, { data: confirmData }, { data: creatorData }] = await Promise.all([
      supabase
        .from('shipment_items')
        .select('id, product_id, quantity_sent, unit_price, item_cost, sushi_products(product_name, sku, category)')
        .eq('shipment_id', shipmentId)
        .order('id', { ascending: true }),
      supabase.from('inventory_confirmations').select('confirmed_at, signer_name, signature_data, users(email)').eq('shipment_id', shipmentId).maybeSingle(),
      supabase.from('users').select('email').eq('id', shipmentData.created_by).maybeSingle(),
    ])

    const nextItems = ((itemData ?? []) as ShipmentItemData[]).map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.sushi_products?.product_name ?? '-',
      sku: item.sushi_products?.sku ?? '-',
      category: item.sushi_products?.category ?? null,
      quantity_sent: item.quantity_sent ?? 0,
      unit_price: item.unit_price ?? 0,
      item_cost: item.item_cost ?? null,
    }))

    setItems(nextItems)
    setConfirmation(
      confirmData
        ? {
            confirmed_at: confirmData.confirmed_at,
            confirmer_email: confirmData.users?.email ?? 'Store user',
            signer_name: confirmData.signer_name ?? null,
            signature_data: confirmData.signature_data ?? null,
          }
        : null
    )
    setCreatorEmail(creatorData?.email ?? null)
    setForm({
      store_id: shipmentData.store_id,
      shipment_date: shipmentData.shipment_date,
      status: (shipmentData.status === 'pending' ? 'pending' : 'confirmed') as ShipmentStatus,
      quantities: nextItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.product_id] = item.quantity_sent
        return acc
      }, {}),
    })
    setLoading(false)
  }, [shipmentId, supabase])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const summary = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + item.quantity_sent, 0)
    const totalCost = items.reduce((sum, item) => sum + (item.item_cost ?? item.unit_price * item.quantity_sent), 0)
    return { totalUnits, totalCost }
  }, [items])

  const editSummary = useMemo(() => {
    if (!form) return { totalUnits: 0, totalCost: 0 }
    const totalUnits = Object.values(form.quantities).reduce((sum, value) => sum + value, 0)
    const totalCost = products.reduce((sum, product) => sum + (form.quantities[product.id] ?? 0) * Number(product.price ?? 0), 0)
    return { totalUnits, totalCost }
  }, [form, products])

  const selectedStoreSuggestions = useMemo(
    () =>
      products.reduce<Record<string, ShipmentSuggestion>>((acc, product) => {
        const key = `${form?.store_id ?? shipment?.store_id ?? ''}::${product.id}`
        const suggestion = suggestions[key]
        if (suggestion) acc[product.id] = suggestion
        return acc
      }, {}),
    [form?.store_id, products, shipment?.store_id, suggestions]
  )

  const activityTimeline = useMemo(() => {
    if (!shipment) return []
    const entries = [
      {
        label: 'Created',
        value: `${fmtDate(shipment.created_at)} · ${fmtTime(shipment.created_at)}`,
        meta: creatorEmail ?? shipment.created_by,
      },
    ]

    if (shipment.updated_at && shipment.updated_at !== shipment.created_at) {
      entries.push({
        label: 'Last updated',
        value: `${fmtDate(shipment.updated_at)} · ${fmtTime(shipment.updated_at)}`,
        meta: 'Admin update recorded',
      })
    }

    if (confirmation) {
      entries.push({
        label: 'Store confirmed',
        value: `${fmtDate(confirmation.confirmed_at)} · ${fmtTime(confirmation.confirmed_at)}`,
        meta: confirmation.confirmer_email,
      })
    }

    return entries
  }, [confirmation, creatorEmail, shipment])

  function openEdit() {
    if (!shipment) return
    setForm({
      store_id: shipment.store_id,
      shipment_date: shipment.shipment_date,
      status: shipment.status,
      quantities: items.reduce<Record<string, number>>((acc, item) => {
        acc[item.product_id] = item.quantity_sent
        return acc
      }, {}),
    })
    setNotice(null)
    setShowEdit(true)
  }

  function adjustQuantity(productId: string, delta: number) {
    setForm((current) => {
      if (!current) return current
      return {
        ...current,
        quantities: {
          ...current.quantities,
          [productId]: Math.max(0, Math.min(200, (current.quantities[productId] ?? 0) + delta)),
        },
      }
    })
  }

  function applyRecommendedPlan() {
    setForm((current) => {
      if (!current) return current
      const next = { ...current.quantities }
      products.forEach((product) => {
        const suggestion = selectedStoreSuggestions[product.id]
        if (suggestion) next[product.id] = suggestion.target_units
      })
      return { ...current, quantities: next }
    })
  }

  async function handleSave() {
    if (!shipment || !form) return

    const payloadItems = products
      .map((product) => ({
        product_id: product.id,
        quantity_sent: form.quantities[product.id] ?? 0,
        unit_price: Number(product.price ?? 0),
      }))
      .filter((item) => item.quantity_sent > 0)

    if (!form.store_id) {
      setError('Select a store before saving.')
      return
    }

    if (!form.shipment_date) {
      setError('Shipment date is required.')
      return
    }

    if (payloadItems.length === 0) {
      setError('Add at least one item before saving.')
      return
    }

    setSaving(true)
    setError(null)

    const response = await fetch('/api/admin/shipments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: shipment.id,
        store_id: form.store_id,
        shipment_date: form.shipment_date,
        status: form.status,
        items: payloadItems,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to update shipment.')
      setSaving(false)
      return
    }

    setNotice('Shipment updated successfully.')
    setShowEdit(false)
    setSaving(false)
    await load()
  }

  async function handleDelete() {
    if (!shipment) return
    if (!confirm('Delete this shipment and all of its items? This cannot be undone.')) return

    setDeleting(true)
    setError(null)

    const response = await fetch(`/api/admin/shipments?id=${encodeURIComponent(shipment.id)}`, {
      method: 'DELETE',
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to delete shipment.')
      setDeleting(false)
      return
    }

    router.push('/admin/shipments?notice=deleted')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Package className="w-8 h-8 text-gray-200 animate-pulse" />
          <p className="text-sm text-gray-400">Loading shipment...</p>
        </div>
      </div>
    )
  }

  if (error && !shipment) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center gap-3">
            <Link href="/admin/shipments" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-sm font-semibold text-gray-900">Shipment Details</h1>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 md:px-6 py-12">
          <div className="bg-white border border-red-100 rounded-2xl px-6 py-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </main>
      </div>
    )
  }

  if (!shipment) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/shipments" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Shipment Details</h1>
              {shipment ? <p className="text-[11px] text-gray-400">{shipment.shipment_code}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete
            </button>
            <StatusBadge status={shipment.status} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-5 space-y-4">
        {notice ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700">{notice}</p>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : null}

        {showEdit && form ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Edit Shipment</h2>
                <p className="text-xs text-gray-400 mt-1">Update the store, date, status, and exact item quantities.</p>
              </div>
              <button onClick={() => setShowEdit(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                <X className="w-3.5 h-3.5" />
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Store</label>
                <select value={form.store_id} onChange={(event) => setForm((current) => (current ? { ...current, store_id: event.target.value } : current))} className="w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-300 focus:bg-white transition-colors">
                  <option value="">Select a store</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}{store.location ? ` - ${store.location}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Shipment Date</label>
                <input type="date" value={form.shipment_date} onChange={(event) => setForm((current) => (current ? { ...current, shipment_date: event.target.value } : current))} className="w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-300 focus:bg-white transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                <select value={form.status} onChange={(event) => setForm((current) => (current ? { ...current, status: event.target.value as ShipmentStatus } : current))} className="w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-300 focus:bg-white transition-colors">
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={applyRecommendedPlan} className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Apply Recommended Plan
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900">Adjust Quantities</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowEdit(false)} className="rounded-xl border border-gray-100 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving} className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save Shipment
                  </button>
                </div>
              </div>
              <div className="max-h-[24rem] overflow-y-auto divide-y divide-gray-50">
                {products.map((product) => {
                  const suggestion = selectedStoreSuggestions[product.id]
                  return (
                    <div key={product.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-800">{product.product_name}</p>
                          {suggestion ? (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                              target {suggestion.target_units} · range {suggestion.min_units}-{suggestion.max_units}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-400">
                          {product.sku} · {product.category ?? 'Uncategorized'} · ${Number(product.price ?? 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => adjustQuantity(product.id, -1)} className="h-8 w-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">-</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min={0}
                          max={200}
                          value={form.quantities[product.id] > 0 ? form.quantities[product.id] : ''}
                          placeholder="0"
                          onChange={(event) =>
                            setForm((current) =>
                              current
                                ? {
                                    ...current,
                                    quantities: {
                                      ...current.quantities,
                                      [product.id]: Math.max(0, Math.min(200, Number(event.target.value) || 0)),
                                    },
                                  }
                                : current
                            )
                          }
                          className="w-14 text-center text-sm font-semibold text-gray-900 outline-none tabular-nums"
                        />
                        <button onClick={() => adjustQuantity(product.id, 1)} className="h-8 w-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">+</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-900 p-4 text-white">
              <p className="text-xs text-gray-400">Updated summary</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-2xl font-bold tabular-nums">{editSummary.totalUnits}</p>
                  <p className="text-xs text-gray-400 mt-1">Units</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-2xl font-bold tabular-nums">${editSummary.totalCost.toFixed(2)}</p>
                  <p className="text-xs text-gray-400 mt-1">Estimated cost</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Calendar className="w-3.5 h-3.5" />
                <span>{fmtDate(shipment.shipment_date)}</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">{shipment.store_name}</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" />
                  {shipment.store_location ?? '-'}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {shipment.manager_name ?? 'No manager assigned'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:min-w-[280px]">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{summary.totalUnits}</p>
                <p className="text-xs text-gray-400 mt-0.5">Units sent</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">${summary.totalCost.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Shipment cost</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-400">Created</p>
              <p className="text-sm font-medium text-gray-800 mt-1">{fmtDate(shipment.created_at)} · {fmtTime(shipment.created_at)}</p>
              <p className="text-xs text-gray-400 mt-1">{creatorEmail ?? shipment.created_by}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-400">Store confirmation</p>
              {confirmation ? (
                <>
                  <p className="text-sm font-medium text-gray-800 mt-1">{fmtDate(confirmation.confirmed_at)} · {fmtTime(confirmation.confirmed_at)}</p>
                  <p className="text-xs text-gray-400 mt-1">{confirmation.confirmer_email}</p>
                  <p className="text-xs text-gray-400 mt-1">{confirmation.signer_name ?? 'Signed on device'}</p>
                  {confirmation.signature_data ? (
                    // Signature data is already a generated data URL from the signature pad.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={confirmation.signature_data}
                      alt="Store signature"
                      className="mt-3 h-24 w-full rounded-xl border border-gray-200 bg-white object-contain p-2"
                    />
                  ) : null}
                </>
              ) : (
                <p className="text-sm font-medium text-amber-700 mt-1">Not confirmed yet</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-400">Shipment id</p>
              <p className="text-sm font-mono text-gray-700 mt-1 break-all">{shipment.id}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Activity Timeline</h3>
          <div className="space-y-3">
            {activityTimeline.map((entry) => (
              <div key={`${entry.label}-${entry.value}`} className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-gray-900 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{entry.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{entry.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{entry.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Shipment Items</h3>
            <span className="text-xs text-gray-400">{items.length} product{items.length !== 1 ? 's' : ''}</span>
          </div>

          {items.length === 0 ? (
            <div className="py-14 text-center">
              <Fish className="w-8 h-8 text-gray-200 mx-auto" />
              <p className="text-sm text-gray-400 mt-3">No shipment items found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400">Product</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400">Category</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-400">Units</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-400">Unit Price</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-400">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const lineTotal = item.item_cost ?? item.unit_price * item.quantity_sent
                    return (
                      <tr key={item.id} className="border-t border-gray-50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                              <Fish className="w-4 h-4 text-gray-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{item.product_name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{item.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-500">{item.category ?? '-'}</td>
                        <td className="px-5 py-4 text-right font-semibold text-gray-900 tabular-nums">{item.quantity_sent}</td>
                        <td className="px-5 py-4 text-right text-gray-500 tabular-nums">${item.unit_price.toFixed(2)}</td>
                        <td className="px-5 py-4 text-right font-semibold text-gray-900 tabular-nums">${lineTotal.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
