'use client'

import { useRef, useState } from 'react'
import type { StoryPhoto } from '@/lib/customer-stories'

export default function PhotoCarousel({ photos, label }: { photos: StoryPhoto[]; label: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  if (!photos.length) return null

  function scrollTo(index: number) {
    const node = track.current
    if (!node) return
    const next = Math.max(0, Math.min(photos.length - 1, index))
    node.scrollTo({ left: next * node.clientWidth, behavior: 'smooth' })
    setActive(next)
  }

  return <div className="cs-carousel" role="region" aria-label={label} aria-roledescription="carousel">
    <div className="cs-carousel-track" ref={track} tabIndex={0} onScroll={event => {
      const node = event.currentTarget
      setActive(Math.min(photos.length - 1, Math.round(node.scrollLeft / Math.max(1, node.clientWidth))))
    }}>
      {photos.map((photo, index) => <div className="cs-carousel-slide" key={`${photo.url}-${index}`}>
        <img src={photo.url} alt={photo.alt} loading="lazy" decoding="async" />
      </div>)}
    </div>
    {photos.length > 1 && <div className="cs-carousel-controls">
      <button type="button" onClick={() => scrollTo(active - 1)} disabled={active === 0} aria-label="Previous photo">‹</button>
      <div className="cs-carousel-dots" aria-label={`Photo ${active + 1} of ${photos.length}`}>
        {photos.map((photo, index) => <button type="button" key={`${photo.url}-dot-${index}`} className={active === index ? 'active' : ''} onClick={() => scrollTo(index)} aria-label={`Show photo ${index + 1}`} aria-current={active === index ? 'true' : undefined} />)}
      </div>
      <button type="button" onClick={() => scrollTo(active + 1)} disabled={active === photos.length - 1} aria-label="Next photo">›</button>
    </div>}
  </div>
}
