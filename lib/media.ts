// Private photos (dress photos, return-inspection photos) are served through this site at a STABLE address: /api/media/<bucket>/<path>.
//
// Why: they used to be opened with Supabase "signed links", and every signing produced a different link (it carries a fresh token and expiry).
// A browser caches by address, so every page view and every app refresh looked like new pictures and downloaded them all again; the page also
// waited for a signing round trip before it could even draw. A stable address caches for a week in the browser and needs no signing at all.
//
// Who may see them is unchanged: only signed-in staff (the sign-in middleware covers /api/*), and the route reads from Storage AS that person, so
// the bucket's own access rules (migration v30: active staff only) still decide. The buckets stay private. The response is "private" so no shared
// cache (the CDN) can keep it and show it to anyone else.
export const MEDIA_BUCKETS = ['dress-images', 'return-inspection-photos'] as const
export type MediaBucket = typeof MEDIA_BUCKETS[number]

export const mediaUrl = (bucket: MediaBucket, objectPath: string): string =>
  `/api/media/${bucket}/${objectPath.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`

const SEGMENT = /^[A-Za-z0-9._~ ()@+=,-]{1,200}$/

/** The object path inside the bucket, or null if anything about it looks wrong (empty, "..", odd characters, too deep). */
export function safeObjectPath(segments: unknown): string | null {
  if (!Array.isArray(segments) || !segments.length || segments.length > 6) return null
  const out: string[] = []
  for (const raw of segments) {
    if (typeof raw !== 'string') return null
    let s = raw
    if (s.includes('%')) { try { s = decodeURIComponent(s) } catch { return null } }
    if (s === '.' || s === '..' || !SEGMENT.test(s)) return null
    out.push(s)
  }
  return out.join('/')
}

export const isMediaBucket = (v: unknown): v is MediaBucket => (MEDIA_BUCKETS as readonly string[]).includes(String(v))

/** Browsers keep a dress photo for a week (its file name is never reused) and an inspection photo for a day. */
export const mediaCacheControl = (bucket: MediaBucket) => bucket === 'dress-images' ? 'private, max-age=604800, immutable' : 'private, max-age=86400'

/** Only real picture types are shown inline. Anything else (for example an SVG, which can carry script) is sent as a download. */
export const SAFE_IMAGE_TYPE = /^image\/(jpeg|png|webp|gif|avif)$/
