// Opening screen. The logo reveals itself with a slow gold sheen. To use a real brand film instead, upload a short
// looping video (MP4, no sound) and set NEXT_PUBLIC_HERO_VIDEO to its address; the animation then plays over it.
export default function Hero() {
  const video = process.env.NEXT_PUBLIC_HERO_VIDEO
  return (<section className="hero2">
    <style>{`.hero2{position:relative;min-height:86vh;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center;color:#f4ecdc;padding:40px 16px}
.hero2 .hv{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5}
.hero2 .hc{position:relative;z-index:1}.hero2 .lg{position:relative;width:min(300px,64vw);margin:0 auto;animation:hrise 2.4s ease-out both;overflow:hidden}.hero2 .lg img{width:100%;display:block}
.hero2 .sheen{position:absolute;inset:0;background:linear-gradient(105deg,transparent 38%,rgba(255,232,180,.5) 50%,transparent 62%);mix-blend-mode:screen;transform:translateX(-130%);animation:hsheen 5.5s ease-in-out 2.2s infinite}
.hero2 h1{font-size:clamp(34px,7vw,64px);margin:18px 0 6px;animation:hfade 2s ease-out .9s both}.hero2 p{color:#b8ab94;margin:0 0 22px;animation:hfade 2s ease-out 1.3s both}
.hero2 a.cta{display:inline-block;color:#f4ecdc;border-bottom:1px solid #f4ecdc;padding-bottom:2px;letter-spacing:.22em;font-size:12px;text-transform:uppercase;text-decoration:none;animation:hfade 2s ease-out 1.7s both}
@keyframes hrise{from{opacity:0;transform:scale(.9) translateY(20px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}@keyframes hfade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@keyframes hsheen{to{transform:translateX(130%)}}
@media (prefers-reduced-motion:reduce){.hero2 *{animation:none!important}}`}</style>
    {video && <video className="hv" src={video} autoPlay muted loop playsInline poster="/logo-full.jpg" />}
    <div className="hc"><div className="lg"><img src="/logo-full.jpg" alt="Swaasa: Breathe your fashion" /><span className="sheen" /></div>
      <h1>Bridal couture, on rent</h1><p>Gowns, lehengas and bridal sarees · Trivandrum</p><a className="cta" href="#collection">Explore the collection</a></div>
  </section>)
}
