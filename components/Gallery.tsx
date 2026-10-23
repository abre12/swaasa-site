'use client'
import { useEffect, useState } from 'react'
// Dress photos. Click a photo to see it large; arrows or swipe-free buttons move between photos, Esc or a click outside closes.
export default function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState<number | null>(null)
  const n = images.length
  useEffect(() => {
    if (i === null) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setI(null)
      if (e.key === 'ArrowRight') setI(x => (x! + 1) % n)
      if (e.key === 'ArrowLeft') setI(x => (x! - 1 + n) % n)
    }
    window.addEventListener('keydown', key); document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = '' }
  }, [i, n])
  if (!n) return <div style={{ height: 420, width: '100%', background: 'var(--blush)' }} />
  const btn: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: '#0008', color: '#fff', border: 0, width: 44, height: 44, fontSize: 26, cursor: 'pointer', borderRadius: 22 }
  return (<>
    <div className="gal">{images.map((u, k) => <img key={u} src={u} alt={name} style={{ cursor: 'zoom-in' }} onClick={() => setI(k)} />)}</div>
    <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>Click a photo to enlarge</p>
    {i !== null && <div onClick={() => setI(null)} role="dialog" aria-label={name} style={{ position: 'fixed', inset: 0, background: '#000d', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={images[i]} alt={name} onClick={e => e.stopPropagation()} style={{ maxWidth: '94vw', maxHeight: '92vh', objectFit: 'contain' }} />
      <button aria-label="Close" onClick={() => setI(null)} style={{ ...btn, top: 22, right: 18, transform: 'none' }}>×</button>
      {n > 1 && <>
        <button aria-label="Previous photo" onClick={e => { e.stopPropagation(); setI((i - 1 + n) % n) }} style={{ ...btn, left: 12 }}>‹</button>
        <button aria-label="Next photo" onClick={e => { e.stopPropagation(); setI((i + 1) % n) }} style={{ ...btn, right: 12 }}>›</button>
        <span style={{ position: 'absolute', bottom: 16, color: '#fff', fontSize: 13 }}>{i + 1} / {n}</span></>}
    </div>}
  </>)
}
