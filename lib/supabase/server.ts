import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
export const supaServer = async () => {
  const store = await cookies()   // Next 15: cookies() is asynchronous, so every caller awaits supaServer()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: (c: { name: string; value: string; options?: any }[]) => { try { c.forEach(({ name, value, options }) => store.set(name, value, options)) } catch {} } },
  })
}
// Service role: server-side only (staff management, the daily digest and the booking tracker lookup). Never import from client code.
export const supaAdmin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
