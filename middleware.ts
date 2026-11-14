import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
// The whole site is private: every page and every API route needs a signed-in staff login (only /login is open).
// The database enforces the same rule on the data itself, so this is a second lock, not the only one.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname, isApi = path.startsWith('/api/')
  // The scheduled reminders (GitHub Actions) have no browser login. That route checks its own secret (CRON_SECRET) and nothing else is open.
  if (path.startsWith('/api/cron/')) return NextResponse.next()
  let res = NextResponse.next({ request: req })
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (c: { name: string; value: string; options?: any }[]) => {
      c.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req })
      c.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) } },
  })
  const deny = (to: string) => isApi ? NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) : NextResponse.redirect(new URL(to, req.url))
  const { data: { user } } = await sb.auth.getUser()
  // Two-step login: a person who has switched it on (Settings) is only let in after the 6-digit code, not on the password alone.
  const aal = user ? (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data : null
  const needCode = !!user && aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2'
  if (path === '/login') {
    if (user && !needCode && !req.nextUrl.searchParams.has('denied')) {       // already signed in: skip the form and open the dashboard
      const { data: s0 } = await sb.from('staff').select('active').eq('user_id', user.id).maybeSingle()
      if (s0?.active) return NextResponse.redirect(new URL('/admin', req.url))
    }
    return res
  }
  if (!user) return deny('/login')
  if (needCode) return deny('/login?mfa=1')
  const { data: st } = await sb.from('staff').select('role,active').eq('user_id', user.id).maybeSingle()      // someone who is not (or no longer) staff gets nothing
  if (!st || !st.active) return deny('/login?denied=1')
  return res
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-mark.png|logo-full.jpg|poster.jpg|hero.mp4).*)'] }
