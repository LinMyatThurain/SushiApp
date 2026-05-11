// lib/supabase/client.ts  — browser (Client Components)
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
      },
    }
  )
}
