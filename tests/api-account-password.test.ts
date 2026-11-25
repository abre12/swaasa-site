import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ user: null as any, updateUserById: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  supaServer: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) } }),
  supaAdmin: () => ({ auth: { admin: { updateUserById: m.updateUserById } } }),
}))
import { POST } from '@/app/api/account/password/route'

const call = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request('https://swaasa.test/api/account/password', { method: 'POST', body, headers: { host: 'swaasa.test', origin: 'https://swaasa.test', ...headers } }))

beforeEach(() => { vi.clearAllMocks(); m.user = { id: 'u1', email: 'sales1@swaasa.test' }; m.updateUserById.mockResolvedValue({ error: null }) })

describe('/api/account/password', () => {
  it('needs a signed-in person', async () => { m.user = null; expect((await call('{"password":"Tulip-Harbour-48"}')).status).toBe(401); expect(m.updateUserById).not.toHaveBeenCalled() })
  it('refuses another website', async () => { expect((await call('{"password":"Tulip-Harbour-48"}', { origin: 'https://evil.example' })).status).toBe(403) })
  it('answers 400 for a broken body, a missing password, and a weak one', async () => {
    for (const body of ['{', '[]', '{}', '{"password":12345678901}', '{"password":"short"}', '{"password":"Password123"}', '{"password":"sales1-Fresh-77"}']) {
      expect((await call(body)).status, body).toBe(400)
    }
    expect(m.updateUserById).not.toHaveBeenCalled()
  })
  it('sets the password for the signed-in person only, and clears the "must change" flag', async () => {
    const r = await call('{"password":"Tulip-Harbour-48","user_id":"someone-else"}'); expect(r.status).toBe(200)
    expect(m.updateUserById).toHaveBeenCalledWith('u1', { password: 'Tulip-Harbour-48', app_metadata: { must_change_password: false } })
  })
  it('says so when the login service fails, and does not claim success', async () => {
    m.updateUserById.mockResolvedValue({ error: { message: 'x' } }); expect((await call('{"password":"Tulip-Harbour-48"}')).status).toBe(500)
  })
})
