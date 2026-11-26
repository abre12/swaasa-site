import { supaServer } from '@/lib/supabase/server'
import { isMediaBucket, mediaCacheControl, safeObjectPath, SAFE_IMAGE_TYPE } from '@/lib/media'

// A private photo at a stable address (see lib/media.ts). Only signed-in staff reach it (middleware), and the photo is read from Storage as that
// person, so the bucket's own rules still apply. If Storage says no, the answer is a plain 404 that browsers are told not to keep.
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const gone = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(_req: Request, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await ctx.params
  const objectPath = safeObjectPath(path)
  if (!isMediaBucket(bucket) || !objectPath) return gone()
  const sb = await supaServer()
  const { data, error } = await sb.storage.from(bucket).download(objectPath)
  if (error || !data) return gone()
  const safe = SAFE_IMAGE_TYPE.test(data.type)
  return new Response(data.stream(), {
    headers: {
      'Content-Type': safe ? data.type : 'application/octet-stream',
      'Content-Length': String(data.size),
      'Cache-Control': mediaCacheControl(bucket),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",   // even if something odd is opened directly, it cannot run script here
      ...(safe ? {} : { 'Content-Disposition': 'attachment' }),
    },
  })
}
