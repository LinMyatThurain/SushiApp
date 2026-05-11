import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database.types'

type DeliveryRole = 'admin' | 'delivery'

type EodItemInput = {
  product_id?: string
  quantity_sold?: number
  quantity_remaining?: number
  quantity_returned?: number
}

type DailyShipmentItemRow = {
  product_id: string | null
  quantity_sent: number | null
  sushi_products: {
    product_name: string | null
    sku: string | null
  } | null
}

type DailyShipmentRow = {
  id: string
  store_id: string | null
  shipment_date: string
  status: string
  created_at: string
  stores: {
    name: string | null
    manager_name: string | null
  } | null
  shipment_items: DailyShipmentItemRow[] | null
}

type EndOfDaySubmissionRow = {
  id: string
  shipment_id: string | null
  submission_date: string
  status: string
  created_at: string
  stores: {
    name: string | null
  } | null
}

type DeliveryBody =
  | {
      action?: 'eod'
      shipment_id?: string
      store_id?: string
      submission_date?: string
      items?: EodItemInput[]
    }

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatShipmentCode(id: string) {
  return `S-${id.slice(0, 8).toUpperCase()}`
}

async function requireDeliveryUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single()

  if (profileError || (profile?.role !== 'admin' && profile?.role !== 'delivery')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user, role: profile.role as DeliveryRole }
}

function parsePositiveInt(value: unknown) {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN
}

