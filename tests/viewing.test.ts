import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CALL_TIMES, LOOKING_FOR, REQUEST_KINDS, istToday, normalisePhone, parseViewingRequest, viewingMessage } from '@/lib/viewing'

const TODAY = '2026-11-18'
const good = { name: 'Anjali Nair', phone: '98765 43210', lookingFor: 'Gown', eventDate: '2027-02-14', visitDate: '2026-11-20', note: 'Size 12' }

describe('viewing request: checking the form', () => {
  it('accepts a complete request and tidies it', () => {
    const r = parseViewingRequest({ ...good, name: '  Anjali   Nair ', note: 'Need\r\n\r\n\r\n\r\nsize 12\u0007' }, TODAY)
    expect(r).toEqual({ ok: true, value: { kind: 'viewing', callTime: null, name: 'Anjali Nair', phone: '+919876543210', lookingFor: 'Gown', eventDate: '2027-02-14', visitDate: '2026-11-20', note: 'Need\n\nsize 12' } })
  })
  it('needs only a name and a mobile number', () => {
    const r: any = parseViewingRequest({ name: 'Anjali', phone: '9876543210' }, TODAY)
    expect(r.ok).toBe(true); expect(r.value).toMatchObject({ lookingFor: 'Not specified', eventDate: null, visitDate: null, note: '' })
  })
  it('understands the usual ways of writing an Indian mobile number, and overseas numbers with a +', () => {
    for (const n of ['98765 43210', '+91 98765 43210', '919876543210', '09876543210', '+91-98765-43210']) expect(normalisePhone(n), n).toBe('+919876543210')
    expect(normalisePhone('+971 50 123 4567')).toBe('+971501234567')
    for (const n of ['12345', '5876543210', '', '+9715', 'abc']) expect(normalisePhone(n), n).toBeNull()
  })
  it('refuses a missing name, a bad number, an unknown option and impossible or past dates', () => {
    const err = (b: object) => (parseViewingRequest({ ...good, ...b }, TODAY) as any).error
    expect(err({ name: 'A' })).toMatch(/name/i)
    expect(err({ phone: '12345' })).toMatch(/mobile/i)
    expect(err({ lookingFor: 'Tractor' })).toMatch(/options/i)
    expect(err({ visitDate: '2026-11-17' })).toBe('The visit date cannot be in the past.')
    expect(err({ eventDate: '2027-02-30' })).toMatch(/valid event date/i)
    expect(err({ eventDate: '2031-01-01' })).toMatch(/three years/i)
  })
  it('allows today, and offers exactly the options the form shows', () => {
    expect(parseViewingRequest({ ...good, visitDate: TODAY }, TODAY).ok).toBe(true)
    expect(LOOKING_FOR).toContain('Bridal lehenga')
  })
  it('limits length, and rejects anything that is not an object', () => {
    expect((parseViewingRequest({ ...good, name: 'x'.repeat(200), note: 'y'.repeat(2000) }, TODAY) as any).value).toMatchObject({ name: 'x'.repeat(80), note: 'y'.repeat(500) })
    for (const b of [null, undefined, 'text', 5, []]) expect(parseViewingRequest(b, TODAY).ok).toBe(false)
  })
  it('treats anything in the hidden field as a bot', () => {
    expect(parseViewingRequest({ ...good, website: 'http://spam.example' }, TODAY)).toEqual({ ok: false, error: '', spam: true })
  })
  it('works out today in India, not in the server\'s time zone', () => {
    expect(istToday(Date.UTC(2026, 10, 18, 19, 0))).toBe('2026-11-19')      // 00:30 on the 19th in India
    expect(istToday(Date.UTC(2026, 10, 18, 5, 0))).toBe('2026-11-18')
  })
})

