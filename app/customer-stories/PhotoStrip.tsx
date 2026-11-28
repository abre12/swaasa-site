'use client'

import { useEffect, useRef, useState } from 'react'
import type { StoryPhoto } from '@/lib/customer-stories'

export default function PhotoStrip({ photos }: { photos: StoryPhoto[] }) {
  const viewport = useRef<HTMLDivElement>(null)
  const focused = useRef(false)
  const resumeAt = useRef(0)
  const [copyCount, setCopyCount] = useState(() => photos.length < 2 ? 1 : Math.max(4, 2 * Math.ceil(1180 / (184 * photos.length)) + 2))

  useEffect(() => {
    const node = viewport.current
    const firstSet = node?.querySelector<HTMLElement>('[data-photo-set="first"]')
    const track = node?.querySelector<HTMLElement>('.cs-photo-strip-track')
    if (!node || !firstSet || !track) return
    if (photos.length < 2) { setCopyCount(current => current === 1 ? current : 1); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setCopyCount(current => current === 1 ? current : 1); return }
    const updateCopies = () => {
      const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0
      const loopWidth = firstSet.getBoundingClientRect().width + gap
      if (loopWidth <= 0) return
      const needed = Math.max(4, 2 * Math.ceil(node.clientWidth / loopWidth) + 2)
      setCopyCount(current => current === needed ? current : needed)
    }
    const observer = new ResizeObserver(updateCopies)
    observer.observe(node)
    observer.observe(firstSet)
    updateCopies()
    return () => observer.disconnect()
  }, [photos.length])

  useEffect(() => {
    const node = viewport.current
    const firstSet = node?.querySelector<HTMLElement>('[data-photo-set="first"]')
    const track = node?.querySelector<HTMLElement>('.cs-photo-strip-track')
    if (!node || !firstSet || !track || photos.length < 2) return

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motionPreference.matches) return

    const loopDistance = () => {
      const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0
      return firstSet.getBoundingClientRect().width + gap
    }

    let frame = 0
    let previous = 0
    const startDistance = loopDistance() * Math.floor(copyCount / 2)
    if (node.scrollWidth - node.clientWidth < startDistance) return
    node.scrollLeft = startDistance
    const animate = (time: number) => {
      if (!previous) previous = time
      const elapsed = Math.min(time - previous, 40)
      previous = time
      if (!focused.current && time >= resumeAt.current) {
        node.scrollLeft -= elapsed * 0.028
        if (node.scrollLeft <= startDistance - loopDistance()) node.scrollLeft = startDistance
      }
      frame = window.requestAnimationFrame(animate)
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [copyCount, photos.length])

  if (!photos.length) return null
  const copies = Array.from({ length: photos.length > 1 ? copyCount : 1 }, () => photos)

  return <div
    className="cs-photo-strip"
    ref={viewport}
    role="region"
    aria-label="Customer celebration photos. Swipe or scroll to browse."
    tabIndex={0}
    onFocus={() => { focused.current = true }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focused.current = false }}
    onPointerDown={event => { resumeAt.current = Number.POSITIVE_INFINITY; event.currentTarget.setPointerCapture(event.pointerId) }}
    onPointerUp={() => { resumeAt.current = performance.now() + 1800 }}
    onPointerCancel={() => { resumeAt.current = performance.now() + 1800 }}
    onWheel={() => { resumeAt.current = performance.now() + 1800 }}
  >
    <div className="cs-photo-strip-track">
      {copies.map((set, copyIndex) => <div className="cs-photo-strip-set" data-photo-set={copyIndex === 0 ? 'first' : undefined} key={`photo-set-${copyIndex}`} aria-hidden={copyIndex !== 0}>
        {set.map((photo, index) => <figure key={`${photo.url}-strip-${copyIndex}-${index}`}>
          <img src={photo.url} alt={copyIndex === 0 ? photo.alt : ''} loading="lazy" decoding="async" />
        </figure>)}
      </div>)}
    </div>
  </div>
}
