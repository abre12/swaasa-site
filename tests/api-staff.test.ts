import { beforeEach, describe, expect, it, vi } from 'vitest'

// /api/staff with a stand-in for Supabase: who may call it, what it refuses, and what it sends to the login service.
const m = vi.hoisted(() => ({
  user: null as any, me: null as any, row: null as any,
  createUser: vi.fn(), updateUserById: vi.fn(), deleteUser: vi.fn(), insert: vi.fn(), update: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  supaServer: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.me }) }) }) }) }),
  supaAdmin: () => ({
    auth: { admin: { createUser: m.createUser, updateUserById: m.updateUserById, deleteUser: m.deleteUser } },
    from: () => ({ insert: m.insert, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.row }) }) }), update: (v: any) => ({ eq: async () => m.update(v) }) }),
  }),
}))
import { POST, PATCH, DELETE } from '@/app/api/staff/route'

const call = (fn: (r: Request) => Promise<Response>, body: string, headers: Record<string, string> = {}) =>
  fn(new Request('https://swaasa.test/api/staff', { method: 'POST', body, headers: { host: 'swaasa.test', origin: 'https://swaasa.test', 'content-type': 'application/json', ...headers } }))
const good = { name: 'Staff One', email: 'sales1@swaasa.test', password: 'Tulip-Harbour-48', role: 'manager' }

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'owner-1' }; m.me = { role: 'owner', active: true }; m.row = { role: 'manager', email: 'sales1@swaasa.test' }
  m.createUser.mockResolvedValue({ data: { user: { id: 'new-1' } }, error: null }); m.insert.mockResolvedValue({ error: null })
  m.updateUserById.mockResolvedValue({ error: null }); m.update.mockResolvedValue({ error: null })
})

describe('/api/staff: who may call it', () => {
  it('refuses another website (403) before looking at anything else', async () => {
    for (const fn of [POST, PATCH, DELETE]) {
      const r = await call(fn, JSON.stringify(good), { origin: 'https://evil.example' })
      expect(r.status).toBe(403)
    }
    expect(m.createUser).not.toHaveBeenCalled(); expect(m.updateUserById).not.toHaveBeenCalled()
  })
  it('refuses a "null" origin without crashing', async () => { expect((await call(POST, JSON.stringify(good), { origin: 'null' })).status).toBe(403) })
  it('refuses anyone who is not the active owner', async () => {
    for (const me of [{ role: 'manager', active: true }, { role: 'owner', active: false }, null]) {
      m.me = me
      for (const fn of [POST, PATCH, DELETE]) expect((await call(fn, JSON.stringify({ ...good, user_id: 'x' }))).status).toBe(403)
    }
    m.user = null
    expect((await call(POST, JSON.stringify(good))).status).toBe(403)
    expect(m.createUser).not.toHaveBeenCalled()
  })
})

describe('/api/staff: bad input is a clear 400, never a crash', () => {
  it('answers 400 for a body that is not JSON, or not an object', async () => {
    for (const body of ['{', '', '[1]', '"x"', 'null']) {
      const r = await call(POST, body); expect(r.status, body).toBe(400)
      expect((await r.json()).error).toMatch(/name/i)
    }
    expect((await call(PATCH, '{')).status).toBe(400)
    m.row = null   // no user_id means no matching person
    expect((await call(DELETE, '{')).status).toBe(403)   // "that account cannot be deleted", not a crash
  })
  it('refuses a weak password, naming the reason, and creates nothing', async () => {
    for (const [password, why] of [['short', /at least 10/], ['Password123', /easy to guess/], ['sales1-Fresh-77', /email name/]] as const) {
      const r = await call(POST, JSON.stringify({ ...good, password })); expect(r.status).toBe(400); expect((await r.json()).error).toMatch(why)
    }
    expect(m.createUser).not.toHaveBeenCalled()
  })
  it('refuses a role other than manager and a bad email', async () => {
    expect((await call(POST, JSON.stringify({ ...good, role: 'owner' }))).status).toBe(400)
    expect((await call(POST, JSON.stringify({ ...good, email: 'nope' }))).status).toBe(400)
  })
})

describe('/api/staff: temporary passwords', () => {
  it('creates a login that must choose its own password at first sign-in', async () => {
    const r = await call(POST, JSON.stringify(good)); expect(r.status).toBe(200)
    expect(m.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'sales1@swaasa.test', email_confirm: true, app_metadata: { must_change_password: true } }))
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'new-1', role: 'manager' }))
  })
  it('rolls the login back if the staff record cannot be saved', async () => {
    m.insert.mockResolvedValue({ error: { message: 'x' } })
    expect((await call(POST, JSON.stringify(good))).status).toBe(500); expect(m.deleteUser).toHaveBeenCalledWith('new-1')
  })
  it('reports a duplicate email in plain words', async () => {
    m.createUser.mockResolvedValue({ data: { user: null }, error: { message: 'User already registered' } })
    expect((await (await call(POST, JSON.stringify(good))).json()).error).toMatch(/already has a login/)
  })
  it('a reset is temporary too, and is checked against the person\'s email', async () => {
    const r = await call(PATCH, JSON.stringify({ user_id: 'u9', password: 'Tulip-Harbour-48' })); expect(r.status).toBe(200)
    expect(m.updateUserById).toHaveBeenCalledWith('u9', { password: 'Tulip-Harbour-48', app_metadata: { must_change_password: true } })
    expect((await call(PATCH, JSON.stringify({ user_id: 'u9', password: 'sales1-Fresh-77' }))).status).toBe(400)
  })
  it('cannot reset the owner, or someone who does not exist', async () => {
    m.row = { role: 'owner' }; expect((await call(PATCH, JSON.stringify({ user_id: 'o', password: 'Tulip-Harbour-48' }))).status).toBe(403)
    m.row = null;             expect((await call(PATCH, JSON.stringify({ user_id: 'z', password: 'Tulip-Harbour-48' }))).status).toBe(403)
  })
})

describe('/api/staff: delete', () => {
  it('locks the login and keeps the record', async () => {
    const r = await call(DELETE, JSON.stringify({ user_id: 'u9' })); expect(r.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ active: false }))
    expect(m.updateUserById).toHaveBeenCalledWith('u9', expect.objectContaining({ ban_duration: '876000h' }))
  })
  it('cannot delete the owner', async () => { m.row = { role: 'owner' }; expect((await call(DELETE, JSON.stringify({ user_id: 'o' }))).status).toBe(403) })
})
