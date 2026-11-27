import Link from 'next/link'
import Analytics from '@/components/Analytics'
import ReelsCarousel from '@/components/ReelsCarousel'
import CustomerBookingTracker from '@/components/CustomerBookingTracker'
import ReviewsCarousel from '@/components/ReviewsCarousel'
import ViewingRequest from '@/components/ViewingRequest'
import { INSTAGRAM_URL, REELS } from '@/lib/reels'
import { getGoogleReviews } from '@/lib/reviews'
import { faqSchema, guidePages } from '@/lib/seo-content'
import { getPublicFaqs } from '@/lib/faq-data'
import { HERO_IMAGE, STUDIO_IMAGE, STUDIO_STEPS } from '@/lib/home-content'
import { getHomepageLookTiles } from '@/lib/category-data'
import { HOME_DESCRIPTION, HOME_TITLE, MAPS_DIRECTIONS_URL, hoursText, jsonLdString, localBusinessGraph, shareMeta, whatsappHref } from '@/lib/site'
import type { Metadata } from 'next'

function lookTileTone(title: string, index: number) {
  const name = title.toLowerCase()
  if (name.includes('bridal')) return 'bridal'
  if (name.includes('reception')) return 'reception'
  if (name.includes('sangeet') || name.includes('mehendi') || name.includes('mehndi')) return 'celebration'
  if (name.includes('bridesmaid')) return 'bridesmaids'
  if (name.includes('occasion') || name.includes('saree')) return 'occasion'
  return ['bridal', 'reception', 'celebration', 'bridesmaids', 'occasion'][index % 5]
}

// Audit M2: canonical address, WhatsApp/Instagram/Facebook/X link preview, and (below) local-business structured data.
export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: '/' },
  ...shareMeta(HOME_TITLE, HOME_DESCRIPTION, '/'),
}

