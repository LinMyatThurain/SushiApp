'use client'

// app/(admin)/dashboard/page.tsx
// Full redesign — all business logic, state, types & API calls preserved exactly.
// Only UI/JSX has changed. ShadCN Card/Button/Badge imports removed (no longer needed).

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AlertCircle, BarChart3, Fish, Package, Plus, RefreshCw,
  Store, Truck, Users, ChevronRight, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Sparkles, Clock, CheckCircle2, X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Types (unchanged) ───────────────────────────────────────────────────────
type Stats = {
  totalStores: number; totalProducts: number; totalShipments: number
  pendingShipments: number; confirmedShipments: number; completedShipments: number
  pendingEod: number; todayShipments: number
  totalUsers: number; adminUsers: number; deliveryUsers: number
}
type RecentShipment = {
  id: string; shipment_code: string; store_name: string
  status: 'pending' | 'confirmed'; shipment_date: string; created_at: string
  confirmed_at: string | null; signer_name: string | null; signature_data: string | null
}
type TopProduct = { product_name: string; total_sold: number; sku: string }
type Recommendation = {
  store_id: string; product_id: string; store_name: string
  product_name: string; sku: string; source: 'live' | 'demo'
  action: 'increase' | 'decrease'; current_avg_sent: number
  target_units: number; delta_units: number; avg_sold: number
  avg_remaining: number; return_rate: number
  confidence: 'high' | 'medium' | 'low'; reason: string
  impact_label: string; sell_through: number; data_days: number
}
type SuggestionPlan = {
  store_id: string; store_name: string; source: 'live' | 'demo'
  note: string; items: Recommendation[]
}
type ProfileRow        = { email: string | null }
type ShipmentSummaryRow = { id: string; shipment_code: string; status: 'pending' | 'confirmed'; shipment_date: string; created_at: string; stores: { name: string | null } | null }
type PendingEodShipmentRow = { id: string; status: 'pending' | 'confirmed' }
type ProductRankRow    = { quantity_sold: number | null; sushi_products: { product_name: string | null; sku: string | null } | null }
type RecommendationRow = { store_id: string | null; product_id: string | null; store_name: string | null; product_name: string | null; sku: string | null; quantity_sent: number | null; quantity_sold: number | null; quantity_remaining: number | null; quantity_returned: number | null; submission_date: string | null }
type ActiveStoreRow    = { id: string; name: string }
type ActiveProductRow  = { id: string; product_name: string; sku: string | null }
type UserRow           = { id: string; role: string | null; store_id: string | null }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border capitalize
      ${map[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status}
    </span>
  )
}

