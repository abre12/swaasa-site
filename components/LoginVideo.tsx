'use client'
import { useEffect, useRef, useState } from 'react'
// Hero film behind the staff sign-in. It plays the brand reel (public/hero.mp4) from the beginning, muted and looping. To skip the opening logo card, set START to 7.5 and END to 40.5. To use another film, replace
// public/hero.mp4 (keep it short, under ~8 MB) and change START / END below to the seconds you want looped.
const START = 0, END = 42   // plays the whole film from the very beginning (the logo card first) and loops
export default function LoginVideo({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null), [playing, setPlaying] = useState(false)
  useEffect(() => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) ref.current?.pause() }, [])   // respect "reduce motion"
  const toggle = () => { const v = ref.current; if (!v) return; if (v.paused) void v.play().catch(() => {}); else v.pause() }
  return <div className={'lg-vid' + (playing ? ' is-playing' : '')}>
    <video ref={ref} src={process.env.NEXT_PUBLIC_HERO_VIDEO || '/hero.mp4'} poster="/poster.jpg" autoPlay muted playsInline preload="metadata" aria-hidden="true"
      onLoadedMetadata={e => { e.currentTarget.currentTime = START }}
      onTimeUpdate={e => { const v = e.currentTarget; if (v.currentTime >= END || v.currentTime < START - 0.5) v.currentTime = START }}
      onEnded={e => { const v = e.currentTarget; v.currentTime = START; void v.play().catch(() => {}) }}
      onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    <div className="lg-shade" aria-hidden="true" />
    {children}
    <button type="button" className="lg-play" onClick={toggle} aria-label={playing ? 'Pause the background video' : 'Play the background video'}>
      {playing ? <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1" /><rect x="13.8" y="5" width="4.2" height="14" rx="1" /></svg>
        : <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>}
    </button>
  </div>
}
