'use client'
import { useEffect, useRef } from 'react'
// Opening screen: a framed fashion reel (muted, silent, looping), then the headline.
// To use a different film, replace public/hero.mp4 (keep it short and under ~8 MB), or set NEXT_PUBLIC_HERO_VIDEO to another video address.
export default function Hero() {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) ref.current?.pause() }, [])   // respect "reduce motion"
  const src = process.env.NEXT_PUBLIC_HERO_VIDEO || '/hero.mp4'
  return (<section className="hero2">
    <style>{`.hero2{background:#000;color:#f4ecdc;text-align:center;padding:26px 16px 44px}
.hero2 .vf{position:relative;max-width:1180px;margin:0 auto;aspect-ratio:16/9;overflow:hidden;background:#000}
.hero2 .vf video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:42% center;display:block;
-webkit-mask-image:linear-gradient(to right,transparent 0,#000 9%,#000 91%,transparent 100%),linear-gradient(to bottom,transparent 0,#000 11%,#000 89%,transparent 100%);-webkit-mask-composite:source-in;
mask-image:linear-gradient(to right,transparent 0,#000 9%,#000 91%,transparent 100%),linear-gradient(to bottom,transparent 0,#000 11%,#000 89%,transparent 100%);mask-composite:intersect}
@media(max-width:700px){.hero2 .vf{aspect-ratio:4/3}}
.hero2 h1{font-size:clamp(32px,6vw,58px);margin:26px 0 6px;animation:hfade 1.6s ease-out .3s both}.hero2 p{color:#b8ab94;margin:0 0 20px;animation:hfade 1.6s ease-out .6s both}
.hero2 a.cta{display:inline-block;color:#f4ecdc;border-bottom:1px solid #f4ecdc;padding-bottom:2px;letter-spacing:.22em;font-size:12px;text-transform:uppercase;text-decoration:none;animation:hfade 1.6s ease-out .9s both}
@keyframes hfade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.hero2 h1,.hero2 p,.hero2 a.cta{animation:none}}`}</style>
    <div className="vf"><video ref={ref} src={src} poster="/poster.jpg" autoPlay muted loop playsInline preload="auto" aria-label="Swaasa bridal fashion film" /></div>
    <h1>Bridal couture, on rent</h1><p>Gowns, lehengas and bridal sarees · Trivandrum</p><a className="cta" href="#collection">Explore the collection</a>
  </section>)
}