export default async function Home() {
  const [google, faqs, lookTiles] = await Promise.all([getGoogleReviews(), getPublicFaqs(), getHomepageLookTiles()])
  const phone = (process.env.STORE_PHONE || '').trim()
  const phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : ''
  const contactHref = phoneHref || INSTAGRAM_URL
  const whatsapp = whatsappHref(process.env.STORE_WHATSAPP || phone)
  const hours = hoursText()
  const contactLabel = phoneHref ? 'Call us' : 'Message us to plan a visit'

  return <main className="customer-home">
    {/* Always open at the top: stops the browser re-opening the page part-way down after a reload or Back.
        Skipped when the link carries a #section, so deep links such as /#visit still work. */}
    <script dangerouslySetInnerHTML={{ __html: "if(!location.hash){try{history.scrollRestoration='manual'}catch(e){}}" }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([localBusinessGraph(phone), faqSchema(faqs)]) }} />
    {hours && <p className="rn-announce"><b>Visit us</b><i aria-hidden="true">·</i>{hours}<span className="rn-announce-more"><i aria-hidden="true">·</i>Karamana, Trivandrum</span></p>}
    <div className="ch-shell">
      <header className="ch-nav">
        <Link className="ch-brand" href="/" aria-label="Swaasa Wedding Rentals home">
          <img src="/logo-mark.png" alt="" width={200} height={196} />
          <span><b>Swaasa</b><small>Wedding Rentals</small></span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#looks">Looks</a>
          <a href="#track-booking">Track a booking</a>
          <a className="ch-nav-cta" href="#plan-a-visit">Plan a visit <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      {/* The page's one <h1> (audit M1): the first thing anyone sees, over a photograph. Fewer words, more picture. */}
      <section className="rn-hero" aria-labelledby="rn-hero-title">
        <img src={HERO_IMAGE.src} alt={HERO_IMAGE.alt} width={1280} height={720} fetchPriority="high" />
        <div className="rn-hero-copy">
          <p className="ch-kicker">BRIDAL &amp; OCCASION RENTALS · KARAMANA</p>
          <h1 id="rn-hero-title">Bridal lehengas &amp; gowns <em>to rent in Trivandrum.</em></h1>
          <p>Come in, try on, fit and rent.</p>
          <div className="rn-actions"><a className="ch-button" href="#plan-a-visit">Plan a visit <span aria-hidden="true">↗</span></a><Link className="rn-link" href="/bridal-lehenga-rental-trivandrum">How renting works</Link></div>
        </div>
      </section>
      <ul className="rn-promise" aria-label="What you can expect"><li>Personal guidance</li><li>Fitting and alteration support</li><li>Flexible rental dates</li></ul>

      <section className="rn-sec" id="looks" aria-labelledby="rn-looks-title">
        <div className="rn-head"><h2 id="rn-looks-title">Find your <em>look</em></h2><a href="#plan-a-visit">Plan a visit</a></div>
        {lookTiles.length > 0 && <ul className="rn-tiles">{lookTiles.map((t, i) => <li key={t.id}>
          <a className="rn-tile" data-tone={lookTileTone(t.title, i)} href="#plan-a-visit" aria-label={`${t.title}: plan a visit`}>
            {t.img && <img src={t.img} alt={t.alt} loading="lazy" decoding="async" width={640} height={960} />}
            <span className="rn-tile-go" aria-hidden="true">↗</span>
            <span className="rn-tile-t"><b>{t.title}</b><small>{t.note}</small></span>
          </a>
        </li>)}</ul>}
        <p className="rn-caption">{lookTiles.length > 0 ? 'Lehengas, gowns, sarees and more, shown in person at our studio.' : 'Visit our studio to explore the collection in person.'}</p>
      </section>

      <div className="ch-showcase rn-sec">
        <ReelsCarousel reels={REELS} instagram={INSTAGRAM_URL} />
      </div>

      <section className="rn-studio rn-sec" id="experience" aria-labelledby="rn-studio-title">
        <div className="rn-studio-img"><img src={STUDIO_IMAGE.src} alt={STUDIO_IMAGE.alt} loading="lazy" decoding="async" width={540} height={960} /></div>
        <div className="rn-studio-copy">
          <p className="ch-kicker">THE STUDIO</p>
          <h2 id="rn-studio-title">Try it on, <em>in person.</em></h2>
          <p>Personal guidance, fitting support and dates that suit your celebration.</p>
          <ol className="rn-steps" aria-label="What happens next">{STUDIO_STEPS.map((t, i) => <li key={t}><span>{i + 1}</span>{t}</li>)}</ol>
          <div className="rn-actions"><a className="ch-button" href="#plan-a-visit">Plan a visit <span aria-hidden="true">↗</span></a></div>
        </div>
      </section>

      <ViewingRequest whatsapp={whatsapp} phoneHref={phoneHref || undefined} />

      <div className="rn-sec"><ReviewsCarousel reviews={google.reviews} rating={google.rating} total={google.total} mapsUrl={google.mapsUrl} /></div>

      <CustomerBookingTracker />

      <section className="ch-offer-contact rn-visit" id="visit" aria-label="Visit our studio">
        <div><p className="ch-kicker">VISIT OUR STUDIO</p><address><b>SWAASA Boutique</b><span>2nd Floor, opposite India Post</span><span>Karamana, Thiruvananthapuram, Kerala 695002</span>{hours && <span>{hours}</span>}</address></div>
        <div className="ch-offer-actions"><a className="ch-directions" href={MAPS_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a>
          {whatsapp && <a className="ch-button" href={whatsapp} target="_blank" rel="noopener noreferrer">Message us on WhatsApp<span aria-hidden="true">↗</span></a>}
          <a className="ch-button" href={contactHref} target={phoneHref ? undefined : '_blank'} rel={phoneHref ? undefined : 'noopener noreferrer'}>{contactLabel}<span aria-hidden="true">↗</span></a>
          {!phoneHref && <a className="ch-offer-social" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Message us on Instagram</a>}
        </div>
      </section>

      {faqs.length > 0 && <section className="rn-faq rn-sec" id="faqs" aria-labelledby="rn-faq-title">
        <div className="rn-faq-head">
          <div>
            <p className="ch-kicker">GOOD TO KNOW</p>
            <h2 id="rn-faq-title">Questions about renting <em>from Swaasa</em></h2>
            <p>The things people ask us most before a first visit to our studio in Karamana, Thiruvananthapuram (Trivandrum).</p>
          </div>
          <Link href="/faq">See all questions <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="rn-faq-list">
          {faqs.map(f => <details className="rn-faq-item" key={f.id}>
            <summary>{f.q}<span className="rn-faq-toggle" aria-hidden="true" /></summary>
            <div className="rn-faq-answer"><p>{f.a}</p></div>
          </details>)}
        </div>
      </section>}

      <footer className="ch-footer"><Link className="ch-brand" href="/" aria-label="Swaasa home"><img src="/logo-mark.png" alt="" width={200} height={196} /><span><b>Swaasa</b><small>Wedding Rentals</small></span></Link>
        <span>{guidePages().map((g, i) => <span key={g.path}>{i > 0 && ' · '}<Link href={g.path}>{g.label}</Link></span>)}<br />Thoughtfully chosen for your celebrations · Thiruvananthapuram, Kerala</span><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
      </footer>
    </div>

    {/* Phone only: the three things a visitor most wants to do, always within reach. */}
    <nav className="rn-bar" aria-label="Quick actions">
      {phoneHref && <a href={phoneHref}>Call</a>}
      {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
      <a className="rn-bar-main" href="#plan-a-visit">Plan a visit</a>
    </nav>
    <Analytics />
  </main>
}
