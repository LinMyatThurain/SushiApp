import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database.types'

type CreateBody = {
  name?: string
  email?: string
  password?: string
  role?: 'admin' | 'delivery'
}

type UpdateBody = {
  id?: string
  name?: string
  email?: string
  password?: string
  role?: 'admin' | 'delivery'
}

function fallbackName(email: string) {
  return email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || email
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

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as CreateBody
  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password?.trim()
  const role = body.role === 'admin' ? 'admin' : body.role === 'delivery' ? 'delivery' : undefined

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  if (!role) {
    return NextResponse.json({ error: 'Role is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const resolvedName = name || fallbackName(email)

  const { data: existingProfile } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile) {
    return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 400 })
  }

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, name: resolvedName },
  })

  if (createError || !createdUser.user) {
    return NextResponse.json({ error: createError?.message ?? 'Failed to create auth user.' }, { status: 400 })
  }

  const { error: profileError } = await admin.from('users').upsert(
    {
      id: createdUser.user.id,
      name: resolvedName,
      email,
      role,
      store_id: null,
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    await admin.auth.admin.deleteUser(createdUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({
    id: createdUser.user.id,
    name: resolvedName,
    email,
    role,
  })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as UpdateBody
  const id = body.id?.trim()
  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password?.trim()
  const role = body.role === 'admin' ? 'admin' : body.role === 'delivery' ? 'delivery' : undefined

  if (!id) {
    return NextResponse.json({ error: 'User ID is required.' }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  if (password && password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  if (!role) {
    return NextResponse.json({ error: 'Role is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const resolvedName = name || fallbackName(email)

  const updatePayload: {
    email: string
    password?: string
    user_metadata: { role: 'admin' | 'delivery'; name: string }
    email_confirm?: boolean
  } = {
    email,
    user_metadata: { role, name: resolvedName },
    email_confirm: true,
  }

  if (password) {
    updatePayload.password = password
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, updatePayload)

  if (authUpdateError) {
    return NextResponse.json({ error: authUpdateError.message }, { status: 400 })
  }

  const { error: profileError } = await admin
    .from('users')
    .update({ name: resolvedName, email, role, store_id: null })
    .eq('id', id)

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()

  if (!id) {
    return NextResponse.json({ error: 'User ID is required.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: profileError } = await admin.from('users').delete().eq('id', id)
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(id)
  if (authDeleteError) {
    return NextResponse.json({ error: authDeleteError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
