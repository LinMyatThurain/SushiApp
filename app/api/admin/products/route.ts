import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database.types'

type ProductBody = {
  id?: string
  product_name?: string
  sku?: string
  category?: string | null
  price?: number
  cost_price?: number
  active_status?: boolean
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

function normalizeProduct(body: ProductBody) {
  const productName = body.product_name?.trim()
  const sku = body.sku?.trim().toUpperCase()
  const category = body.category?.trim() || null
  const price = Number(body.price)
  const costPrice = Number(body.cost_price ?? 0)

  if (!productName) return { error: 'Product name is required.' }
  if (!sku) return { error: 'SKU is required.' }
  if (!Number.isFinite(price) || price < 0) return { error: 'Valid price is required.' }
  if (!Number.isFinite(costPrice) || costPrice < 0) return { error: 'Valid making cost is required.' }
  if (costPrice > price) return { error: 'Making cost should not be higher than selling price.' }

  return {
    payload: {
      product_name: productName,
      sku,
      category,
      price,
      cost_price: costPrice,
      active_status: Boolean(body.active_status),
      updated_at: new Date().toISOString(),
    },
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as ProductBody
  const normalized = normalizeProduct(body)
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('sushi_products').insert(normalized.payload)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as ProductBody
  const id = body.id?.trim()
  if (!id) {
    return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 })
  }

  const normalized = normalizeProduct(body)
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('sushi_products').update(normalized.payload).eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()
  if (!id) {
    return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('sushi_products').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