export async function GET() {
  const auth = await requireDeliveryUser()
  if ('error' in auth) return auth.error

  const admin = createAdminClient()

  const [
    { data: stores, error: storeError },
    { data: products, error: productError },
    { data: shipments, error: shipmentError },
    { data: submissions, error: submissionError },
  ] = await Promise.all([
    admin.from('stores').select('id, name, location').eq('status', 'active').order('name'),
    admin.from('sushi_products').select('id, product_name, sku, category, price').eq('active_status', true).order('product_name'),
    admin
      .from('daily_shipments')
      .select('id, store_id, shipment_date, status, created_at, stores(name, manager_name), shipment_items(product_id, quantity_sent, sushi_products(product_name, sku))')
      .order('created_at', { ascending: false })
      .limit(25),
    admin
      .from('end_of_day_submissions')
      .select('id, shipment_id, submission_date, status, created_at, stores(name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (storeError) return NextResponse.json({ error: storeError.message }, { status: 400 })
  if (productError) return NextResponse.json({ error: productError.message }, { status: 400 })
  if (shipmentError) return NextResponse.json({ error: shipmentError.message }, { status: 400 })
  if (submissionError) return NextResponse.json({ error: submissionError.message }, { status: 400 })

  return NextResponse.json({
    stores: stores ?? [],
    products: products ?? [],
    recent_shipments: (shipments ?? []).map((row: DailyShipmentRow) => ({
      id: row.id,
      shipment_code: formatShipmentCode(row.id),
      shipment_date: row.shipment_date,
      status: row.status === 'pending' ? 'pending' : 'confirmed',
      created_at: row.created_at,
      store_id: row.store_id ?? null,
      store_name: row.stores?.name ?? '-',
      manager_name: row.stores?.manager_name ?? null,
      total_units: (row.shipment_items ?? []).reduce((sum: number, item) => sum + (item.quantity_sent ?? 0), 0),
      items: (row.shipment_items ?? []).map((item) => ({
        product_id: item.product_id ?? '',
        product_name: item.sushi_products?.product_name ?? '-',
        sku: item.sushi_products?.sku ?? '-',
        quantity_sent: item.quantity_sent ?? 0,
      })),
    })),
    recent_submissions: (submissions ?? []).map((row: EndOfDaySubmissionRow) => ({
      id: row.id,
      shipment_id: row.shipment_id ?? null,
      submission_date: row.submission_date,
      status: row.status,
      created_at: row.created_at,
      store_name: row.stores?.name ?? '-',
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireDeliveryUser()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as DeliveryBody
  const admin = createAdminClient()

  if (body.action === 'eod') {
    const shipmentId = body.shipment_id?.trim()
    const storeId = body.store_id?.trim()
    const submissionDate = body.submission_date?.trim() || formatLocalDate(new Date())

    if (!shipmentId) {
      return NextResponse.json({ error: 'Shipment is required.' }, { status: 400 })
    }

    const { data: shipments, error: shipmentLookupError } = await admin
      .from('daily_shipments')
      .select('id, store_id, shipment_date, status, shipment_items(product_id, quantity_sent)')
      .eq('id', shipmentId)
      .maybeSingle()

    if (shipmentLookupError) {
      return NextResponse.json({ error: shipmentLookupError.message }, { status: 400 })
    }

    if (!shipments) {
      return NextResponse.json({ error: 'Shipment not found.' }, { status: 400 })
    }

    if (shipments.status !== 'confirmed') {
      return NextResponse.json({ error: 'EOD can only be submitted after the shipment is confirmed.' }, { status: 400 })
    }

    if (storeId && shipments.store_id && storeId !== shipments.store_id) {
      return NextResponse.json({ error: 'Shipment store does not match the selected store.' }, { status: 400 })
    }

    if (submissionDate && submissionDate !== shipments.shipment_date) {
      return NextResponse.json({ error: 'Shipment date does not match the selected date.' }, { status: 400 })
    }

    const shipmentItems = shipments.shipment_items ?? []
    if (!shipmentItems.length) {
      return NextResponse.json({ error: 'Selected shipment has no items.' }, { status: 400 })
    }

    const itemInputs = (body.items ?? []).map((item) => ({
      product_id: item.product_id?.trim() ?? '',
      quantity_sold: parsePositiveInt(item.quantity_sold),
      quantity_remaining: parsePositiveInt(item.quantity_remaining),
      quantity_returned: parsePositiveInt(item.quantity_returned),
    }))

    if (itemInputs.length !== shipmentItems.length) {
      return NextResponse.json({ error: 'Shipment items do not match the selected shipment.' }, { status: 400 })
    }

    const sentByProduct = new Map<string, number>()
    shipmentItems.forEach((item: { product_id: string | null; quantity_sent: number | null }) => {
      if (!item.product_id) return
      sentByProduct.set(item.product_id, (sentByProduct.get(item.product_id) ?? 0) + (item.quantity_sent ?? 0))
    })

    const shipmentProductIds = shipmentItems.map((item) => item.product_id?.trim() ?? '').sort()
    const inputProductIds = itemInputs.map((item) => item.product_id).sort()

    if (
      shipmentProductIds.length !== inputProductIds.length ||
      shipmentProductIds.some((productId, index) => productId !== inputProductIds[index])
    ) {
      return NextResponse.json({ error: 'Shipment items do not match the selected shipment.' }, { status: 400 })
    }

    const validItems = itemInputs.filter((item) => item.product_id)

    const { data: existingSubmission } = await admin
      .from('end_of_day_submissions')
      .select('id')
      .eq('shipment_id', shipmentId)
      .maybeSingle()

    if (existingSubmission) {
      return NextResponse.json({ error: 'An EOD submission already exists for this shipment.' }, { status: 400 })
    }

    const validatedItems: Array<{
      product_id: string
      quantity_sold: number
      quantity_remaining: number
      quantity_returned: number
      return_reason: string | null
    }> = []

    for (const item of validItems) {
      const quantitySent = sentByProduct.get(item.product_id) ?? 0
      const quantitySold = item.quantity_sold
      const quantityRemaining = item.quantity_remaining
      const quantityReturned = item.quantity_returned

      if (quantitySent <= 0) {
        return NextResponse.json({ error: `No shipment found for product ${item.product_id}.` }, { status: 400 })
      }

      if (quantitySold + quantityRemaining + quantityReturned !== quantitySent) {
        return NextResponse.json(
          { error: `Sold, remaining, and return must equal shipped quantity for product ${item.product_id}.` },
          { status: 400 }
        )
      }

      validatedItems.push({
        product_id: item.product_id,
        quantity_sold: quantitySold,
        quantity_remaining: quantityRemaining,
        quantity_returned: quantityReturned,
        return_reason: null,
      })
    }

    const { data: submission, error: submissionError } = await admin
      .from('end_of_day_submissions')
      .insert({
        shipment_id: shipmentId,
        store_id: shipments.store_id ?? storeId ?? '',
        submission_date: shipments.shipment_date ?? submissionDate,
        status: 'submitted',
        submitted_by: auth.user.id,
      })
      .select('id')
      .single()

    if (submissionError || !submission) {
      return NextResponse.json({ error: submissionError?.message ?? 'Failed to create EOD submission.' }, { status: 400 })
    }

    const insertRows = validatedItems.map((item) => ({
      submission_id: submission.id,
      ...item,
    }))

    const { error: itemsError } = await admin.from('end_of_day_items').insert(insertRows)

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, submission_id: submission.id })
  }

  return NextResponse.json({ error: 'Invalid delivery action.' }, { status: 400 })
}
