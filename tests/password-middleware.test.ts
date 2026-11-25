import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The middleware with a stand-in for Supabase, as in mfa.test.ts, to check the "choose your own password" gate.
const h = vi.hoisted(() => ({ user: null as any, staff: null as any, aal: null as any }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: h.aal }) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.staff }) }) }) }),
  }),
}))
import { middleware } from '@/middleware'

const VERIFIED = { currentLevel: 'aal2', nextLevel: 'aal2' }, NO_FACTOR = { currentLevel: 'aal1', nextLevel: 'aal1' }
const temp = { id: 'u1', email: 'new@swaasa.test', app_metadata: { must_change_password: true } }
const settled = { id: 'u1', email: 'new@swaasa.test', app_metadata: { must_change_password: false } }
async function run(path: string, user: any, staff: any, aal: any) {
  h.user = user; h.staff = staff; h.aal = aal
  const res = await middleware(new NextRequest('https://swaasa.test' + path))
  const loc = res.headers.get('location')
  return { status: res.status, to: loc ? new URL(loc).pathname : null, passes: res.headers.get('x-middleware-next') === '1', body: res.headers.get('content-type')?.includes('json') ? await res.json() : null }
}
const manager = { role: 'manager', active: true }, prep = { role: 'preparation', active: true }

describe('middleware: choose-your-own-password gate', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon' })

  it('sends a page request to the change-password page', async () => {
    for (const p of ['/admin', '/collection', '/dress/abc', '/admin/performance']) expect(await run(p, temp, manager, VERIFIED)).toMatchObject({ to: '/account/password' })
  })
  it('answers an API request with 403 and a code the screen can act on', async () => {
    const r = await run('/api/staff', temp, manager, VERIFIED)
    expect(r.status).toBe(403); expect(r.body).toMatchObject({ code: 'password_change_required' })
    expect((await run('/api/close-day', temp, manager, VERIFIED)).status).toBe(403)
  })
  it('keeps the change-password page and its API open', async () => {
    expect((await run('/account/password', temp, manager, VERIFIED)).passes).toBe(true)
    expect((await run('/api/account/password', temp, manager, VERIFIED)).passes).toBe(true)
  })
  it('applies to every role, including one that has no two-step login', async () => {
    expect(await run('/admin', temp, prep, NO_FACTOR)).toMatchObject({ to: '/account/password' })
  })
  it('lets the person in once the flag is cleared', async () => {
    expect((await run('/admin', settled, manager, VERIFIED)).passes).toBe(true)
    expect((await run('/admin', { id: 'u1', email: 'a@b.c' }, manager, VERIFIED)).passes).toBe(true)   // an older login with no flag at all
  })
  it('still asks for the two-step code first, then the password change', async () => {
    expect(await run('/admin', temp, manager, { currentLevel: 'aal1', nextLevel: 'aal2' })).toMatchObject({ to: '/login' })
    expect(await run('/admin', temp, manager, NO_FACTOR)).toMatchObject({ to: '/login' })       // manager must set up two-step login before anything else
  })
  it('does not interfere with the public pages or with someone not signed in', async () => {
    expect((await run('/', temp, manager, VERIFIED)).passes).toBe(true)
    expect(await run('/admin', null, null, null)).toMatchObject({ to: '/login' })
  })
  it('does not let a deactivated account use the change-password page', async () => {
    expect(await run('/account/password', temp, { role: 'manager', active: false }, VERIFIED)).toMatchObject({ to: '/login' })
  })
})
