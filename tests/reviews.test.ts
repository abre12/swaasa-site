import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheSeconds, getGoogleReviews, GOOGLE_MAPS_LISTING, MAX_REVIEWS, pickReviews } from '@/lib/reviews'
import { existsSync, readFileSync } from 'node:fs'

const r = (rating: number, text: string, i = 1, publishTime = '2026-11-01T00:00:00Z') => ({ name: `places/x/reviews/${i}`, rating, text: { text }, publishTime, authorAttribution: { displayName: `Author ${i}`, uri: 'https://maps.google.com/u/' + i } })

describe('pickReviews: shows what Google returned, honestly', () => {
  it('keeps every star rating and every length, with the review\'s own stars', () => {
    const out = pickReviews([r(5, 'Lovely', 1), r(3, 'It was fine, alterations took a little longer than we hoped', 2), r(1, 'Not happy', 3)])
    expect(out.map(x => x.stars).sort()).toEqual([1, 3, 5])
    expect(out).toHaveLength(3)
  })
  it('puts the newest first, whatever order Google sent them in', () => {
    const out = pickReviews([r(5, 'old', 1, '2025-01-01T00:00:00Z'), r(4, 'newest', 2, '2026-11-20T00:00:00Z'), r(5, 'middle', 3, '2026-03-01T00:00:00Z')])
    expect(out.map(x => x.text)).toEqual(['newest', 'middle', 'old'])
  })
  it('skips only a review with no text (it still counts in Google\'s average) or no valid rating', () => {
    expect(pickReviews([r(5, '   ', 1), r(0, 'no rating', 2), r(5, 'fine', 3)]).map(x => x.id)).toEqual(['places/x/reviews/3'])
  })
  it('never edits the text apart from collapsing whitespace, and keeps the author attribution', () => {
    const [x] = pickReviews([r(5, 'Great   dress\n\nand staff', 4)])
    expect(x.text).toBe('Great dress and staff'); expect(x).toMatchObject({ author: 'Author 4', url: 'https://maps.google.com/u/4' })
  })
  it('never returns more than Google\'s five', () => { expect(pickReviews(Array.from({ length: 9 }, (_, i) => r(5, `review ${i}`, i))).length).toBe(MAX_REVIEWS) })
})

describe('what is no longer in the code', () => {
  it('has no hand-copied reviews file', () => { expect(existsSync('lib/reviews-manual.ts')).toBe(false) })
  it('adds no review or rating markup to the page\'s structured data (Google ignores self-published reviews of your own business)', () => {
    const src = readFileSync('lib/site.ts', 'utf8'); expect(src).not.toMatch(/aggregateRating|"?@type"?:\s*'Review'/)
  })
})

describe('cache time', () => {
  it('defaults to one hour, accepts 0 (ask Google every time) and ignores nonsense', () => {
    expect(cacheSeconds(undefined)).toBe(3600); expect(cacheSeconds('')).toBe(3600); expect(cacheSeconds('0')).toBe(0)
    expect(cacheSeconds('600')).toBe(600); expect(cacheSeconds('-5')).toBe(3600); expect(cacheSeconds('abc')).toBe(3600); expect(cacheSeconds('999999')).toBe(86400)
  })
})

describe('getGoogleReviews', () => {
  const env = { ...process.env }
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks() })
  it('hides the section when Google is not set up, and still links to the listing', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY; delete process.env.GOOGLE_PLACE_ID
    expect(await getGoogleReviews()).toEqual({ reviews: [], rating: null, total: null, mapsUrl: GOOGLE_MAPS_LISTING })
  })
  it('returns the live rating and count for ALL reviews alongside the sample, and survives Google being down', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k'; process.env.GOOGLE_PLACE_ID = 'ChIJabc'
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ rating: 4.6, userRatingCount: 120, googleMapsUri: 'https://maps.google.com/?cid=1', reviews: [r(4, 'Good', 1)] }) } as any)
    expect(await getGoogleReviews()).toMatchObject({ rating: 4.6, total: 120, mapsUrl: 'https://maps.google.com/?cid=1', reviews: [{ stars: 4 }] })
    expect((spy.mock.calls[0][1] as any).headers['X-Goog-Api-Key']).toBe('k')
    spy.mockRejectedValue(new Error('down')); expect((await getGoogleReviews()).reviews).toEqual([])
  })
})
