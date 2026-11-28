import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { mfaGate } from '@/lib/mfa'
import { CHANGE_PASSWORD_PAGE, isPasswordChangePath, mustChangePassword } from '@/lib/passwordGate'
import { GATE_COOKIE, GATE_SECONDS, readGate, signGate } from '@/lib/staffGate'
import { PUBLIC_PAGES } from '@/lib/site'
// The customer landing page, customer stories and its guide pages (FAQ, area page), booking tracker, viewing-request form, crawl rules (robots.txt, sitemap.xml), selected promotional reels and designated public images are public. Inventory,
// dress pages, admin pages and other APIs stay behind active-staff authentication (with two-step login for owner and manager, see lib/mfa.ts); dress photos are protected in Storage.
//
// Per staff request this used to make three Supabase calls one after another (who is it, are they staff, which two-step level). Now:
//  - "are they staff" is remembered for 60 seconds in a signed cookie (lib/staffGate.ts), so in the steady state it costs nothing;
//  - the two-step level is read from the session already in the cookie (no network);
//  - "who is it" is still confirmed with Supabase by default. Set AUTH_FAST_CHECK=1 to check the sign-in token locally instead (no network at all;
//    see README-fixes-2026-11-25.md for the trade-off: a login that was revoked stays valid until its token expires, up to an hour).
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname, isApi = path.startsWith('/api/')
  const publicImage = path === '/home-hero-luxury.jpg' || path === '/studio-boutique-visit.jpg' ||
    (/^\/(?:category-images|customer-stories)\/[A-Za-z0-9._/-]+\.(?:png|jpe?g|webp)$/i.test(path) && !path.split('/').includes('..'))
  if (path === '/' || path === '/booking' || path === '/booking/' || path === '/robots.txt' || path === '/sitemap.xml' || path === '/api/customer-booking/track' || path === '/api/viewing-request' || path === '/api/csp-report' || path.startsWith('/monitoring') || PUBLIC_PAGES.includes(path.replace(/\/+$/, '')) || publicImage || /^\/reels\/reel-[1-8](?:\.mp4|-poster\.webp)$/i.test(path)) return NextResponse.next()
  // The scheduled reminders (GitHub Actions) have no browser login. That route checks its own secret (CRON_SECRET) and nothing else is open.
  if (path.startsWith('/api/cron/')) return NextResponse.next()
  let res = NextResponse.next({ request: req })
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (c: { name: string; value: string; options?: any }[]) => {
      c.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req })
      c.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) } },
  })
  const deny = (to: string) => isApi ? NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) : NextResponse.redirect(new URL(to, req.url))

  // Who is it?
  type Who = { id: string; app_metadata?: Record<string, unknown> | null }
  let user: Who | null = null
  const auth = sb.auth as any
  if (process.env.AUTH_FAST_CHECK === '1' && typeof auth.getClaims === 'function') {
    try {
      const c = (await auth.getClaims()).data?.claims
      user = c?.sub ? { id: c.sub, app_metadata: c.app_metadata } : null
      // The flag that forces a new password is cleared on the server, but a token issued before that still carries it: confirm with Supabase.
      if (user && mustChangePassword(user)) user = (await sb.auth.getUser()).data.user
    } catch { user = (await sb.auth.getUser()).data.user }
  } else user = (await sb.auth.getUser()).data.user

  // Are they active staff? Remembered for a minute (a positive answer only).
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  let st: { role: string; active: boolean } | null = null, remember: string | null = null
  if (user) {
    const cachedRole = secret ? await readGate(secret, req.cookies.get(GATE_COOKIE)?.value, user.id) : null
    if (cachedRole) st = { role: cachedRole, active: true }
    else {
      const { data } = await sb.from('staff').select('role,active').eq('user_id', user.id).maybeSingle()      // someone who is not (or no longer) staff gets nothing
      st = data
      if (secret && st?.active) remember = await signGate(secret, user.id, st.role)
    }
  }
  const pass = () => {
    if (remember) res.cookies.set(GATE_COOKIE, remember, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: GATE_SECONDS })
    return res
  }
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
  return pass()
}
export const config = { matcher: ['/((?!_next/static|_next/image|monitoring|favicon.ico|logo-mark.png|poster.jpg|hero.mp4|og-image.jpg|apple-touch-icon.png|icon-192.png|icon-512.png).*)'] }
