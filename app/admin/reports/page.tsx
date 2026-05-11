'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildShipmentSuggestions, type SalesHistoryRow, type ShipmentSuggestion } from '@/lib/shipments/planning'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Calendar, CheckCircle2, Download, Fish, Loader2, Package, Plus, RefreshCw, Store, Trash2, TrendingUp, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

type ReportPeriod = 'daily' | 'weekly' | 'monthly'
type TabKey = 'overview' | 'manual' | 'matrix' | 'chef' | 'products' | 'stores' | 'return' | 'details' | 'quality'

type SalesRow = {
  submission_date: string
  store_name: string
  store_location: string | null
  product_name: string
  sku: string
  category: string | null
  price: number
  cost_price: number
  quantity_sent: number
  quantity_sold: number
  quantity_remaining: number
  quantity_returned: number
  revenue: number
  production_cost: number
  net_profit: number
  return_reason: string | null
  submission_status: string | null
}

type SummaryStats = {
  totalSent: number
  totalSold: number
  totalRemaining: number
  totalReturned: number
  totalRevenue: number
  totalProductionCost: number
  netProfit: number
  shippedValue: number
  recoveryMargin: number
  sellThrough: number
}

type ProductSummary = {
  product_name: string
  sku: string
  total_sent: number
  total_sold: number
  total_remaining: number
  total_returned: number
  revenue: number
  production_cost: number
  net_profit: number
}

type StoreSummary = {
  store_name: string
  total_sent: number
  total_sold: number
  total_remaining: number
  total_returned: number
  revenue: number
  production_cost: number
  net_profit: number
  report_days: number
  revenue_delta: number
}

type ChartPoint = {
  label: string
  sold: number
  returned: number
  revenue: number
}

type TooltipEntry = {
  dataKey: string
  color?: string
  value: number
}

type TooltipProps = {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}

type MatrixRow = {
  label: string
  location: string
  values: Record<string, number>
  totalSent: number
  totalReturn: number
}

type MatrixTotals = {
  values: Record<string, number>
  totalSent: number
  totalReturn: number
}

type ChefMatrixRow = {
  label: string
  values: Record<string, number>
  totalCook: number
}

type ChefMatrixTotals = {
  values: Record<string, number>
  totalCook: number
}

type StoreOption = {
  id: string
  name: string
}

type ProductOption = {
  id: string
  product_name: string
  sku: string
  category: string | null
}

type ManualEodLine = {
  product_id: string
  quantity_sent: string
  quantity_sold: string
  quantity_remaining: string
  quantity_returned: string
  return_reason: string
}

const EMPTY_MANUAL_LINE: ManualEodLine = {
  product_id: '',
  quantity_sent: '',
  quantity_sold: '',
  quantity_remaining: '',
  quantity_returned: '',
  return_reason: '',
}

