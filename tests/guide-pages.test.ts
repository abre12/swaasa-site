import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FAQ, PRICE_GUIDE, faqSchema, guidePages, hasPricing } from '@/lib/seo-content'
import { PUBLIC_PAGES } from '@/lib/site'

;(globalThis as any).React = React
const page = async (mod: string) => renderToStaticMarkup(await ((await import(mod)).default)())

describe('guide pages', () => {
  it('every public guide page that exists is in the public list the sign-in middleware reads', () => {
    for (const g of guidePages()) expect(PUBLIC_PAGES).toContain(g.path)
  })
  it('the FAQ page has one visible <h1>, every question and answer, and matching structured data', async () => {
    const html = await page('@/app/faq/page')
    expect([...html.matchAll(/<h1[\s>]/g)]).toHaveLength(1)
    for (const f of FAQ) { expect(html).toContain(f.q.replace(/'/g, '&#x27;')); }
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1].replace(/\\u003c/g, '<'))
    expect(ld[0]['@type']).toBe('FAQPage'); expect(ld[0].mainEntity).toHaveLength(FAQ.length); expect(ld[1]['@type']).toBe('BreadcrumbList')
  })
  it('the area page targets the search, has one <h1>, explains the process, and links onward', async () => {
    const html = await page('@/app/bridal-lehenga-rental-trivandrum/page')
    expect([...html.matchAll(/<h1[\s>]/g)]).toHaveLength(1); expect(html).toMatch(/<h1[^>]*>Bridal lehenga rental in <em>Trivandrum<\/em><\/h1>/)
    expect(html).toContain('Karamana'); expect(html).toContain('href="/faq"'); expect(html).toContain('href="/#private-viewing"')
  })
  it('makes no claim that needs the owner: no prices, deposit or delivery promises while those are empty', async () => {
    const text = (await page('@/app/bridal-lehenga-rental-trivandrum/page')) + (await page('@/app/faq/page'))
    expect(text).not.toMatch(/₹|Rs\.?\s?\d|deposit|free delivery|open (daily|every)|best in/i)
  })
  it('the pricing page does not exist until prices are added', async () => {
    expect(hasPricing()).toBe(false); expect(PRICE_GUIDE).toHaveLength(0)
    await expect(page('@/app/pricing/page')).rejects.toThrow()          // notFound() throws Next's not-found signal
    expect(guidePages().map(g => g.path)).not.toContain('/pricing')
  })
  it('faqSchema escapes cleanly into a script tag', () => { expect(JSON.stringify(faqSchema())).toContain('FAQPage') })
})
