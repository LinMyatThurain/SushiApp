// proxy.ts - protect all routes, redirect by role
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (!user) {
    if (!path.startsWith('/login')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()

  const isAdmin = profile?.role === 'admin'

  if (path === '/' || path === '/login') {
    return NextResponse.redirect(
      new URL(isAdmin ? '/admin/dashboard' : '/delivery/dashboard', request.url)
    )
  }

  if (!isAdmin && path.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/delivery/dashboard', request.url))
  }

  if (path.startsWith('/store')) {
    return NextResponse.redirect(new URL('/delivery/dashboard', request.url))
  }

  if (isAdmin && path.startsWith('/delivery')) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
