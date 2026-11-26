import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error plain CommonJS file shared with next.config.js
import { buildCsp } from '../csp'

const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_REELS_VIDEO_BASE_URL: 'https://abc.supabase.co/storage/v1/object/public/reels' }
const dir = (csp: string, name: string) => csp.split('; ').find(p => p.startsWith(name + ' ')) || ''

describe('Content-Security-Policy (report-only)', () => {
  const csp: string = buildCsp(env)
  it('allows what the pages really load and nothing broad', () => {
    expect(dir(csp, 'default-src')).toBe("default-src 'self'")
    expect(dir(csp, 'script-src')).toContain('https://challenges.cloudflare.com')
    expect(dir(csp, 'connect-src')).toContain('https://abc.supabase.co'); expect(dir(csp, 'connect-src')).toContain('wss://abc.supabase.co')
    expect(dir(csp, 'img-src')).toContain('https://*.googleusercontent.com')
    expect(dir(csp, 'media-src')).toContain('https://abc.supabase.co')
    expect(dir(csp, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com')
    expect(csp).not.toMatch(/\*(?!\.)|https:(?!\/\/)|\shttp:/)   // no bare wildcard, no "any https:" source
  })
  it('closes the doors that are never needed', () => {
    for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"]) expect(csp).toContain(d)
    expect(dir(csp, 'script-src')).not.toContain('unsafe-eval')
  })
  it('reports to the site, and tolerates a missing or malformed Supabase address', () => {
    expect(csp).toMatch(/report-uri \/api\/csp-report$/)
    expect(() => buildCsp({})).not.toThrow(); expect(buildCsp({ NEXT_PUBLIC_SUPABASE_URL: 'not a url' })).toContain("connect-src 'self' https://challenges.cloudflare.com")
  })
  it('is sent report-only, next to the existing enforced frame-ancestors rule', () => {
    const cfg = readFileSync('next.config.js', 'utf8')
    expect(cfg).toContain("key: 'Content-Security-Policy-Report-Only'"); expect(cfg).toContain("{ key: 'Content-Security-Policy', value: \"frame-ancestors 'none'\" }")
  })
})
