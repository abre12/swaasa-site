import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
// The whole site is private: every page and every API route needs a signed-in staff login (only /login is open).
// The database enforces the same rule on the data itself, so this is a second lock, not the only one.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname, isApi = path.startsWith('/api/')
  let res = NextResponse.next({ request: req })
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (c) => {
      c.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req })
      c.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) } },
  })
  const deny = (to: string) => isApi ? NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) : NextResponse.redirect(new URL(to, req.url))
  const { data: { user } } = await sb.auth.getUser()
  if (path === '/login') return res
  if (!user) return deny('/login')
  const { data: st } = await sb.from('staff').select('role,active').eq('user_id', user.id).maybeSingle()      // someone who is not (or no longer) staff gets nothing
  if (!st || !st.active) return deny('/login?denied=1')
  return res
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-mark.png|logo-full.jpg|poster.jpg|hero.mp4).*)'] }
