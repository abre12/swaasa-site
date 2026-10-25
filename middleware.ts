import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
// Every /admin page requires a signed-in staff member. Owner-only areas are double-checked by database rules.
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (c) => {
      c.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req })
      c.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) } },
  })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const { data: st } = await sb.from('staff').select('role,active').eq('user_id', user.id).maybeSingle()
  if (!st || !st.active) return NextResponse.redirect(new URL('/login?denied=1', req.url))
  return res
}
export const config = { matcher: ['/admin/:path*'] }
