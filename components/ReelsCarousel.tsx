'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Reel } from '@/lib/reels'

const Chev = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const Speaker = ({ muted }: { muted: boolean }) => <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" />{muted ? <path d="m16 9 5 6m0-6-5 6" /> : <><path d="M15 9a5 5 0 0 1 0 6" /><path d="M18 6a9 9 0 0 1 0 12" /></>}</svg>

export default function ReelsCarousel({ reels, instagram }: { reels: Reel[]; instagram: string }) {
  const track = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLElement | null)[]>([])
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const [on, setOn] = useState(0)
  const [soundOn, setSoundOn] = useState(false)
  const [playing, setPlaying] = useState<number | null>(null)
  const [visible, setVisible] = useState<Set<number>>(() => new Set([0]))
  const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const pick = useCallback(() => {
    const t = track.current
    if (!t) return
    const mid = t.scrollLeft + t.clientWidth / 2
    let best = 0, gap = Infinity
    cards.current.forEach((el, i) => {
      if (!el) return
      const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - mid)
      if (d < gap) { gap = d; best = i }
    })
    setOn(best)
  }, [])

  useEffect(() => { setSoundOn(false) }, [on])

  useEffect(() => {
    videos.current.forEach((video, i) => { if (i !== on) video?.pause() })
    const activeVideo = videos.current[on]
    if (activeVideo?.paused) activeVideo.play().catch(() => setPlaying(current => current === on ? null : current))
  }, [on, visible])

  useEffect(() => {
    const root = track.current
    if (!root) return
    if (!('IntersectionObserver' in window)) {
      setVisible(new Set([on]))
      return
    }
    const observer = new IntersectionObserver(entries => {
      setVisible(previous => {
        const next = new Set(previous)
        entries.forEach(entry => {
          const index = cards.current.indexOf(entry.target as HTMLElement)
          if (index < 0) return
          if (entry.isIntersecting && entry.intersectionRatio >= 0.35) next.add(index)
          else next.delete(index)
        })
        return next
      })
    }, { root, threshold: [0, 0.35] })
    cards.current.forEach(card => card && observer.observe(card))
    return () => observer.disconnect()
  }, [reels.length])

  useEffect(() => {
    const t = track.current
    if (!t) return
    const el = cards.current[on]
    if (!el) return
    // The current item is kept centered as the layout changes between desktop and mobile.
    t.scrollTo({ left: el.offsetLeft - (t.clientWidth - el.clientWidth) / 2, behavior: 'auto' })
  }, [reels.length])

  const go = (i: number) => {
    const t = track.current
    const el = cards.current[Math.max(0, Math.min(reels.length - 1, i))]
    if (!t || !el) return
    t.scrollTo({ left: el.offsetLeft - (t.clientWidth - el.clientWidth) / 2, behavior: reduceMotion() ? 'auto' : 'smooth' })
  }
  const selectAndPlay = (i: number) => {
    const index = Math.max(0, Math.min(reels.length - 1, i))
    setOn(index)
    setSoundOn(false)
    go(index)
    videos.current[index]?.play().catch(() => setPlaying(current => current === index ? null : current))
  }
  const prev = <button type="button" className="cl-arrow l" onClick={() => go(on - 1)} disabled={on === 0} aria-label="Previous reel"><Chev d="m15 5-7 7 7 7" /></button>
  const next = <button type="button" className="cl-arrow r" onClick={() => go(on + 1)} disabled={on >= reels.length - 1} aria-label="Next reel"><Chev d="m9 5 7 7-7 7" /></button>

  return <section className="cl-reels" aria-label="Swaasa in Motion">
    <div className="cl-reels-txt"><h2>Swaasa in Motion</h2><p>Discover our latest looks, real stylings and behind-the-scenes moments.</p>
      <a className="cl-ig" href={instagram} target="_blank" rel="noopener noreferrer">Follow on Instagram <span aria-hidden="true">↗</span></a></div>
    <div className="cl-reels-stage">{prev}
      <div className="cl-track" ref={track} onScroll={() => { requestAnimationFrame(pick) }}>
        {reels.map((reel, i) => <div key={reel.video || reel.poster} ref={el => { cards.current[i] = el }} className={'cl-reel' + (i === on ? ' on' : '')}>
          <button type="button" className="cl-reel-select" aria-label={`${playing === i ? 'Playing' : 'Play'} reel ${i + 1}: ${reel.alt}`} aria-pressed={i === on} onClick={() => selectAndPlay(i)}>
            <img src={reel.poster} alt="" loading={i < 3 ? 'eager' : 'lazy'} decoding="async" />
            {reel.video && visible.has(i) && <video ref={el => { videos.current[i] = el }} key={reel.video} src={reel.video} poster={reel.poster} preload="metadata" muted={i !== on || !soundOn} loop playsInline autoPlay={i === on} aria-label={reel.alt} onPlaying={() => setPlaying(i)} onPause={() => setPlaying(current => current === i ? null : current)} />}
            {reel.video && playing !== i && <span className="cl-reel-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg></span>}
          </button>
          {reel.video && visible.has(i) && <button type="button" className="cl-sound" aria-label={soundOn && i === on ? `Mute reel ${i + 1}` : `Turn sound on for reel ${i + 1}`} aria-pressed={soundOn && i === on} onClick={() => { if (i === on) { setSoundOn(value => !value); videos.current[i]?.play().catch(() => setPlaying(current => current === i ? null : current)) } else selectAndPlay(i) }}><Speaker muted={!(soundOn && i === on)} /></button>}
        </div>)}
      </div>{next}
    </div>
    <div className="cl-dots" role="tablist" aria-label="Choose a reel">
      <span className="cl-mnav">{prev}</span>
      {reels.map((reel, i) => <button key={reel.video || reel.poster} type="button" role="tab" aria-selected={i === on} aria-label={`Reel ${i + 1} of ${reels.length}`} className={i === on ? 'on' : ''} onClick={() => go(i)} />)}
      <span className="cl-mnav">{next}</span>
    </div>
  </section>
}
