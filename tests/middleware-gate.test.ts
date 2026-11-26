import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The sign-in middleware's speed-ups: the staff lookup is remembered for a minute, and AUTH_FAST_CHECK=1 checks the token locally.
// (The sign-in rules themselves are in mfa.test.ts and password-middleware.test.ts.)
const h = vi.hoisted(() => ({ user: null as any, claims: null as any, staff: null as any, aal: null as any, calls: { getUser: 0, getClaims: 0, staff: 0 } }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => { h.calls.getUser++; return { data: { user: h.user } } },
      getClaims: async () => { h.calls.getClaims++; return { data: { claims: h.claims } } },
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: h.aal }) },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { h.calls.staff++; return { data: h.staff } } }) }) }),
  }),
}))
import { middleware } from '@/middleware'

const VERIFIED = { currentLevel: 'aal2', nextLevel: 'aal2' }
const user = { id: '11111111-2222-3333-4444-555555555555', app_metadata: {} }
const go = (path: string, cookie = '') => middleware(new NextRequest('https://swaasa.test' + path, { headers: cookie ? { cookie } : {} }))
const gateCookie = (res: Response) => /sw_gate=([^;]+)/.exec(res.headers.get('set-cookie') || '')?.[1]

describe('middleware: staff lookup is remembered, not repeated', () => {
  beforeEach(() => {
    Object.assign(h, { user, claims: null, staff: { role: 'manager', active: true }, aal: VERIFIED, calls: { getUser: 0, getClaims: 0, staff: 0 } })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'; delete process.env.AUTH_FAST_CHECK
  })
  it('looks the person up once, hands out a cookie, and skips the lookup while the cookie is valid', async () => {
    const first = await go('/admin'); expect(first.headers.get('x-middleware-next')).toBe('1'); expect(h.calls.staff).toBe(1)
    const cookie = gateCookie(first); expect(cookie).toBeTruthy(); expect(first.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    const second = await go('/admin', `sw_gate=${cookie}`); expect(second.headers.get('x-middleware-next')).toBe('1'); expect(h.calls.staff).toBe(1)
  })
  it('ignores a forged cookie, or one made for someone else, and looks up again', async () => {
    await go('/admin', 'sw_gate=v1.' + user.id + '.owner.9999999999.' + 'a'.repeat(64)); expect(h.calls.staff).toBe(1)
    const cookie = gateCookie(await go('/admin'))!; h.user = { ...user, id: '99999999-2222-3333-4444-555555555555' }; h.calls.staff = 0
    await go('/admin', `sw_gate=${cookie}`); expect(h.calls.staff).toBe(1)
  })
  it('never remembers "not staff" or "switched off": the next request looks again', async () => {
    h.staff = { role: 'manager', active: false }
    const r = await go('/admin'); expect(new URL(r.headers.get('location')!).pathname).toBe('/login'); expect(gateCookie(r)).toBeUndefined()
    h.staff = null; await go('/admin'); expect(h.calls.staff).toBe(2)
  })
  it('does not remember anything when the server key is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY; const r = await go('/admin'); expect(r.headers.get('x-middleware-next')).toBe('1'); expect(gateCookie(r)).toBeUndefined()
  })
  it('still applies the two-step rule to a remembered person', async () => {
    const cookie = gateCookie(await go('/admin'))!; h.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
    expect(new URL((await go('/admin', `sw_gate=${cookie}`)).headers.get('location')!).pathname).toBe('/login')
  })
  it('keeps the new public pages and the monitoring and report routes open without a login', async () => {
    h.user = null
    for (const p of ['/faq', '/faq/', '/bridal-lehenga-rental-trivandrum', '/api/csp-report', '/monitoring', '/monitoring?o=1']) expect((await go(p)).headers.get('x-middleware-next'), p).toBe('1')
    expect((await go('/admin')).status).toBe(307)
  })
})

describe('middleware: AUTH_FAST_CHECK=1 (token checked locally)', () => {
  beforeEach(() => {
    Object.assign(h, { user: null, claims: { sub: user.id, app_metadata: {} }, staff: { role: 'manager', active: true }, aal: VERIFIED, calls: { getUser: 0, getClaims: 0, staff: 0 } })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'; process.env.AUTH_FAST_CHECK = '1'
  })
  it('uses the token and makes no call to Supabase\'s user endpoint', async () => {
    expect((await go('/admin')).headers.get('x-middleware-next')).toBe('1'); expect(h.calls.getClaims).toBe(1); expect(h.calls.getUser).toBe(0)
  })
  it('treats a missing or invalid token as signed out', async () => {
    h.claims = null; expect(new URL((await go('/admin')).headers.get('location')!).pathname).toBe('/login')
  })
  it('asks Supabase again when the token still carries the "choose a new password" flag, which may already be cleared', async () => {
    h.claims = { sub: user.id, app_metadata: { must_change_password: true } }; h.user = { ...user, app_metadata: { must_change_password: false } }
    expect((await go('/admin')).headers.get('x-middleware-next')).toBe('1'); expect(h.calls.getUser).toBe(1)
    h.user = { ...user, app_metadata: { must_change_password: true } }
    expect(new URL((await go('/admin')).headers.get('location')!).pathname).toBe('/account/password')
  })
})
