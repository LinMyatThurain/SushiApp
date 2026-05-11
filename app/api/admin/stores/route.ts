import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database.types'

type StoreBody = {
  id?: string
  name?: string
  location?: string | null
  manager_name?: string | null
  status?: string
}

type StoreStatus = Database['public']['Tables']['stores']['Row']['status']

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

function normalizeStore(body: StoreBody) {
  const name = body.name?.trim()
  const status: StoreStatus | null = body.status === 'inactive' ? 'inactive' : body.status === 'active' ? 'active' : null

  if (!name) return { error: 'Store name is required.' }
  if (!status) return { error: 'Store status is invalid.' }

  return {
    payload: {
      name,
      location: body.location?.trim() || null,
      manager_name: body.manager_name?.trim() || null,
      status,
      updated_at: new Date().toISOString(),
    },
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as StoreBody
  const normalized = normalizeStore(body)
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('stores').insert(normalized.payload)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as StoreBody
  const id = body.id?.trim()
  if (!id) {
    return NextResponse.json({ error: 'Store ID is required.' }, { status: 400 })
  }

  const normalized = normalizeStore(body)
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('stores').update(normalized.payload).eq('id', id)

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
    return NextResponse.json({ error: 'Store ID is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('stores').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
