// Return-inspection and handover photos live in a PRIVATE bucket. The database stores each photo's address, and the app opens it with a
// short-lived signed link, so a copied URL stops working for anyone who is not signed in as staff.
export const PHOTO_BUCKET = 'return-inspection-photos'

export async function signedPhotoUrl(sb: any, url: string, seconds = 3600): Promise<string> {
  const m = /\/return-inspection-photos\/(.+?)(?:\?|$)/.exec(url || ''); if (!m) return url
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(decodeURIComponent(m[1]), seconds)
  return error || !data?.signedUrl ? url : data.signedUrl
}

/** Upload files and return their stored addresses (and the paths, so a failed save can remove them again). */
export async function uploadPhotos(sb: any, folder: string, files: File[]): Promise<{ urls: string[]; paths: string[]; failed: number }> {
  const urls: string[] = [], paths: string[] = []; let failed = 0
  for (const [i, file] of files.entries()) {
    if (!(file instanceof File) || !file.size) continue
    const path = `${folder}/${Date.now()}-${i}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false, contentType: file.type })
    if (up.error) failed++; else { paths.push(path); urls.push(sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl) }
  }
  return { urls, paths, failed }
}
