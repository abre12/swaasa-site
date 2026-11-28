'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { StoryPhoto } from '@/lib/customer-stories'

type StripLayout = { copyCount: number; loopWidth: number }

export default function PhotoStrip({ photos }: { photos: StoryPhoto[] }) {
  const viewport = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const pointerInside = useRef(false)
  const pointerActive = useRef(false)
  const keyboardFocused = useRef(false)
  const modalOpen = useRef(false)
  const [paused, setPaused] = useState(false)
  const [activePhoto, setActivePhoto] = useState<StoryPhoto | null>(null)
  const [layout, setLayout] = useState<StripLayout>({ copyCount: 1, loopWidth: 0 })

  useEffect(() => {
    const node = viewport.current
    const firstSet = node?.querySelector<HTMLElement>('[data-photo-set="first"]')
    const track = node?.querySelector<HTMLElement>('.cs-photo-strip-track')
    if (!node || !firstSet || !track || photos.length < 2) return

    const measure = () => {
      const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0
      const loopWidth = firstSet.getBoundingClientRect().width + gap
      if (loopWidth <= 0) return
      // Keep several full sets on both sides of the viewport so the animation
      // can travel one complete set and reset without exposing an empty edge.
      const copyCount = Math.max(6, 2 * Math.ceil(node.clientWidth / loopWidth) + 4)
      setLayout(current => current.copyCount === copyCount && Math.abs(current.loopWidth - loopWidth) < 1
        ? current
        : { copyCount, loopWidth })
    }

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    observer.observe(firstSet)
    measure()
    return () => observer.disconnect()
  }, [photos.length])

  useLayoutEffect(() => {
    const node = viewport.current
    if (!node || layout.copyCount < 2 || layout.loopWidth <= 0) return
    // Begin in the middle of the repeated strip. Moving left then always has
    // another identical set ready to enter the viewport.
    const frame = window.requestAnimationFrame(() => {
      node.scrollLeft = Math.floor(layout.copyCount / 2) * layout.loopWidth
    })
    return () => window.cancelAnimationFrame(frame)
  }, [layout.copyCount, layout.loopWidth])

  const closePhoto = useCallback(() => {
    modalOpen.current = false
    setActivePhoto(null)
    setPaused(pointerInside.current || pointerActive.current || keyboardFocused.current)
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
    setPaused(true)
    setActivePhoto(photo)
  }

  if (!photos.length) return null
  const copies = Array.from({ length: photos.length > 1 ? layout.copyCount : 1 }, (_, index) => index)
  const moving = photos.length > 1 && layout.loopWidth > 0
  const trackStyle = {
    '--cs-loop-distance': `${-layout.loopWidth}px`,
    '--cs-loop-duration': `${Math.max(24, layout.loopWidth / 38)}s`,
  } as CSSProperties

  return <>
    <div
      className="cs-photo-strip"
      ref={viewport}
      role="region"
      aria-label="Customer celebration photos. The gallery moves from left to right. Hover to pause and enlarge, click to view a larger photo, or swipe to browse."
      aria-roledescription="photo gallery"
      data-paused={paused}
      tabIndex={0}
      onFocus={event => {
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
          keyboardFocused.current = true
          setPaused(true)
        }
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          keyboardFocused.current = false
          if (!pointerInside.current && !pointerActive.current && !modalOpen.current) setPaused(false)
        }
      }}
      onPointerEnter={() => {
        pointerInside.current = true
        setPaused(true)
      }}
      onPointerLeave={() => {
        pointerInside.current = false
        if (!pointerActive.current && !keyboardFocused.current && !modalOpen.current) setPaused(false)
      }}
      onPointerDown={() => {
        pointerActive.current = true
        setPaused(true)
      }}
      onPointerUp={event => {
        pointerActive.current = false
        if (event.pointerType === 'touch') pointerInside.current = false
        if (!pointerInside.current && !keyboardFocused.current && !modalOpen.current) setPaused(false)
      }}
      onPointerCancel={() => {
        pointerActive.current = false
        if (!pointerInside.current && !keyboardFocused.current && !modalOpen.current) setPaused(false)
      }}
    >
      <div className="cs-photo-strip-track" data-moving={moving} style={trackStyle}>
        {copies.map((copyIndex) => <div
          className="cs-photo-strip-set"
          data-photo-set={copyIndex === 0 ? 'first' : undefined}
          key={`photo-set-${copyIndex}`}
          aria-hidden={copyIndex !== 0}
        >
          {photos.map((photo, index) => <button
            className="cs-photo-strip-photo"
            type="button"
            key={`${photo.url}-strip-${copyIndex}-${index}`}
            aria-label={`View larger: ${photo.alt || 'customer celebration photo'}`}
            tabIndex={copyIndex === 0 ? undefined : -1}
            onClick={event => openPhoto(photo, event.currentTarget)}
          >
            <img src={photo.url} alt={copyIndex === 0 ? photo.alt : ''} loading={copyIndex < 3 ? 'eager' : 'lazy'} decoding="async" />
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
