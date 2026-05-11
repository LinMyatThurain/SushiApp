"use client"

// app/(delivery)/dashboard/page.tsx
// UI redesign — all business logic, API calls, types and state are preserved exactly.
// Only className strings and JSX structure have changed.

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { SignaturePad } from "@/components/signature-pad"
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  type LucideIcon,
  RefreshCw,
  Save,
  Truck,
  PenLine,
  X,
  UtensilsCrossed,
  Fish,
} from "lucide-react"
import { useRouter } from "next/navigation"

// ─── Types (unchanged) ───────────────────────────────────────────────────────
type StoreRow = { id: string; name: string; location: string | null }
type ProductRow = { id: string; product_name: string; sku: string; price: number | null; category: string | null }
type RecentShipment = {
  id: string; shipment_code: string; store_id: string | null
  shipment_date: string; status: string; created_at: string
  store_name: string; manager_name: string | null; total_units: number
  items: Array<{ product_id: string; product_name: string; sku: string; quantity_sent: number }>
}
type RecentSubmission = {
  id: string; shipment_id: string | null; submission_date: string
  status: string; created_at: string; store_name: string
}
type DashboardData = {
  stores: StoreRow[]; products: ProductRow[]
  recent_shipments: RecentShipment[]; recent_submissions: RecentSubmission[]
}
type DashboardTab = "shipments" | "eod" | "activity"
type EodFormState = {
  shipment_id: string; store_id: string; submission_date: string
  sold: Record<string, string>; remaining: Record<string, string>; returned: Record<string, string>
}

