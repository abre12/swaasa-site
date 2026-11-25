import { describe, expect, it } from 'vitest'
import { readJson, sameOrigin } from '@/lib/apiGuard'

const req = (headers: Record<string, string>, body?: string) => new Request('https://swaasa.test/api/x', { method: 'POST', headers, body })

describe('sameOrigin', () => {
  it('accepts a request from this site', () => {
    expect(sameOrigin(req({ host: 'swaasa.test', origin: 'https://swaasa.test' }))).toBe(true)
  })
  it('refuses another site', () => {
    expect(sameOrigin(req({ host: 'swaasa.test', origin: 'https://evil.example' }))).toBe(false)
    expect(sameOrigin(req({ host: 'swaasa.test', origin: 'https://swaasa.test.evil.example' }))).toBe(false)
  })
  it('refuses the literal "null" origin and other junk instead of crashing', () => {
    expect(sameOrigin(req({ host: 'swaasa.test', origin: 'null' }))).toBe(false)
    expect(sameOrigin(req({ host: 'swaasa.test', origin: 'not a url' }))).toBe(false)
    expect(sameOrigin(req({ host: 'swaasa.test', origin: '' }))).toBe(false)
  })
  it('uses the forwarded host behind a proxy', () => {
    expect(sameOrigin(req({ host: 'internal:3000', 'x-forwarded-host': 'swaasa.test', origin: 'https://swaasa.test' }))).toBe(true)
  })
  it('with no Origin header, lets through only same-origin browser requests and non-browser callers', () => {
    expect(sameOrigin(req({ host: 'swaasa.test' }))).toBe(true)                                              // curl, scripts
    expect(sameOrigin(req({ host: 'swaasa.test', 'sec-fetch-site': 'same-origin' }))).toBe(true)
    expect(sameOrigin(req({ host: 'swaasa.test', 'sec-fetch-site': 'none' }))).toBe(true)
    expect(sameOrigin(req({ host: 'swaasa.test', 'sec-fetch-site': 'cross-site' }))).toBe(false)
    expect(sameOrigin(req({ host: 'swaasa.test', 'sec-fetch-site': 'same-site' }))).toBe(false)           // a sibling subdomain is not this site
  })
})

describe('readJson', () => {
  it('returns a JSON object', async () => { expect(await readJson(req({}, '{"a":1}'))).toEqual({ a: 1 }) })
  it('returns null for anything that is not an object', async () => {
    for (const b of ['', 'nope', '[1,2]', '"text"', '7', 'null', '{"a":']) expect(await readJson(req({}, b))).toBeNull()
  })
})