describe('call-back requests', () => {
  const cb = { kind: 'callback', name: 'Anjali Nair', phone: '98765 43210', callTime: 'Evening', lookingFor: 'Saree', eventDate: '2027-02-14', note: 'Budget question' }
  it('defaults to a viewing, so older forms keep working', () => {
    expect((parseViewingRequest(good, TODAY) as any).value.kind).toBe('viewing')
    expect(REQUEST_KINDS).toEqual(['viewing', 'callback'])
  })
  it('accepts a call-back with a best time and no visit day', () => {
    const r: any = parseViewingRequest(cb, TODAY)
    expect(r.ok).toBe(true); expect(r.value).toMatchObject({ kind: 'callback', callTime: 'Evening', visitDate: null, phone: '+919876543210' })
  })
  it('ignores a leftover visit day on a call-back instead of refusing it', () => {
    const r: any = parseViewingRequest({ ...cb, visitDate: '2020-01-01' }, TODAY)
    expect(r.ok).toBe(true); expect(r.value.visitDate).toBeNull()
  })
  it('uses "Any time" when no time is chosen, and refuses unknown kinds or times', () => {
    expect((parseViewingRequest({ ...cb, callTime: '' }, TODAY) as any).value.callTime).toBe('Any time')
    expect(parseViewingRequest({ ...cb, kind: 'refund' }, TODAY).ok).toBe(false)
    expect(parseViewingRequest({ ...cb, callTime: 'Midnight' }, TODAY).ok).toBe(false)
    expect(CALL_TIMES).toEqual(['Any time', 'Morning', 'Afternoon', 'Evening'])
  })
  it('still needs a valid name and number', () => {
    expect(parseViewingRequest({ ...cb, phone: '123' }, TODAY).ok).toBe(false)
    expect(parseViewingRequest({ ...cb, name: '' }, TODAY).ok).toBe(false)
  })
  it('tells the team it is a call-back, with the best time and no visit day line', () => {
    const text = viewingMessage((parseViewingRequest(cb, TODAY) as any).value)
    expect(text).toContain('New call-back request'); expect(text).toContain('Best time to call: Evening'); expect(text).toContain('WhatsApp: https://wa.me/919876543210')
    expect(text).not.toContain('Preferred visit day'); expect(text).toContain('Note: Budget question')
  })
  it('mentions the best time on a viewing only when one was chosen', () => {
    expect(viewingMessage((parseViewingRequest({ ...good, callTime: 'Morning' }, TODAY) as any).value)).toContain('Best time to call: Morning')
    expect(viewingMessage((parseViewingRequest({ ...good, callTime: 'Any time' }, TODAY) as any).value)).not.toContain('Best time to call')
    expect(viewingMessage((parseViewingRequest(good, TODAY) as any).value)).toContain('New viewing request')
  })
})

describe('viewing request: the message the team receives', () => {
  it('lists everything, with a WhatsApp link to the customer', () => {
    const r: any = parseViewingRequest(good, TODAY)
    const text = viewingMessage(r.value)
    expect(text).toContain('Name: Anjali Nair'); expect(text).toContain('Mobile: +919876543210')
    expect(text).toContain('WhatsApp: https://wa.me/919876543210'); expect(text).toContain('Looking for: Gown')
    expect(text).toContain('Event date: 14 Feb 2027'); expect(text).toContain('Preferred visit day: 20 Nov 2026'); expect(text).toContain('Note: Size 12')
  })
  it('says "Not given" for missing dates and leaves out an empty note', () => {
    const r: any = parseViewingRequest({ name: 'Anjali', phone: '9876543210' }, TODAY)
    const text = viewingMessage(r.value)
    expect(text).toContain('Event date: Not given'); expect(text).not.toContain('Note:')
  })
})

