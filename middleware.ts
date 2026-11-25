import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { mfaGate } from '@/lib/mfa'
import { CHANGE_PASSWORD_PAGE, isPasswordChangePath, mustChangePassword } from '@/lib/passwordGate'
// The customer landing page, booking tracker, viewing-request form, crawl rules (robots.txt, sitemap.xml) and selected promotional reels are public. Inventory,
// dress pages, admin pages and other APIs stay behind active-staff authentication (with two-step login for owner and manager, see lib/mfa.ts); dress photos are protected in Storage.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname, isApi = path.startsWith('/api/')
  if (path === '/' || path === '/booking' || path === '/booking/' || path === '/robots.txt' || path === '/sitemap.xml' || path === '/api/customer-booking/track' || path === '/api/viewing-request' || /^\/reels\/reel-[1-8](?:\.mp4|-poster\.webp)$/i.test(path)) return NextResponse.next()
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
  const { data: st } = user ? await sb.from('staff').select('role,active').eq('user_id', user.id).maybeSingle() : { data: null }      // someone who is not (or no longer) staff gets nothing
  // Two-step login (audit H1): owner and manager logins must have it set up, and anyone who has it must enter the 6-digit code, not just the password.
  const aal = user ? (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data : null
  const gate = user ? mfaGate(st?.active ? st.role : null, aal) : 'ok'
  if (path === '/login') {
    if (user && gate === 'ok' && !req.nextUrl.searchParams.has('denied') && st?.active) return NextResponse.redirect(new URL('/admin', req.url))   // already signed in: skip the form and open the dashboard
    return res
  }
  if (!user) return deny('/login')
  if (gate === 'need_code') return deny('/login?mfa=1')
  if (gate === 'need_setup') return isApi ? NextResponse.json({ error: 'Two-step login must be set up first.', code: 'mfa_required' }, { status: 403 }) : deny('/login?mfa=setup')
  if (!st || !st.active) return deny('/login?denied=1')
  // A login the owner just created, or whose password the owner reset, must choose its own password before anything else (lib/passwordGate.ts).
  if (mustChangePassword(user) && !isPasswordChangePath(path)) return isApi ? NextResponse.json({ error: 'Choose your own password first.', code: 'password_change_required' }, { status: 403 }) : NextResponse.redirect(new URL(CHANGE_PASSWORD_PAGE, req.url))
  return res
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-mark.png|poster.jpg|hero.mp4|og-image.jpg|apple-touch-icon.png|icon-192.png|icon-512.png).*)'] }