function getDateRange(period: ReportPeriod, offset = 0) {
  const now = new Date()

  if (period === 'daily') {
    const date = new Date(now)
    date.setDate(date.getDate() - offset)
    const iso = formatLocalDate(date)
    return { from: iso, to: iso, label: offset === 0 ? 'Today' : iso }
  }

  if (period === 'weekly') {
    const start = new Date(now)
    start.setDate(start.getDate() - start.getDay() - offset * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return {
      from: formatLocalDate(start),
      to: formatLocalDate(end),
      label: offset === 0 ? 'This week' : `Week of ${start.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`,
    }
  }

  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  return {
    from: formatLocalDate(start),
    to: formatLocalDate(end),
    label: offset === 0 ? 'This month' : start.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' }),
  }
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

function shiftLocalDate(value: string, days: number) {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

function fmtMoney(value: number) {
  return `$${value.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtNum(value: number) {
  return value.toLocaleString('en-SG')
}

function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function normalizeRows(rows: Array<Record<string, unknown>>): SalesRow[] {
  return rows.map((row) => ({
    submission_date: String(row.submission_date ?? ''),
    store_name: String(row.store_name ?? '-'),
    store_location: row.store_location == null ? null : String(row.store_location),
    product_name: String(row.product_name ?? '-'),
    sku: String(row.sku ?? '-'),
    category: row.category == null ? null : String(row.category),
    price: Number(row.price ?? 0),
    cost_price: Number(row.cost_price ?? 0),
    quantity_sent: Number(row.quantity_sent ?? 0),
    quantity_sold: Number(row.quantity_sold ?? 0),
    quantity_remaining: Number(row.quantity_remaining ?? 0),
    quantity_returned: Number(row.quantity_returned ?? 0),
    revenue: Number(row.revenue ?? 0),
    production_cost: Number(row.production_cost ?? Number(row.quantity_sold ?? 0) * Number(row.cost_price ?? 0)),
    net_profit: Number(row.net_profit ?? Number(row.revenue ?? 0) - Number(row.quantity_sold ?? 0) * Number(row.cost_price ?? 0)),
    return_reason: row.return_reason == null ? null : String(row.return_reason),
    submission_status: row.submission_status == null ? null : String(row.submission_status),
  }))
}

function makeMatrixKey(row: SalesRow) {
  return row.sku || row.product_name
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 text-xs shadow-lg">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500 capitalize">{entry.dataKey}:</span>
          <span className="font-medium text-gray-800">{entry.dataKey === 'revenue' ? fmtMoney(entry.value) : fmtNum(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), [])

  const [period, setPeriod] = useState<ReportPeriod>('daily')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<TabKey>('overview')
  const [rows, setRows] = useState<SalesRow[]>([])
  const [previousRows, setPreviousRows] = useState<SalesRow[]>([])
  const [forecastRows, setForecastRows] = useState<SalesHistoryRow[]>([])
  const [activeStores, setActiveStores] = useState<StoreOption[]>([])
  const [activeProducts, setActiveProducts] = useState<ProductOption[]>([])
  const [storeFilter, setStoreFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [manualStoreId, setManualStoreId] = useState('')
  const [manualDate, setManualDate] = useState(formatLocalDate(new Date()))
  const [manualLines, setManualLines] = useState<ManualEodLine[]>([{ ...EMPTY_MANUAL_LINE }])
  const [manualSaving, setManualSaving] = useState(false)
  const [manualNotice, setManualNotice] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)

  const { from, to, label } = getDateRange(period, offset)
  const chefTargetDate = formatLocalDate(new Date(Date.now() + 1000 * 60 * 60 * 24))
  const chefHistoryFrom = shiftLocalDate(chefTargetDate, -56)

  const previousRange = useMemo(() => {
    const currentStart = parseLocalDate(from)
    const currentEnd = parseLocalDate(to)
    const daySpan = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000) + 1)
    const prevEnd = new Date(currentStart)
    prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevStart.getDate() - (daySpan - 1))
    return {
      from: formatLocalDate(prevStart),
      to: formatLocalDate(prevEnd),
    }
  }, [from, to])

  const load = useCallback(async () => {
    setRefreshing(true)

    const [{ data }, { data: prevData }, { data: historyData }, { data: storeData }, { data: productData }] = await Promise.all([
      supabase.from('v_daily_sales').select('*').gte('submission_date', from).lte('submission_date', to).order('submission_date', { ascending: false }),
      supabase
        .from('v_daily_sales')
        .select('*')
        .gte('submission_date', previousRange.from)
        .lte('submission_date', previousRange.to)
        .order('submission_date', { ascending: false }),
      supabase
        .from('v_daily_sales')
        .select('submission_date, store_id, store_name, product_id, product_name, sku, quantity_sent, quantity_sold, quantity_remaining, quantity_returned')
        .gte('submission_date', chefHistoryFrom)
        .lt('submission_date', chefTargetDate)
        .order('submission_date', { ascending: false }),
      supabase.from('stores').select('id, name').eq('status', 'active').order('name'),
      supabase.from('sushi_products').select('id, product_name, sku, category').eq('active_status', true).order('product_name'),
    ])

    setRows(normalizeRows(data ?? []))
    setPreviousRows(normalizeRows(prevData ?? []))
    setForecastRows(historyData ?? [])
    setActiveStores((storeData ?? []) as StoreOption[])
    setActiveProducts((productData ?? []) as ProductOption[])
    setLoading(false)
    setRefreshing(false)
  }, [chefHistoryFrom, chefTargetDate, from, previousRange.from, previousRange.to, supabase, to])

  useEffect(() => {
    // Initial client-side load for the selected date range.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const storeOptions = useMemo(
    () => ['all', ...Array.from(new Set([...rows.map((row) => row.store_name), ...forecastRows.map((row) => row.store_name).filter((name): name is string => Boolean(name))])).sort()],
    [forecastRows, rows]
  )
  const productOptions = useMemo(
    () => ['all', ...Array.from(new Set([...rows.map((row) => row.product_name), ...forecastRows.map((row) => row.product_name).filter((name): name is string => Boolean(name))])).sort()],
    [forecastRows, rows]
  )

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (storeFilter !== 'all' && row.store_name !== storeFilter) return false
        if (productFilter !== 'all' && row.product_name !== productFilter) return false
        return true
      }),
    [productFilter, rows, storeFilter]
  )

  const filteredPreviousRows = useMemo(
    () =>
      previousRows.filter((row) => {
        if (storeFilter !== 'all' && row.store_name !== storeFilter) return false
        if (productFilter !== 'all' && row.product_name !== productFilter) return false
        return true
      }),
    [previousRows, productFilter, storeFilter]
  )

  const summary = useMemo<SummaryStats>(() => {
    const totalSent = filteredRows.reduce((sum, row) => sum + row.quantity_sent, 0)
    const totalSold = filteredRows.reduce((sum, row) => sum + row.quantity_sold, 0)
    const totalRemaining = filteredRows.reduce((sum, row) => sum + row.quantity_remaining, 0)
    const totalReturned = filteredRows.reduce((sum, row) => sum + row.quantity_returned, 0)
    const totalRevenue = filteredRows.reduce((sum, row) => sum + row.revenue, 0)
    const totalProductionCost = filteredRows.reduce((sum, row) => sum + row.production_cost, 0)
    const netProfit = filteredRows.reduce((sum, row) => sum + row.net_profit, 0)
    const shippedValue = filteredRows.reduce((sum, row) => sum + row.quantity_sent * row.price, 0)
    const recoveryMargin = totalRevenue - shippedValue
    const sellThrough = totalSent > 0 ? (totalSold / totalSent) * 100 : 0
    return { totalSent, totalSold, totalRemaining, totalReturned, totalRevenue, totalProductionCost, netProfit, shippedValue, recoveryMargin, sellThrough }
  }, [filteredRows])

  const productSummary = useMemo<ProductSummary[]>(() => {
    const map = new Map<string, ProductSummary>()
    filteredRows.forEach((row) => {
      const key = row.sku || row.product_name
      const current = map.get(key) ?? {
        product_name: row.product_name,
        sku: row.sku,
        total_sent: 0,
        total_sold: 0,
        total_remaining: 0,
        total_returned: 0,
        revenue: 0,
        production_cost: 0,
        net_profit: 0,
      }
      current.total_sent += row.quantity_sent
      current.total_sold += row.quantity_sold
      current.total_remaining += row.quantity_remaining
      current.total_returned += row.quantity_returned
      current.revenue += row.revenue
      current.production_cost += row.production_cost
      current.net_profit += row.net_profit
      map.set(key, current)
    })
    return Array.from(map.values()).sort((a, b) => b.total_sold - a.total_sold)
  }, [filteredRows])

  const storeSummary = useMemo<StoreSummary[]>(() => {
    const map = new Map<string, StoreSummary>()
    const datesByStore = new Map<string, Set<string>>()
    const previousRevenue = filteredPreviousRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.store_name] = (acc[row.store_name] ?? 0) + row.revenue
      return acc
    }, {})

    filteredRows.forEach((row) => {
      const current = map.get(row.store_name) ?? {
        store_name: row.store_name,
        total_sent: 0,
        total_sold: 0,
        total_remaining: 0,
        total_returned: 0,
        revenue: 0,
        production_cost: 0,
        net_profit: 0,
        report_days: 0,
        revenue_delta: 0,
      }
      current.total_sent += row.quantity_sent
      current.total_sold += row.quantity_sold
      current.total_remaining += row.quantity_remaining
      current.total_returned += row.quantity_returned
      current.revenue += row.revenue
      current.production_cost += row.production_cost
      current.net_profit += row.net_profit
      map.set(row.store_name, current)
      if (!datesByStore.has(row.store_name)) datesByStore.set(row.store_name, new Set())
      datesByStore.get(row.store_name)!.add(row.submission_date)
    })

    map.forEach((value, key) => {
      value.report_days = datesByStore.get(key)?.size ?? 0
      value.revenue_delta = value.revenue - (previousRevenue[key] ?? 0)
    })

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [filteredPreviousRows, filteredRows])

  const returnRows = useMemo(() => filteredRows.filter((row) => row.quantity_returned > 0), [filteredRows])
  const qualityRows = useMemo(
    () => filteredRows.filter((row) => row.quantity_sent !== row.quantity_sold + row.quantity_remaining + row.quantity_returned),
    [filteredRows]
  )

  const chartData = useMemo<ChartPoint[]>(() => {
    if (period === 'daily') {
      return productSummary.slice(0, 8).map((row) => ({
        label: row.product_name,
        sold: row.total_sold,
        returned: row.total_returned,
        revenue: row.revenue,
      }))
    }

    const byDate = new Map<string, ChartPoint>()
    filteredRows.forEach((row) => {
      const labelValue = new Date(row.submission_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
      const current = byDate.get(row.submission_date) ?? { label: labelValue, sold: 0, returned: 0, revenue: 0 }
      current.sold += row.quantity_sold
      current.returned += row.quantity_returned
      current.revenue += row.revenue
      byDate.set(row.submission_date, current)
    })
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
  }, [filteredRows, period, productSummary])

  const matrixProducts = useMemo(() => {
    return productSummary.map((row) => ({
      key: row.sku || row.product_name,
      label: row.product_name,
    }))
  }, [productSummary])

  const matrixData = useMemo(() => {
    const rowsByStore = new Map<string, MatrixRow>()
    const totals: MatrixTotals = {
      values: {},
      totalSent: 0,
      totalReturn: 0,
    }

    filteredRows.forEach((row) => {
      const key = row.store_name
      const productKey = makeMatrixKey(row)
      const current = rowsByStore.get(key) ?? {
        label: row.store_name,
        location: row.store_location ?? '',
        values: {},
        totalSent: 0,
        totalReturn: 0,
      }

      current.location = current.location || row.store_location || ''
      current.values[productKey] = (current.values[productKey] ?? 0) + row.quantity_sent
      current.totalSent += row.quantity_sent
      current.totalReturn += row.quantity_returned
      rowsByStore.set(key, current)

      totals.values[productKey] = (totals.values[productKey] ?? 0) + row.quantity_sent
      totals.totalSent += row.quantity_sent
      totals.totalReturn += row.quantity_returned
    })

    const rows = Array.from(rowsByStore.values()).sort((a, b) => a.label.localeCompare(b.label))
    return { rows, totals }
  }, [filteredRows])

  const averageUnitPrice = summary.totalSent > 0 ? summary.shippedValue / summary.totalSent : 0
  const averageStoreSale = matrixData.rows.length > 0 ? summary.totalRevenue / matrixData.rows.length : 0

  const chefSuggestions = useMemo<ShipmentSuggestion[]>(() => {
    const targetDate = parseLocalDate(chefTargetDate)
    const usableRows = forecastRows.filter((row) => {
      if (storeFilter !== 'all' && row.store_name !== storeFilter) return false
      if (productFilter !== 'all' && row.product_name !== productFilter) return false
      return true
    })

    return buildShipmentSuggestions(usableRows, targetDate).sort((a, b) => {
      if (a.store_name === b.store_name) return b.target_units - a.target_units
      return a.store_name.localeCompare(b.store_name)
    })
  }, [chefTargetDate, forecastRows, productFilter, storeFilter])

  const chefProducts = useMemo(() => {
    const products = new Map<string, string>()
    chefSuggestions.forEach((row) => {
      products.set(row.sku || row.product_name, row.product_name)
    })
    return Array.from(products.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [chefSuggestions])

  const chefMatrixData = useMemo(() => {
    const rowsByStore = new Map<string, ChefMatrixRow>()
    const totals: ChefMatrixTotals = {
      values: {},
      totalCook: 0,
    }

    chefSuggestions.forEach((row) => {
      const key = row.store_name
      const productKey = row.sku || row.product_name
      const current = rowsByStore.get(key) ?? {
        label: row.store_name,
        values: {},
        totalCook: 0,
      }

      current.values[productKey] = (current.values[productKey] ?? 0) + row.target_units
      current.totalCook += row.target_units
      rowsByStore.set(key, current)

      totals.values[productKey] = (totals.values[productKey] ?? 0) + row.target_units
      totals.totalCook += row.target_units
    })

    return {
      rows: Array.from(rowsByStore.values()).sort((a, b) => a.label.localeCompare(b.label)),
      totals,
    }
  }, [chefSuggestions])

  const manualTotals = useMemo(() => {
    return manualLines.reduce(
      (totals, line) => ({
        sent: totals.sent + Number(line.quantity_sent || 0),
        sold: totals.sold + Number(line.quantity_sold || 0),
        remaining: totals.remaining + Number(line.quantity_remaining || 0),
        returned: totals.returned + Number(line.quantity_returned || 0),
      }),
      { sent: 0, sold: 0, remaining: 0, returned: 0 }
    )
  }, [manualLines])

  function exportDetails() {
    exportCsv(
      filteredRows.map((row) => ({
        Date: row.submission_date,
        Store: row.store_name,
        Location: row.store_location ?? '',
        Product: row.product_name,
        SKU: row.sku,
        Category: row.category ?? '',
        Price: row.price.toFixed(2),
        CostPrice: row.cost_price.toFixed(2),
        Sent: row.quantity_sent,
        Sold: row.quantity_sold,
        Remaining: row.quantity_remaining,
        Returned: row.quantity_returned,
        Revenue: row.revenue.toFixed(2),
        ProductionCost: row.production_cost.toFixed(2),
        NetProfit: row.net_profit.toFixed(2),
        Status: row.submission_status ?? '',
        ReturnReason: row.return_reason ?? '',
      })),
      `sales-detail-${from}-${to}.csv`
    )
  }

  function exportProducts() {
    exportCsv(
      productSummary.map((row) => ({
        Product: row.product_name,
        SKU: row.sku,
        Sent: row.total_sent,
        Sold: row.total_sold,
        Remaining: row.total_remaining,
        Returned: row.total_returned,
        Revenue: row.revenue.toFixed(2),
        ProductionCost: row.production_cost.toFixed(2),
        NetProfit: row.net_profit.toFixed(2),
      })),
      `product-summary-${from}-${to}.csv`
    )
  }

  function exportStores() {
    exportCsv(
      storeSummary.map((row) => ({
        Store: row.store_name,
        Sent: row.total_sent,
        Sold: row.total_sold,
        Remaining: row.total_remaining,
        Returned: row.total_returned,
        Revenue: row.revenue.toFixed(2),
        ProductionCost: row.production_cost.toFixed(2),
        NetProfit: row.net_profit.toFixed(2),
        Trend: row.revenue_delta.toFixed(2),
        ReportDays: row.report_days,
      })),
      `store-summary-${from}-${to}.csv`
    )
  }

  function exportReturn() {
    exportCsv(
      returnRows.map((row) => ({
        Date: row.submission_date,
        Store: row.store_name,
        Product: row.product_name,
        Returned: row.quantity_returned,
        Reason: row.return_reason ?? '',
      })),
      `return-report-${from}-${to}.csv`
    )
  }

  function exportQuality() {
    exportCsv(
      qualityRows.map((row) => ({
        Date: row.submission_date,
        Store: row.store_name,
        Product: row.product_name,
        Sent: row.quantity_sent,
        Sold: row.quantity_sold,
        Remaining: row.quantity_remaining,
        Returned: row.quantity_returned,
        Difference: row.quantity_sent - (row.quantity_sold + row.quantity_remaining + row.quantity_returned),
      })),
      `quality-check-${from}-${to}.csv`
    )
  }

  function exportMatrix() {
    exportCsv(
      [
        ...matrixData.rows.map((row) => {
          const record: Record<string, unknown> = {
            Location: row.label,
            StoreLocation: row.location,
          }
          matrixProducts.forEach((product) => {
            record[product.label] = row.values[product.key] ?? 0
          })
          record.Total = row.totalSent
          record.Return = row.totalReturn
          return record
        }),
        {
          Location: 'Grand Total',
          StoreLocation: '',
          ...Object.fromEntries(matrixProducts.map((product) => [product.label, matrixData.totals.values[product.key] ?? 0])),
          Total: matrixData.totals.totalSent,
          Return: matrixData.totals.totalReturn,
        },
      ],
      `location-matrix-${from}-${to}.csv`
    )
  }

  function exportChefPlan() {
    exportCsv(
      [
        ...chefMatrixData.rows.map((row) => ({
          Store: row.label,
          ...Object.fromEntries(
            matrixProducts.map((product) => [product.label, row.values[product.key] ?? 0])
          ),
          Total: row.totalCook,
        })),
        {
          Store: 'Grand Total',
          ...Object.fromEntries(
            matrixProducts.map((product) => [product.label, chefMatrixData.totals.values[product.key] ?? 0])
          ),
          Total: chefMatrixData.totals.totalCook,
        },
      ],
      `chef-matrix-${from}-${to}.csv`
    )
  }

  function updateManualLine(index: number, field: keyof ManualEodLine, value: string) {
    setManualLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line))
    )
  }

  function addManualLine() {
    setManualLines((current) => [...current, { ...EMPTY_MANUAL_LINE }])
  }

  function removeManualLine(index: number) {
    setManualLines((current) => (current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index)))
  }

  async function submitManualEod() {
    setManualError(null)
    setManualNotice(null)

    if (!manualStoreId) {
      setManualError('Select a store before saving historical EOD data.')
      return
    }

    if (!manualDate) {
      setManualError('Select the sales date.')
      return
    }

    const usableLines = manualLines.filter((line) => line.product_id)
    if (usableLines.length === 0) {
      setManualError('Add at least one product line.')
      return
    }

    setManualSaving(true)
    try {
      const response = await fetch('/api/admin/eod-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: manualStoreId,
          submission_date: manualDate,
          items: usableLines.map((line) => ({
            product_id: line.product_id,
            quantity_sent: Number(line.quantity_sent || 0),
            quantity_sold: Number(line.quantity_sold || 0),
            quantity_remaining: Number(line.quantity_remaining || 0),
            quantity_returned: Number(line.quantity_returned || 0),
            return_reason: line.return_reason.trim() || null,
          })),
        }),
      })
      const result = await response.json()

      if (!response.ok) {
        setManualError(result.error ?? 'Failed to save historical EOD data.')
        return
      }

      setManualNotice('Historical EOD data saved.')
      setManualLines([{ ...EMPTY_MANUAL_LINE }])
      await load()
    } catch {
      setManualError('Failed to save historical EOD data.')
    } finally {
      setManualSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Fish className="w-8 h-8 text-gray-200 animate-pulse" />
          <p className="text-sm text-gray-400">Loading reports...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-auto max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:h-14 sm:px-4 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/dashboard" className="rounded-2xl p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-sm font-semibold text-gray-900 truncate">Reports</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load} disabled={refreshing} className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportDetails} className="inline-flex items-center gap-1.5 rounded-2xl bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-700">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Details</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-4 md:px-6">
        {manualError ? (
          <div className="flex items-center gap-2 rounded-3xl border border-red-200 bg-red-50 px-4 py-3">
            <TriangleAlert className="w-4 h-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{manualError}</p>
          </div>
        ) : null}

        {manualNotice ? (
          <div className="flex items-center gap-2 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-700">{manualNotice}</p>
          </div>
        ) : null}

        <div className="max-w-full overflow-hidden space-y-4 rounded-[2rem] border border-gray-100 bg-white p-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-1">
              {(['daily', 'weekly', 'monthly'] as ReportPeriod[]).map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setPeriod(value)
                    setOffset(0)
                  }}
                  className={`shrink-0 whitespace-nowrap rounded-2xl px-3 py-1.5 text-xs font-medium capitalize transition-all ${period === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 lg:ml-auto shrink-0 flex-wrap">
              <button onClick={() => setOffset((current) => current + 1)} className="rounded-2xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50">
                Prev
              </button>
              <div className="flex min-w-[130px] items-center justify-center gap-1.5 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-1.5 sm:min-w-[150px]">
                <Calendar className="w-3 h-3 text-gray-400" />
                <span className="text-xs font-medium text-gray-700 truncate">{label}</span>
              </div>
              <button onClick={() => setOffset((current) => Math.max(0, current - 1))} disabled={offset === 0} className="rounded-2xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40">
                Next
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-gray-300 focus:bg-white">
              {storeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All stores' : option}
                </option>
              ))}
            </select>

            <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-gray-300 focus:bg-white">
              {productOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All products' : option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={exportStores} className="rounded-2xl border border-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50">Store Ranking Export</button>
            <button onClick={exportReturn} className="rounded-2xl border border-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50">Return Audit Export</button>
            <button onClick={exportQuality} className="rounded-2xl border border-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50">Quality Export</button>
            <button onClick={() => setTab('manual')} className="inline-flex items-center gap-1.5 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
              <Plus className="h-3 w-3" />
              Manual EOD Entry
            </button>
          </div>

          <p className="text-xs text-gray-400">{from === to ? from : `${from} to ${to}`}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: 'Sent', value: fmtNum(summary.totalSent), sub: 'units', icon: Package },
            { label: 'Sold', value: fmtNum(summary.totalSold), sub: 'units', icon: TrendingUp },
            { label: 'Remaining', value: fmtNum(summary.totalRemaining), sub: 'units', icon: Store },
            { label: 'Returned', value: fmtNum(summary.totalReturned), sub: 'units', icon: TriangleAlert },
            { label: 'Revenue', value: fmtMoney(summary.totalRevenue), sub: `${summary.sellThrough.toFixed(1)}% sell-through`, icon: Fish },
            { label: 'Cost', value: fmtMoney(summary.totalProductionCost), sub: 'making cost', icon: Package },
            { label: 'Net Profit', value: fmtMoney(summary.netProfit), sub: 'revenue minus cost', icon: TrendingUp },
            { label: 'Recovery', value: fmtMoney(summary.recoveryMargin), sub: `vs ${fmtMoney(summary.shippedValue)} shipped value`, icon: TrendingUp },
          ].map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className="rounded-[1.75rem] border border-gray-100 bg-white p-4">
                <div className="mb-3 inline-flex rounded-2xl bg-gray-50 p-2">
                  <Icon className="w-4 h-4 text-gray-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{card.value}</p>
                <p className="text-xs text-gray-400 mt-1">{card.label}</p>
                <p className="text-xs text-gray-300 mt-0.5">{card.sub}</p>
              </div>
            )
          })}
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-gray-100 pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
          {[
            ['overview', 'Overview'],
            ['manual', 'Manual EOD'],
            ['matrix', 'Matrix'],
            ['chef', 'Chef'],
            ['products', 'Products'],
            ['stores', 'Stores'],
            ['return', 'Return'],
            ['details', 'Details'],
            ['quality', 'Quality'],
          ].map(([key, title]) => (
            <button key={key} onClick={() => setTab(key as TabKey)} className={`shrink-0 whitespace-nowrap rounded-t-2xl px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {title}
            </button>
          ))}
        </div>

        {tab === 'manual' && (
          <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Manual Historical EOD Entry</h2>
                <p className="mt-1 text-xs text-gray-400">Enter past sales by store, date, and product. Totals must balance per product line.</p>
              </div>
              <button
                onClick={addManualLine}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-gray-100 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add product line
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Store</label>
                <select
                  value={manualStoreId}
                  onChange={(event) => setManualStoreId(event.target.value)}
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-gray-300 focus:bg-white"
                >
                  <option value="">Select store</option>
                  {activeStores.map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Sales date</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(event) => setManualDate(event.target.value)}
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-gray-300 focus:bg-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-2 py-2.5 text-left font-medium text-gray-400">Product</th>
                    <th className="px-2 py-2.5 text-right font-medium text-gray-400">Shipped</th>
                    <th className="px-2 py-2.5 text-right font-medium text-gray-400">Sold</th>
                    <th className="px-2 py-2.5 text-right font-medium text-gray-400">Remaining</th>
                    <th className="px-2 py-2.5 text-right font-medium text-gray-400">Returned</th>
                    <th className="px-2 py-2.5 text-left font-medium text-gray-400">Return reason</th>
                    <th className="px-2 py-2.5 text-right font-medium text-gray-400">Balance</th>
                    <th className="px-2 py-2.5 text-right font-medium text-gray-400">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {manualLines.map((line, index) => {
                    const sent = Number(line.quantity_sent || 0)
                    const sold = Number(line.quantity_sold || 0)
                    const remaining = Number(line.quantity_remaining || 0)
                    const returned = Number(line.quantity_returned || 0)
                    const balance = sent - (sold + remaining + returned)

                    return (
                      <tr key={index} className="border-b border-gray-50">
                        <td className="px-2 py-3">
                          <select
                            value={line.product_id}
                            onChange={(event) => updateManualLine(index, 'product_id', event.target.value)}
                            className="w-full min-w-[220px] rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs outline-none focus:border-gray-300 focus:bg-white"
                          >
                            <option value="">Select product</option>
                            {activeProducts.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.product_name} ({product.sku})
                              </option>
                            ))}
                          </select>
                        </td>
                        {(['quantity_sent', 'quantity_sold', 'quantity_remaining', 'quantity_returned'] as const).map((field) => (
                          <td key={field} className="px-2 py-3">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={line[field]}
                              onChange={(event) => updateManualLine(index, field, event.target.value.replace(/[^0-9]/g, ''))}
                              className="ml-auto block w-20 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-right text-xs outline-none focus:border-gray-300 focus:bg-white"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-3">
                          <input
                            type="text"
                            value={line.return_reason}
                            onChange={(event) => updateManualLine(index, 'return_reason', event.target.value)}
                            className="w-full min-w-[180px] rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs outline-none focus:border-gray-300 focus:bg-white"
                          />
                        </td>
                        <td className={`px-2 py-3 text-right font-semibold tabular-nums ${balance === 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {balance}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <button
                            onClick={() => removeManualLine(index)}
                            disabled={manualLines.length === 1}
                            className="inline-flex items-center justify-center rounded-xl border border-red-100 p-2 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td className="px-2 py-3 font-semibold text-gray-900">Totals</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{fmtNum(manualTotals.sent)}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{fmtNum(manualTotals.sold)}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{fmtNum(manualTotals.remaining)}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{fmtNum(manualTotals.returned)}</td>
                    <td className="px-2 py-3" />
                    <td className={`px-2 py-3 text-right font-semibold tabular-nums ${manualTotals.sent === manualTotals.sold + manualTotals.remaining + manualTotals.returned ? 'text-emerald-600' : 'text-red-500'}`}>
                      {manualTotals.sent - (manualTotals.sold + manualTotals.remaining + manualTotals.returned)}
                    </td>
                    <td className="px-2 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">Saving creates a confirmed historical shipment plus a submitted EOD record for reporting.</p>
              <button
                onClick={submitManualEod}
                disabled={manualSaving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
              >
                {manualSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save historical EOD
              </button>
            </div>
          </div>
        )}

        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 max-w-full overflow-hidden">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{period === 'daily' ? 'Sales by Product' : 'Sales Over Time'}</h2>
              {chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-56 gap-2">
                  <Fish className="w-8 h-8 text-gray-200" />
                  <p className="text-sm text-gray-400">No data for this period</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="sold" fill="#111827" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="returned" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {chartData.length > 1 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 max-w-full overflow-hidden">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Revenue Trend</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={50} tickFormatter={(value) => `$${value}`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line dataKey="revenue" stroke="#111827" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>
        )}

        {tab === 'matrix' && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 space-y-4 max-w-full overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Location Matrix</h2>
                  <p className="text-xs text-gray-400 mt-1">Pivoted by store location with product quantities across the selected period.</p>
                </div>
                <button onClick={exportMatrix} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                  <Download className="w-3 h-3" />
                  Export CSV
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Grand Total</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{fmtNum(matrixData.totals.totalSent)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Return</p>
                  <p className="mt-1 text-xl font-bold text-amber-600 tabular-nums">{fmtNum(matrixData.totals.totalReturn)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Avg Price</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{fmtMoney(averageUnitPrice)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Avg Sale</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{fmtMoney(averageStoreSale)}</p>
                </div>
              </div>

              {matrixData.rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Fish className="w-8 h-8 text-gray-200" />
                  <p className="text-sm text-gray-400">No rows available for this filter set</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-w-full -mx-1 px-1">
                  <table className="min-w-[720px] md:min-w-[980px] w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-50">
                        <th className="py-2.5 px-2 text-left font-medium text-gray-400">Location</th>
                        {matrixProducts.map((product) => (
                          <th key={product.key} className="py-2.5 px-2 text-right font-medium text-gray-400 whitespace-nowrap">
                            {product.label}
                          </th>
                        ))}
                        <th className="py-2.5 px-2 text-right font-medium text-gray-400">Total</th>
                        <th className="py-2.5 px-2 text-right font-medium text-gray-400">Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixData.rows.map((row) => (
                        <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-3 px-2">
                            <div className="font-medium text-gray-800">{row.label}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">{row.location || '-'}</div>
                          </td>
                          {matrixProducts.map((product) => (
                            <td key={product.key} className="py-3 px-2 text-right text-gray-700 tabular-nums">
                              {fmtNum(row.values[product.key] ?? 0)}
                            </td>
                          ))}
                          <td className="py-3 px-2 text-right font-semibold text-gray-900 tabular-nums">{fmtNum(row.totalSent)}</td>
                          <td className="py-3 px-2 text-right font-semibold text-amber-600 tabular-nums">{fmtNum(row.totalReturn)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td className="py-3 px-2 font-semibold text-gray-900">Grand Total</td>
                        {matrixProducts.map((product) => (
                          <td key={product.key} className="py-3 px-2 text-right font-semibold text-red-500 tabular-nums">
                            {fmtNum(matrixData.totals.values[product.key] ?? 0)}
                          </td>
                        ))}
                        <td className="py-3 px-2 text-right font-semibold text-red-500 tabular-nums">{fmtNum(matrixData.totals.totalSent)}</td>
                        <td className="py-3 px-2 text-right font-semibold text-amber-600 tabular-nums">{fmtNum(matrixData.totals.totalReturn)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'chef' && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 space-y-4 max-w-full overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Chef Prediction Matrix</h2>
                  <p className="text-xs text-gray-400 mt-1">Predicted cook quantities for {chefTargetDate}, based on recent EOD sales and return.</p>
                </div>
                <button onClick={exportChefPlan} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                  <Download className="w-3 h-3" />
                  Export CSV
                </button>
              </div>

              {chefMatrixData.rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Fish className="w-8 h-8 text-gray-200" />
                  <p className="text-sm text-gray-400">No prediction data available for this filter set</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-w-full -mx-1 px-1">
                  <table className="min-w-[720px] md:min-w-[980px] w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-50">
                        <th className="py-2.5 px-2 text-left font-medium text-gray-400">Store</th>
                        {chefProducts.map((product) => (
                          <th key={product.key} className="py-2.5 px-2 text-right font-medium text-gray-400 whitespace-nowrap">
                            {product.label}
                          </th>
                        ))}
                        <th className="py-2.5 px-2 text-right font-medium text-gray-400">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chefMatrixData.rows.map((row) => (
                        <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-3 px-2">
                            <div className="font-medium text-gray-800">{row.label}</div>
                          </td>
                          {chefProducts.map((product) => (
                            <td key={product.key} className="py-3 px-2 text-right text-gray-700 tabular-nums">
                              {fmtNum(row.values[product.key] ?? 0)}
                            </td>
                          ))}
                          <td className="py-3 px-2 text-right font-semibold text-gray-900 tabular-nums">{fmtNum(row.totalCook)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td className="py-3 px-2 font-semibold text-gray-900">Grand Total</td>
                        {chefProducts.map((product) => (
                          <td key={product.key} className="py-3 px-2 text-right font-semibold text-red-500 tabular-nums">
                            {fmtNum(chefMatrixData.totals.values[product.key] ?? 0)}
                          </td>
                        ))}
                        <td className="py-3 px-2 text-right font-semibold text-red-500 tabular-nums">{fmtNum(chefMatrixData.totals.totalCook)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'products' && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Product Performance</h2>
              <button onClick={exportProducts} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                <Download className="w-3 h-3" />
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">Product</th>
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">SKU</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Sent</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Sold</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Remaining</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Returned</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Revenue</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Cost</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {productSummary.map((row) => (
                    <tr key={row.sku} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-2 text-gray-800 font-medium">{row.product_name}</td>
                      <td className="py-3 px-2 text-gray-400 font-mono">{row.sku}</td>
                      <td className="py-3 px-2 text-right text-gray-600 tabular-nums">{fmtNum(row.total_sent)}</td>
                      <td className="py-3 px-2 text-right text-gray-900 font-semibold tabular-nums">{fmtNum(row.total_sold)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{fmtNum(row.total_remaining)}</td>
                      <td className="py-3 px-2 text-right text-red-500 tabular-nums">{fmtNum(row.total_returned)}</td>
                      <td className="py-3 px-2 text-right text-gray-900 font-semibold tabular-nums">{fmtMoney(row.revenue)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{fmtMoney(row.production_cost)}</td>
                      <td className={`py-3 px-2 text-right font-semibold tabular-nums ${row.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtMoney(row.net_profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'stores' && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Store Performance</h2>
              <button onClick={exportStores} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                <Download className="w-3 h-3" />
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">Store</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Sent</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Sold</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Remaining</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Returned</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Revenue</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Cost</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Net</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Trend</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Report Days</th>
                  </tr>
                </thead>
                <tbody>
                  {storeSummary.map((row) => (
                    <tr key={row.store_name} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-2 text-gray-800 font-medium">{row.store_name}</td>
                      <td className="py-3 px-2 text-right text-gray-600 tabular-nums">{fmtNum(row.total_sent)}</td>
                      <td className="py-3 px-2 text-right text-gray-900 font-semibold tabular-nums">{fmtNum(row.total_sold)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{fmtNum(row.total_remaining)}</td>
                      <td className="py-3 px-2 text-right text-red-500 tabular-nums">{fmtNum(row.total_returned)}</td>
                      <td className="py-3 px-2 text-right text-gray-900 font-semibold tabular-nums">{fmtMoney(row.revenue)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{fmtMoney(row.production_cost)}</td>
                      <td className={`py-3 px-2 text-right font-semibold tabular-nums ${row.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtMoney(row.net_profit)}</td>
                      <td className={`py-3 px-2 text-right font-medium tabular-nums ${row.revenue_delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{row.revenue_delta >= 0 ? '+' : ''}{fmtMoney(row.revenue_delta)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{row.report_days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'return' && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Return Report</h2>
              <button onClick={exportReturn} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                <Download className="w-3 h-3" />
                Export CSV
              </button>
            </div>
            {returnRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Fish className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">No return recorded for this filter set</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="py-2.5 px-2 text-left font-medium text-gray-400">Date</th>
                      <th className="py-2.5 px-2 text-left font-medium text-gray-400">Store</th>
                      <th className="py-2.5 px-2 text-left font-medium text-gray-400">Product</th>
                      <th className="py-2.5 px-2 text-right font-medium text-gray-400">Qty</th>
                      <th className="py-2.5 px-2 text-left font-medium text-gray-400">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnRows.map((row, index) => (
                      <tr key={`${row.submission_date}-${row.sku}-${index}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3 px-2 text-gray-500">{row.submission_date}</td>
                        <td className="py-3 px-2 text-gray-800">{row.store_name}</td>
                        <td className="py-3 px-2 text-gray-800">{row.product_name}</td>
                        <td className="py-3 px-2 text-right text-red-500 font-semibold tabular-nums">{fmtNum(row.quantity_returned)}</td>
                        <td className="py-3 px-2 text-gray-400">{row.return_reason ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'details' && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Raw Sales Detail</h2>
              <button onClick={exportDetails} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                <Download className="w-3 h-3" />
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1400px] w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">Date</th>
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">Store</th>
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">Product</th>
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">SKU</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Sent</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Sold</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Remaining</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Returned</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Price</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Cost/Unit</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Revenue</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Cost</th>
                    <th className="py-2.5 px-2 text-right font-medium text-gray-400">Net</th>
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">Status</th>
                    <th className="py-2.5 px-2 text-left font-medium text-gray-400">Return Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={`${row.submission_date}-${row.sku}-${index}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-2 text-gray-500">{row.submission_date}</td>
                      <td className="py-3 px-2">
                        <div className="text-gray-800 font-medium">{row.store_name}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{row.store_location ?? ''}</div>
                      </td>
                      <td className="py-3 px-2 text-gray-800">{row.product_name}</td>
                      <td className="py-3 px-2 text-gray-400 font-mono">{row.sku}</td>
                      <td className="py-3 px-2 text-right text-gray-600 tabular-nums">{fmtNum(row.quantity_sent)}</td>
                      <td className="py-3 px-2 text-right text-gray-900 font-semibold tabular-nums">{fmtNum(row.quantity_sold)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{fmtNum(row.quantity_remaining)}</td>
                      <td className="py-3 px-2 text-right text-red-500 tabular-nums">{fmtNum(row.quantity_returned)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{fmtMoney(row.price)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{fmtMoney(row.cost_price)}</td>
                      <td className="py-3 px-2 text-right text-gray-900 font-semibold tabular-nums">{fmtMoney(row.revenue)}</td>
                      <td className="py-3 px-2 text-right text-gray-500 tabular-nums">{fmtMoney(row.production_cost)}</td>
                      <td className={`py-3 px-2 text-right font-semibold tabular-nums ${row.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtMoney(row.net_profit)}</td>
                      <td className="py-3 px-2 text-gray-500">{row.submission_status ?? '-'}</td>
                      <td className="py-3 px-2 text-gray-400">{row.return_reason ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'quality' && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Data Quality Checks</h2>
              <button onClick={exportQuality} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                <Download className="w-3 h-3" />
                Export CSV
              </button>
            </div>
            {qualityRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <p className="text-sm text-gray-400">No shipment/EOD mismatches found for this filter set</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="py-2.5 px-2 text-left font-medium text-gray-400">Date</th>
                      <th className="py-2.5 px-2 text-left font-medium text-gray-400">Store</th>
                      <th className="py-2.5 px-2 text-left font-medium text-gray-400">Product</th>
                      <th className="py-2.5 px-2 text-right font-medium text-gray-400">Sent</th>
                      <th className="py-2.5 px-2 text-right font-medium text-gray-400">Sold</th>
                      <th className="py-2.5 px-2 text-right font-medium text-gray-400">Remaining</th>
                      <th className="py-2.5 px-2 text-right font-medium text-gray-400">Returned</th>
                      <th className="py-2.5 px-2 text-right font-medium text-gray-400">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualityRows.map((row, index) => (
                      <tr key={`${row.submission_date}-${row.sku}-${index}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3 px-2 text-gray-500">{row.submission_date}</td>
                        <td className="py-3 px-2 text-gray-800">{row.store_name}</td>
                        <td className="py-3 px-2 text-gray-800">{row.product_name}</td>
                        <td className="py-3 px-2 text-right tabular-nums">{fmtNum(row.quantity_sent)}</td>
                        <td className="py-3 px-2 text-right tabular-nums">{fmtNum(row.quantity_sold)}</td>
                        <td className="py-3 px-2 text-right tabular-nums">{fmtNum(row.quantity_remaining)}</td>
                        <td className="py-3 px-2 text-right tabular-nums">{fmtNum(row.quantity_returned)}</td>
                        <td className="py-3 px-2 text-right font-semibold text-red-500 tabular-nums">{fmtNum(row.quantity_sent - (row.quantity_sold + row.quantity_remaining + row.quantity_returned))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

