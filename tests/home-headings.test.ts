import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'

// Audit M1: the home page needs exactly one <h1>, first in the outline, so screen readers and search engines get a page title.
vi.mock('@/lib/reviews', () => ({ getGoogleReviews: async () => ({ reviews: [], rating: 0, total: 0, mapsUrl: '' }) }))

// Vitest compiles JSX the classic way, which needs React in scope; the Next build does not.
async function render() {
  ;(globalThis as any).React = React
  const Home = (await import('@/app/page')).default
  return renderToStaticMarkup(await Home())
}

describe('home page headings', () => {
  it('has exactly one <h1>, before every other heading', async () => {
    const html = await render()
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]))
    expect(levels.filter(l => l === 1)).toHaveLength(1)
    expect(levels[0]).toBe(1)
    expect(levels.length).toBeGreaterThan(3)   // the existing <h2>/<h3> section headings are still there
  })
  it('names what is offered and the place, in the words people search for', async () => {
    const html = await render()
    const h1 = (html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1] ?? '').replace(/<[^>]+>/g, '')
    expect(h1).toMatch(/bridal lehengas/i); expect(h1).toMatch(/gowns/i)
    expect(h1).toContain('Trivandrum')
    expect(html).toContain('Thiruvananthapuram')
  })
  it('is a visible heading (not hidden), with the city in it, inside the introduction above the reels', async () => {
    const html = await render()
    expect(html).not.toMatch(/<h1 class="sr-only"/)
    expect(html).toMatch(/<section class="rn-hero"[^>]*><img [^>]*\/><div class="rn-hero-copy"><p class="ch-kicker">[^<]*<\/p><h1 id="rn-hero-title">.*?Trivandrum/)
    expect(readFileSync('app/globals.css', 'utf8')).toMatch(/\.rn-hero h1\{/)
  })
  it('links to the guide pages and offers the viewing form from the introduction', async () => {
    const html = await render()
    expect(html).toContain('href="/bridal-lehenga-rental-trivandrum"'); expect(html).toContain('href="/faq"'); expect(html).toMatch(/href="#plan-a-visit"/)
  })
})
