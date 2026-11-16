import { MANUAL_REVIEWS, type ManualReview } from './reviews-manual'

// Google reviews for the customer home page.
// Server-only: the API key never reaches the browser. The result is cached for 24 hours by Next.js,
// so the site makes at most about one Google request per day however many people visit.

export type GoogleReview = { id: string; author: string; photo: string | null; text: string; when: string; url: string | null }
export type GoogleReviews = { reviews: GoogleReview[]; rating: number | null; total: number | null; mapsUrl: string }

// Public link to the business on Google Maps ("See all reviews").
export const GOOGLE_MAPS_LISTING = 'https://www.google.com/maps/place/SWAASA+Wedding+Rentals/@8.4810158,76.9668482,2087m/data=!3m1!1e3!4m8!3m7!1s0x3b05bb3da2637689:0xd363eb716563564d!8m2!3d8.4810105!4d76.9694231!9m1!1b1!16s%2Fg%2F11yczlm_mb'

export const MIN_WORDS = 11 // "more than 10 words"
export const MAX_REVIEWS = 12

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

type ApiReview = {
  name?: string
  rating?: number
  relativePublishTimeDescription?: string
  text?: { text?: string }
  originalText?: { text?: string }
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string }
}

/** Keep only 5-star reviews longer than 10 words. Exported so it can be unit tested. */
export function pickReviews(raw: ApiReview[]): GoogleReview[] {
  return raw
    .map((r, i): GoogleReview | null => {
      const text = (r.originalText?.text || r.text?.text || '').replace(/\s+/g, ' ').trim()
      if (r.rating !== 5 || wordCount(text) < MIN_WORDS) return null
      return {
        id: r.name || `r${i}`,
        author: r.authorAttribution?.displayName || 'Google reviewer',
        photo: r.authorAttribution?.photoUri || null,
        text,
        when: r.relativePublishTimeDescription || '',
        url: r.authorAttribution?.uri || null,
      }
    })
    .filter((r): r is GoogleReview => r !== null)
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80)

/** Hand-picked reviews (lib/reviews-manual.ts) go through the same filter as live ones. */
export function pickManual(list: ManualReview[]): GoogleReview[] {
  return list
    .map((m, i): GoogleReview | null => {
      const text = (m.text || '').replace(/\s+/g, ' ').trim()
      if (wordCount(text) < MIN_WORDS) return null
      return { id: `manual-${i}`, author: m.author?.trim() || 'Google reviewer', photo: null, text, when: m.when || '', url: m.url || null }
    })
    .filter((r): r is GoogleReview => r !== null)
}

/** Live reviews first, then hand-picked ones; the same review is never shown twice. */
export function mergeReviews(live: GoogleReview[], manual: GoogleReview[], max = MAX_REVIEWS): GoogleReview[] {
  const seen = new Set<string>()
  const out: GoogleReview[] = []
  for (const r of [...live, ...manual]) {
    const key = norm(r.text)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out.slice(0, max)
}

async function fetchLive(): Promise<{ reviews: GoogleReview[]; rating: number | null; total: number | null; mapsUrl: string | null }> {
  const none = { reviews: [], rating: null, total: null, mapsUrl: null }
  const key = (process.env.GOOGLE_PLACES_API_KEY || '').trim()
  const placeId = (process.env.GOOGLE_PLACE_ID || '').trim()
  if (!key || !placeId) return none // Google not configured: hand-picked reviews still show

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews' },
      next: { revalidate: 60 * 60 * 24 },
    })
    if (!res.ok) return none
    const data = await res.json() as { rating?: number; userRatingCount?: number; googleMapsUri?: string; reviews?: ApiReview[] }
    return {
      reviews: pickReviews(data.reviews || []),
      rating: typeof data.rating === 'number' ? data.rating : null,
      total: typeof data.userRatingCount === 'number' ? data.userRatingCount : null,
      mapsUrl: data.googleMapsUri || null,
    }
  } catch {
    return none // Google being unreachable must never break the home page
  }
}

export async function getGoogleReviews(): Promise<GoogleReviews> {
  const live = await fetchLive()
  return {
    reviews: mergeReviews(live.reviews, pickManual(MANUAL_REVIEWS)),
    rating: live.rating,
    total: live.total,
    mapsUrl: live.mapsUrl || GOOGLE_MAPS_LISTING,
  }
}
