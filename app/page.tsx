import Link from 'next/link'
import Analytics from '@/components/Analytics'
import CustomerBookingTracker from '@/components/CustomerBookingTracker'
import ReviewsCarousel from '@/components/ReviewsCarousel'
import ViewingRequest from '@/components/ViewingRequest'
import { INSTAGRAM_URL } from '@/lib/reels'
import { getGoogleReviews } from '@/lib/reviews'
import { guidePages } from '@/lib/seo-content'
import { HERO_IMAGE, LOOK_TILES, STUDIO_STEPS } from '@/lib/home-content'
import { HOME_DESCRIPTION, HOME_TITLE, MAPS_DIRECTIONS_URL, hoursText, jsonLdString, localBusinessGraph, shareMeta, whatsappHref } from '@/lib/site'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: '/' },
  ...shareMeta(HOME_TITLE, HOME_DESCRIPTION, '/'),
}

export default async function Home() {
  const google = await getGoogleReviews()
  const phone = (process.env.STORE_PHONE || '').trim()
  const phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : ''
  const whatsapp = whatsappHref(process.env.STORE_WHATSAPP || phone)
  const hours = hoursText()

  return <main className="customer-home">
    <script dangerouslySetInnerHTML={{ __html: "if(!location.hash){try{history.scrollRestoration='manual'}catch(e){}}" }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(localBusinessGraph(phone)) }} />
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

      <section className="rn-hero" aria-labelledby="rn-hero-title">
        <img src={HERO_IMAGE.src} alt={HERO_IMAGE.alt} width={1280} height={720} fetchPriority="high" />
        <div className="rn-hero-copy">
          <p className="ch-kicker">BRIDAL &amp; OCCASION RENTALS · KARAMANA</p>
          <h1 id="rn-hero-title">Bridal lehengas &amp; gowns <em>to rent in Trivandrum.</em></h1>
          <p>Come in, try on, fit and rent.</p>
          <div className="rn-actions">
            <a className="ch-button" href="#plan-a-visit">Plan a visit <span aria-hidden="true">↗</span></a>
            <Link className="rn-link" href="/bridal-lehenga-rental-trivandrum">How renting works</Link>
          </div>
        </div>
      </section>

      <ul className="rn-promise" aria-label="What you can expect">
        <li>Personal guidance</li>
        <li>Fitting support</li>
        <li>Flexible rental dates</li>
      </ul>

      <section className="rn-sec" id="looks" aria-labelledby="rn-looks-title">
        <div className="rn-head">
          <div><p className="ch-kicker">FOR EVERY CELEBRATION</p><h2 id="rn-looks-title">Find your <em>look</em></h2></div>
          <a href="#plan-a-visit">Let us help you choose</a>
        </div>
        <ul className="rn-tiles">
          {LOOK_TILES.map(t => <li key={t.title}>
            <a className="rn-tile" href="#plan-a-visit" aria-label={`${t.title}: plan a visit`}>
              <img src={t.img} alt={t.alt} loading="lazy" decoding="async" width={540} height={720} />
              <span className="rn-tile-go" aria-hidden="true">↗</span>
              <span className="rn-tile-t"><b>{t.title}</b><small>{t.note}</small></span>
            </a>
          </li>)}
        </ul>
        <p className="rn-caption">Lehengas, gowns, sarees and more, shown in person at our studio.</p>
      </section>

      <section className="rn-experience rn-sec" id="experience" aria-labelledby="rn-experience-title">
        <div className="rn-experience-copy">
          <p className="ch-kicker">THE SWAASA EXPERIENCE</p>
          <h2 id="rn-experience-title">A little help makes all <em>the difference.</em></h2>
          <p>Take your time, try a few looks and find what feels like you.</p>
        </div>
        <ol className="rn-steps" aria-label="What happens next">
          {STUDIO_STEPS.map((step, i) => <li key={step}><span>{i + 1}</span>{step}</li>)}
        </ol>
      </section>

      <ViewingRequest whatsapp={whatsapp} phoneHref={phoneHref || undefined} />

      {google.reviews.length > 0 && <details className="rn-reviews rn-sec">
        <summary><span><b>What customers say on Google</b><small>Read recent reviews from our visitors.</small></span><i aria-hidden="true">+</i></summary>
        <ReviewsCarousel reviews={google.reviews} rating={google.rating} total={google.total} mapsUrl={google.mapsUrl} />
      </details>}

      <details className="rn-track rn-sec" id="track-booking">
        <summary><span><b>Already booked?</b><small>Check your booking progress and dates.</small></span><i aria-hidden="true">+</i></summary>
        <CustomerBookingTracker />
      </details>

      <section className="ch-offer-contact rn-visit" id="visit" aria-label="Visit our studio">
        <div><p className="ch-kicker">COME AND SEE US</p><address><b>SWAASA Boutique</b><span>2nd Floor, opposite India Post</span><span>Karamana, Thiruvananthapuram, Kerala 695002</span>{hours && <span>{hours}</span>}</address></div>
        <div className="ch-offer-actions">
          <a className="ch-directions" href={MAPS_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a>
          {whatsapp && <a className="ch-button" href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp<span aria-hidden="true">↗</span></a>}
          {phoneHref && <a className="ch-button" href={phoneHref}>Call us<span aria-hidden="true">↗</span></a>}
        </div>
      </section>

      <footer className="ch-footer">
        <Link className="ch-brand" href="/" aria-label="Swaasa home"><img src="/logo-mark.png" alt="" width={200} height={196} /><span><b>Swaasa</b><small>Wedding Rentals</small></span></Link>
        <span>{guidePages().map((g, i) => <span key={g.path}>{i > 0 && ' · '}<Link href={g.path}>{g.label}</Link></span>)}<br />Thoughtfully chosen for your celebrations · Thiruvananthapuram, Kerala</span>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
      </footer>
    </div>

    <nav className="rn-bar" aria-label="Quick actions">
      {phoneHref && <a href={phoneHref}>Call</a>}
      {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
      <a className="rn-bar-main" href="#plan-a-visit">Plan a visit</a>
    </nav>
    <Analytics />
  </main>
}
