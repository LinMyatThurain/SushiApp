import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database.types'

type ManualEodItem = {
  product_id?: string
  quantity_sent?: number
  quantity_sold?: number
  quantity_remaining?: number
  quantity_returned?: number
  return_reason?: string | null
}

type ManualEodBody = {
  store_id?: string
  submission_date?: string
  items?: ManualEodItem[]
}

type NormalizedItem = {
  product_id: string
  quantity_sent: number
  quantity_sold: number
  quantity_remaining: number
  quantity_returned: number
  return_reason: string | null
}

const MAX_UNITS_PER_PRODUCT = 1000

async function requireAdmin() {
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

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}

function parseWholeNumber(value: unknown) {
  const parsed = Math.floor(Number(value ?? 0))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN
}

function normalizeItems(items: ManualEodItem[] | undefined) {
  return (items ?? [])
    .map((item) => ({
      product_id: item.product_id?.trim() ?? '',
      quantity_sent: parseWholeNumber(item.quantity_sent),
      quantity_sold: parseWholeNumber(item.quantity_sold),
      quantity_remaining: parseWholeNumber(item.quantity_remaining),
      quantity_returned: parseWholeNumber(item.quantity_returned),
      return_reason: item.return_reason?.trim() || null,
    }))
    .filter((item) => item.product_id)
}

