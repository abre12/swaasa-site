import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { HOME_DESCRIPTION, jsonLdString, localBusinessGraph, OG_IMAGE, schemaPhone, shareMeta, siteUrl } from '@/lib/site'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { metadata as layoutMeta } from '@/app/layout'
import { metadata as homeMeta } from '@/app/page'
import { config as middlewareConfig } from '@/middleware'

// Audit M2: sitemap, Open Graph/Twitter tags, structured data, canonical URL and favicon.
vi.mock('@/lib/reviews', () => ({ getGoogleReviews: async () => ({ reviews: [], rating: 0, total: 0, mapsUrl: '' }) }))
const env = { ...process.env }
afterEach(() => { process.env = { ...env } })

const pub = (f: string) => `public/${f}`
function jpegSize(f: string) {                      // read width/height from the JPEG header
  const b = readFileSync(f); let i = 2
  while (i < b.length) { if (b[i] !== 0xff) { i++; continue } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2) }
  throw new Error('no SOF')
}
const pngSize = (f: string) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } }

describe('site address', () => {
  it('uses SITE_URL, without a trailing slash, adding https if missing', () => {
    process.env.SITE_URL = 'https://www.example.in/'; expect(siteUrl()).toBe('https://www.example.in')
    process.env.SITE_URL = 'www.example.in'; expect(siteUrl()).toBe('https://www.example.in')
  })
  it('falls back to the Vercel production domain, so Preview builds still point at the real site', () => {
    delete process.env.SITE_URL; process.env.VERCEL_PROJECT_PRODUCTION_URL = 'swaasa.example.app'
    expect(siteUrl()).toBe('https://swaasa.example.app')
  })
  it('never produces localhost in production', () => {
    delete process.env.SITE_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    ;(process.env as any).NODE_ENV = 'production'; expect(siteUrl()).toBe('https://swaasa-site.vercel.app')
    ;(process.env as any).NODE_ENV = 'development'; expect(siteUrl()).toBe('http://localhost:3000')
  })
})

describe('sitemap and robots', () => {
  it('lists the public home page as an absolute address', () => {
    process.env.SITE_URL = 'https://www.example.in'
    expect(sitemap().map(e => e.url)).toEqual(['https://www.example.in/'])
  })
  it('never lists a page that robots.txt blocks or that is private', () => {
    const rules = [robots().rules].flat()[0] as { disallow: string[] }
    for (const e of sitemap()) {
      const path = new URL(e.url).pathname
      for (const d of rules.disallow) expect(path.startsWith(d), `${path} vs ${d}`).toBe(false)
      expect(path).not.toMatch(/collection|dress|admin|login|booking|api/)
    }
    expect(new Set(sitemap().map(e => e.url)).size).toBe(sitemap().length)
  })
  it('points crawlers at the sitemap and keeps the private areas blocked', () => {
    process.env.SITE_URL = 'https://www.example.in'
    const r = robots(), rules = [r.rules].flat()[0] as { disallow: string[] }
    expect(r.sitemap).toBe('https://www.example.in/sitemap.xml')
    for (const p of ['/collection', '/dress/', '/admin', '/login', '/api/']) expect(rules.disallow).toContain(p)
  })
})

describe('page tags', () => {
  it('home page has a canonical address and a description with both spellings of the city', () => {
    expect(homeMeta.alternates?.canonical).toBe('/')
    expect(HOME_DESCRIPTION).toContain('Thiruvananthapuram'); expect(HOME_DESCRIPTION).toContain('Trivandrum')
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(160)
    expect(homeMeta.description).toBe(HOME_DESCRIPTION)
  })
  it('home page has complete Open Graph and Twitter tags (a page replaces, not merges, the layout ones)', () => {
    const og: any = homeMeta.openGraph, tw: any = homeMeta.twitter
    expect(og).toMatchObject({ type: 'website', siteName: 'Swaasa Wedding Rentals', locale: 'en_IN', url: '/', title: homeMeta.title, description: homeMeta.description })
    expect(og.images[0]).toMatchObject({ url: '/og-image.jpg', width: 1200, height: 630 }); expect(og.images[0].alt).toBeTruthy()
    expect(tw).toMatchObject({ card: 'summary_large_image', title: homeMeta.title, images: ['/og-image.jpg'] })
  })
  it('layout supplies the base address, favicon set and default share tags, and uses both city spellings', () => {
    expect(layoutMeta.metadataBase).toBeInstanceOf(URL)
    const icons: any = layoutMeta.icons
    expect(icons.icon.map((i: any) => i.url)).toEqual(expect.arrayContaining(['/favicon.ico', '/icon-192.png']))
    expect(icons.apple[0].url).toBe('/apple-touch-icon.png')
    expect((layoutMeta.openGraph as any).siteName).toBe('Swaasa Wedding Rentals')
    expect((layoutMeta.twitter as any).card).toBe('summary_large_image')
    expect(layoutMeta.description).toMatch(/Thiruvananthapuram/); expect(layoutMeta.description).toMatch(/Trivandrum/)
  })
  it('shareMeta only adds a url when given a path', () => {
    expect('url' in shareMeta('t', 'd').openGraph).toBe(false)
    expect(shareMeta('t', 'd', '/x').openGraph.url).toBe('/x')
  })
})

