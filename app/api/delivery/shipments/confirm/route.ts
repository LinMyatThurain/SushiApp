import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database.types'

type DeliveryBody = {
  shipment_id?: string
  signer_name?: string
  signature_data?: string
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

  return { user }
}

export async function POST(request: Request) {
  const auth = await requireDeliveryUser()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as DeliveryBody
  const shipmentId = body.shipment_id?.trim()
  const signerName = body.signer_name?.trim() ?? ''
  const signatureData = body.signature_data?.trim() ?? ''

  if (!shipmentId) {
    return NextResponse.json({ error: 'Shipment is required.' }, { status: 400 })
  }

  if (!signatureData) {
    return NextResponse.json({ error: 'Signature is required.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: shipment, error: shipmentError } = await admin
    .from('daily_shipments')
    .select('id, store_id, status')
    .eq('id', shipmentId)
    .maybeSingle()

  if (shipmentError) {
    return NextResponse.json({ error: shipmentError.message }, { status: 400 })
  }

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found.' }, { status: 404 })
  }

  if (shipment.status === 'confirmed') {
    return NextResponse.json({ error: 'Shipment is already confirmed.' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error: confirmationError } = await admin.from('inventory_confirmations').upsert(
    {
      shipment_id: shipmentId,
      store_id: shipment.store_id,
      confirmed_by: auth.user.id,
      confirmed_at: now,
      signer_name: signerName || null,
      signature_data: signatureData,
    },
    { onConflict: 'shipment_id' }
  )

  if (confirmationError) {
    return NextResponse.json({ error: confirmationError.message }, { status: 400 })
  }

  const { error: shipmentUpdateError } = await admin
    .from('daily_shipments')
    .update({ status: 'confirmed', updated_at: now })
    .eq('id', shipmentId)

  if (shipmentUpdateError) {
    await admin.from('inventory_confirmations').delete().eq('shipment_id', shipmentId)
    return NextResponse.json({ error: shipmentUpdateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