function validateItems(items: NormalizedItem[]) {
  if (items.length === 0) {
    return 'At least one product line is required.'
  }

  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.product_id)) {
      return 'Duplicate products are not allowed in one EOD submission.'
    }
    seen.add(item.product_id)

    const values = [item.quantity_sent, item.quantity_sold, item.quantity_remaining, item.quantity_returned]
    if (values.some((value) => !Number.isFinite(value))) {
      return 'All quantities must be whole numbers.'
    }

    if (item.quantity_sent <= 0) {
      return 'Each product line must have a shipped quantity above zero.'
    }

    if (item.quantity_sent > MAX_UNITS_PER_PRODUCT) {
      return `A single product cannot exceed ${MAX_UNITS_PER_PRODUCT} shipped units.`
    }

    if (item.quantity_sold + item.quantity_remaining + item.quantity_returned !== item.quantity_sent) {
      return 'For each product, sold + remaining + returned must equal shipped quantity.'
    }
  }

  return null
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as ManualEodBody
  const storeId = body.store_id?.trim()
  const submissionDate = body.submission_date?.trim()
  const items = normalizeItems(body.items)

  if (!storeId) {
    return NextResponse.json({ error: 'Store is required.' }, { status: 400 })
  }

  if (!submissionDate) {
    return NextResponse.json({ error: 'Submission date is required.' }, { status: 400 })
  }

  const itemValidationError = validateItems(items)
  if (itemValidationError) {
    return NextResponse.json({ error: itemValidationError }, { status: 400 })
  }

  const admin = createAdminClient()

  const [{ data: store }, { data: activeProducts }, { data: existingShipment }, { data: existingSubmission }] = await Promise.all([
    admin.from('stores').select('id').eq('id', storeId).maybeSingle(),
    admin.from('sushi_products').select('id, price').in('id', items.map((item) => item.product_id)),
    admin.from('daily_shipments').select('id').eq('store_id', storeId).eq('shipment_date', submissionDate).maybeSingle(),
    admin.from('end_of_day_submissions').select('id').eq('store_id', storeId).eq('submission_date', submissionDate).maybeSingle(),
  ])

  if (!store) {
    return NextResponse.json({ error: 'Store not found.' }, { status: 404 })
  }

  if ((activeProducts ?? []).length !== items.length) {
    return NextResponse.json({ error: 'One or more products could not be found.' }, { status: 400 })
  }

  const priceByProductId = new Map((activeProducts ?? []).map((product) => [product.id, Number(product.price ?? 0)]))

  if (existingShipment || existingSubmission) {
    return NextResponse.json({ error: 'A shipment or EOD submission already exists for this store and date.' }, { status: 400 })
  }

  const { data: shipment, error: shipmentError } = await admin
    .from('daily_shipments')
    .insert({
      store_id: storeId,
      shipment_date: submissionDate,
      status: 'confirmed',
      created_by: auth.user.id,
    })
    .select('id')
    .single()

  if (shipmentError || !shipment) {
    return NextResponse.json({ error: shipmentError?.message ?? 'Failed to create historical shipment.' }, { status: 400 })
  }

  const { error: shipmentItemsError } = await admin.from('shipment_items').insert(
    items.map((item) => ({
      shipment_id: shipment.id,
      product_id: item.product_id,
      quantity_sent: item.quantity_sent,
      unit_price: priceByProductId.get(item.product_id) ?? 0,
    }))
  )

  if (shipmentItemsError) {
    await admin.from('daily_shipments').delete().eq('id', shipment.id)
    return NextResponse.json({ error: shipmentItemsError.message }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error: confirmationError } = await admin.from('inventory_confirmations').upsert(
    {
      shipment_id: shipment.id,
      store_id: storeId,
      confirmed_by: auth.user.id,
      confirmed_at: now,
      signer_name: 'Manual historical entry',
    },
    { onConflict: 'shipment_id' }
  )

  if (confirmationError) {
    await admin.from('shipment_items').delete().eq('shipment_id', shipment.id)
    await admin.from('daily_shipments').delete().eq('id', shipment.id)
    return NextResponse.json({ error: confirmationError.message }, { status: 400 })
  }

  const { data: submission, error: submissionError } = await admin
    .from('end_of_day_submissions')
    .insert({
      shipment_id: shipment.id,
      store_id: storeId,
      submission_date: submissionDate,
      status: 'submitted',
      submitted_by: auth.user.id,
    })
    .select('id')
    .single()

  if (submissionError || !submission) {
    await admin.from('inventory_confirmations').delete().eq('shipment_id', shipment.id)
    await admin.from('shipment_items').delete().eq('shipment_id', shipment.id)
    await admin.from('daily_shipments').delete().eq('id', shipment.id)
    return NextResponse.json({ error: submissionError?.message ?? 'Failed to create historical EOD submission.' }, { status: 400 })
  }

  const { error: eodItemsError } = await admin.from('end_of_day_items').insert(
    items.map((item) => ({
      submission_id: submission.id,
      product_id: item.product_id,
      quantity_sold: item.quantity_sold,
      quantity_remaining: item.quantity_remaining,
      quantity_returned: item.quantity_returned,
      return_reason: item.return_reason,
    }))
  )

  if (eodItemsError) {
    await admin.from('end_of_day_submissions').delete().eq('id', submission.id)
    await admin.from('inventory_confirmations').delete().eq('shipment_id', shipment.id)
    await admin.from('shipment_items').delete().eq('shipment_id', shipment.id)
    await admin.from('daily_shipments').delete().eq('id', shipment.id)
    return NextResponse.json({ error: eodItemsError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, shipment_id: shipment.id, submission_id: submission.id })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store_id')?.trim()
  const submissionDate = searchParams.get('submission_date')?.trim()

  if (!storeId || !submissionDate) {
    return NextResponse.json({ error: 'Store and submission date are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: submission, error: lookupError } = await admin
    .from('end_of_day_submissions')
    .select('id, shipment_id, submitted_by')
    .eq('store_id', storeId)
    .eq('submission_date', submissionDate)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 400 })
  }

  if (!submission) {
    return NextResponse.json({ success: true, deleted: false })
  }

  if (submission.submitted_by !== auth.user.id) {
    return NextResponse.json({ error: 'Only the admin who created this manual entry can delete it through this endpoint.' }, { status: 403 })
  }

  await admin.from('end_of_day_items').delete().eq('submission_id', submission.id)
  await admin.from('end_of_day_submissions').delete().eq('id', submission.id)

  if (submission.shipment_id) {
    await admin.from('inventory_confirmations').delete().eq('shipment_id', submission.shipment_id)
    await admin.from('shipment_items').delete().eq('shipment_id', submission.shipment_id)
    await admin.from('daily_shipments').delete().eq('id', submission.shipment_id)
  }

  return NextResponse.json({ success: true, deleted: true })
}
