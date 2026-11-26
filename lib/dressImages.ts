import { mediaUrl } from './media'

export const DRESS_IMAGE_BUCKET = 'dress-images'

const IMAGE_PATH_MARKERS = [
  `/api/media/${DRESS_IMAGE_BUCKET}/`,
  `/storage/v1/object/public/${DRESS_IMAGE_BUCKET}/`,
  `/storage/v1/object/sign/${DRESS_IMAGE_BUCKET}/`,
  `/storage/v1/object/authenticated/${DRESS_IMAGE_BUCKET}/`,
  `/storage/v1/render/image/public/${DRESS_IMAGE_BUCKET}/`,
  `/storage/v1/render/image/sign/${DRESS_IMAGE_BUCKET}/`,
]

function decodePath(path: string) {
  try { return decodeURIComponent(path).replace(/^\/+/, '') } catch { return path.replace(/^\/+/, '') }
}

// Existing rows contain public Supabase URLs; newer rows store Storage object paths.
// Accept both forms so switching the bucket to private does not require editing every dress record.
export function dressImagePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null
  let pathname = raw
  if (/^https?:\/\//i.test(raw)) {
    try { pathname = new URL(raw).pathname } catch { return null }
  }
  for (const marker of IMAGE_PATH_MARKERS) {
    const at = pathname.indexOf(marker)
    if (at >= 0) return decodePath(pathname.slice(at + marker.length))
  }
  return /^https?:\/\//i.test(raw) ? null : decodePath(raw)
}

/**
 * The address to show each stored photo value at. Values may be old public Supabase links, signed links, or plain Storage paths; every one that
 * names a dress-image object becomes the SAME stable address on every call (/api/media/..., see lib/media.ts), so browsers can cache it.
 * Nothing is signed any more, so this needs no network. The `sb` and `expiresIn` arguments are kept so existing callers do not change.
 */
export async function signDressImageValues(_sb: any, values: string[], _expiresIn = 3600): Promise<string[]> {
  return values.map(value => { const path = dressImagePath(value); return path ? mediaUrl(DRESS_IMAGE_BUCKET, path) : value })
}

export async function signDressRows(sb: any, rows: any[], expiresIn = 3600): Promise<any[]> {
  const fields = ['images', 'thumbs', 'medium'] as const
  const all: string[] = []
  rows.forEach(row => {
    fields.forEach(field => { if (Array.isArray(row[field])) all.push(...row[field]) })
    if (typeof row.try_on_image === 'string') all.push(row.try_on_image)
  })
  const signed = await signDressImageValues(sb, all, expiresIn)
  let at = 0
  return rows.map(row => {
    const next = { ...row }
    fields.forEach(field => {
      if (Array.isArray(row[field])) next[field] = row[field].map(() => signed[at++])
    })
    if (typeof row.try_on_image === 'string') next.try_on_image = signed[at++]
    return next
  })
}
