'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildShipmentSuggestions, type ShipmentSuggestion } from '@/lib/shipments/planning'
import { AlertCircle, ArrowLeft, CheckCircle2, Fish, Loader2, Minus, Plus, Store } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type StoreRow = { id: string; name: string; location: string | null }
type ProductRow = { id: string; product_name: string; sku: string; category: string | null; price: number | null }
type PrefillPayload = {
  storeId: string
  storeName?: string
  note?: string
  items: Array<{ productId: string; quantity: number }>
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function NewShipmentPage() {
  const supabase = createClient()
  const router = useRouter()
  const today = formatLocalDate(new Date())

  const [stores, setStores] = useState<StoreRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [selectedStore, setStore] = useState('')
  const [shipmentDate, setShipmentDate] = useState(today)
  const [quantities, setQty] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [shipmentCode, setShipmentCode] = useState('')
  const [prefillNote, setPrefillNote] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, ShipmentSuggestion>>({})

  useEffect(() => {
    async function load() {
      const [{ data: storeData }, { data: productData }, { data: reportData }] = await Promise.all([
        supabase.from('stores').select('id, name, location').eq('status', 'active').order('name'),
        supabase.from('sushi_products').select('id, product_name, sku, category, price').eq('active_status', true).order('product_name'),
        supabase.from('v_daily_sales').select('*').gte('submission_date', formatLocalDate(new Date(Date.now() - 1000 * 60 * 60 * 24 * 56))),
      ])

      setStores(storeData ?? [])
      setProducts(productData ?? [])

      const init: Record<string, number> = {}
      ;(productData ?? []).forEach((product: ProductRow) => {
        init[product.id] = 0
      })

      const rawPrefill = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('prefill') : null

      if (rawPrefill) {
        try {
          const parsed = JSON.parse(rawPrefill) as PrefillPayload
          const nextQty = { ...init }
          parsed.items.forEach((item) => {
            if (item.productId in nextQty) {
              nextQty[item.productId] = Math.max(0, Number(item.quantity) || 0)
            }
          })
          setStore(parsed.storeId)
          setQty(nextQty)
          setPrefillNote(parsed.note ?? `Prefilled from dashboard suggestion for ${parsed.storeName ?? 'selected store'}.`)
        } catch {
          setQty(init)
          setPrefillNote(null)
        }
      } else {
        setQty(init)
      }

      const nextSuggestions = buildShipmentSuggestions(reportData ?? [], new Date())
      setSuggestions(
        nextSuggestions.reduce<Record<string, ShipmentSuggestion>>((acc, suggestion) => {
          acc[`${suggestion.store_id}::${suggestion.product_id}`] = suggestion
          return acc
        }, {})
      )
      setLoading(false)
    }

    load()
  }, [supabase])

  const totalUnits = Object.values(quantities).reduce((sum, value) => sum + value, 0)
  const filledProducts = products.filter((product) => quantities[product.id] > 0)
  const totalCost = filledProducts.reduce((sum, product) => sum + (product.price ?? 0) * quantities[product.id], 0)

  const selectedStoreName = stores.find((store) => store.id === selectedStore)?.name ?? ''

  const selectedStoreSuggestions = useMemo(
    () => products.reduce<Record<string, ShipmentSuggestion>>((acc, product) => {
      const suggestion = suggestions[`${selectedStore}::${product.id}`]
      if (suggestion) {
        acc[product.id] = suggestion
      }
      return acc
    }, {}),
    [products, selectedStore, suggestions]
  )

  function adjust(id: string, delta: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }))
  }

  function applyRecommendedPlan() {
    if (!selectedStore) return
    setQty((current) => {
      const next = { ...current }
      products.forEach((product) => {
        const suggestion = selectedStoreSuggestions[product.id]
        if (suggestion) {
          next[product.id] = suggestion.target_units
        }
      })
      return next
    })
  }

  async function handleSubmit() {
    setError('')

    if (!selectedStore) {
      setError('Please select a store first.')
      return
    }

    if (totalUnits === 0) {
      setError('Add at least one product quantity.')
      return
    }

    setSubmitting(true)

    const response = await fetch('/api/admin/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: selectedStore,
        shipment_date: shipmentDate,
        status: 'pending',
        items: filledProducts.map((product) => ({
          product_id: product.id,
          quantity_sent: quantities[product.id],
          unit_price: product.price ?? 0,
        })),
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Failed to create shipment.')
      setSubmitting(false)
      return
    }

    setShipmentCode(result.shipment_code ?? '')
    setSuccess(true)
    setTimeout(() => router.push('/admin/shipments'), 1000)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-gray-800">Shipment created!</p>
          {shipmentCode ? <p className="text-xs font-mono text-gray-500">{shipmentCode}</p> : null}
          <p className="text-xs text-gray-400">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/shipments" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">New Shipment</h1>
              <p className="text-xs text-gray-400">{shipmentDate}</p>
            </div>
          </div>
          {totalUnits > 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white">
              <div className="flex items-center gap-1.5">
                <Fish className="w-3 h-3" />
                {totalUnits} units
              </div>
              <div className="rounded-full bg-white/10 px-2 py-1 text-gray-200">${totalCost.toFixed(2)} total</div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {error ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : null}

        {prefillNote ? (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
            <p className="text-sm text-blue-700">{prefillNote}</p>
          </div>
        ) : null}

        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
              <Store className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Shipment Setup</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Shipment Date</label>
              <input
                type="date"
                value={shipmentDate}
                onChange={(event) => setShipmentDate(event.target.value)}
                className="w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-300 focus:bg-white transition-colors"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={applyRecommendedPlan}
                disabled={!selectedStore}
                className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Apply Recommended Plan
              </button>
            </div>
          </div>

          {loading ? (
            <div className="h-10 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => setStore(store.id)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                    selectedStore === store.id
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{store.name}</p>
                    <p className="text-xs mt-0.5 text-gray-400">{store.location}</p>
                  </div>
                  {selectedStore === store.id ? <CheckCircle2 className="w-4 h-4 text-white shrink-0" /> : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
              <Fish className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Set Quantities</h2>
            <span className="ml-auto text-xs text-gray-400">Whole numbers only · max 200 each</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((index) => (
                <div key={index} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {['Nigiri', 'Roll', 'Maki', 'Premium'].map((category) => {
                const categoryProducts = products.filter((product) => product.category === category)
                if (!categoryProducts.length) return null

                return (
                  <div key={category}>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1 mb-1.5 mt-3 first:mt-0">{category}</p>
                    {categoryProducts.map((product) => {
                      const suggestion = selectedStoreSuggestions[product.id]
                      return (
                        <div
                          key={product.id}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all mb-1.5 ${
                            quantities[product.id] > 0 ? 'border-gray-200 bg-gray-50' : 'border-gray-50 bg-white'
                          }`}
                        >
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
                              {product.sku} · ${product.price?.toFixed(2)}
                              {suggestion ? ` · avg sold ${suggestion.avg_sold}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => adjust(product.id, -1)}
                              disabled={quantities[product.id] === 0}
                              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              min={0}
                              max={200}
                              value={quantities[product.id] > 0 ? quantities[product.id] : ''}
                              placeholder="0"
                              onChange={(event) => setQty((prev) => ({ ...prev, [product.id]: Math.max(0, Math.min(200, Number(event.target.value) || 0)) }))}
                              className="w-14 text-center text-sm font-semibold text-gray-900 bg-transparent outline-none tabular-nums"
                            />
                            <button
                              onClick={() => adjust(product.id, 1)}
                              disabled={(quantities[product.id] ?? 0) >= 200}
                              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-2xl p-5 text-white">
          <p className="text-xs text-gray-400 mb-3">Shipment summary</p>
          <div className="space-y-1.5 mb-4">
            {filledProducts.map((product) => {
              const lineCost = (product.price ?? 0) * quantities[product.id]
              return (
                <div key={product.id} className="flex justify-between text-sm">
                  <span className="text-gray-300">{product.product_name}</span>
                  <span className="font-semibold tabular-nums">
                    {quantities[product.id]} units · ${lineCost.toFixed(2)}
                  </span>
                </div>
              )
            })}
            <div className="space-y-2 pt-2 border-t border-gray-700">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Store</span>
                <span className="font-bold">{selectedStoreName || 'Not selected'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Date</span>
                <span className="font-bold">{shipmentDate}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Total units</span>
                <span className="font-bold tabular-nums">{totalUnits} units</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Total cost</span>
                <span className="font-bold tabular-nums">${totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedStore}
            className="w-full bg-white text-gray-900 text-sm font-semibold py-3 rounded-xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Creating...
              </>
            ) : (
              `Send to ${selectedStoreName || 'Store'}`
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
