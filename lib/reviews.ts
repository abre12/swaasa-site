// Google reviews for the customer home page.
// Server-only: the API key never reaches the browser. The result is cached for 24 hours by Next.js,
// so the site makes at most about one Google request per day however many people visit.

export type GoogleReview = { id: string; author: string; photo: string | null; text: string; when: string; url: string | null }
export type GoogleReviews = { reviews: GoogleReview[]; rating: number | null; total: number | null; mapsUrl: string }

// Public link to the business on Google Maps ("See all reviews").
export const GOOGLE_MAPS_LISTING = 'https://www.google.com/maps/place/SWAASA+Wedding+Rentals/@8.4810158,76.9668482,2087m/data=!3m1!1e3!4m8!3m7!1s0x3b05bb3da2637689:0xd363eb716563564d!8m2!3d8.4810105!4d76.9694231!9m1!1b1!16s%2Fg%2F11yczlm_mb'

export const MIN_WORDS = 11 // "more than 10 words"
export const MAX_REVIEWS = 8

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
    .slice(0, MAX_REVIEWS)
}

export async function getGoogleReviews(): Promise<GoogleReviews> {
  const empty: GoogleReviews = { reviews: [], rating: null, total: null, mapsUrl: GOOGLE_MAPS_LISTING }
  const key = (process.env.GOOGLE_PLACES_API_KEY || '').trim()
  const placeId = (process.env.GOOGLE_PLACE_ID || '').trim()
  if (!key || !placeId) return empty // not configured: the section simply does not appear

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews',
      },
      next: { revalidate: 60 * 60 * 24 },
    })
    if (!res.ok) return empty
    const data = await res.json() as { rating?: number; userRatingCount?: number; googleMapsUri?: string; reviews?: ApiReview[] }
    return {
      reviews: pickReviews(data.reviews || []),
      rating: typeof data.rating === 'number' ? data.rating : null,
      total: typeof data.userRatingCount === 'number' ? data.userRatingCount : null,
      mapsUrl: data.googleMapsUri || GOOGLE_MAPS_LISTING,
    }
  } catch {
    return empty // Google being unreachable must never break the home page
  }
}
