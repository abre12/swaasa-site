import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dressImagePath, signDressImageValues, signDressRows } from '@/lib/dressImages'
import { signedPhotoUrl } from '@/lib/photos'
import { mediaCacheControl, mediaUrl, safeObjectPath } from '@/lib/media'

const h = vi.hoisted(() => ({ download: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ supaServer: async () => ({ storage: { from: (b: string) => ({ download: (p: string) => h.download(b, p) }) } }) }))

describe('stable private photo addresses', () => {
  it('gives the same address every time for the same photo, whatever form it was stored in', async () => {
    const stored = ['dress/abc/1700000000-0-front.jpg', 'https://x.supabase.co/storage/v1/object/public/dress-images/dress/abc/1700000000-0-front.jpg',
      'https://x.supabase.co/storage/v1/object/sign/dress-images/dress/abc/1700000000-0-front.jpg?token=aaa', 'https://x.supabase.co/storage/v1/object/sign/dress-images/dress/abc/1700000000-0-front.jpg?token=bbb']
    const out = await signDressImageValues(null, stored)
    expect(new Set(out).size).toBe(1); expect(out[0]).toBe('/api/media/dress-images/dress/abc/1700000000-0-front.jpg')
    expect(await signDressImageValues(null, stored)).toEqual(out)
  })
  it('leaves previews and other addresses alone, and needs no network', async () => {
    expect(await signDressImageValues(null, ['blob:abc', 'data:image/png;base64,AA', 'https://elsewhere.test/a.jpg'])).toEqual(['blob:abc', 'data:image/png;base64,AA', 'https://elsewhere.test/a.jpg'])
  })
  it('turns a stable address back into the storage path (so saving or deleting a dress still finds the file)', () => {
    expect(dressImagePath('/api/media/dress-images/dress/abc/a%20b.jpg')).toBe('dress/abc/a b.jpg')
    expect(dressImagePath(mediaUrl('dress-images', 'dress/abc/a b.jpg'))).toBe('dress/abc/a b.jpg')
  })
  it('fills the photo fields of a dress row', async () => {
    const [row] = await signDressRows(null, [{ id: 1, images: ['dress/1/a.jpg'], thumbs: ['dress/1/t.jpg'], medium: ['dress/1/m.jpg'], try_on_image: 'dress/1/try.jpg', name: 'x' }])
    expect(row).toEqual({ id: 1, images: ['/api/media/dress-images/dress/1/a.jpg'], thumbs: ['/api/media/dress-images/dress/1/t.jpg'], medium: ['/api/media/dress-images/dress/1/m.jpg'], try_on_image: '/api/media/dress-images/dress/1/try.jpg', name: 'x' })
  })
  it('does the same for inspection photos', async () => {
    expect(await signedPhotoUrl(null, 'https://x.supabase.co/storage/v1/object/public/return-inspection-photos/b1/2-x.jpg')).toBe('/api/media/return-inspection-photos/b1/2-x.jpg')
    expect(await signedPhotoUrl(null, 'https://elsewhere.test/x.jpg')).toBe('https://elsewhere.test/x.jpg')
  })
})

describe('safeObjectPath', () => {
  it('accepts ordinary storage paths', () => { expect(safeObjectPath(['dress', 'abc', '1700-0-front (1).jpg'])).toBe('dress/abc/1700-0-front (1).jpg') })
  it('refuses traversal, odd characters, empty and over-deep paths', () => {
    for (const bad of [['..', 'x'], ['a', '..'], ['.'], [], ['a/b'], ['a\\b'], ['a%2F..%2Fb'], ['%E0%A4%A'], ['a', ''], ['<x>'], ['a;b'], Array(7).fill('a'), 'dress', null, [1]]) expect(safeObjectPath(bad as any), JSON.stringify(bad)).toBeNull()
  })
})
it('dress photos are cached for a week and privately', () => {
  expect(mediaCacheControl('dress-images')).toBe('private, max-age=604800, immutable'); expect(mediaCacheControl('return-inspection-photos')).toBe('private, max-age=86400')
})

describe('GET /api/media/[bucket]/[...path]', () => {
  let GET: (r: any, c: any) => Promise<Response>
  beforeEach(async () => { vi.resetModules(); h.download.mockReset(); ;({ GET } = await import('@/app/api/media/[bucket]/[...path]/route')) })
  const get = (bucket: string, path: string[]) => GET(new Request('https://swaasa.test/x'), { params: Promise.resolve({ bucket, path }) })
  const blob = (type: string) => new Blob(['abc'], { type })

  it('streams the photo with private long-lived caching and locked-down headers', async () => {
    h.download.mockResolvedValue({ data: blob('image/jpeg'), error: null })
    const r = await get('dress-images', ['dress', 'abc', 'a.jpg'])
    expect(r.status).toBe(200); expect(h.download).toHaveBeenCalledWith('dress-images', 'dress/abc/a.jpg')
    expect(r.headers.get('content-type')).toBe('image/jpeg'); expect(r.headers.get('cache-control')).toBe('private, max-age=604800, immutable')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff'); expect(r.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(await r.text()).toBe('abc')
  })
  it('never shows a non-picture inline (an SVG could carry script): it is sent as a download', async () => {
    h.download.mockResolvedValue({ data: blob('image/svg+xml'), error: null })
    const r = await get('dress-images', ['x.svg']); expect(r.headers.get('content-type')).toBe('application/octet-stream'); expect(r.headers.get('content-disposition')).toBe('attachment')
  })
  it('answers 404 (not kept by browsers) when storage refuses, for unknown buckets and for bad paths, without asking storage', async () => {
    h.download.mockResolvedValue({ data: null, error: { message: 'denied' } })
    const denied = await get('dress-images', ['a.jpg']); expect(denied.status).toBe(404); expect(denied.headers.get('cache-control')).toBe('no-store')
    h.download.mockClear()
    for (const [b, p] of [['secrets', ['a.jpg']], ['dress-images', ['..', 'a.jpg']], ['dress-images', []]] as const) expect((await get(b, [...p])).status).toBe(404)
    expect(h.download).not.toHaveBeenCalled()
  })
})