function confidenceStyles(confidence: Recommendation['confidence']) {
  const map: Record<Recommendation['confidence'], string> = {
    high: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    medium: 'bg-blue-100 text-blue-700 border-blue-200',
    low: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  return map[confidence]
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function buildRecommendationInsight(input: {
  action: 'increase' | 'decrease'
  deltaUnits: number
  avgSold: number
  avgSent: number
  avgRemaining: number
  returnRate: number
  sellThrough: number
  days: number
}) {
  const { action, deltaUnits, avgSold, avgSent, avgRemaining, returnRate, sellThrough, days } = input

  const confidence: Recommendation['confidence'] =
    days >= 5 && (deltaUnits >= 3 || sellThrough >= 0.95 || returnRate >= 0.15)
      ? 'high'
      : days >= 3 || deltaUnits >= 2
        ? 'medium'
        : 'low'

  if (action === 'increase') {
    return {
      confidence,
      reason:
        avgRemaining <= 1
          ? `Selling through ${formatPercent(sellThrough)} with low leftovers.`
          : `Average sold ${Math.round(avgSold)} is close to average sent ${Math.round(avgSent)}.`,
      impact_label: 'Reduces stockout risk',
    }
  }

  return {
    confidence,
    reason:
      returnRate >= 0.15
        ? `Return rate is ${formatPercent(returnRate)}, above the 15% waste threshold.`
        : `Average leftover is ${Math.round(avgRemaining)} units after sales.`,
    impact_label: 'Reduces waste risk',
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, accent = false, alert = false }: {
  label: string; value: number | string; sub: string
  icon: React.ElementType; accent?: boolean; alert?: boolean
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 border transition-all hover:shadow-md
      ${accent ? 'bg-gray-900 border-gray-800' : alert && Number(value) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-medium tracking-wide uppercase mb-1
            ${accent ? 'text-gray-400' : alert && Number(value) > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{label}</p>
          <p className={`text-3xl font-bold tabular-nums
            ${accent ? 'text-white' : alert && Number(value) > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
          <p className={`text-xs mt-1
            ${accent ? 'text-gray-400' : alert && Number(value) > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{sub}</p>
        </div>
        <div className={`p-2.5 rounded-xl ${accent ? 'bg-gray-800' : alert && Number(value) > 0 ? 'bg-amber-100' : 'bg-gray-50'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-gray-300' : alert && Number(value) > 0 ? 'text-amber-500' : 'text-gray-400'}`} />
        </div>
      </div>
    </div>
  )
}

// ─── Suggestion Card ──────────────────────────────────────────────────────────
function SuggestionCard({ plan, onDismiss }: { plan: SuggestionPlan; onDismiss: (id: string) => void }) {
  const increases = plan.items.filter(i => i.action === 'increase')
  const decreases = plan.items.filter(i => i.action === 'decrease')
  const totalTargetUnits = plan.items.reduce((sum, item) => sum + item.target_units, 0)
  const netChange = plan.items.reduce((sum, item) => sum + (item.action === 'increase' ? item.delta_units : -item.delta_units), 0)
  const highConfidence = plan.items.filter(item => item.confidence === 'high').length

  function buildPrefillHref() {
    const payload = {
      storeId: plan.store_id, storeName: plan.store_name,
      note: plan.source === 'demo'
        ? `Demo prefill for ${plan.store_name}. Review and edit before sending.`
        : `Prefilled from dashboard recommendation for ${plan.store_name}. Review before sending.`,
      items: plan.items.map(item => ({ productId: item.product_id, quantity: item.target_units })),
    }
    return `/admin/shipments/create?prefill=${encodeURIComponent(JSON.stringify(payload))}`
  }

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all hover:shadow-md
      ${plan.source === 'demo' ? 'border-dashed border-gray-200' : 'border-gray-100'}`}>

      {/* Source label */}
      <div className={`flex items-center gap-1.5 px-4 py-2 border-b
        ${plan.source === 'demo'
          ? 'bg-purple-50 border-purple-100'
          : 'bg-emerald-50 border-emerald-100'}`}>
        <Sparkles className={`w-3 h-3 ${plan.source === 'demo' ? 'text-purple-400' : 'text-emerald-500'}`} />
        <span className={`text-xs font-medium ${plan.source === 'demo' ? 'text-purple-600' : 'text-emerald-700'}`}>
          {plan.source === 'demo' ? 'Demo · ship first to get live data' : 'Live · based on 21-day avg'}
        </span>
      </div>

      <div className="p-4">
        {/* Store header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center shrink-0">
              <Store className="w-3.5 h-3.5 text-white" />
            </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{plan.store_name}</p>
            <p className="text-xs text-gray-400">{plan.items.length} suggestion{plan.items.length !== 1 ? 's' : ''}</p>
          </div>
          </div>
          <button onClick={() => onDismiss(plan.store_id)}
            className="p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase text-gray-400">Target</p>
            <p className="text-sm font-bold text-gray-900 tabular-nums">{totalTargetUnits}</p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase text-gray-400">Net</p>
            <p className={`text-sm font-bold tabular-nums ${netChange >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {netChange >= 0 ? '+' : ''}{netChange}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase text-gray-400">High conf.</p>
            <p className="text-sm font-bold text-gray-900 tabular-nums">{highConfidence}</p>
          </div>
        </div>

        {/* Increase items */}
        {increases.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-medium text-emerald-600 flex items-center gap-1 mb-1.5">
              <TrendingUp className="w-3 h-3" /> Send more
            </p>
            <div className="space-y-1.5">
              {increases.map(item => (
                <div key={item.product_id}
                  className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <p className="text-xs font-medium text-gray-800">{item.product_name}</p>
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${confidenceStyles(item.confidence)}`}>
                        {item.confidence}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                    <p className="mt-1 text-[11px] leading-snug text-gray-500">{item.reason}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase text-emerald-700">{item.impact_label}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-xs text-gray-400 tabular-nums">{item.current_avg_sent}</span>
                      <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                      <span className="text-xs font-bold text-emerald-700 tabular-nums">{item.target_units}</span>
                    </div>
                    <p className="text-xs text-gray-400">+{item.delta_units} units</p>
                    <p className="text-[10px] text-gray-400 mt-1">sold {item.avg_sold} / left {item.avg_remaining}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Decrease items */}
        {decreases.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-red-500 flex items-center gap-1 mb-1.5">
              <TrendingDown className="w-3 h-3" /> Send less
            </p>
            <div className="space-y-1.5">
              {decreases.map(item => (
                <div key={item.product_id}
                  className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <p className="text-xs font-medium text-gray-800">{item.product_name}</p>
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${confidenceStyles(item.confidence)}`}>
                        {item.confidence}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                    <p className="mt-1 text-[11px] leading-snug text-gray-500">{item.reason}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase text-red-600">{item.impact_label}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-xs text-gray-400 tabular-nums">{item.current_avg_sent}</span>
                      <ArrowDownRight className="w-3 h-3 text-red-400" />
                      <span className="text-xs font-bold text-red-600 tabular-nums">{item.target_units}</span>
                    </div>
                    <p className="text-xs text-gray-400">−{item.delta_units} units</p>
                    <p className="text-[10px] text-gray-400 mt-1">return {formatPercent(item.return_rate)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <Link href={buildPrefillHref()}
          className="flex items-center justify-center gap-1.5 w-full bg-gray-900 text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-gray-700 transition-colors mt-2">
          <Truck className="w-3.5 h-3.5" /> Use this plan
        </Link>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const supabase = createClient()
  const router   = useRouter()
  const today    = formatLocalDate(new Date())

  const [stats, setStats]                     = useState<Stats | null>(null)
  const [recentShipments, setRecentShipments] = useState<RecentShipment[]>([])
  const [topProducts, setTopProducts]         = useState<TopProduct[]>([])
  const [suggestionPlans, setSuggestionPlans] = useState<SuggestionPlan[]>([])
  const [dismissedStores, setDismissedStores] = useState<Set<string>>(new Set())
  const [userName, setUserName]               = useState('')
  const [loading, setLoading]                 = useState(true)
  const [refreshing, setRefreshing]           = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [
      { data: profile },
      { count: totalStores },
      { count: totalProducts },
      { count: totalShipments },
      { count: todayShipments },
      { data: allShipmentRows },
      { data: allSubmissionRows },
      { data: recentData },
      { data: confirmationData },
      { data: topData },
      { data: userData },
      { data: recommendationData },
      { data: activeStoreData },
      { data: activeProductData },
    ] = await Promise.all([
      supabase.from('users').select('email').eq('id', user.id).single(),
      supabase.from('stores').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('sushi_products').select('*', { count: 'exact', head: true }).eq('active_status', true),
      supabase.from('daily_shipments').select('*', { count: 'exact', head: true }),
      supabase.from('daily_shipments').select('*', { count: 'exact', head: true }).eq('shipment_date', today),
      supabase.from('daily_shipments').select('id, status'),
      supabase.from('end_of_day_submissions').select('shipment_id'),
      supabase.from('daily_shipments').select('id, shipment_code, status, shipment_date, created_at, stores(name)').order('created_at', { ascending: false }).limit(6),
      supabase.from('inventory_confirmations').select('shipment_id, confirmed_at, signer_name, signature_data').order('confirmed_at', { ascending: false }),
      supabase.from('end_of_day_items').select('quantity_sold, sushi_products(product_name, sku)').order('quantity_sold', { ascending: false }).limit(20),
      supabase.from('users').select('id, role, store_id'),
      supabase.from('v_daily_sales').select('*').gte('submission_date', formatLocalDate(new Date(Date.now() - 1000 * 60 * 60 * 24 * 21))),
      supabase.from('stores').select('id, name').eq('status', 'active'),
      supabase.from('sushi_products').select('id, product_name, sku').eq('active_status', true),
    ])

    const typedProfile           = profile as ProfileRow | null
    const typedUsers             = (userData ?? []) as UserRow[]
    const typedRecentData        = (recentData ?? []) as ShipmentSummaryRow[]
    const typedConfirmations     = (confirmationData ?? []) as Array<{ shipment_id: string | null; confirmed_at: string | null; signer_name: string | null; signature_data: string | null }>
    const typedAllShipmentRows   = (allShipmentRows ?? []) as PendingEodShipmentRow[]
    const typedAllSubmissionRows = (allSubmissionRows ?? []) as Array<{ shipment_id: string | null }>
    const typedTopData           = (topData ?? []) as ProductRankRow[]
    const typedRecommendationData = (recommendationData ?? []) as RecommendationRow[]
    const typedActiveStoreData   = (activeStoreData ?? []) as ActiveStoreRow[]
    const typedActiveProductData = (activeProductData ?? []) as ActiveProductRow[]

    setUserName(typedProfile?.email ?? 'Admin')

    const totalUsers    = typedUsers.length
    const adminUsers    = typedUsers.filter(r => r.role === 'admin').length
    const deliveryUsers = typedUsers.filter(r => r.role === 'delivery').length
    const submittedIds  = new Set(typedAllSubmissionRows.map(r => r.shipment_id).filter((id): id is string => Boolean(id)))
    const pendingEod         = typedAllShipmentRows.filter(r => r.status === 'confirmed' && !submittedIds.has(r.id)).length
    const completedShipments = typedAllShipmentRows.filter(r => r.status === 'confirmed' && submittedIds.has(r.id)).length
    const confirmedShipments = typedAllShipmentRows.filter(r => r.status === 'confirmed' && !submittedIds.has(r.id)).length
    const pendingShipments   = typedAllShipmentRows.filter(r => r.status === 'pending').length
    const confirmationMap    = new Map(
      typedConfirmations
        .filter((r): r is { shipment_id: string; confirmed_at: string | null; signer_name: string | null; signature_data: string | null } => Boolean(r.shipment_id))
        .map(r => [r.shipment_id, r])
    )

    setStats({ totalStores: totalStores ?? 0, totalProducts: totalProducts ?? 0, totalShipments: totalShipments ?? 0, pendingShipments, confirmedShipments, completedShipments, todayShipments: todayShipments ?? 0, pendingEod, totalUsers, adminUsers, deliveryUsers })

    setRecentShipments(typedRecentData.map(s => ({
      id: s.id, shipment_code: s.shipment_code, store_name: s.stores?.name ?? '—',
      status: s.status === 'pending' ? 'pending' : 'confirmed',
      shipment_date: s.shipment_date, created_at: s.created_at,
      confirmed_at:   confirmationMap.get(s.id)?.confirmed_at   ?? null,
      signer_name:    confirmationMap.get(s.id)?.signer_name    ?? null,
      signature_data: confirmationMap.get(s.id)?.signature_data ?? null,
    })))

    // Top products
    const productMap: Record<string, { name: string; sku: string; total: number }> = {}
    typedTopData.forEach(item => {
      const key = item.sushi_products?.sku ?? item.sushi_products?.product_name ?? 'unknown'
      if (!productMap[key]) productMap[key] = { name: item.sushi_products?.product_name ?? '—', sku: item.sushi_products?.sku ?? '—', total: 0 }
      productMap[key].total += item.quantity_sold ?? 0
    })
    setTopProducts(Object.values(productMap).sort((a, b) => b.total - a.total).slice(0, 5).map(p => ({ product_name: p.name, sku: p.sku, total_sold: p.total })))

    // Recommendations engine (unchanged)
    const recMap: Record<string, { store_id: string; product_id: string; store_name: string; product_name: string; sku: string; sent: number; sold: number; remaining: number; returned: number; days: Set<string> }> = {}
    typedRecommendationData.forEach(row => {
      if (!row.store_name || !row.product_name || !row.store_id || !row.product_id) return
      const key = `${row.store_id}::${row.product_id}`
      if (!recMap[key]) recMap[key] = { store_id: row.store_id, product_id: row.product_id, store_name: row.store_name, product_name: row.product_name, sku: row.sku ?? '—', sent: 0, sold: 0, remaining: 0, returned: 0, days: new Set() }
      recMap[key].sent      += row.quantity_sent      ?? 0
      recMap[key].sold      += row.quantity_sold      ?? 0
      recMap[key].remaining += row.quantity_remaining ?? 0
      recMap[key].returned  += row.quantity_returned  ?? 0
      if (row.submission_date) recMap[key].days.add(row.submission_date)
    })

    const liveRecs = (Object.values(recMap).map(entry => {
      const days = Math.max(1, entry.days.size)
      const avgSent = entry.sent / days, avgSold = entry.sold / days
      const avgRemaining = entry.remaining / days
      const returnRate = entry.sent > 0 ? entry.returned / entry.sent : 0
      const sellThrough = entry.sent > 0 ? entry.sold / entry.sent : 0
      const targetUnits = Math.max(0, Math.round(avgSold * 1.1))
      const deltaUnits = targetUnits - Math.round(avgSent)
      if (Math.abs(deltaUnits) < 2) return null
      if (returnRate > 0.15 || avgRemaining >= 3 || avgSold < avgSent * 0.65) {
        const insight = buildRecommendationInsight({
          action: 'decrease',
          deltaUnits: Math.abs(deltaUnits),
          avgSold,
          avgSent,
          avgRemaining,
          returnRate,
          sellThrough,
          days,
        })
        return { store_id: entry.store_id, product_id: entry.product_id, store_name: entry.store_name, product_name: entry.product_name, sku: entry.sku, source: 'live' as const, action: 'decrease' as const, current_avg_sent: Math.round(avgSent), target_units: targetUnits, delta_units: Math.abs(deltaUnits), avg_sold: Math.round(avgSold), avg_remaining: Math.round(avgRemaining), return_rate: returnRate, sell_through: sellThrough, data_days: days, ...insight }
      }
      if (avgSent > 0 && avgSold >= avgSent * 0.95 && avgRemaining <= 1 && returnRate < 0.08 && deltaUnits > 0) {
        const insight = buildRecommendationInsight({
          action: 'increase',
          deltaUnits,
          avgSold,
          avgSent,
          avgRemaining,
          returnRate,
          sellThrough,
          days,
        })
        return { store_id: entry.store_id, product_id: entry.product_id, store_name: entry.store_name, product_name: entry.product_name, sku: entry.sku, source: 'live' as const, action: 'increase' as const, current_avg_sent: Math.round(avgSent), target_units: targetUnits, delta_units: deltaUnits, avg_sold: Math.round(avgSold), avg_remaining: Math.round(avgRemaining), return_rate: returnRate, sell_through: sellThrough, data_days: days, ...insight }
      }
      return null
    }).filter(Boolean) as Recommendation[]).sort((a, b) => b.delta_units - a.delta_units).slice(0, 8)

    const demoRecs: Recommendation[] =
      liveRecs.length === 0 && typedActiveStoreData.length > 0 && typedActiveProductData.length > 0
        ? typedActiveProductData.slice(0, 4).map((product, i) => {
            const action = i < 2 ? 'increase' as const : 'decrease' as const
            const currentAvgSent = [8, 10, 14, 12][i] ?? 10
            const targetUnits = [12, 13, 9, 8][i] ?? 10
            const avgSold = [11, 12, 8, 7][i] ?? 8
            const avgRemaining = [1, 1, 4, 3][i] ?? 2
            const returnRate = [0.03, 0.04, 0.19, 0.16][i] ?? 0.05
            const sellThrough = currentAvgSent > 0 ? avgSold / currentAvgSent : 0
            const deltaUnits = Math.abs(targetUnits - currentAvgSent)
            const insight = buildRecommendationInsight({
              action,
              deltaUnits,
              avgSold,
              avgSent: currentAvgSent,
              avgRemaining,
              returnRate,
              sellThrough,
              days: 4,
            })
            return {
              store_id: typedActiveStoreData[0].id, product_id: product.id,
              store_name: typedActiveStoreData[0].name, product_name: product.product_name,
              sku: product.sku ?? '—', source: 'demo' as const,
              action,
              current_avg_sent: currentAvgSent, target_units: targetUnits,
              delta_units: deltaUnits,
              avg_sold: avgSold, avg_remaining: avgRemaining,
              return_rate: returnRate, sell_through: sellThrough, data_days: 4,
              ...insight,
            }
          })
        : []

    // Group by store into plans
    const allRecs = liveRecs.length > 0 ? liveRecs : demoRecs
    const planMap: Record<string, SuggestionPlan> = {}
    allRecs.forEach(rec => {
      if (!planMap[rec.store_id]) planMap[rec.store_id] = { store_id: rec.store_id, store_name: rec.store_name, source: rec.source, note: '', items: [] }
      planMap[rec.store_id].items.push(rec)
    })
    setSuggestionPlans(Object.values(planMap))

    setLoading(false)
    setRefreshing(false)
  }, [router, supabase, today])

  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  async function handleLogout() { await supabase.auth.signOut(); router.push('/login') }

  const completionPercent = stats
    ? Math.round(((stats.completedShipments ?? 0) / Math.max(1, stats.totalShipments)) * 100)
    : 0
  const visiblePlans = suggestionPlans.filter(p => !dismissedStores.has(p.store_id))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Fish className="w-8 h-8 text-gray-200 animate-pulse" />
          <p className="text-sm text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <Fish className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900">SushiTrack</span>
            <span className="hidden md:inline text-xs text-gray-300 ml-1">/ Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={refreshing}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-sm text-gray-500 hidden md:block">{userName}</span>
            <button onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* ── Greeting ── */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-gray-400">{greeting()},</p>
            <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <Link href="/admin/shipments/create"
            className="flex items-center gap-1.5 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-700 transition-colors">
            <Plus className="w-4 h-4" /> New Shipment
          </Link>
        </div>

        {/* ── Alert Banner ── */}
        {(stats?.pendingEod ?? 0) > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700">
              <span className="font-semibold">{stats?.pendingEod} store{(stats?.pendingEod ?? 0) > 1 ? 's' : ''}</span>
              {' '}have not confirmed today&apos;s shipment yet.
            </p>
            <Link href="/admin/shipments" className="ml-auto text-xs font-medium text-amber-700 underline underline-offset-2 shrink-0">
              View
            </Link>
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Stores"      value={stats?.totalStores ?? 0}    sub="Active locations"    icon={Store}  accent />
          <StatCard label="Products"    value={stats?.totalProducts ?? 0}  sub="Sushi varieties"     icon={Fish} />
          <StatCard label="Today"       value={stats?.todayShipments ?? 0} sub="Shipments sent"      icon={Truck} />
          <StatCard label="Pending EOD" value={stats?.pendingEod ?? 0}     sub="Awaiting submission" icon={Clock} alert />
        </div>

        {/* ── Shipment Progress ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Today&apos;s Shipment Status</h2>
            <span className="text-xs text-gray-400">{today}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Pending',   value: stats?.pendingShipments,   cls: 'bg-amber-50 text-amber-700',   icon: Clock },
              { label: 'Confirmed', value: stats?.confirmedShipments, cls: 'bg-blue-50 text-blue-700',     icon: CheckCircle2 },
              { label: 'Completed', value: stats?.completedShipments, cls: 'bg-emerald-50 text-emerald-700', icon: TrendingUp },
            ].map(({ label, value, cls, icon: Icon }) => (
              <div key={label} className={`${cls} rounded-xl p-3 text-center`}>
                <Icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
                <p className="text-2xl font-bold tabular-nums">{value ?? 0}</p>
                <p className="text-xs opacity-80 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>Completion</span><span>{completionPercent}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-900 rounded-full transition-all duration-500" style={{ width: `${completionPercent}%` }} />
          </div>
        </div>

        {/* ── Recent Shipments + Top Products ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Recent Shipments */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Recent Shipments</h2>
              <Link href="/admin/shipments" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {recentShipments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Truck className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">No shipments yet</p>
                <Link href="/admin/shipments/create" className="text-xs font-medium text-gray-900 underline underline-offset-2">Create first shipment</Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentShipments.slice(0, 5).map(s => (
                  <Link key={s.id} href={`/admin/shipments/${s.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="w-10 h-10 bg-gray-50 border border-gray-100 rounded-xl flex flex-col items-center justify-center shrink-0">
                      <p className="text-sm font-bold text-gray-900 leading-none">{new Date(s.shipment_date).getDate()}</p>
                      <p className="text-xs text-gray-400">{new Date(s.shipment_date).toLocaleDateString('en-SG', { month: 'short' })}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.store_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{s.shipment_code}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={s.status} />
                      <ChevronRight className="w-3.5 h-3.5 text-gray-200 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Top Products</h2>
              <BarChart3 className="w-4 h-4 text-gray-300" />
            </div>
            {topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Package className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">No sales data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p, i) => {
                  const max = topProducts[0]?.total_sold || 1
                  return (
                    <div key={p.sku}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-300 w-4">{i + 1}</span>
                          <span className="text-sm font-medium text-gray-800 truncate max-w-[160px]">{p.product_name}</span>
                        </div>
                        <span className="text-xs font-semibold text-gray-600 tabular-nums">{p.total_sold}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-900 rounded-full" style={{ width: `${Math.round((p.total_sold / max) * 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SMART SHIPMENT SUGGESTIONS
        ══════════════════════════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Smart Shipment Suggestions</h2>
                <p className="text-xs text-gray-400">Auto-calculated · 21-day avg · +10% buffer applied</p>
              </div>
            </div>
            {visiblePlans.length > 0 && (
              <span className="text-xs text-gray-400 bg-white border border-gray-100 px-2.5 py-1 rounded-full">
                {visiblePlans.length} store{visiblePlans.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {visiblePlans.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-600">No suggestions right now</p>
              <p className="text-xs text-gray-400 text-center max-w-xs">
                Suggestions appear after stores submit end-of-day reports. All quantities look balanced.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visiblePlans.map(plan => (
                <SuggestionCard
                  key={plan.store_id}
                  plan={plan}
                  onDismiss={id => setDismissedStores(prev => new Set([...prev, id]))}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: 'New Shipment', href: '/admin/shipments/create', icon: Plus,      primary: true },
              { label: 'Shipments',   href: '/admin/shipments',         icon: Truck,     primary: false },
              { label: 'Stores',      href: '/admin/stores',            icon: Store,     primary: false },
              { label: 'Products',    href: '/admin/products',          icon: Fish,      primary: false },
              { label: 'Reports',     href: '/admin/reports',           icon: BarChart3, primary: false },
              { label: 'Users',       href: '/admin/users',             icon: Users,     primary: false },
            ].map(({ label, href, icon: Icon, primary }) => (
              <Link key={href} href={href}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-colors
                  ${primary ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-100'}`}>
                <Icon className="w-4 h-4 shrink-0" />{label}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Team Overview ── */}
        {stats && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Team Overview</h2>
              <Link href="/admin/users" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5">
                Manage <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Users',    value: stats.totalUsers },
                { label: 'Admins',         value: stats.adminUsers },
                { label: 'Delivery Staff', value: stats.deliveryUsers },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
