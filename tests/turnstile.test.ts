import { describe, expect, it, vi } from 'vitest'
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from '@/lib/turnstile'
import { scrubEvent } from '@/lib/sentryScrub'

const cf = (body: object, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body }) as any

describe('verifyTurnstile', () => {
  it('is "disabled" (check skipped) when no secret key is set', async () => { expect(await verifyTurnstile('t', '1.2.3.4', cf({}), '')).toBe('disabled') })
  it('fails a missing, empty, non-text or oversized token without calling Cloudflare', async () => {
    const f = cf({ success: true })
    for (const t of [undefined, '', 5, {}, 'x'.repeat(2049)]) expect(await verifyTurnstile(t, null, f, 'k')).toBe('fail')
    expect(f.mock.calls).toHaveLength(0)
  })
  it('passes only when Cloudflare says success, and for the right form', async () => {
    expect(await verifyTurnstile('t', '1.2.3.4', cf({ success: true, action: 'lead' }), 'k')).toBe('pass')
    expect(await verifyTurnstile('t', null, cf({ success: true }), 'k')).toBe('pass')                 // the test keys return no action
    expect(await verifyTurnstile('t', null, cf({ success: false, 'error-codes': ['timeout-or-duplicate'] }), 'k')).toBe('fail')
    expect(await verifyTurnstile('t', null, cf({ success: true, action: 'other' }), 'k')).toBe('fail')
  })
  it('sends the secret, token and visitor address to Cloudflare\'s verify address', async () => {
    const f = cf({ success: true }); await verifyTurnstile('tok', '203.0.113.5', f, 'sekret')
    expect(f.mock.calls[0][0]).toBe(TURNSTILE_VERIFY_URL); expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ secret: 'sekret', response: 'tok', remoteip: '203.0.113.5' })
    const g = cf({ success: true }); await verifyTurnstile('tok', 'unknown', g, 'sekret'); expect(JSON.parse(g.mock.calls[0][1].body)).toEqual({ secret: 'sekret', response: 'tok' })
  })
  it('is "unavailable" (let the customer through) if Cloudflare errors, is down or sends rubbish', async () => {
    expect(await verifyTurnstile('t', null, cf({}, false), 'k')).toBe('unavailable')
    expect(await verifyTurnstile('t', null, vi.fn().mockRejectedValue(new Error('network')) as any, 'k')).toBe('unavailable')
    expect(await verifyTurnstile('t', null, vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('bad json') } }) as any, 'k')).toBe('unavailable')
  })
})

describe('scrubEvent (nothing personal leaves in an error report)', () => {
  it('drops form data, cookies, query strings, headers that identify the visitor, and the user', () => {
    const e = scrubEvent({ user: { ip_address: '1.2.3.4', id: 'u' }, request: { url: 'https://s.test/api/x?phone=98765#frag', data: { phone: '9876543210' }, cookies: { a: 'b' }, query_string: 'phone=1', headers: { cookie: 'x', 'X-Forwarded-For': '1.2.3.4', 'user-agent': 'ua' } } })
    expect(e.user).toBeUndefined(); expect(e.request).toEqual({ url: 'https://s.test/api/x', headers: { 'user-agent': 'ua' } })
  })
  it('replaces phone-number-like digit runs in messages, exceptions and breadcrumbs', () => {
    const e = scrubEvent({ message: 'failed for +91 98765 43210', exception: { values: [{ value: 'bad 9876543210 here' }] }, breadcrumbs: [{ message: 'call 098765-43210', data: { body: 'secret', url: '/x' } }] })
    expect(e.message).toBe('failed for [number]'); expect(e.exception.values[0].value).toBe('bad [number] here')
    expect(e.breadcrumbs[0].message).toBe('call [number]'); expect(e.breadcrumbs[0].data).toEqual({ url: '/x' })
  })
  it('leaves short numbers such as status codes and years alone', () => { expect(scrubEvent({ message: 'HTTP 503 in 2026 after 1234 ms' }).message).toBe('HTTP 503 in 2026 after 1234 ms') })
})
