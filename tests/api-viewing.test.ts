import { beforeEach, describe, expect, it, vi } from 'vitest'

// The public enquiry form. Since migration v33 the limits, the repeat check and the saving all happen in one database call (lead_submit),
// so these tests stand in for that call and check what the route does with each answer.
const m = vi.hoisted(() => ({ send: vi.fn(), rpc: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: m.send }))
vi.mock('@/lib/supabase/server', () => ({ supaAdmin: () => ({ rpc: m.rpc }) }))

const H = { host: 'swaasa.test', origin: 'https://swaasa.test', 'content-type': 'application/json' }
const post = (body: string, headers: Record<string, string> = {}) => new Request('https://swaasa.test/api/viewing-request', { method: 'POST', body, headers: { ...H, ...headers } }) as any
const viewing = { name: 'Anjali Nair', phone: '98765 43210', lookingFor: 'Gown' }
const created = (id = 7, action = 'send') => ({ data: [{ outcome: 'created', lead_id: id, tg_action: action }], error: null })

describe('/api/viewing-request', () => {
  let POST: (r: any) => Promise<Response>
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); m.send.mockResolvedValue(undefined)
    m.rpc.mockImplementation(async (fn: string) => fn === 'lead_submit' ? created() : { data: null, error: null })
    process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_OWNER_CHAT_ID = '1'; process.env.TELEGRAM_STAFF_CHAT_ID = '2'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
    delete process.env.TURNSTILE_SECRET_KEY
    ;({ POST } = await import('@/app/api/viewing-request/route'))
  })
  const send = (b: object | string, h: Record<string, string> = {}) => POST(post(typeof b === 'string' ? b : JSON.stringify(b), { 'x-vercel-forwarded-for': '203.0.113.9', ...h }))

  it('saves the enquiry first, then messages both chats and records that Telegram worked', async () => {
    expect((await send(viewing)).status).toBe(200)
    expect(m.rpc).toHaveBeenNthCalledWith(1, 'lead_submit', expect.objectContaining({ p_kind: 'viewing', p_name: 'Anjali Nair', p_phone: '+919876543210', p_looking_for: 'Gown', p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }))
    expect(m.send).toHaveBeenCalledTimes(2)
    expect(m.send.mock.calls[0][1]).toContain('Enquiry number: 7')
    expect(m.rpc).toHaveBeenNthCalledWith(2, 'lead_mark_telegram', { p_id: 7, p_ok: true })
  })
  it('never sends the raw IP address to the database', async () => {
    await send(viewing); expect(JSON.stringify(m.rpc.mock.calls)).not.toContain('203.0.113.9')
  })
  it('keeps the customer\'s enquiry and says thank you even when Telegram is down or not set up', async () => {
    m.send.mockRejectedValue(new Error('down'))
    expect((await send(viewing)).status).toBe(200)
    expect(m.rpc).toHaveBeenCalledWith('lead_mark_telegram', { p_id: 7, p_ok: false })
    delete process.env.TELEGRAM_BOT_TOKEN; m.send.mockClear()
    expect((await send({ ...viewing, phone: '9123456780' })).status).toBe(200)
    expect(m.send).not.toHaveBeenCalled(); expect(m.rpc).toHaveBeenLastCalledWith('lead_mark_telegram', { p_id: 7, p_ok: false })
  })
  it('refuses another site, a "null" origin, a huge body and bad JSON before touching the database', async () => {
    expect((await send(viewing, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await send(viewing, { origin: 'null' })).status).toBe(403)
    expect((await send('{')).status).toBe(400)
    expect((await send(viewing, { 'content-length': '99999' })).status).toBe(413)
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled()
  })
  it('quietly ignores a bot that fills the hidden field, without saving anything', async () => {
    const r = await send({ ...viewing, website: 'http://spam' }); expect(r.status).toBe(200)
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled()
  })
  it('asks for a name and a valid mobile', async () => { expect((await send({ name: 'A', phone: '1' })).status).toBe(400); expect(m.rpc).not.toHaveBeenCalled() })

  it('says thank you but sends nothing for a repeat tap or a phone number that already has its three for the day', async () => {
    for (const outcome of ['duplicate', 'limited_phone']) {
      m.rpc.mockResolvedValueOnce({ data: [{ outcome, lead_id: 3, tg_action: 'none' }], error: null })
      expect((await send(viewing)).status).toBe(200)
    }
    expect(m.send).not.toHaveBeenCalled()
  })
  it('answers 429 when one visitor is over the limit', async () => {
    m.rpc.mockResolvedValueOnce({ data: [{ outcome: 'limited_visitor', lead_id: null, tg_action: 'none' }], error: null })
    const r = await send(viewing); expect(r.status).toBe(429); expect(m.send).not.toHaveBeenCalled()
  })
  it('has no site-wide cap: many different visitors in a row are all saved', async () => {
    for (let i = 0; i < 60; i++) expect((await send({ ...viewing, phone: `9876${String(100000 + i)}` }, { 'x-vercel-forwarded-for': `198.51.100.${i}` })).status).toBe(200)
    expect(m.rpc.mock.calls.filter(c => c[0] === 'lead_submit')).toHaveLength(60)
  })
  it('when the database says "throttled", saves quietly and sends one summary, not the enquiry details', async () => {
    m.rpc.mockResolvedValueOnce(created(8, 'summary')); await send(viewing)
    expect(m.send).toHaveBeenCalledTimes(2); expect(m.send.mock.calls[0][1]).toMatch(/Many website enquiries/); expect(m.send.mock.calls[0][1]).not.toContain('Anjali')
    expect(m.rpc).not.toHaveBeenCalledWith('lead_mark_telegram', expect.anything())
    m.send.mockClear(); m.rpc.mockResolvedValueOnce(created(9, 'none')); await send(viewing); expect(m.send).not.toHaveBeenCalled()
  })
  it('answers 503, and does not message anyone, if the enquiry cannot be saved', async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } }); expect((await send(viewing)).status).toBe(503)
    m.rpc.mockRejectedValueOnce(new Error('network')); expect((await send(viewing)).status).toBe(503)
    delete process.env.SUPABASE_SERVICE_ROLE_KEY; expect((await send(viewing)).status).toBe(503)
    expect(m.send).not.toHaveBeenCalled()
  })

  describe('Turnstile bot check', () => {
    const cf = (body: object, ok = true) => vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, json: async () => body } as any)
    beforeEach(() => { process.env.TURNSTILE_SECRET_KEY = 'secret' })
    it('refuses a request with no token, or a token Cloudflare rejects, before saving', async () => {
      expect((await send(viewing)).status).toBe(400)
      cf({ success: false }); expect((await send({ ...viewing, turnstileToken: 'bad' })).status).toBe(400)
      expect(m.rpc).not.toHaveBeenCalled()
    })
    it('accepts a token Cloudflare confirms, and sends the secret and the token to Cloudflare', async () => {
      const spy = cf({ success: true, action: 'lead' }); expect((await send({ ...viewing, turnstileToken: 'good' })).status).toBe(200)
      expect(String(spy.mock.calls[0][0])).toContain('challenges.cloudflare.com/turnstile/v0/siteverify')
      expect(JSON.parse((spy.mock.calls[0][1] as any).body)).toMatchObject({ secret: 'secret', response: 'good' })
      expect(m.rpc).toHaveBeenCalledWith('lead_submit', expect.anything())
    })
    it('refuses a token that was made for a different form', async () => { cf({ success: true, action: 'login' }); expect((await send({ ...viewing, turnstileToken: 'x' })).status).toBe(400) })
    it('lets the customer through when Cloudflare itself cannot be reached (the database limits still apply)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network')); expect((await send({ ...viewing, turnstileToken: 'x' })).status).toBe(200)
      cf({}, false); expect((await send({ ...viewing, turnstileToken: 'x', phone: '9123456780' })).status).toBe(200)
    })
  })
})
