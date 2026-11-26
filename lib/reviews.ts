// Google reviews for the customer home page.
//
// Rules this file follows (reviewed 25 Nov 2026; see README-fixes-2026-11-25.md for the reasons):
//  1. Everything shown comes live from Google's Places API. Nothing is copied into the code or the database (the old hand-picked list was removed):
//     Google's Places policies do not allow storing its content, a copied review goes stale when its author edits or deletes it, and mixing copied
//     reviews with live ones breaks Google's rule that its content is kept apart from other content.
//  2. Nothing is filtered by star rating or length. Showing only 5-star reviews of 11+ words under a heading like "what customers say" gives a
//     picture that is more favourable than the real one, which consumer-protection rules treat as misleading. The real rating and the real count
//     (from Google, covering ALL reviews) are shown next to the reviews, with each review's own star rating.
//  3. Each review shows its author's name (linked to their Google profile) and photo where Google supplies them, and the section carries a visible
//     "Google Maps" attribution. Review text is never edited.
//  4. The API returns at most five reviews (Google picks them), so this is a sample, and the page says so. "See all reviews" links to the listing.
//  5. Server only: the API key never reaches the browser. The response is kept briefly by Next.js (REVIEWS_CACHE_SECONDS, default one hour) so the
//     home page does not call Google for every visitor; set it to 0 to ask Google on every page view (stricter reading of Google's no-caching rule,
//     at the cost of a slower home page and more billable calls).

export type GoogleReview = { id: string; author: string; photo: string | null; text: string; stars: number; when: string; publishedAt: string | null; url: string | null }
export type GoogleReviews = { reviews: GoogleReview[]; rating: number | null; total: number | null; mapsUrl: string }

// Public link to the business on Google Maps ("See all reviews").
export const GOOGLE_MAPS_LISTING = 'https://www.google.com/maps/place/SWAASA+Wedding+Rentals/@8.4810158,76.9668482,2087m/data=!3m1!1e3!4m8!3m7!1s0x3b05bb3da2637689:0xd363eb716563564d!8m2!3d8.4810105!4d76.9694231!9m1!1b1!16s%2Fg%2F11yczlm_mb'

export const MAX_REVIEWS = 5   // Google's Places API never returns more than five

type ApiReview = {
  name?: string
  rating?: number
  relativePublishTimeDescription?: string
  publishTime?: string
  text?: { text?: string }
  originalText?: { text?: string }
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string }
}

const time = (r: ApiReview) => { const t = Date.parse(r.publishTime || ''); return Number.isNaN(t) ? 0 : t }

/** All reviews that have text to show, newest first, each with its real star rating. No rating or length filter. Exported for tests. */
export function pickReviews(raw: ApiReview[]): GoogleReview[] {
  return raw
    .map((r, i) => ({ r, i }))
    .sort((a, b) => time(b.r) - time(a.r) || a.i - b.i)
    .map(({ r, i }): GoogleReview | null => {
      const text = (r.originalText?.text || r.text?.text || '').replace(/\s+/g, ' ').trim()
      const stars = Math.round(Number(r.rating))
      if (!text || !(stars >= 1 && stars <= 5)) return null     // a rating-only review has nothing to display; it still counts in the total and the average
      return {
        id: r.name || `r${i}`,
        author: r.authorAttribution?.displayName || 'Google reviewer',
        photo: r.authorAttribution?.photoUri || null,
        text,
        stars,
        when: r.relativePublishTimeDescription || '',
        publishedAt: r.publishTime || null,
        url: r.authorAttribution?.uri || null,
      }
    })
    .filter((r): r is GoogleReview => r !== null)
    .slice(0, MAX_REVIEWS)
}

export const cacheSeconds = (raw = process.env.REVIEWS_CACHE_SECONDS): number => {
  const n = Number(raw === undefined || raw === '' ? 3600 : raw)
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 86400) : 3600
}

async function fetchLive(): Promise<{ reviews: GoogleReview[]; rating: number | null; total: number | null; mapsUrl: string | null }> {
  const none = { reviews: [], rating: null, total: null, mapsUrl: null }
  const key = (process.env.GOOGLE_PLACES_API_KEY || '').trim()
  const placeId = (process.env.GOOGLE_PLACE_ID || '').trim()
  if (!key || !placeId) return none   // Google not configured: the section is simply hidden

  try {
    const secs = cacheSeconds()
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews' },
      ...(secs === 0 ? { cache: 'no-store' as const } : { next: { revalidate: secs } }),
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
  return { reviews: live.reviews, rating: live.rating, total: live.total, mapsUrl: live.mapsUrl || GOOGLE_MAPS_LISTING }
}
