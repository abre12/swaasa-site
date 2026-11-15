export const DRESS_IMAGE_BUCKET = 'dress-images'

const IMAGE_PATH_MARKERS = [
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

export async function signDressImageValues(sb: any, values: string[], expiresIn = 3600): Promise<string[]> {
  const paths = Array.from(new Set(values.map(dressImagePath).filter((path): path is string => !!path)))
  if (!paths.length) return values

  const signed = new Map<string, string>()
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100)
    const { data, error } = await sb.storage.from(DRESS_IMAGE_BUCKET).createSignedUrls(batch, expiresIn)
    if (error) continue
    for (const item of data || []) {
      const path = dressImagePath(item.path) || decodePath(String(item.path || ''))
      if (path && item.signedUrl) signed.set(path, item.signedUrl)
    }
  }

  return values.map(value => {
    const path = dressImagePath(value)
    return path ? signed.get(path) || value : value
  })
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
