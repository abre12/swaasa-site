'use client'
import { useEffect, useRef, useState } from 'react'
// One large main photo with thumbnails underneath. A thumbnail click puts that photo on top;
// clicking the main photo opens it full screen with a clear Close button.
export default function Gallery({ images, name }: { images: string[]; name: string }) {
  const [cur, setCur] = useState(0); const [full, setFull] = useState(false); const box = useRef<HTMLDivElement>(null)
  const n = images.length
  const go = (d: number) => setCur(c => (c + d + n) % n)
  const close = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setFull(false) }

  useEffect(() => {
    if (!full) return
    box.current?.requestFullscreen?.().catch(() => {})            // real full screen where the browser allows it; otherwise the overlay still fills the screen
    const onFs = () => { if (!document.fullscreenElement) setFull(false) }   // Esc in full screen also closes
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1) }
    document.addEventListener('fullscreenchange', onFs); window.addEventListener('keydown', key); document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', key); document.body.style.overflow = '' }
  }, [full, n])

  if (!n) return <div style={{ height: 420, width: '100%', background: 'var(--blush)' }} />
  const nav: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: '#0009', color: '#fff', border: 0, width: 46, height: 46, fontSize: 28, cursor: 'pointer', borderRadius: 23 }
  return (<>
    <div style={{ height: 'min(70vh, 540px)', background: 'var(--blush)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={images[cur]} alt={name} onClick={() => setFull(true)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in' }} /></div>
    <p className="mut" style={{ fontSize: 12, margin: '6px 0' }}>Click the photo for full screen{n > 1 ? ' · click a small photo to view it' : ''}</p>
    {n > 1 && <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>{images.map((u, k) =>
      <button key={u} type="button" onClick={() => setCur(k)} aria-label={`Show photo ${k + 1}`} style={{ flex: 'none', padding: 0, background: 'none', cursor: 'pointer', border: `2px solid ${k === cur ? 'var(--ink)' : 'var(--line)'}`, opacity: k === cur ? 1 : 0.7 }}>
        <img src={u} alt="" style={{ width: 64, height: 84, objectFit: 'cover', display: 'block' }} /></button>)}</div>}
    {full && <div ref={box} onClick={close} role="dialog" aria-label={name} style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={images[cur]} alt={name} onClick={e => e.stopPropagation()} style={{ maxWidth: '100vw', maxHeight: '100vh', objectFit: 'contain' }} />
      <button type="button" onClick={e => { e.stopPropagation(); close() }} style={{ position: 'absolute', top: 16, right: 16, background: '#fff', color: '#000', border: 0, padding: '10px 18px', fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer' }}>✕ Close full screen</button>
      {n > 1 && <>
        <button type="button" aria-label="Previous photo" onClick={e => { e.stopPropagation(); go(-1) }} style={{ ...nav, left: 14 }}>‹</button>
        <button type="button" aria-label="Next photo" onClick={e => { e.stopPropagation(); go(1) }} style={{ ...nav, right: 14 }}>›</button>
        <span style={{ position: 'absolute', bottom: 16, color: '#fff', fontSize: 13 }}>{cur + 1} / {n}</span></>}
    </div>}
  </>)
}
