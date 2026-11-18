import { describe, it, expect, vi, afterEach } from 'vitest'

// The reel videos can be served from a storage bucket instead of public/reels (docs/MEDIA.md). The posters always stay on this site.
async function load(base?: string) {
  vi.resetModules()
  if (base === undefined) vi.stubEnv('NEXT_PUBLIC_REELS_VIDEO_BASE_URL', '')
  else vi.stubEnv('NEXT_PUBLIC_REELS_VIDEO_BASE_URL', base)
  return (await import('../lib/reels')).REELS
}
afterEach(() => { vi.unstubAllEnvs() })

describe('reel video location', () => {
  it('defaults to the files in public/reels', async () => {
    const r = await load()
    expect(r).toHaveLength(8)
    expect(r.map(x => x.video)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => `/reels/reel-${n}.mp4`))
  })
  it('uses the configured storage address for videos only, ignoring a trailing slash', async () => {
    const r = await load('https://abc.supabase.co/storage/v1/object/public/reels/')
    expect(r[2].video).toBe('https://abc.supabase.co/storage/v1/object/public/reels/reel-3.mp4')
    expect(r[2].poster).toBe('/reels/reel-3-poster.webp')
  })
})
