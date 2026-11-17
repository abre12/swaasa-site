import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { mfaGate, mfaRequired } from '@/lib/mfa'

// What Supabase reports for a session:
const NO_FACTOR = { currentLevel: 'aal1', nextLevel: 'aal1' }      // password only, never set up two-step login
const NEEDS_CODE = { currentLevel: 'aal1', nextLevel: 'aal2' }     // has an authenticator, has not entered the code yet
const VERIFIED = { currentLevel: 'aal2', nextLevel: 'aal2' }       // password and code both checked

describe('mfaRequired', () => {
  it('requires it for owner and manager only', () => {
    expect(mfaRequired('owner')).toBe(true)
    expect(mfaRequired('manager')).toBe(true)
    expect(mfaRequired('preparation')).toBe(false)
    expect(mfaRequired(null)).toBe(false)
    expect(mfaRequired(undefined)).toBe(false)
    expect(mfaRequired('')).toBe(false)
  })
})

describe('mfaGate', () => {
  it('H1: owner and manager with a password only are sent to set it up', () => {
    expect(mfaGate('owner', NO_FACTOR)).toBe('need_setup')
    expect(mfaGate('manager', NO_FACTOR)).toBe('need_setup')
  })
  it('anyone with an authenticator must enter the code, whatever the role', () => {
    for (const r of ['owner', 'manager', 'preparation', null]) expect(mfaGate(r, NEEDS_CODE)).toBe('need_code')
  })
  it('lets through a session where the code was entered', () => {
    for (const r of ['owner', 'manager', 'preparation', null]) expect(mfaGate(r, VERIFIED)).toBe('ok')
  })
  it('keeps the preparation role optional', () => {
    expect(mfaGate('preparation', NO_FACTOR)).toBe('ok')
    expect(mfaGate(null, NO_FACTOR)).toBe('ok')
  })
  it('fails closed for a required role if the level is unknown', () => {
    expect(mfaGate('owner', null)).toBe('need_code')
    expect(mfaGate('manager', undefined)).toBe('need_code')
    expect(mfaGate('preparation', null)).toBe('ok')
  })
  it('does not let a missing level field count as verified', () => {
    expect(mfaGate('owner', {})).toBe('need_setup')
  })
})

// ---- middleware, with a stand-in for Supabase ----
const h = vi.hoisted(() => ({ user: null as any, staff: null as any, aal: null as any, calls: 0 }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: h.aal }) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.staff }) }) }) }),
  }),
}))
import { middleware } from '@/middleware'

const U = { id: 'u1', email: 'x@example.com' }
async function run(path: string, o: { user?: any; staff?: any; aal?: any } = {}) {
  h.user = 'user' in o ? o.user : U; h.staff = o.staff ?? null; h.aal = o.aal ?? null
  const res = await middleware(new NextRequest('https://swaasa.test' + path))
  const loc = res.headers.get('location')
  return { status: res.status, to: loc ? new URL(loc).pathname + new URL(loc).search : null, passes: res.headers.get('x-middleware-next') === '1', body: res.headers.get('content-type')?.includes('json') ? await res.json() : null }
}
const owner = { role: 'owner', active: true }, manager = { role: 'manager', active: true }, prep = { role: 'preparation', active: true }

describe('middleware two-step gate', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon' })

  it('H1: an owner who signed in with a password only cannot open the admin; they are sent to set up', async () => {
    expect(await run('/admin', { staff: owner, aal: NO_FACTOR })).toMatchObject({ to: '/login?mfa=setup' })
  })
  it('H1: same for a manager, and for any other staff page', async () => {
    expect(await run('/admin', { staff: manager, aal: NO_FACTOR })).toMatchObject({ to: '/login?mfa=setup' })
    expect(await run('/collection', { staff: manager, aal: NO_FACTOR })).toMatchObject({ to: '/login?mfa=setup' })
    expect(await run('/dress/abc', { staff: owner, aal: NO_FACTOR })).toMatchObject({ to: '/login?mfa=setup' })
  })
  it('staff APIs answer 403 mfa_required until setup is done, and 401 while the code is still owed', async () => {
    const a = await run('/api/staff', { staff: owner, aal: NO_FACTOR })
    expect(a.status).toBe(403); expect(a.body).toMatchObject({ code: 'mfa_required' })
    const b = await run('/api/book', { staff: manager, aal: NEEDS_CODE })
    expect(b.status).toBe(401)
  })
  it('still asks for the code when an authenticator exists', async () => {
    expect(await run('/admin', { staff: owner, aal: NEEDS_CODE })).toMatchObject({ to: '/login?mfa=1' })
    expect(await run('/admin', { staff: prep, aal: NEEDS_CODE })).toMatchObject({ to: '/login?mfa=1' })
  })
  it('lets owner and manager in once the code has been entered', async () => {
    expect((await run('/admin', { staff: owner, aal: VERIFIED })).passes).toBe(true)
    expect((await run('/admin', { staff: manager, aal: VERIFIED })).passes).toBe(true)
    expect((await run('/api/staff', { staff: owner, aal: VERIFIED })).passes).toBe(true)
  })
  it('keeps the preparation role optional', async () => {
    expect((await run('/admin', { staff: prep, aal: NO_FACTOR })).passes).toBe(true)
  })
  it('fails closed for owner if the assurance level cannot be read', async () => {
    expect(await run('/admin', { staff: owner, aal: null })).toMatchObject({ to: '/login?mfa=1' })
  })
  it('does not redirect a person who still has to set up away from the login page (no redirect loop)', async () => {
    const r = await run('/login?mfa=setup', { staff: owner, aal: NO_FACTOR })
    expect(r.to).toBeNull(); expect(r.passes).toBe(true)
    expect((await run('/login', { staff: owner, aal: NO_FACTOR })).to).toBeNull()
    expect((await run('/login?mfa=1', { staff: owner, aal: NEEDS_CODE })).to).toBeNull()
  })
  it('skips the login form for a fully signed-in staff member', async () => {
    expect(await run('/login', { staff: owner, aal: VERIFIED })).toMatchObject({ to: '/admin' })
    expect((await run('/login?denied=1', { staff: owner, aal: VERIFIED })).to).toBeNull()
  })
  it('signed-out visitors go to the login page; non-staff and deactivated logins are denied', async () => {
    expect(await run('/admin', { user: null })).toMatchObject({ to: '/login' })
    expect((await run('/api/staff', { user: null })).status).toBe(401)
    expect(await run('/admin', { staff: null, aal: NO_FACTOR })).toMatchObject({ to: '/login?denied=1' })
    expect(await run('/admin', { staff: { role: 'manager', active: false }, aal: NO_FACTOR })).toMatchObject({ to: '/login?denied=1' })
  })
  it('leaves the public pages and the cron route alone', async () => {
    for (const p of ['/', '/booking', '/robots.txt', '/api/customer-booking/track', '/reels/reel-3.mp4', '/api/cron/digest'])
      expect((await run(p, { user: null })).passes).toBe(true)
  })
})
