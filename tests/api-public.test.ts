import { beforeEach, describe, expect, it, vi } from 'vitest'

// The public booking-tracker POST route (the enquiry form is in api-viewing.test.ts).
const m = vi.hoisted(() => ({ send: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: m.send }))
vi.mock('@/lib/supabase/server', () => ({ supaAdmin: () => ({ rpc: m.rpc }) }))

const H = { host: 'swaasa.test', origin: 'https://swaasa.test', 'content-type': 'application/json' }
const post = (url: string, body: string, headers: Record<string, string> = {}) => new Request(`https://swaasa.test${url}`, { method: 'POST', body, headers: { ...H, ...headers } }) as any
let n = 0

// The enquiry form's own tests are in api-viewing.test.ts.

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
