import { beforeEach, describe, expect, it, vi } from 'vitest'

// The two public POST routes. Their limits live in module memory, so every test gets a fresh copy of the route.
const m = vi.hoisted(() => ({ send: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: m.send }))
vi.mock('@/lib/supabase/server', () => ({ supaAdmin: () => ({ rpc: m.rpc }) }))

const H = { host: 'swaasa.test', origin: 'https://swaasa.test', 'content-type': 'application/json' }
const post = (url: string, body: string, headers: Record<string, string> = {}) => new Request(`https://swaasa.test${url}`, { method: 'POST', body, headers: { ...H, ...headers } }) as any
let n = 0
const viewing = { name: 'Anjali Nair', phone: '98765 43210', lookingFor: 'Gown' }

describe('/api/viewing-request', () => {
  let POST: (r: any) => Promise<Response>
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); m.send.mockResolvedValue(undefined)
    process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_OWNER_CHAT_ID = '1'; process.env.TELEGRAM_STAFF_CHAT_ID = '2'
    ;({ POST } = await import('@/app/api/viewing-request/route'))
  })
  const send = (b: object, h: Record<string, string> = {}) => POST(post('/api/viewing-request', JSON.stringify(b), { 'x-vercel-forwarded-for': `10.0.0.${++n}`, ...h }))

  it('sends a good request to both chats', async () => {
    expect((await send(viewing)).status).toBe(200); expect(m.send).toHaveBeenCalledTimes(2)
  })
  it('refuses another site, a "null" origin, a huge body and bad JSON', async () => {
    expect((await send(viewing, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await send(viewing, { origin: 'null' })).status).toBe(403)
    expect((await POST(post('/api/viewing-request', '{', { 'x-vercel-forwarded-for': '9.9.9.9' }))).status).toBe(400)
    expect((await POST(post('/api/viewing-request', JSON.stringify(viewing), { 'content-length': '99999' }))).status).toBe(413)
    expect(m.send).not.toHaveBeenCalled()
  })
  it('quietly ignores a bot that fills the hidden field', async () => {
    const r = await send({ ...viewing, website: 'http://spam' }); expect(r.status).toBe(200); expect(m.send).not.toHaveBeenCalled()
  })
  it('asks for a name and a valid mobile', async () => { expect((await send({ name: 'A', phone: '1' })).status).toBe(400) })
  it('does not message the team twice for a double tap', async () => {
    await send(viewing); await send(viewing); expect(m.send).toHaveBeenCalledTimes(2)   // two chats, once
  })
  it('limits one visitor to 4 requests an hour', async () => {
    const same = { 'x-vercel-forwarded-for': '7.7.7.7' }
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await POST(post('/api/viewing-request', JSON.stringify({ ...viewing, phone: `9876543${100 + i}` }), same))).status)
    expect(statuses).toEqual([200, 200, 200, 200, 429, 429])
  })
  it('says so when Telegram is not set up, or when every send fails', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN; expect((await send(viewing)).status).toBe(503)
    process.env.TELEGRAM_BOT_TOKEN = 't'; m.send.mockRejectedValue(new Error('down')); expect((await send({ ...viewing, phone: '9123456780' })).status).toBe(502)
  })
})

describe('/api/customer-booking/track', () => {
  let POST: (r: any) => Promise<Response>
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
    ;({ POST } = await import('@/app/api/customer-booking/track/route'))
  })
  const track = (b: unknown, h: Record<string, string> = {}) => POST(post('/api/customer-booking/track', typeof b === 'string' ? b : JSON.stringify(b), h))
  const row = { allowed: true, booking_id: 'SW1A2B3C4', booking_status: 'confirmed', prep_status: 'ready', start_date: '2026-12-01', end_date: '2026-12-03', event_date: null, event_type: null }

  it('returns the progress for a matching booking and phone', async () => {
    m.rpc.mockResolvedValue({ data: [row], error: null })
    const r = await track({ bookingId: ' sw1a2b3c4 ', phone: '+91 98765 43210' }); expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ bookingId: 'SW1A2B3C4', bookingStatus: 'confirmed', prepStatus: 'ready' })
    expect(m.rpc).toHaveBeenCalledWith('customer_booking_track', expect.objectContaining({ p_booking_id: 'SW1A2B3C4', p_phone: '919876543210', p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }))
  })
  it('never sends the raw IP address to the database', async () => {
    m.rpc.mockResolvedValue({ data: [row], error: null }); await track({ bookingId: 'SW1A2B3C4', phone: '9876543210' }, { 'x-vercel-forwarded-for': '203.0.113.9' })
    expect(JSON.stringify(m.rpc.mock.calls)).not.toContain('203.0.113.9')
  })
  it('refuses another site, bad JSON, non-objects and bad input before touching the database', async () => {
    expect((await track({ bookingId: 'SW1A2B3C4', phone: '9876543210' }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await track({ bookingId: 'SW1A2B3C4', phone: '9876543210' }, { origin: 'null' })).status).toBe(403)
    for (const b of ['{', '[]', 'null', '{}', { bookingId: 'x', phone: '9876543210' }, { bookingId: 'SW1A2B3C4', phone: '123' }, { bookingId: 'SW 1!', phone: '9876543210' }]) expect((await track(b)).status, JSON.stringify(b)).toBe(400)
    expect((await POST(post('/api/customer-booking/track', '{}', { 'content-length': '99999' }))).status).toBe(413)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('answers 404 for no match, 429 when the visitor is over the limit, 503 when the database fails', async () => {
    const ok = { bookingId: 'SW1A2B3C4', phone: '9876543210' }
    m.rpc.mockResolvedValue({ data: [], error: null }); expect((await track(ok)).status).toBe(404)
    m.rpc.mockResolvedValue({ data: [{ allowed: false }], error: null }); expect((await track(ok)).status).toBe(429)
    m.rpc.mockResolvedValue({ data: null, error: { message: 'x' } }); expect((await track(ok)).status).toBe(503)
    m.rpc.mockRejectedValue(new Error('network')); expect((await track(ok)).status).toBe(503)
    delete process.env.SUPABASE_SERVICE_ROLE_KEY; expect((await track(ok)).status).toBe(503)
  })
})
