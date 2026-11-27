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
    expect(viewingMessage((parseViewingRequest(good, TODAY) as any).value)).toContain('New studio visit request')
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
// The route itself (saving, limits, Telegram, the bot check) is tested in api-viewing.test.ts.
