// Browser-side photo sizing. Every uploaded photo is stored three ways so pages load quickly:
//   thumb  (about 420 px wide)  catalogue cards and small previews
//   medium (about 960 px wide)  the main photo on a dress page
//   original (at most 2400 px)  opened only when someone clicks for full screen
async function shrink(src: Blob, maxW: number, quality: number): Promise<Blob> {
  const bmp = await createImageBitmap(src)                                   // respects the phone's rotation
  const k = Math.min(1, maxW / bmp.width), c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('resize failed')), 'image/jpeg', quality))
}
export const makeSizes = async (src: Blob) => ({ original: await shrink(src, 2400, 0.9), medium: await shrink(src, 960, 0.84), thumb: await shrink(src, 420, 0.78) })
export const thumbOf = (d: any, i = 0) => d?.thumbs?.[i] || d?.images?.[i]
export const mediumOf = (d: any, i = 0) => d?.medium?.[i] || d?.images?.[i]
