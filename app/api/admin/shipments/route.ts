import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database.types'

type ShipmentItemInput = {
  product_id?: string
  quantity_sent?: number
  unit_price?: number
}

type CreateShipmentBody = {
  store_id?: string
  shipment_date?: string
  status?: string
  items?: ShipmentItemInput[]
}

type UpdateShipmentBody = CreateShipmentBody & {
  id?: string
}

type BulkShipmentBody =
  | {
      action?: 'bulk_status'
      ids?: string[]
      status?: string
    }
  | {
      action?: 'bulk_delete'
      ids?: string[]
    }
  | {
      action?: 'duplicate'
      ids?: string[]
      shipment_date?: string
    }

type NormalizedItem = {
  product_id: string
  quantity_sent: number
  unit_price: number
}

const VALID_STATUSES = new Set(['pending', 'confirmed'])
const MAX_UNITS_PER_PRODUCT = 200

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

function normalizeItems(items: ShipmentItemInput[] | undefined) {
  return (items ?? [])
    .map((item) => ({
      product_id: item.product_id?.trim() ?? '',
      quantity_sent: Math.floor(Number(item.quantity_sent ?? 0)),
      unit_price: Number(item.unit_price ?? 0),
    }))
    .filter((item) => item.product_id && item.quantity_sent > 0)
}

function validateItems(items: NormalizedItem[]) {
  if (items.length === 0) {
    return 'At least one shipment item is required.'
  }

  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.product_id)) {
      return 'Duplicate products are not allowed in one shipment.'
    }
    seen.add(item.product_id)

    if (!Number.isFinite(item.quantity_sent) || item.quantity_sent <= 0) {
      return 'All quantities must be positive whole numbers.'
    }

    if (item.quantity_sent > MAX_UNITS_PER_PRODUCT) {
      return `A single product cannot exceed ${MAX_UNITS_PER_PRODUCT} units.`
    }
  }

  return null
}

async function ensureNoDuplicateShipment(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  shipmentDate: string,
  excludeId?: string
) {
  let query = admin
    .from('daily_shipments')
    .select('id')
    .eq('store_id', storeId)
    .eq('shipment_date', shipmentDate)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { data } = await query.maybeSingle()
  return Boolean(data)
}

async function replaceShipmentItems(
  admin: ReturnType<typeof createAdminClient>,
  shipmentId: string,
  items: NormalizedItem[]
) {
  const { error: deleteItemsError } = await admin
    .from('shipment_items')
    .delete()
    .eq('shipment_id', shipmentId)

  if (deleteItemsError) return deleteItemsError.message

  const { error: insertItemsError } = await admin.from('shipment_items').insert(
    items.map((item) => ({
      shipment_id: shipmentId,
      product_id: item.product_id,
      quantity_sent: item.quantity_sent,
      unit_price: item.unit_price,
    }))
  )

  if (insertItemsError) return insertItemsError.message
  return null
}

