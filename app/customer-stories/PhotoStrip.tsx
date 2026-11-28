'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoryPhoto } from '@/lib/customer-stories'

export default function PhotoStrip({ photos }: { photos: StoryPhoto[] }) {
  const viewport = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const pointerInside = useRef(false)
  const pointerActive = useRef(false)
  const keyboardFocused = useRef(false)
  const modalOpen = useRef(false)
  const resumeAt = useRef(0)
  const [activePhoto, setActivePhoto] = useState<StoryPhoto | null>(null)
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
      const paused = pointerInside.current || pointerActive.current || keyboardFocused.current || modalOpen.current
      if (!paused && time >= resumeAt.current) {
        node.scrollLeft -= elapsed * 0.045
        if (node.scrollLeft <= startDistance - loopDistance()) node.scrollLeft = startDistance
      }
      frame = window.requestAnimationFrame(animate)
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [copyCount, photos.length])

  const closePhoto = useCallback(() => {
    modalOpen.current = false
    setActivePhoto(null)
    resumeAt.current = performance.now() + 650
    window.requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
  }, [])

  useEffect(() => {
    if (!activePhoto) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePhoto()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activePhoto, closePhoto])

  function openPhoto(photo: StoryPhoto, button: HTMLButtonElement) {
    opener.current = button
    modalOpen.current = true
    setActivePhoto(photo)
  }

  if (!photos.length) return null
  const copies = Array.from({ length: photos.length > 1 ? copyCount : 1 }, () => photos)

  return <>
    <div
      className="cs-photo-strip"
      ref={viewport}
      role="region"
      aria-label="Customer celebration photos. Hover to pause and enlarge, click to view a larger photo, swipe or scroll to browse."
      tabIndex={0}
      onFocus={event => {
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) keyboardFocused.current = true
      }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) keyboardFocused.current = false }}
      onPointerEnter={() => { pointerInside.current = true }}
      onPointerLeave={() => {
        pointerInside.current = false
        resumeAt.current = performance.now() + 650
      }}
      onPointerDown={event => {
        pointerActive.current = true
        resumeAt.current = Number.POSITIVE_INFINITY
        if (event.pointerType === 'mouse') event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerUp={() => {
        pointerActive.current = false
        resumeAt.current = performance.now() + 650
      }}
      onPointerCancel={() => {
        pointerActive.current = false
        resumeAt.current = performance.now() + 650
      }}
      onWheel={() => { resumeAt.current = performance.now() + 650 }}
    >
      <div className="cs-photo-strip-track">
        {copies.map((set, copyIndex) => <div className="cs-photo-strip-set" data-photo-set={copyIndex === 0 ? 'first' : undefined} key={`photo-set-${copyIndex}`} aria-hidden={copyIndex !== 0}>
          {set.map((photo, index) => <button
            className="cs-photo-strip-photo"
            type="button"
            key={`${photo.url}-strip-${copyIndex}-${index}`}
            aria-label={`View larger: ${photo.alt || 'customer celebration photo'}`}
            onClick={event => openPhoto(photo, event.currentTarget)}
          >
            <img src={photo.url} alt={copyIndex === 0 ? photo.alt : ''} loading="lazy" decoding="async" />
          </button>)}
        </div>)}
      </div>
    </div>
    {activePhoto && <div className="cs-photo-lightbox" role="dialog" aria-modal="true" aria-label="Customer celebration photo" onClick={closePhoto}>
      <button className="cs-photo-lightbox-close" type="button" ref={closeButton} onClick={closePhoto} aria-label="Close enlarged photo">×</button>
      <img src={activePhoto.url} alt={activePhoto.alt} onClick={event => event.stopPropagation()} />
      <p className="cs-photo-lightbox-caption">{activePhoto.alt}</p>
    </div>}
  </>
}
