'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Reel } from '@/lib/reels'
// "Swaasa in Motion": a swipeable strip of Instagram Reels on the booking page. Arrows, dots, swipe and keyboard all work.
export default function ReelsCarousel({ reels, instagram }: { reels: Reel[]; instagram: string }) {
  const track = useRef<HTMLDivElement>(null), [on, setOn] = useState(0)
  const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const pick = useCallback(() => {
    const t = track.current; if (!t) return
    const mid = t.scrollLeft + t.clientWidth / 2; let best = 0, gap = Infinity
    Array.from(t.children).forEach((c, i) => { const el = c as HTMLElement, d = Math.abs(el.offsetLeft + el.clientWidth / 2 - mid); if (d < gap) { gap = d; best = i } })
    setOn(best)
  }, [])
  useEffect(() => { pick() }, [pick])
  const go = (i: number) => {
    const t = track.current, el = t?.children[Math.max(0, Math.min(reels.length - 1, i))] as HTMLElement | undefined; if (!t || !el) return
    t.scrollTo({ left: el.offsetLeft - (t.clientWidth - el.clientWidth) / 2, behavior: reduce() ? 'auto' : 'smooth' })
  }
  return <section className="cl-reels" aria-label="Swaasa in Motion">
    <div className="cl-reels-txt"><h2>Swaasa in Motion</h2><p>Watch our latest looks, real stylings and behind-the-scenes moments on Instagram Reels.</p>
      <a className="cl-ig" href={instagram} target="_blank" rel="noopener noreferrer">Follow on Instagram <span aria-hidden="true">↗</span></a></div>
    <div className="cl-reels-stage">
      <button type="button" className="cl-arrow l" onClick={() => go(on - 1)} disabled={on === 0} aria-label="Previous reel"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg></button>
      <div className="cl-track" ref={track} onScroll={() => requestAnimationFrame(pick)}>
        {reels.map((r, i) => <a key={r.poster} className={'cl-reel' + (i === on ? ' on' : '')} href={r.href || instagram} target="_blank" rel="noopener noreferrer" aria-label={`Watch on Instagram: ${r.alt}`}>
          <img src={r.poster} alt="" loading="lazy" decoding="async" />
          {i === on && r.video && <video src={r.video} poster={r.poster} autoPlay muted loop playsInline preload="none" aria-hidden="true" />}
          {i === on && <span className="cl-reel-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg></span>}
        </a>)}
      </div>
      <button type="button" className="cl-arrow r" onClick={() => go(on + 1)} disabled={on === reels.length - 1} aria-label="Next reel"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></button>
    </div>
    <div className="cl-dots" role="tablist" aria-label="Choose a reel">{reels.map((r, i) => <button key={r.poster} type="button" role="tab" aria-selected={i === on} aria-label={`Reel ${i + 1} of ${reels.length}`} className={i === on ? 'on' : ''} onClick={() => go(i)} />)}</div>
  </section>
}
