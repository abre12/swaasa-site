import ReelsCarousel from '@/components/ReelsCarousel'
import CustomerBookingTracker from '@/components/CustomerBookingTracker'
import ReviewsCarousel from '@/components/ReviewsCarousel'
import { INSTAGRAM_URL, REELS } from '@/lib/reels'
import { getGoogleReviews } from '@/lib/reviews'

export const metadata = {
  title: 'Swaasa Wedding Rentals | A Private Bridal Wardrobe',
  description: 'Discover Swaasa Wedding Rentals in Thiruvananthapuram. Arrange a private viewing for bridal and occasion wear, with personal fitting support.',
}

const occasions = [
  { n: '01', title: 'Bridal lehengas', note: 'For the ceremony and the moments around it' },
  { n: '02', title: 'Gowns', note: 'A graceful choice for receptions and celebrations' },
  { n: '03', title: 'Sarees', note: 'Timeless drapes for meaningful occasions' },
  { n: '04', title: 'Bridesmaid looks', note: 'Styles for the people by your side' },
  { n: '05', title: 'Other occasions', note: 'Find a look for the celebration ahead' },
]

const MAPS_URL = 'https://www.google.com/maps/dir/?api=1&destination=2nd%20Floor%2C%20SWAASA%20Boutique%2C%20opposite%20India%20Post%2C%20Karamana%2C%20Thiruvananthapuram%2C%20Kerala%20695002'

export default async function Home() {
  const google = await getGoogleReviews()
  const phone = (process.env.STORE_PHONE || '').trim()
  const phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : ''
  const contactHref = phoneHref || INSTAGRAM_URL
  const contactLabel = phoneHref ? 'Call to plan a private viewing' : 'Message us to plan a private viewing'

  return <main className="customer-home">
    {/* Always open at the top: stops the browser re-opening the page part-way down after a reload or Back.
        Skipped when the link carries a #section, so deep links such as /#visit still work. */}
    <script dangerouslySetInnerHTML={{ __html: "if(!location.hash){try{history.scrollRestoration='manual'}catch(e){}}" }} />
    <div className="ch-shell">
      {/* The page's one <h1> (audit M1). It comes first so screen-reader and search-engine outlines start with it; the visible headings below are all <h2>/<h3>.
          Hidden visually on purpose: the design opens straight on the reels. Wording matches the page title and description. */}
      <h1 className="sr-only">Swaasa Wedding Rentals: a private bridal wardrobe in Thiruvananthapuram</h1>
      <header className="ch-nav">
        <a className="ch-brand" href="/" aria-label="Swaasa Wedding Rentals home">
          <img src="/logo-mark.png" alt="" />
          <span><b>Swaasa</b><small>Wedding Rentals</small></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#experience">What we offer</a>
          <a className="ch-nav-cta" href="#track-booking">Track a booking <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

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

        <ReviewsCarousel reviews={google.reviews} rating={google.rating} total={google.total} mapsUrl={google.mapsUrl} />

        <div className="ch-offer-contact" id="visit">
          <div><p className="ch-kicker">VISIT OUR STUDIO</p><address><b>SWAASA Boutique</b><span>2nd Floor, opposite India Post</span><span>Karamana, Thiruvananthapuram, Kerala 695002</span></address></div>
          <div className="ch-offer-actions"><a className="ch-directions" href={MAPS_URL} target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a>
            <a className="ch-button" href={contactHref} target={phoneHref ? undefined : '_blank'} rel={phoneHref ? undefined : 'noopener noreferrer'}>{contactLabel}<span aria-hidden="true">↗</span></a>
            {!phoneHref && <a className="ch-offer-social" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Message us on Instagram</a>}
          </div>
        </div>
      </section>

      <footer className="ch-footer"><a className="ch-brand" href="/" aria-label="Swaasa home"><img src="/logo-mark.png" alt="" /><span><b>Swaasa</b><small>Wedding Rentals</small></span></a>
        <span>Thoughtfully chosen for your celebrations · Thiruvananthapuram, Kerala</span><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
      </footer>
    </div>
  </main>
}