// ─── Helpers (unchanged) ─────────────────────────────────────────────────────
function formatLocalDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
function emptyShipmentQuantities(items: RecentShipment["items"]) {
  return items.reduce<Record<string, string>>((acc, item) => { acc[item.product_id] = ""; return acc }, {})
}
function parseQuantityInput(value: string | undefined) {
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}
function getLatestUndeliveredShipment(shipments: RecentShipment[], submittedIds: Set<string>) {
  return shipments.find((s) => !submittedIds.has(s.id)) ?? null
}
function buildShipmentEodState(current: EodFormState, shipments: RecentShipment[], submittedIds: Set<string>) {
  const currentShipment =
    current.shipment_id && !submittedIds.has(current.shipment_id)
      ? shipments.find((s) => s.id === current.shipment_id) ?? null : null
  const fallback = getLatestUndeliveredShipment(shipments, submittedIds)
  const selected = currentShipment ?? fallback
  const shouldReset = !currentShipment || currentShipment.id !== current.shipment_id
  return {
    ...current,
    shipment_id: selected?.id ?? "",
    store_id: selected?.store_id ?? "",
    submission_date: selected?.shipment_date ?? current.submission_date,
    sold:      shouldReset && selected ? emptyShipmentQuantities(selected.items) : current.sold,
    remaining: shouldReset && selected ? emptyShipmentQuantities(selected.items) : current.remaining,
    returned:  shouldReset && selected ? emptyShipmentQuantities(selected.items) : current.returned,
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, accent = false, alert = false,
}: {
  label: string; value: number | string; sub: string
  icon: LucideIcon; accent?: boolean; alert?: boolean
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 border transition-all duration-200 hover:shadow-md
      ${accent
        ? "bg-gray-900 border-gray-800 text-white"
        : alert && Number(value) > 0
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-gray-100"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-medium tracking-wide uppercase mb-1
            ${accent ? "text-gray-400" : alert && Number(value) > 0 ? "text-amber-600" : "text-gray-500"}`}>
            {label}
          </p>
          <p className={`text-3xl font-bold tabular-nums
            ${accent ? "text-white" : alert && Number(value) > 0 ? "text-amber-700" : "text-gray-900"}`}>
            {value}
          </p>
          <p className={`text-xs mt-1
            ${accent ? "text-gray-400" : alert && Number(value) > 0 ? "text-amber-500" : "text-gray-400"}`}>
            {sub}
          </p>
        </div>
        <div className={`p-2.5 rounded-xl
          ${accent ? "bg-gray-800" : alert && Number(value) > 0 ? "bg-amber-100" : "bg-gray-50"}`}>
          <Icon className={`w-5 h-5
            ${accent ? "text-gray-300" : alert && Number(value) > 0 ? "text-amber-600" : "text-gray-400"}`} />
        </div>
      </div>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   "bg-amber-50 text-amber-700 border-amber-200",
    confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    completed: "bg-blue-50 text-blue-700 border-blue-200",
    submitted: "bg-purple-50 text-purple-700 border-purple-200",
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border capitalize
      ${map[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {status}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DeliveryDashboard() {
  const router = useRouter()
  const today  = formatLocalDate(new Date())

  const [loading, setLoading]         = useState(true)
  const [submittingEod, setSubmittingEod] = useState(false)
  const [error, setError]             = useState("")
  const [notice, setNotice]           = useState("")
  const [data, setData]               = useState<DashboardData>({
    stores: [], products: [], recent_shipments: [], recent_submissions: [],
  })
  const [activeTab, setActiveTab]     = useState<DashboardTab>("shipments")
  const [shipmentStoreFilter, setShipmentStoreFilter]       = useState("")
  const [shipmentDateFromFilter, setShipmentDateFromFilter] = useState("")
  const [shipmentDateToFilter, setShipmentDateToFilter]     = useState("")
  const [shipmentStatusFilter, setShipmentStatusFilter]     = useState("")
  const [expandedShipment, setExpandedShipment]             = useState<string | null>(null)
  const [selectedShipmentForConfirm, setSelectedShipmentForConfirm] = useState<RecentShipment | null>(null)
  const [confirmSignerName, setConfirmSignerName]           = useState("")
  const [confirmSignature, setConfirmSignature]             = useState("")
  const [confirmingShipment, setConfirmingShipment]         = useState(false)
  const [eod, setEod] = useState<EodFormState>({
    shipment_id: "", store_id: "", submission_date: today,
    sold: {}, remaining: {}, returned: {},
  })

  // ── Data loading (unchanged) ──────────────────────────────────────────────
  async function load() {
    setLoading(true); setError("")
    const response = await fetch("/api/delivery")
    const result   = await response.json()
    if (!response.ok) { setError(result.error ?? "Failed to load delivery data."); setLoading(false); return }
    const next: DashboardData = result
    setData(next)
    const submittedIds = new Set(
      next.recent_submissions.map((s) => s.shipment_id).filter((id): id is string => Boolean(id))
    )
    setEod((current) => buildShipmentEodState(current, next.recent_shipments, submittedIds))
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    async function loadInitialData() {
      const response = await fetch("/api/delivery")
      const result   = await response.json()
      if (cancelled) return
      if (!response.ok) { setError(result.error ?? "Failed to load delivery data."); setLoading(false); return }
      const next: DashboardData = result
      setData(next)
      const submittedIds = new Set(
        next.recent_submissions.map((s) => s.shipment_id).filter((id): id is string => Boolean(id))
      )
      setEod((current) => buildShipmentEodState(current, next.recent_shipments, submittedIds))
      setLoading(false)
    }
    void loadInitialData()
    return () => { cancelled = true }
  }, [])

  // ── Derived state (unchanged) ─────────────────────────────────────────────
  const filteredShipments = useMemo(() => {
    return data.recent_shipments.filter((s) => {
      const storeOk  = shipmentStoreFilter  ? s.store_id      === shipmentStoreFilter  : true
      const statusOk = shipmentStatusFilter ? s.status        === shipmentStatusFilter  : true
      const fromOk   = shipmentDateFromFilter ? s.shipment_date >= shipmentDateFromFilter : true
      const toOk     = shipmentDateToFilter   ? s.shipment_date <= shipmentDateToFilter   : true
      return storeOk && statusOk && fromOk && toOk
    })
  }, [data.recent_shipments, shipmentDateFromFilter, shipmentDateToFilter, shipmentStatusFilter, shipmentStoreFilter])

  const shipmentUnitTotal    = useMemo(() => filteredShipments.reduce((s, r) => s + r.total_units, 0), [filteredShipments])
  const todayShipments       = useMemo(() => data.recent_shipments.filter((s) => s.shipment_date === today), [data.recent_shipments, today])
  const todayDeliveriesCount = todayShipments.length
  const todayLeftToDeliverCount = useMemo(() => todayShipments.filter((s) => s.status === "pending").length, [todayShipments])
  const submittedShipmentIds = useMemo(
    () => new Set(data.recent_submissions.map((s) => s.shipment_id).filter((id): id is string => Boolean(id))),
    [data.recent_submissions]
  )
  const pendingShipments = useMemo(
    () => data.recent_shipments.filter((s) => s.status === "confirmed" && !submittedShipmentIds.has(s.id)),
    [data.recent_shipments, submittedShipmentIds]
  )
  const selectedShipment      = useMemo(() => data.recent_shipments.find((s) => s.id === eod.shipment_id) ?? null, [data.recent_shipments, eod.shipment_id])
  const selectedShipmentItems = useMemo(() => selectedShipment?.items ?? [], [selectedShipment])
  const eodTotalSold          = useMemo(() => Object.values(eod.sold).reduce((s, v) => s + Number(v || 0), 0), [eod.sold])
  const eodTotalRemaining     = useMemo(() => Object.values(eod.remaining).reduce((s, v) => s + Number(v || 0), 0), [eod.remaining])
  const eodTotalReturned      = useMemo(() => Object.values(eod.returned).reduce((s, v) => s + Number(v || 0), 0), [eod.returned])
  const eodLineValidation = useMemo(
    () => selectedShipmentItems.map((item) => {
      const sold      = parseQuantityInput(eod.sold[item.product_id])
      const remaining = parseQuantityInput(eod.remaining[item.product_id])
      const returned  = parseQuantityInput(eod.returned[item.product_id])
      const total     = sold + remaining + returned
      return { product_id: item.product_id, quantity_sent: item.quantity_sent, total, valid: total === item.quantity_sent }
    }),
    [eod.remaining, eod.returned, eod.sold, selectedShipmentItems]
  )
  const eodLineValidationByProduct = useMemo(
    () => new Map(eodLineValidation.map((l) => [l.product_id, l])),
    [eodLineValidation]
  )
  const canSubmitEod = Boolean(selectedShipment) && eodLineValidation.every((l) => l.valid)

  // ── Handlers (unchanged) ──────────────────────────────────────────────────
  async function handleLogout() {
    const client = createClient()
    await client.auth.signOut()
    router.push("/login")
  }
  function openShipmentConfirmation(shipment: RecentShipment) {
    setSelectedShipmentForConfirm(shipment)
    setConfirmSignerName(shipment.manager_name ?? shipment.store_name)
    setConfirmSignature("")
  }
  function closeShipmentConfirmation() {
    setSelectedShipmentForConfirm(null)
    setConfirmSignerName("")
    setConfirmSignature("")
  }
  async function submitShipmentConfirmation() {
    if (!selectedShipmentForConfirm) return
    if (!confirmSignature) { setError("Signature is required to confirm the shipment."); return }
    setConfirmingShipment(true); setError(""); setNotice("")
    const response = await fetch("/api/delivery/shipments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipment_id:    selectedShipmentForConfirm.id,
        signer_name:    confirmSignerName.trim() || selectedShipmentForConfirm.manager_name || selectedShipmentForConfirm.store_name,
        signature_data: confirmSignature,
      }),
    })
    const result = await response.json()
    if (!response.ok) { setError(result.error ?? "Failed to confirm shipment."); setConfirmingShipment(false); return }
    setNotice("Shipment confirmed and signed.")
    setConfirmingShipment(false)
    closeShipmentConfirmation()
    await load()
    setActiveTab("shipments")
  }
  async function submitEod() {
    setError(""); setNotice("")
    if (!selectedShipment) { setError("Select a shipment for the EOD submission."); return }
    if (eodTotalSold + eodTotalRemaining + eodTotalReturned <= 0) { setError("Add at least one EOD quantity."); return }
    const invalidLine = eodLineValidation.find((l) => !l.valid)
    if (invalidLine) { setError(`For each product, sold + remaining + returned must equal ${invalidLine.quantity_sent}.`); return }
    setSubmittingEod(true)
    const response = await fetch("/api/delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "eod",
        shipment_id:     selectedShipment.id,
        store_id:        selectedShipment.store_id,
        submission_date: selectedShipment.shipment_date,
        items: selectedShipment.items.map((item) => ({
          product_id:         item.product_id,
          quantity_sold:      parseQuantityInput(eod.sold[item.product_id]),
          quantity_remaining: parseQuantityInput(eod.remaining[item.product_id]),
          quantity_returned:  parseQuantityInput(eod.returned[item.product_id]),
        })),
      }),
    })
    const result = await response.json()
    if (!response.ok) { setError(result.error ?? "Failed to save EOD submission."); setSubmittingEod(false); return }
    setNotice("End-of-day submission saved.")
    const nextShipment = getLatestUndeliveredShipment(
      data.recent_shipments.filter((s) => s.id !== selectedShipment.id),
      submittedShipmentIds
    )
    setEod({
      shipment_id:     nextShipment?.id ?? "",
      store_id:        nextShipment?.store_id ?? "",
      submission_date: nextShipment?.shipment_date ?? today,
      sold:      nextShipment ? emptyShipmentQuantities(nextShipment.items) : {},
      remaining: nextShipment ? emptyShipmentQuantities(nextShipment.items) : {},
      returned:  nextShipment ? emptyShipmentQuantities(nextShipment.items) : {},
    })
    setSubmittingEod(false)
    await load()
    setActiveTab("activity")
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Fish className="w-8 h-8 text-gray-300 animate-pulse" />
          <p className="text-sm text-gray-400">Loading delivery tools…</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: "shipments" as const, label: "Shipments",      icon: Truck },
    { id: "eod"       as const, label: "EOD Submission", icon: UtensilsCrossed },
    { id: "activity"  as const, label: "Activity",       icon: Clock3 },
  ]

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <Truck className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="leading-tight">
              <span className="text-sm font-semibold text-gray-900">SushiTrack</span>
              <span className="hidden md:inline text-xs text-gray-300 ml-1">/ Delivery</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <button onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-5 space-y-5">

        {/* ── Banners ── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700">{notice}</p>
            <button onClick={() => setNotice("")} className="ml-auto text-emerald-400 hover:text-emerald-600"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Today"       value={todayDeliveriesCount}   sub="Scheduled"          icon={Truck}        accent />
          <StatCard label="Unconfirmed" value={todayLeftToDeliverCount} sub="Awaiting sign-off"  icon={Clock3} />
          <StatCard label="Pending EOD" value={pendingShipments.length} sub="Ready to submit"    icon={CheckCircle2} alert />
        </div>

        {/* ── Tab container ── */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-gray-100 px-2 pt-2 gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-t-xl border-b-2 -mb-px transition-all
                  ${activeTab === id
                    ? "text-gray-900 border-gray-900 bg-gray-50"
                    : "text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50"}`}>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">

            {/* ════════════════════════════════════════════════════════════════
                TAB 1 — SHIPMENTS
            ════════════════════════════════════════════════════════════════ */}
            {activeTab === "shipments" && (
              <div className="space-y-4">

                {/* Section title + badges */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Shipment Report</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Route plan, status and store sign-off</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100 text-gray-500 font-medium">
                      {filteredShipments.length} shown
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100 text-gray-500 font-medium">
                      {shipmentUnitTotal} units
                    </span>
                  </div>
                </div>

                {/* Filters */}
                <div className="grid gap-2 md:grid-cols-[1fr_140px_140px_140px_auto] bg-gray-50 border border-gray-100 rounded-2xl p-3">
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Store</p>
                    <select value={shipmentStoreFilter}
                      onChange={(e) => { setShipmentStoreFilter(e.target.value); setExpandedShipment(null) }}
                      className="w-full text-xs bg-white border border-gray-100 rounded-xl px-3 py-2 outline-none focus:border-gray-300 transition-colors text-gray-700">
                      <option value="">All stores</option>
                      {data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.location ? ` - ${s.location}` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">From</p>
                    <input type="date" value={shipmentDateFromFilter}
                      onChange={(e) => { setShipmentDateFromFilter(e.target.value); setExpandedShipment(null) }}
                      className="w-full text-xs bg-white border border-gray-100 rounded-xl px-3 py-2 outline-none focus:border-gray-300 transition-colors text-gray-700" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">To</p>
                    <input type="date" value={shipmentDateToFilter}
                      onChange={(e) => { setShipmentDateToFilter(e.target.value); setExpandedShipment(null) }}
                      className="w-full text-xs bg-white border border-gray-100 rounded-xl px-3 py-2 outline-none focus:border-gray-300 transition-colors text-gray-700" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Status</p>
                    <select value={shipmentStatusFilter}
                      onChange={(e) => { setShipmentStatusFilter(e.target.value); setExpandedShipment(null) }}
                      className="w-full text-xs bg-white border border-gray-100 rounded-xl px-3 py-2 outline-none focus:border-gray-300 transition-colors text-gray-700">
                      <option value="">All</option>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={() => { setShipmentStoreFilter(""); setShipmentDateFromFilter(""); setShipmentDateToFilter(""); setShipmentStatusFilter(""); setExpandedShipment(null) }}
                      className="w-full text-xs px-3 py-2 bg-white border border-gray-100 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors font-medium">
                      Clear
                    </button>
                  </div>
                </div>

                {/* Shipments list */}
                <div className="border border-gray-100 rounded-2xl overflow-hidden">
                  {/* Desktop header */}
                  <div className="hidden md:grid grid-cols-[140px_1fr_110px_90px_32px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium uppercase tracking-wide text-gray-400">
                    <span>Shipment</span><span>Store</span><span>Status</span><span>Units</span><span />
                  </div>

                  {filteredShipments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-2">
                      <Truck className="w-8 h-8 text-gray-200" />
                      <p className="text-sm text-gray-400">No shipments match the filters</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {filteredShipments.map((shipment) => {
                        const expanded = expandedShipment === shipment.id
                        return (
                          <div key={shipment.id}>
                            <button
                              onClick={() => setExpandedShipment((c) => c === shipment.id ? null : shipment.id)}
                              className="w-full grid gap-3 md:grid-cols-[140px_1fr_110px_90px_32px] md:items-center px-4 py-3.5 text-left hover:bg-gray-50/60 transition-colors">
                              <div>
                                <p className="text-xs font-semibold text-gray-900">{shipment.shipment_code}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{shipment.shipment_date}</p>
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-800">{shipment.store_name}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{shipment.total_units} units total</p>
                              </div>
                              <div><StatusBadge status={shipment.status} /></div>
                              <p className="text-sm font-semibold text-gray-900 tabular-nums">{shipment.total_units}</p>
                              <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`} />
                            </button>

                            {expanded && (
                              <div className="border-t border-gray-50 bg-gray-50/60 px-4 py-4">
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 mb-3">
                                  {shipment.items.map((item, idx) => (
                                    <div key={`${shipment.id}-${item.sku}-${idx}`}
                                      className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-100 px-3 py-2.5">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-gray-800">{item.product_name}</p>
                                        <p className="text-xs text-gray-400">{item.sku}</p>
                                      </div>
                                      <span className="text-sm font-bold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg tabular-nums">{item.quantity_sent}</span>
                                    </div>
                                  ))}
                                </div>

                                {shipment.status === "confirmed" ? (
                                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-700">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
                                  </div>
                                ) : (
                                  <button onClick={() => openShipmentConfirmation(shipment)}
                                    className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-gray-700 transition-colors">
                                    <PenLine className="w-3.5 h-3.5" /> Sign & Confirm
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                TAB 2 — EOD SUBMISSION
            ════════════════════════════════════════════════════════════════ */}
            {activeTab === "eod" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">End-of-Day Submission</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Fast entry for sold, remaining and returned units</p>
                </div>

                <div className="grid gap-4 xl:grid-cols-[300px_1fr]">

                  {/* ── Sidebar ── */}
                  <div className="space-y-3">
                    {/* Shipment selector */}
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Select Shipment</p>
                        <select value={eod.shipment_id}
                          onChange={(e) => {
                            const s = pendingShipments.find((r) => r.id === e.target.value) ?? null
                            setEod({
                              shipment_id:     s?.id ?? "",
                              store_id:        s?.store_id ?? "",
                              submission_date: s?.shipment_date ?? today,
                              sold:      s ? emptyShipmentQuantities(s.items) : {},
                              remaining: s ? emptyShipmentQuantities(s.items) : {},
                              returned:  s ? emptyShipmentQuantities(s.items) : {},
                            })
                          }}
                          className="w-full text-xs bg-white border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 transition-colors text-gray-700">
                          <option value="">Select a shipment…</option>
                          {pendingShipments.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.shipment_code} · {s.store_name} · {s.shipment_date}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Store + date info */}
                      <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide">Store</p>
                          <p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedShipment?.store_name ?? "—"}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Date</p>
                            <p className="text-xs font-medium text-gray-700 mt-0.5">{selectedShipment?.shipment_date ?? today}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Reported</p>
                            <p className="text-xs font-medium text-gray-700 mt-0.5">{eodTotalSold + eodTotalRemaining + eodTotalReturned} units</p>
                          </div>
                        </div>
                      </div>

                      {/* Running totals */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Sold",   value: eodTotalSold,      color: "text-gray-900" },
                          { label: "Left",   value: eodTotalRemaining, color: "text-amber-600" },
                          { label: "Return", value: eodTotalReturned,  color: "text-blue-600" },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-white border border-gray-100 rounded-xl p-2 text-center">
                            <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
                            <p className={`text-lg font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── Line items ── */}
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">Line Items</p>
                      <p className="text-xs text-gray-400">{selectedShipmentItems.length} products</p>
                    </div>

                    <div className="divide-y divide-gray-50">
                      {selectedShipmentItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2">
                          <UtensilsCrossed className="w-8 h-8 text-gray-200" />
                          <p className="text-sm text-gray-400">Select a shipment to load products</p>
                        </div>
                      ) : (
                        selectedShipmentItems.map((item) => {
                          const line      = eodLineValidationByProduct.get(item.product_id)
                          const isInvalid = line ? !line.valid : false
                          const isFilled  = line ? line.total > 0 : false
                          return (
                            <div key={item.product_id}
                              className={`grid gap-3 px-4 py-3 lg:grid-cols-[1fr_88px_88px_88px] lg:items-start
                                ${isInvalid && isFilled ? "bg-red-50/40" : ""}`}>
                              <div className="min-w-0">
                                <div className="flex items-start justify-between gap-3 lg:block">
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
                                    <p className="text-xs text-gray-400">{item.sku}</p>
                                  </div>
                                  <span className="text-xs text-gray-400 shrink-0 lg:mt-1">{item.quantity_sent} sent</span>
                                </div>
                                {line && isFilled && (
                                  <p className={`text-xs font-medium mt-1 ${line.valid ? "text-emerald-600" : "text-red-500"}`}>
                                    {line.valid
                                      ? "✓ Matches quantity"
                                      : line.total < line.quantity_sent
                                        ? `${line.quantity_sent - line.total} more needed`
                                        : `${line.total - line.quantity_sent} over limit`}
                                  </p>
                                )}
                              </div>

                              {(["sold", "remaining", "returned"] as const).map((field) => (
                                <div key={field}>
                                  <p className="text-xs font-medium text-gray-400 mb-1 capitalize">{field}</p>
                                  <input
                                    type="text" inputMode="numeric" pattern="[0-9]*"
                                    value={eod[field][item.product_id] ?? ""}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/[^0-9]/g, "")
                                      setEod((c) => ({ ...c, [field]: { ...c[field], [item.product_id]: v } }))
                                    }}
                                    className={`w-full text-sm font-semibold rounded-xl border px-3 py-2 outline-none transition-all text-center
                                      ${isInvalid && isFilled
                                        ? "border-red-300 bg-red-50 focus:border-red-400 text-red-700"
                                        : "border-gray-100 bg-gray-50 focus:border-gray-300 focus:bg-white text-gray-900"}`}
                                  />
                                </div>
                              ))}
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Submit footer */}
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
                      <p className="text-xs text-gray-400">
                        {canSubmitEod
                          ? "✓ All lines match — ready to submit"
                          : "Fix red lines before submitting"}
                      </p>
                      <button onClick={submitEod} disabled={submittingEod || !canSubmitEod}
                        className="flex items-center gap-2 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                        {submittingEod ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Submit EOD
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                TAB 3 — ACTIVITY
            ════════════════════════════════════════════════════════════════ */}
            {activeTab === "activity" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Latest shipment movement and EOD submissions</p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {/* Shipment feed */}
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-gray-400" />
                        <h3 className="text-sm font-semibold text-gray-900">Shipment Feed</h3>
                      </div>
                      <span className="text-xs text-gray-400">{data.recent_shipments.length} records</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {data.recent_shipments.length === 0 ? (
                        <p className="text-sm text-gray-400 p-6">No shipments yet.</p>
                      ) : (
                        data.recent_shipments.map((row) => (
                          <div key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0
                              ${row.status === "confirmed" ? "bg-emerald-400" : "bg-amber-400"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-medium text-gray-800">{row.store_name}</p>
                                <StatusBadge status={row.status} />
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{row.shipment_date} · {row.total_units} units</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* EOD feed */}
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-gray-400" />
                        <h3 className="text-sm font-semibold text-gray-900">EOD Feed</h3>
                      </div>
                      <span className="text-xs text-gray-400">{data.recent_submissions.length} records</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {data.recent_submissions.length === 0 ? (
                        <p className="text-sm text-gray-400 p-6">No submissions yet.</p>
                      ) : (
                        data.recent_submissions.map((row) => (
                          <div key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                            <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-medium text-gray-800">{row.store_name}</p>
                                <StatusBadge status={row.status} />
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{row.submission_date}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ════════════════════════════════════════════════════════════════════════
          SIGNATURE MODAL (Confirm Shipment)
      ════════════════════════════════════════════════════════════════════════ */}
      {selectedShipmentForConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeShipmentConfirmation} />
          <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest">Store sign-off</p>
                <h3 className="text-base font-semibold text-gray-900 mt-0.5">{selectedShipmentForConfirm.store_name}</h3>
              </div>
              <button onClick={closeShipmentConfirmation}
                className="p-2 rounded-xl border border-gray-100 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4 lg:grid lg:grid-cols-[1fr_1.2fr] lg:gap-5 lg:space-y-0">

                {/* Left: shipment info */}
                <div className="space-y-3">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-2">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Shipment</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedShipmentForConfirm.shipment_date}</p>
                    <p className="text-xs text-gray-500">{selectedShipmentForConfirm.total_units} units · {selectedShipmentForConfirm.manager_name ?? "Store manager"}</p>
                  </div>

                  <div className="hidden lg:block bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Items</p>
                    <div className="space-y-2">
                      {selectedShipmentForConfirm.items.map((item) => (
                        <div key={item.product_id}
                          className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
                            <p className="text-xs text-gray-400">{item.sku}</p>
                          </div>
                          <span className="text-sm font-bold text-gray-900 tabular-nums">{item.quantity_sent}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: signer + signature */}
                <div className="space-y-3">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Signer name</p>
                    <input value={confirmSignerName}
                      onChange={(e) => setConfirmSignerName(e.target.value)}
                      placeholder="Store manager name"
                      className="w-full text-sm bg-white border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-gray-300 transition-all" />
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-gray-900">Signature</p>
                      <p className="text-xs text-gray-400">Use finger or mouse</p>
                    </div>
                    <SignaturePad
                      value={confirmSignature}
                      onChange={setConfirmSignature}
                      onCancel={closeShipmentConfirmation}
                      onConfirm={submitShipmentConfirmation}
                      confirmDisabled={confirmingShipment || selectedShipmentForConfirm.status === "confirmed"}
                    />
                  </div>

                  {selectedShipmentForConfirm.status === "confirmed" && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" /> This shipment is already confirmed.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
