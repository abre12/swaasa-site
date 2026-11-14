'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Reel } from '@/lib/reels'
// "Swaasa in Motion": a strip of Instagram Reels on the booking page.
// With links (REEL_LINKS in lib/reels.ts) each card is Instagram's own player. Without links it shows the still pictures instead.
// Only the reel in view and its two neighbours load Instagram, so the page stays light.
const embedSrc = (u: string) => {
  const m = u.match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]+)/i); if (!m) return null
  const t = m[1].toLowerCase(); return `https://www.instagram.com/${t.startsWith('reel') ? 'reel' : t}/${m[2]}/embed/`
}
const Chev = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
export default function ReelsCarousel({ reels, links, instagram }: { reels: Reel[]; links: string[]; instagram: string }) {
  const embeds = links.map(embedSrc).filter((x): x is string => !!x), live = embeds.length > 0, count = live ? embeds.length : reels.length
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
    const t = track.current, el = t?.children[Math.max(0, Math.min(count - 1, i))] as HTMLElement | undefined; if (!t || !el) return
    t.scrollTo({ left: el.offsetLeft - (t.clientWidth - el.clientWidth) / 2, behavior: reduce() ? 'auto' : 'smooth' })
  }
  const prev = <button type="button" className="cl-arrow l" onClick={() => go(on - 1)} disabled={on === 0} aria-label="Previous reel"><Chev d="m15 5-7 7 7 7" /></button>
  const next = <button type="button" className="cl-arrow r" onClick={() => go(on + 1)} disabled={on >= count - 1} aria-label="Next reel"><Chev d="m9 5 7 7-7 7" /></button>
  return <section className={'cl-reels' + (live ? ' live' : '')} aria-label="Swaasa in Motion">
    <div className="cl-reels-txt"><h2>Swaasa in Motion</h2><p>Watch our latest looks, real stylings and behind-the-scenes moments on Instagram Reels.</p>
      <a className="cl-ig" href={instagram} target="_blank" rel="noopener noreferrer">Follow on Instagram <span aria-hidden="true">↗</span></a></div>
    <div className="cl-reels-stage">{prev}
      <div className="cl-track" ref={track} onScroll={() => requestAnimationFrame(pick)}>
        {live ? embeds.map((src, i) => <div key={src} className="cl-embed">
          {Math.abs(i - on) <= 1 ? <iframe src={src} title={`Instagram reel ${i + 1} of ${embeds.length}`} loading="lazy" scrolling="no" allowFullScreen allow="encrypted-media; picture-in-picture; fullscreen" />
            : <button type="button" className="cl-embed-ph" onClick={() => go(i)} aria-label={`Show reel ${i + 1}`}><span>▶</span></button>}
        </div>) : reels.map((r, i) => <a key={r.poster} className={'cl-reel' + (i === on ? ' on' : '')} href={r.href || instagram} target="_blank" rel="noopener noreferrer" aria-label={`Watch on Instagram: ${r.alt}`}>
          <img src={r.poster} alt="" loading="lazy" decoding="async" />
          {i === on && <span className="cl-reel-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg></span>}
        </a>)}
      </div>{next}
    </div>
    <div className="cl-dots" role="tablist" aria-label="Choose a reel">
      <span className="cl-mnav">{prev}</span>
      {Array.from({ length: count }, (_, i) => <button key={i} type="button" role="tab" aria-selected={i === on} aria-label={`Reel ${i + 1} of ${count}`} className={i === on ? 'on' : ''} onClick={() => go(i)} />)}
      <span className="cl-mnav">{next}</span>
    </div>
  </section>
}
