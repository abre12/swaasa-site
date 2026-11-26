import Link from 'next/link'
import Analytics from '@/components/Analytics'
import ReelsCarousel from '@/components/ReelsCarousel'
import CustomerBookingTracker from '@/components/CustomerBookingTracker'
import ReviewsCarousel from '@/components/ReviewsCarousel'
import ViewingRequest from '@/components/ViewingRequest'
import { INSTAGRAM_URL, REELS } from '@/lib/reels'
import { getGoogleReviews } from '@/lib/reviews'
import { guidePages } from '@/lib/seo-content'
import { HOME_DESCRIPTION, HOME_TITLE, MAPS_DIRECTIONS_URL, hoursText, jsonLdString, localBusinessGraph, shareMeta, whatsappHref } from '@/lib/site'
import type { Metadata } from 'next'

// Audit M2: canonical address, WhatsApp/Instagram/Facebook/X link preview, and (below) local-business structured data.
export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: '/' },
  ...shareMeta(HOME_TITLE, HOME_DESCRIPTION, '/'),
}

const occasions = [
  { n: '01', title: 'Bridal lehengas', note: 'For the ceremony and the moments around it' },
  { n: '02', title: 'Gowns', note: 'A graceful choice for receptions and celebrations' },
  { n: '03', title: 'Sarees', note: 'Timeless drapes for meaningful occasions' },
  { n: '04', title: 'Bridesmaid looks', note: 'Styles for the people by your side' },
  { n: '05', title: 'Other occasions', note: 'Find a look for the celebration ahead' },
]

export default async function Home() {
  const google = await getGoogleReviews()
  const phone = (process.env.STORE_PHONE || '').trim()
  const phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : ''
  const contactHref = phoneHref || INSTAGRAM_URL
  const whatsapp = whatsappHref(process.env.STORE_WHATSAPP || phone)
  const hours = hoursText()
  const contactLabel = phoneHref ? 'Call us' : 'Message us to plan a private viewing'

  return <main className="customer-home">
    {/* Always open at the top: stops the browser re-opening the page part-way down after a reload or Back.
        Skipped when the link carries a #section, so deep links such as /#visit still work. */}
    <script dangerouslySetInnerHTML={{ __html: "if(!location.hash){try{history.scrollRestoration='manual'}catch(e){}}" }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(localBusinessGraph(phone)) }} />
    <div className="ch-shell">
      <header className="ch-nav">
        <Link className="ch-brand" href="/" aria-label="Swaasa Wedding Rentals home">
          <img src="/logo-mark.png" alt="" width={200} height={196} />
          <span><b>Swaasa</b><small>Wedding Rentals</small></span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#experience">What we offer</a>
          <a href="#track-booking">Track a booking</a>
          <a className="ch-nav-cta" href="#private-viewing">Request a viewing <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      {/* The page's one <h1> (audit M1), now visible: a short introduction above the reels, so people and search engines both see what the page is. */}
      <section className="ch-intro" aria-labelledby="ch-intro-title">
        <p className="ch-kicker">PRIVATE BRIDAL WARDROBE · KARAMANA, TRIVANDRUM</p>
        <h1 id="ch-intro-title">Bridal lehengas, gowns &amp; sarees <em>to rent in Trivandrum.</em></h1>
        <p>Arrange a private viewing at our Thiruvananthapuram studio, with personal guidance and fitting support.</p>
        <div className="ch-intro-actions"><a className="ch-button" href="#private-viewing">Request a viewing <span aria-hidden="true">↗</span></a><Link href="/bridal-lehenga-rental-trivandrum">How renting works</Link></div>
      </section>

      <div className="ch-showcase">
        <ReelsCarousel reels={REELS} instagram={INSTAGRAM_URL} />
      </div>
      <CustomerBookingTracker />

      <section className="ch-offer" id="experience" aria-labelledby="ch-offer-title">
        <div className="ch-offer-head">
          <div><p className="ch-kicker">WEDDING &amp; OCCASION WEAR RENTALS</p><h2 id="ch-offer-title">Wedding looks to rent,<br /><em>for every celebration.</em></h2></div>
          <p>Explore rental looks for the bride, bridesmaids and guests across our collection of lehengas, gowns, sarees and more.</p>
        </div>

        <div className="ch-occasion-grid">{occasions.map(item => <article className="ch-occasion" key={item.n}>
          <span className="ch-occasion-n">{item.n}</span><span className="ch-occasion-mark" aria-hidden="true">✳</span>
          <h3>{item.title}</h3><p>{item.note}</p>
        </article>)}</div>

        <div className="ch-offer-support" aria-label="Rental service details">
          <div><span>01</span><b>Private studio viewings</b><p>Explore styles with personal guidance.</p></div>
          <div><span>02</span><b>Fitting and alteration support</b><p>Talk through fit before you decide.</p></div>
          <div><span>03</span><b>Flexible rental dates</b><p>Plan around your celebration.</p></div>
        </div>

        <ViewingRequest whatsapp={whatsapp} phoneHref={phoneHref || undefined} />

        <ReviewsCarousel reviews={google.reviews} rating={google.rating} total={google.total} mapsUrl={google.mapsUrl} />

        <div className="ch-offer-contact" id="visit">
          <div><p className="ch-kicker">VISIT OUR STUDIO</p><address><b>SWAASA Boutique</b><span>2nd Floor, opposite India Post</span><span>Karamana, Thiruvananthapuram, Kerala 695002</span>{hours && <span>{hours}</span>}</address></div>
          <div className="ch-offer-actions"><a className="ch-directions" href={MAPS_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a>
            {whatsapp && <a className="ch-button" href={whatsapp} target="_blank" rel="noopener noreferrer">Message us on WhatsApp<span aria-hidden="true">↗</span></a>}
            <a className="ch-button" href={contactHref} target={phoneHref ? undefined : '_blank'} rel={phoneHref ? undefined : 'noopener noreferrer'}>{contactLabel}<span aria-hidden="true">↗</span></a>
            {!phoneHref && <a className="ch-offer-social" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Message us on Instagram</a>}
          </div>
        </div>
      </section>

      <footer className="ch-footer"><Link className="ch-brand" href="/" aria-label="Swaasa home"><img src="/logo-mark.png" alt="" width={200} height={196} /><span><b>Swaasa</b><small>Wedding Rentals</small></span></Link>
        <span>{guidePages().map((g, i) => <span key={g.path}>{i > 0 && ' · '}<Link href={g.path}>{g.label}</Link></span>)}<br />Thoughtfully chosen for your celebrations · Thiruvananthapuram, Kerala</span><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
      </footer>
    </div>
    <Analytics />
  </main>
}