describe('image and icon files', () => {
  it('every icon and image the tags point to exists', () => {
    const icons: any = layoutMeta.icons
    for (const u of [OG_IMAGE.url, ...icons.icon.map((i: any) => i.url), ...icons.apple.map((i: any) => i.url)]) expect(existsSync(pub(u)), u).toBe(true)
  })
  it('share image is 1200x630 and light enough for WhatsApp to preview', () => {
    expect(jpegSize(pub('og-image.jpg'))).toEqual({ w: 1200, h: 630 })
    expect(statSync(pub('og-image.jpg')).size).toBeLessThan(300 * 1024)
  })
  it('app icons are the sizes the tags declare', () => {
    expect(pngSize(pub('icon-192.png'))).toEqual({ w: 192, h: 192 })
    expect(pngSize(pub('icon-512.png'))).toEqual({ w: 512, h: 512 })
    expect(pngSize(pub('apple-touch-icon.png'))).toEqual({ w: 180, h: 180 })
  })
  it('favicon.ico is a real ICO holding 16, 32 and 48 pixel images', () => {
    const b = readFileSync(pub('favicon.ico'))
    expect([b.readUInt16LE(0), b.readUInt16LE(2)]).toEqual([0, 1])
    const n = b.readUInt16LE(4), sizes = Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c)
    expect(sizes).toEqual([16, 32, 48])
  })
})

describe('structured data', () => {
  it('turns phone numbers into international format only when sure', () => {
    expect(schemaPhone('98765 43210')).toBe('+919876543210')
    expect(schemaPhone('+91 98765-43210')).toBe('+919876543210')
    expect(schemaPhone('0471 2345678')).toBe('04712345678')
    expect(schemaPhone('')).toBeUndefined(); expect(schemaPhone(undefined)).toBeUndefined()
  })
  it('describes the business with the address the site prints, on absolute addresses', () => {
    process.env.SITE_URL = 'https://www.example.in'
    const g = localBusinessGraph('9876543210'), biz: any = g['@graph'].find(n => n['@type'] === 'LocalBusiness')
    expect(g['@context']).toBe('https://schema.org')
    expect(biz).toMatchObject({ name: 'Swaasa Wedding Rentals', alternateName: 'SWAASA Boutique', telephone: '+919876543210', url: 'https://www.example.in/', image: 'https://www.example.in/og-image.jpg' })
    expect(biz.address).toMatchObject({ '@type': 'PostalAddress', addressLocality: 'Thiruvananthapuram', addressRegion: 'Kerala', postalCode: '695002', addressCountry: 'IN' })
    expect(biz.areaServed).toMatchObject({ name: 'Thiruvananthapuram', alternateName: 'Trivandrum' })
    expect(biz.sameAs[0]).toMatch(/^https:\/\/www\.instagram\.com\//)
    for (const k of ['image', 'logo', 'url']) expect(biz[k]).toMatch(/^https:\/\/www\.example\.in\//)
  })
  it('leaves the telephone out when none is configured, and invents no hours or coordinates', () => {
    const biz: any = localBusinessGraph('')['@graph'][1]
    expect('telephone' in biz).toBe(false); expect(biz.openingHours).toBeUndefined(); expect(biz.geo).toBeUndefined()
  })
  it('cannot be broken out of its script tag', () => {
    const s = jsonLdString({ name: '</script><script>alert(1)</script>' })
    expect(s).not.toContain('<'); expect(JSON.parse(s).name).toBe('</script><script>alert(1)</script>')
  })
  it('is on the rendered home page as valid JSON', async () => {
    ;(globalThis as any).React = React
    process.env.STORE_PHONE = '9876543210'
    const html = renderToStaticMarkup(await (await import('@/app/page')).default())
    const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
    expect(m).not.toBeNull()
    const data = JSON.parse(m![1]); expect(data['@graph'].map((n: any) => n['@type'])).toEqual(['WebSite', 'LocalBusiness'])
    expect(data['@graph'][1].telephone).toBe('+919876543210')
  })
})

describe('middleware lets crawlers reach the new files', () => {
  // Next compiles the matcher as a path pattern; this is the same rule as a regular expression.
  const re = new RegExp('^' + middlewareConfig.matcher[0] + '$')
  it('skips the login check for the share image, favicon and icons', () => {
    for (const p of ['/og-image.jpg', '/favicon.ico', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/logo-mark.png']) expect(re.test(p), p).toBe(false)
  })
  it('still runs the login check for everything private', () => {
    for (const p of ['/admin', '/collection', '/dress/abc', '/api/staff', '/login']) expect(re.test(p), p).toBe(true)
  })
})