// The route itself, with Telegram replaced by a stand-in. Each test loads a fresh copy so the in-memory limits start empty.
describe('viewing request: the route', () => {
  const send = vi.fn()
  const env = { ...process.env }
  const call = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import('@/app/api/viewing-request/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('https://swaasa.example/api/viewing-request', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const res = await POST(req)
    return { status: res.status, json: await res.json() }
  }
  beforeEach(() => {
    vi.resetModules(); send.mockReset(); send.mockResolvedValue(undefined)
    vi.doMock('@/lib/telegram', () => ({ sendTelegram: send }))
    process.env.TELEGRAM_BOT_TOKEN = 'token'; process.env.TELEGRAM_OWNER_CHAT_ID = '111'; process.env.TELEGRAM_STAFF_CHAT_ID = '222'
  })
  afterEach(() => { process.env = { ...env }; vi.doUnmock('@/lib/telegram') })
  const future = { name: 'Anjali Nair', phone: '9876543210' }

  it('sends the request to the owner and staff chats', async () => {
    const r = await call(future)
    expect(r).toEqual({ status: 200, json: { ok: true } })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls.map(c => c[0]).sort()).toEqual(['111', '222'])
    expect(send.mock.calls[0][1]).toContain('Anjali Nair')
  })
  it('sends once when both chats are the same chat', async () => {
    process.env.TELEGRAM_STAFF_CHAT_ID = '111'
    await call(future); expect(send).toHaveBeenCalledTimes(1)
  })
  it('still succeeds when only one of the two chats can be reached', async () => {
    send.mockRejectedValueOnce(new Error('blocked')); const r = await call(future)
    expect(r.status).toBe(200)
  })
  it('tells the visitor to phone when nothing could be sent', async () => {
    send.mockRejectedValue(new Error('down')); const r = await call(future)
    expect(r.status).toBe(502); expect(r.json.error).toMatch(/call or WhatsApp/)
  })
  it('says it is unavailable, rather than pretending, when Telegram is not set up', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const r = await call(future); expect(r.status).toBe(503); expect(send).not.toHaveBeenCalled()
  })
  it('refuses a bad request without sending anything', async () => {
    const r = await call({ name: 'A', phone: '1' }); expect(r.status).toBe(400); expect(send).not.toHaveBeenCalled()
  })
  it('pretends to accept a bot but sends nothing', async () => {
    const r = await call({ ...future, website: 'http://spam.example' }); expect(r).toEqual({ status: 200, json: { ok: true } }); expect(send).not.toHaveBeenCalled()
  })
  it('refuses a form posted from another website', async () => {
    const r = await call(future, { origin: 'https://evil.example' }); expect(r.status).toBe(403); expect(send).not.toHaveBeenCalled()
  })
  it('accepts a form posted from this website', async () => {
    const r = await call(future, { origin: 'https://swaasa.example' }); expect(r.status).toBe(200)
  })
  it('does not message the team twice when the same number is sent again straight away', async () => {
    await call(future); send.mockClear()
    const r = await call(future); expect(r.status).toBe(200); expect(send).not.toHaveBeenCalled()
  })
  it('treats a call-back and a viewing from the same number as two requests', async () => {
    await call({ ...future }); await call({ ...future, kind: 'callback', callTime: 'Morning' })
    expect(send.mock.calls.filter(c => String(c[1]).includes('call-back request')).length).toBe(2)   // owner and staff chats
    expect(send.mock.calls.length).toBe(4)
  })
  it('limits one visitor to four different requests an hour', async () => {
    const ip = { 'x-forwarded-for': '203.0.113.7' }
    for (const n of ['9876543201', '9876543202', '9876543203', '9876543204']) expect((await call({ name: 'Anjali', phone: n }, ip)).status).toBe(200)
    const r = await call({ name: 'Anjali', phone: '9876543205' }, ip)
    expect(r.status).toBe(429); expect(r.json.error).toMatch(/call or WhatsApp/)
    expect((await call({ name: 'Anjali', phone: '9876543206' }, { 'x-forwarded-for': '203.0.113.8' })).status).toBe(200)   // someone else is not affected
  })
})