async function deleteShipmentTree(admin: ReturnType<typeof createAdminClient>, shipmentId: string) {
  const { error: deleteConfirmationError } = await admin
    .from('inventory_confirmations')
    .delete()
    .eq('shipment_id', shipmentId)

  if (deleteConfirmationError) return deleteConfirmationError.message

  const { error: deleteItemsError } = await admin
    .from('shipment_items')
    .delete()
    .eq('shipment_id', shipmentId)

  if (deleteItemsError) return deleteItemsError.message

  const { error: deleteShipmentError } = await admin
    .from('daily_shipments')
    .delete()
    .eq('id', shipmentId)

  if (deleteShipmentError) return deleteShipmentError.message
  return null
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as CreateShipmentBody | BulkShipmentBody
  const admin = createAdminClient()

  if ('action' in body && body.action) {
    const ids = Array.from(new Set((body.ids ?? []).map((id) => id.trim()).filter(Boolean)))
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one shipment.' }, { status: 400 })
    }

    if (body.action === 'bulk_status') {
      if (!body.status || !VALID_STATUSES.has(body.status)) {
        return NextResponse.json({ error: 'A valid bulk status is required.' }, { status: 400 })
      }

      const nextStatus = body.status as 'pending' | 'confirmed'
      const { error } = await admin
        .from('daily_shipments')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .in('id', ids)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    if (body.action === 'bulk_delete') {
      for (const id of ids) {
        const deleteError = await deleteShipmentTree(admin, id)
        if (deleteError) {
          return NextResponse.json({ error: deleteError }, { status: 400 })
        }
      }

      return NextResponse.json({ success: true })
    }

    if (body.action === 'duplicate') {
      const shipmentDate = body.shipment_date?.trim() || formatLocalDate(new Date())
      const created: string[] = []

      for (const id of ids) {
        const { data: shipment } = await admin
          .from('daily_shipments')
          .select('store_id')
          .eq('id', id)
          .single()

        if (!shipment) {
          return NextResponse.json({ error: 'Shipment not found for duplication.' }, { status: 404 })
        }

        const duplicateExists = await ensureNoDuplicateShipment(admin, shipment.store_id, shipmentDate)
        if (duplicateExists) {
          return NextResponse.json(
            { error: 'A shipment for one of the selected stores already exists on the target date.' },
            { status: 400 }
          )
        }

        const { data: items } = await admin
          .from('shipment_items')
          .select('product_id, quantity_sent, unit_price')
          .eq('shipment_id', id)

        const { data: createdShipment, error: createError } = await admin
          .from('daily_shipments')
          .insert({
            shipment_date: shipmentDate,
            store_id: shipment.store_id,
            created_by: auth.user.id,
            status: 'pending',
          })
          .select('id')
          .single()

        if (createError || !createdShipment) {
          return NextResponse.json({ error: createError?.message ?? 'Failed to duplicate shipment.' }, { status: 400 })
        }

        const itemError = await replaceShipmentItems(admin, createdShipment.id, normalizeItems(items ?? []))
        if (itemError) {
          return NextResponse.json({ error: itemError }, { status: 400 })
        }

        created.push(createdShipment.id)
      }

      return NextResponse.json({ success: true, created })
    }
  }

  const createBody = body as CreateShipmentBody
  const shipmentDate = createBody.shipment_date?.trim()
  const storeId = createBody.store_id?.trim()
  const status = createBody.status?.trim() || 'pending'
  const items = normalizeItems(createBody.items)

  if (!storeId) {
    return NextResponse.json({ error: 'Store is required.' }, { status: 400 })
  }

  if (!shipmentDate) {
    return NextResponse.json({ error: 'Shipment date is required.' }, { status: 400 })
  }

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Shipment status is invalid.' }, { status: 400 })
  }

  const itemValidationError = validateItems(items)
  if (itemValidationError) {
    return NextResponse.json({ error: itemValidationError }, { status: 400 })
  }

  const duplicateExists = await ensureNoDuplicateShipment(admin, storeId, shipmentDate)
  if (duplicateExists) {
    return NextResponse.json({ error: 'A shipment already exists for this store on that date.' }, { status: 400 })
  }

  const nextStatus = status as 'pending' | 'confirmed'
  const { data: createdShipment, error: shipmentError } = await admin
    .from('daily_shipments')
    .insert({
      shipment_date: shipmentDate,
      store_id: storeId,
      created_by: auth.user.id,
      status: nextStatus,
    })
    .select('id, shipment_code')
    .single()

  if (shipmentError || !createdShipment) {
    return NextResponse.json({ error: shipmentError?.message ?? 'Failed to create shipment.' }, { status: 400 })
  }

  const itemError = await replaceShipmentItems(admin, createdShipment.id, items)
  if (itemError) {
    await deleteShipmentTree(admin, createdShipment.id)
    return NextResponse.json({ error: itemError }, { status: 400 })
  }

  return NextResponse.json({ success: true, id: createdShipment.id, shipment_code: createdShipment.shipment_code })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as UpdateShipmentBody
  const id = body.id?.trim()
  const storeId = body.store_id?.trim()
  const shipmentDate = body.shipment_date?.trim()
  const status = body.status?.trim()
  const items = normalizeItems(body.items)

  if (!id) {
    return NextResponse.json({ error: 'Shipment ID is required.' }, { status: 400 })
  }

  if (!storeId) {
    return NextResponse.json({ error: 'Store is required.' }, { status: 400 })
  }

  if (!shipmentDate) {
    return NextResponse.json({ error: 'Shipment date is required.' }, { status: 400 })
  }

  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Shipment status is required.' }, { status: 400 })
  }

  const itemValidationError = validateItems(items)
  if (itemValidationError) {
    return NextResponse.json({ error: itemValidationError }, { status: 400 })
  }

  const admin = createAdminClient()
  const duplicateExists = await ensureNoDuplicateShipment(admin, storeId, shipmentDate, id)
  if (duplicateExists) {
    return NextResponse.json({ error: 'Another shipment already exists for this store on that date.' }, { status: 400 })
  }

  const nextStatus = status as 'pending' | 'confirmed'
  const { error: shipmentError } = await admin
    .from('daily_shipments')
    .update({
      store_id: storeId,
      shipment_date: shipmentDate,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (shipmentError) {
    return NextResponse.json({ error: shipmentError.message }, { status: 400 })
  }

  const { error: confirmationError } = await admin
    .from('inventory_confirmations')
    .update({ store_id: storeId })
    .eq('shipment_id', id)

  if (confirmationError) {
    return NextResponse.json({ error: confirmationError.message }, { status: 400 })
  }

  const itemError = await replaceShipmentItems(admin, id, items)
  if (itemError) {
    return NextResponse.json({ error: itemError }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()

  if (!id) {
    return NextResponse.json({ error: 'Shipment ID is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const deleteError = await deleteShipmentTree(admin, id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
