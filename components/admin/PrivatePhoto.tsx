'use client'
import { useEffect, useState } from 'react'
import { signedPhotoUrl } from '@/lib/photos'

// One photo from the private bucket: opens a short-lived link, shows a thumbnail, and opens full size in a new tab.
export default function PrivatePhoto({ sb, url, alt }: { sb: any; url: string; alt: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let off = false; signedPhotoUrl(sb, url).then(u => { if (!off) setSrc(u) }); return () => { off = true } }, [sb, url])
  return src ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={alt} loading="lazy" /></a> : <span className="mut" style={{ fontSize: 12 }}>Loading photo…</span>
}
