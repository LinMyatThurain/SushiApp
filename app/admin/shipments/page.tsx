'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle2, ChevronRight, Clock, Copy, Loader2, Package, Plus, Search, Store, Table2, Trash2, Truck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Shipment = {
  id: string
  shipment_code: string
  shipment_date: string
  status: 'pending' | 'confirmed'
  created_at: string
  created_by: string
  created_by_email: string | null
  store_id: string
  store_name: string
  store_location: string
  item_count: number
  total_units: number
  total_cost: number
  confirmed_at: string | null
}

type ShipmentTableRow = {
  shipment_id: string
  shipment_code: string
  shipment_date: string
  created_at: string
  status: string
  store_name: string
  store_location: string
  created_by_email: string | null
  confirmed_at: string | null
  product_name: string
  sku: string
  category: string | null
  quantity_sent: number
  unit_price: number
  line_total: number
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
    confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  }
  const current = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock }
  const Icon = current.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${current.cls}`}>
      <Icon className="w-3 h-3" />
      {current.label}
    </span>
  )
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ShipmentsPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const today = formatLocalDate(new Date())

  const [shipments, setShipments] = useState<Shipment[]>([])
  const [tableRows, setTableRows] = useState<ShipmentTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [notice, setNotice] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    return params.get('notice') === 'deleted' ? 'Shipment deleted successfully.' : null
  })
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [duplicateDate, setDuplicateDate] = useState(today)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: shipmentData } = await supabase
      .from('daily_shipments')
      .select('id, shipment_code, shipment_date, status, created_at, created_by, store_id, stores(name, location)')
      .order('created_at', { ascending: false })

    const rows: Shipment[] = (shipmentData ?? []).map((shipment) => ({
      id: shipment.id,
      shipment_code: shipment.shipment_code,
      shipment_date: shipment.shipment_date,
      status: shipment.status === 'pending' ? 'pending' : 'confirmed',
      created_at: shipment.created_at,
      created_by: shipment.created_by,
      created_by_email: null,
      store_id: shipment.store_id,
      store_name: shipment.stores?.name ?? '-',
      store_location: shipment.stores?.location ?? '-',
      item_count: 0,
      total_units: 0,
      total_cost: 0,
      confirmed_at: null,
    }))

    const shipmentIds = rows.map((row) => row.id)
    const userIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean))]

    const [{ data: itemData }, { data: confirmationData }, { data: userData }] = await Promise.all([
      shipmentIds.length
        ? supabase.from('shipment_items').select('shipment_id, quantity_sent, unit_price, item_cost, sushi_products(product_name, sku, category)').in('shipment_id', shipmentIds)
        : Promise.resolve({ data: [] }),
      shipmentIds.length
        ? supabase.from('inventory_confirmations').select('shipment_id, confirmed_at').in('shipment_id', shipmentIds)
        : Promise.resolve({ data: [] }),
      userIds.length ? supabase.from('users').select('id, email').in('id', userIds) : Promise.resolve({ data: [] }),
    ])

    const creators = new Map<string, string>()
    ;(userData ?? []).forEach((user) => creators.set(user.id, user.email))

    const confirmations = new Map<string, string>()
    ;(confirmationData ?? []).forEach((row) => confirmations.set(row.shipment_id, row.confirmed_at))

    const table: ShipmentTableRow[] = []
    const itemCountMap = new Map<string, number>()
    const unitMap = new Map<string, number>()
    const costMap = new Map<string, number>()

    ;(itemData ?? []).forEach((item) => {
      itemCountMap.set(item.shipment_id, (itemCountMap.get(item.shipment_id) ?? 0) + 1)
      unitMap.set(item.shipment_id, (unitMap.get(item.shipment_id) ?? 0) + (item.quantity_sent ?? 0))
      costMap.set(item.shipment_id, (costMap.get(item.shipment_id) ?? 0) + Number(item.item_cost ?? (item.unit_price ?? 0) * (item.quantity_sent ?? 0)))
    })

    rows.forEach((row) => {
      row.item_count = itemCountMap.get(row.id) ?? 0
      row.total_units = unitMap.get(row.id) ?? 0
      row.total_cost = costMap.get(row.id) ?? 0
      row.confirmed_at = confirmations.get(row.id) ?? null
      row.created_by_email = creators.get(row.created_by) ?? null
    })

    const shipmentById = new Map(rows.map((row) => [row.id, row]))
    ;(itemData ?? []).forEach((item) => {
      const shipment = shipmentById.get(item.shipment_id)
      if (!shipment) return
      table.push({
        shipment_id: shipment.id,
        shipment_code: shipment.shipment_code,
        shipment_date: shipment.shipment_date,
        created_at: shipment.created_at,
        status: shipment.status === 'pending' ? 'pending' : 'confirmed',
        store_name: shipment.store_name,
        store_location: shipment.store_location,
        created_by_email: shipment.created_by_email,
        confirmed_at: shipment.confirmed_at,
        product_name: item.sushi_products?.product_name ?? '-',
        sku: item.sushi_products?.sku ?? '-',
        category: item.sushi_products?.category ?? null,
        quantity_sent: item.quantity_sent ?? 0,
        unit_price: Number(item.unit_price ?? 0),
        line_total: Number(item.item_cost ?? (item.unit_price ?? 0) * (item.quantity_sent ?? 0)),
      })
    })

    setShipments(rows)
    setTableRows(table)
    setSelectedIds((current) => current.filter((id) => rows.some((row) => row.id === id)))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const filteredShipments = useMemo(() => {
    let next = shipments
    if (statusFilter !== 'all') next = next.filter((shipment) => shipment.status === statusFilter)
    if (search.trim()) {
      const query = search.toLowerCase()
      next = next.filter(
        (shipment) =>
          shipment.store_name.toLowerCase().includes(query) ||
          shipment.store_location.toLowerCase().includes(query) ||
          shipment.shipment_date.includes(query) ||
          (shipment.created_by_email ?? '').toLowerCase().includes(query)
      )
    }
    return next
  }, [search, shipments, statusFilter])

  const visibleShipmentIds = useMemo(
    () => new Set(filteredShipments.map((shipment) => shipment.id)),
    [filteredShipments]
  )

  const filteredTableRows = useMemo(() => {
    let next = tableRows.filter((row) => visibleShipmentIds.has(row.shipment_id))
    if (search.trim()) {
      const query = search.toLowerCase()
      next = next.filter(
        (row) =>
          row.product_name.toLowerCase().includes(query) ||
          row.sku.toLowerCase().includes(query) ||
          (row.category ?? '').toLowerCase().includes(query) ||
          row.store_name.toLowerCase().includes(query)
      )
    }
    return next
  }, [search, tableRows, visibleShipmentIds])

  const todayShipments = shipments.filter((shipment) => shipment.shipment_date === today)
  const pendingCount = shipments.filter((shipment) => shipment.status === 'pending').length
  const confirmedCount = shipments.filter((shipment) => shipment.status === 'confirmed').length
  const totalUnits = filteredShipments.reduce((sum, shipment) => sum + shipment.total_units, 0)
  const allVisibleSelected = filteredShipments.length > 0 && filteredShipments.every((shipment) => selectedIds.includes(shipment.id))

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })

  function toggleShipment(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleShipmentIds.has(id))
      }
      return Array.from(new Set([...current, ...filteredShipments.map((shipment) => shipment.id)]))
    })
  }

  async function runBulkAction(payload: Record<string, unknown>, successMessage: string) {
    setBusy(true)
    setError(null)
    setNotice(null)

    const response = await fetch('/api/admin/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json()

    if (!response.ok) {
      setError(result.error ?? 'Bulk shipment action failed.')
      setBusy(false)
      return
    }

    setSelectedIds([])
    setNotice(successMessage)
    setBusy(false)
    await load()
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.04),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-slate-950">Shipments</h1>
              <p className="text-[11px] text-slate-500">Review, confirm, and manage outgoing shipments</p>
            </div>
          </div>
          <Link href="/admin/shipments/create" className="flex items-center gap-1.5 bg-slate-950 text-white text-xs font-medium px-3 py-2 rounded-xl hover:bg-slate-800 transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5" />
            New Shipment
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {notice ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700">{notice}</p>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <Clock className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { label: "Today's", value: todayShipments.length, sub: 'shipments', color: 'bg-white' },
            { label: 'Pending', value: pendingCount, sub: 'awaiting action', color: 'bg-amber-50' },
            { label: 'Confirmed', value: confirmedCount, sub: 'all time', color: 'bg-emerald-50' },
            { label: 'Units', value: totalUnits, sub: 'filtered total', color: 'bg-gray-900 text-white' },
          ].map((card) => (
            <div key={card.label} className={`${card.color} rounded-3xl border ${card.label === 'Units' ? 'border-slate-900' : 'border-slate-200/70'} p-4 shadow-sm`}>
              <p className={`text-2xl font-bold tabular-nums ${card.label === 'Units' ? 'text-white' : 'text-slate-950'}`}>{card.value}</p>
              <p className={`text-xs mt-0.5 ${card.label === 'Units' ? 'text-slate-400' : 'text-slate-500'}`}>{card.label}</p>
              <p className={`text-xs ${card.label === 'Units' ? 'text-slate-500' : 'text-slate-400'}`}>{card.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200/70 rounded-2xl px-3 py-2 shadow-sm">
            <Search className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <input
              type="text"
              placeholder="Search by store, product, SKU, creator, or date..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-300"
            />
          </div>
          <div className="flex bg-white border border-slate-200/70 rounded-2xl overflow-hidden shadow-sm">
            {(['all', 'pending', 'confirmed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`text-xs px-3 py-2 capitalize transition-colors ${statusFilter === status ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {status === 'all' ? 'All' : status}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-3xl p-4 space-y-3 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="text-sm font-semibold text-slate-950">Bulk actions</div>
            <div className="text-xs text-slate-400">{selectedIds.length} selected</div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <button onClick={toggleVisible} className="rounded-lg border border-slate-200/70 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
              </button>
              <button
                onClick={() => runBulkAction({ action: 'bulk_status', ids: selectedIds, status: 'confirmed' }, 'Selected shipments marked confirmed.')}
                disabled={busy || selectedIds.length === 0}
                className="rounded-lg border border-sky-100 px-3 py-2 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-40 transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : null} Confirm
              </button>
              <button
                onClick={() => runBulkAction({ action: 'bulk_delete', ids: selectedIds }, 'Selected shipments deleted.')}
                disabled={busy || selectedIds.length === 0}
                className="rounded-lg border border-red-100 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="text-xs text-slate-500">Duplicate selected shipments to:</div>
            <input
              type="date"
              value={duplicateDate}
              onChange={(event) => setDuplicateDate(event.target.value)}
              className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:bg-white transition-colors"
            />
            <button
              onClick={() => runBulkAction({ action: 'duplicate', ids: selectedIds, shipment_date: duplicateDate }, 'Selected shipments duplicated.')}
              disabled={busy || selectedIds.length === 0}
              className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5 shadow-sm"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[430px,1fr] gap-4">
          <div className="bg-white border border-slate-200/70 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-950">Shipment overview</h2>
              <span className="text-xs text-slate-400">{filteredShipments.length} shipments</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Truck className="w-8 h-8 text-slate-200 animate-pulse" />
              </div>
            ) : filteredShipments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                  <Truck className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">No shipments found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[900px] overflow-y-auto">
                {filteredShipments.map((shipment) => (
                  <div key={shipment.id} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                    <input type="checkbox" checked={selectedIds.includes(shipment.id)} onChange={() => toggleShipment(shipment.id)} className="h-4 w-4 rounded border-gray-300" />
                    <Link href={`/admin/shipments/${shipment.id}`} className="flex items-center gap-4 flex-1 min-w-0 group">
                      <div className="w-12 shrink-0 text-center bg-gray-50 rounded-xl py-2">
                        <p className="text-lg font-bold text-gray-900 leading-none">{new Date(shipment.shipment_date).getDate()}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(shipment.shipment_date).toLocaleDateString('en-SG', { month: 'short' })}</p>
                      </div>
                      <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                        <Store className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{shipment.shipment_code}</p>
                        <p className="text-sm font-semibold text-gray-800 truncate">{shipment.store_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {shipment.store_location} · {shipment.item_count} products · {shipment.total_units} units · ${shipment.total_cost.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-gray-300 mt-1">{fmtDate(shipment.shipment_date)} · {fmtTime(shipment.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={shipment.status} />
                        <ChevronRight className="w-4 h-4 text-gray-200 group-hover:text-gray-400 transition-colors" />
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">Detailed Shipment Table</h2>
              </div>
              <span className="text-xs text-gray-400">{filteredTableRows.length} product lines</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Package className="w-8 h-8 text-gray-200 animate-pulse" />
              </div>
            ) : filteredTableRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Package className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">No shipment lines match the current filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1240px] w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">Store</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">Product</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">SKU</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">Category</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-400">Qty</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-400">Unit Price</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-400">Line Total</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">Created By</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">Confirmed</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-400">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTableRows.map((row, index) => (
                      <tr
                        key={`${row.shipment_id}-${row.sku}-${index}`}
                        className={`border-t border-gray-50 hover:bg-gray-50/40 ${selectedIds.includes(row.shipment_id) ? 'bg-blue-50/40' : ''} cursor-pointer`}
                        onClick={() => router.push(`/admin/shipments/${row.shipment_id}`)}
                      >
                        <td className="px-4 py-3 text-gray-500">
                          <div className="font-mono text-[11px] text-gray-400">{row.shipment_code}</div>
                          <div>{fmtDate(row.shipment_date)}</div>
                          <div className="text-[11px] text-gray-300 mt-0.5">{fmtTime(row.created_at)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{row.store_name}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{row.store_location}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-800">{row.product_name}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono">{row.sku}</td>
                        <td className="px-4 py-3 text-gray-500">{row.category ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{row.quantity_sent}</td>
                        <td className="px-4 py-3 text-right text-gray-500 tabular-nums">${row.unit_price.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">${row.line_total.toFixed(2)}</td>
                        <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-3 text-gray-500">{row.created_by_email ?? '-'}</td>
                        <td className="px-4 py-3 text-gray-500">{row.confirmed_at ? `${fmtDate(row.confirmed_at)} ${fmtTime(row.confirmed_at)}` : 'Not confirmed'}</td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/shipments/${row.shipment_id}`} className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            Manage
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
