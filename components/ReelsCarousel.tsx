'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Reel } from '@/lib/reels'

const Chev = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const Speaker = ({ muted }: { muted: boolean }) => <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" />{muted ? <path d="m16 9 5 6m0-6-5 6" /> : <><path d="M15 9a5 5 0 0 1 0 6" /><path d="M18 6a9 9 0 0 1 0 12" /></>}</svg>

export default function ReelsCarousel({ reels, instagram }: { reels: Reel[]; instagram: string }) {
  const track = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLDivElement | null)[]>([])
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const activeRef = useRef(0)
  const scrollTimer = useRef<number | null>(null)
  const [active, setActive] = useState(0)
  const [soundOn, setSoundOn] = useState(false)
  const [playing, setPlaying] = useState<number | null>(null)
  // Only the active card and cards actually in the scroll viewport get a video source.
  const [visible, setVisible] = useState<Set<number>>(() => new Set([0]))

  const pauseOthers = useCallback((keep: number) => {
    videos.current.forEach((video, index) => {
      if (index === keep || !video) return
      video.pause()
      video.muted = true
    })
  }, [])

  const changeActive = useCallback((index: number) => {
    const next = Math.max(0, Math.min(reels.length - 1, index))
    if (next === activeRef.current) return
    activeRef.current = next
    pauseOthers(next)
    setActive(next)
    setSoundOn(false)
  }, [pauseOthers, reels.length])

  const scrollToCard = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const scroller = track.current
    const card = cards.current[index]
    if (!scroller || !card) return
    const trackRect = scroller.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const trackCenter = trackRect.left + scroller.clientWidth / 2
    const cardCenter = cardRect.left + cardRect.width / 2
    scroller.scrollTo({ left: scroller.scrollLeft + cardCenter - trackCenter, behavior })
  }, [])

  const pickCenteredCard = useCallback(() => {
    const scroller = track.current
    if (!scroller) return
    const center = scroller.getBoundingClientRect().left + scroller.clientWidth / 2
    let best = activeRef.current
    let distance = Infinity
    cards.current.forEach((card, index) => {
      if (!card) return
      const rect = card.getBoundingClientRect()
      const candidate = Math.abs(rect.left + rect.width / 2 - center)
      if (candidate < distance) {
        best = index
        distance = candidate
      }
    })
    changeActive(best)
  }, [changeActive])

  const onTrackScroll = () => {
    // Wait until momentum and scroll-snap settle before changing the active
    // slide. Updating React state on every touch-scroll frame can interrupt
    // swipes and can reset sound while a tap is starting playback.
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current)
    scrollTimer.current = window.setTimeout(() => {
      scrollTimer.current = null
      pickCenteredCard()
    }, 120)
  }

  useEffect(() => () => {
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current)
  }, [])

  useEffect(() => {
    const root = track.current
    if (!root) return
    if (!('IntersectionObserver' in window)) {
      setVisible(new Set([activeRef.current]))
      return
    }
    const observer = new IntersectionObserver(entries => {
      setVisible(previous => {
        const next = new Set(previous)
        entries.forEach(entry => {
          const index = cards.current.indexOf(entry.target as HTMLDivElement)
          if (index < 0) return
          if (entry.isIntersecting && entry.intersectionRatio >= 0.2) next.add(index)
          else next.delete(index)
        })
        return next
      })
    }, { root, threshold: [0, 0.2] })
    cards.current.forEach(card => card && observer.observe(card))
    return () => observer.disconnect()
  }, [reels.length])

  // Release the source of cards that have left the viewport to stop background downloads.
  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video || visible.has(index) || index === active) return
      video.pause()
      video.removeAttribute('src')
      video.load()
    })
  }, [active, visible])

  useEffect(() => {
    const scroller = track.current
    if (!scroller || !cards.current[activeRef.current]) return
    scrollToCard(activeRef.current, 'auto')
  }, [reels.length, scrollToCard])

  const go = (index: number) => {
    const target = Math.max(0, Math.min(reels.length - 1, index))
    if (!track.current || !cards.current[target]) return
    changeActive(target)
    scrollToCard(target, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
  }

  const playWithSound = (index: number) => {
    const reel = reels[index]
    const video = videos.current[index]
    if (!reel?.video || !video) return

    changeActive(index)
    scrollToCard(index)
    pauseOthers(index)
    setVisible(previous => new Set(previous).add(index))
    setSoundOn(true)

    // Set source and audio synchronously in the user's click gesture so mobile
    // browsers allow audible playback without a second tap.
    if (video.getAttribute('src') !== reel.video) {
      video.src = reel.video
      video.load()
    }
    video.muted = false
    video.volume = 1
    video.playsInline = true
    video.play().then(() => setPlaying(index)).catch(() => {
      video.muted = true
      setSoundOn(false)
      setPlaying(current => current === index ? null : current)
    })
  }

  const toggleSound = (index: number) => {
    const reel = reels[index]
    const video = videos.current[index]
    if (!reel?.video || !video) return
    if (index !== activeRef.current) {
      playWithSound(index)
      return
    }

    if (video.getAttribute('src') !== reel.video) {
      video.src = reel.video
      video.load()
    }
    const nextMuted = !video.muted
    video.muted = nextMuted
    setSoundOn(!nextMuted)
    if (!nextMuted && video.paused) {
      video.volume = 1
      video.play().then(() => setPlaying(index)).catch(() => {
        video.muted = true
        setSoundOn(false)
        setPlaying(current => current === index ? null : current)
      })
    }
  }

  const previous = () => <button type="button" className="cl-arrow l" onClick={() => go(activeRef.current - 1)} disabled={active === 0} aria-label="Previous reel"><Chev d="m15 5-7 7 7 7" /></button>
  const next = () => <button type="button" className="cl-arrow r" onClick={() => go(activeRef.current + 1)} disabled={active >= reels.length - 1} aria-label="Next reel"><Chev d="m9 5 7 7-7 7" /></button>

  return <section className="cl-reels" aria-label="Swaasa in Motion">
    <div className="cl-reels-txt"><h2>Swaasa in Motion</h2><p>Discover our latest looks, real stylings and behind-the-scenes moments.</p>
      <a className="cl-ig" href={instagram} target="_blank" rel="noopener noreferrer">Follow on Instagram <span aria-hidden="true">↗</span></a></div>
    <div className="cl-reels-stage">{previous()}
      <div className="cl-track" ref={track} onScroll={onTrackScroll}>
        {reels.map((reel, index) => {
          const shouldLoad = visible.has(index) || index === active
          const isMuted = index !== active || !soundOn
          return <div key={reel.video || reel.poster} ref={element => { cards.current[index] = element }} className={'cl-reel' + (index === active ? ' on' : '')}>
            <button type="button" className="cl-reel-select" aria-label={`${playing === index ? 'Playing' : 'Play'} reel ${index + 1}: ${reel.alt}`} onClick={() => playWithSound(index)}>
              <img src={reel.poster} alt="" loading={index < 3 ? 'eager' : 'lazy'} decoding="async" />
              {reel.video && <video ref={element => { videos.current[index] = element }} src={shouldLoad ? reel.video : undefined} poster={reel.poster} preload={shouldLoad ? 'metadata' : 'none'} muted={isMuted} loop playsInline aria-label={reel.alt} onPlaying={() => setPlaying(index)} onPause={() => setPlaying(current => current === index ? null : current)} />}
              {reel.video && playing !== index && <span className="cl-reel-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg></span>}
            </button>
            {reel.video && shouldLoad && <button type="button" className="cl-sound" aria-label={soundOn && index === active ? `Mute reel ${index + 1}` : `Turn sound on for reel ${index + 1}`} aria-pressed={soundOn && index === active} onClick={() => toggleSound(index)}><Speaker muted={!(soundOn && index === active)} /></button>}
          </div>
        })}
      </div>{next()}
    </div>
    <div className="cl-dots" role="tablist" aria-label="Choose a reel">
      <span className="cl-mnav">{previous()}</span>
      {reels.map((reel, index) => <button key={reel.video || reel.poster} type="button" role="tab" aria-selected={index === active} aria-label={`Reel ${index + 1} of ${reels.length}`} className={index === active ? 'on' : ''} onClick={() => go(index)} />)}
      <span className="cl-mnav">{next()}</span>
    </div>
  </section>
}
