import ReelsCarousel from '@/components/ReelsCarousel'
import CustomerBookingTracker from '@/components/CustomerBookingTracker'
import { INSTAGRAM_URL, REELS } from '@/lib/reels'

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

const steps = [
  { n: '01', title: 'Tell us about your day', text: 'Share the occasion and event date so we can guide you to the right next step.' },
  { n: '02', title: 'View styles privately', text: 'Arrange a personal viewing and explore the pieces that suit your plans.' },
  { n: '03', title: 'Get ready with care', text: 'We will talk through fit, alteration support and rental dates before you decide.' },
]

export default function Home() {
  const phone = (process.env.STORE_PHONE || '').trim()
  const phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : ''
  const contactHref = phoneHref || INSTAGRAM_URL
  const contactLabel = phoneHref ? 'Call to plan a private viewing' : 'Message us to plan a private viewing'

  return <main className="customer-home">
    <div className="ch-shell">
      <header className="ch-nav">
        <a className="ch-brand" href="/" aria-label="Swaasa Wedding Rentals home">
          <img src="/logo-mark.png" alt="" />
          <span><b>Swaasa</b><small>Wedding Rentals</small></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#experience">The experience</a>
          <a className="ch-nav-cta" href="#track-booking">Track a booking <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <div className="ch-showcase">
        <ReelsCarousel reels={REELS} instagram={INSTAGRAM_URL} />
      </div>

      <section className="ch-intro" aria-labelledby="ch-title">
        <div className="ch-intro-copy">
          <p className="ch-kicker"><span /> PRIVATE WARDROBE · THIRUVANANTHAPURAM</p>
          <h1 id="ch-title">A look that feels<br /><em>like your moment.</em></h1>
          <p className="ch-lead">Bridal and occasion wear, thoughtfully chosen for the celebrations that matter to you.</p>
          <p className="ch-body">Swaasa offers a personal way to explore rental styles in Thiruvananthapuram. We keep the full wardrobe private and show pieces through a guided viewing, with support for fit and rental dates.</p>
          <div className="ch-actions">
            <a className="ch-button" href={contactHref} target={phoneHref ? undefined : '_blank'} rel={phoneHref ? undefined : 'noopener noreferrer'}>{contactLabel}<span aria-hidden="true">↗</span></a>
            <a className="ch-text-link" href="#wardrobe">Explore the experience <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className="ch-art" aria-hidden="true">
          <div className="ch-art-frame">
            <span className="ch-art-top">A PRIVATE WARDROBE</span>
            <div className="ch-art-orbit"><i /><b>S</b><i /></div>
            <span className="ch-art-bottom">FOR YOUR MOST MEANINGFUL DAYS</span>
            <span className="ch-art-number">SW · 01</span>
          </div>
        </div>
      </section>

      <div className="ch-promise" aria-label="Swaasa service highlights">
        <span><b>01</b> Private guided viewings</span>
        <span><b>02</b> Fit and alteration support</span>
        <span><b>03</b> Flexible rental dates</span>
      </div>

      <section className="ch-wardrobe" id="wardrobe" aria-labelledby="ch-wardrobe-title">
        <div className="ch-section-head">
          <div><p className="ch-kicker">MADE FOR YOUR CELEBRATION</p><h2 id="ch-wardrobe-title">A wardrobe for every way<br />you celebrate.</h2></div>
          <p>Explore the collection in person. Tell us what you are celebrating, and we will help you find a fitting place to begin.</p>
        </div>
        <div className="ch-occasion-grid">{occasions.map(item => <article className="ch-occasion" key={item.n}>
          <span className="ch-occasion-n">{item.n}</span><span className="ch-occasion-mark" aria-hidden="true">✳</span>
          <h3>{item.title}</h3><p>{item.note}</p>
        </article>)}</div>
        <p className="ch-private-note"><span aria-hidden="true">✦</span> Our detailed catalogue is shared privately during a guided viewing.</p>
      </section>

      <CustomerBookingTracker />

      <section className="ch-experience" id="experience" aria-labelledby="ch-experience-title">
        <div className="ch-experience-heading"><p className="ch-kicker">A LITTLE MORE PERSONAL</p><h2 id="ch-experience-title">Choosing your look<br /><em>should feel special.</em></h2>
          <p>From the first conversation to the fitting, we make space for you to explore at your own pace.</p>
        </div>
        <ol className="ch-steps">{steps.map(step => <li key={step.n}><span>{step.n}</span><div><h3>{step.title}</h3><p>{step.text}</p></div><b aria-hidden="true">↗</b></li>)}</ol>
      </section>

      <section className="ch-visit" id="visit" aria-labelledby="ch-visit-title">
        <div><p className="ch-kicker">YOUR MOMENT, YOUR WAY</p><h2 id="ch-visit-title">Let’s find the right<br /><em>look for your day.</em></h2></div>
        <div><p>Tell us what you are celebrating and when. We’ll help you arrange a private viewing at Swaasa.</p>
          <a className="ch-button ch-button-light" href={contactHref} target={phoneHref ? undefined : '_blank'} rel={phoneHref ? undefined : 'noopener noreferrer'}>{contactLabel}<span aria-hidden="true">↗</span></a>
          {!phoneHref && <a className="ch-visit-social" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Visit us on Instagram <span aria-hidden="true">↗</span></a>}
        </div>
      </section>

      <footer className="ch-footer"><a className="ch-brand" href="/" aria-label="Swaasa home"><img src="/logo-mark.png" alt="" /><span><b>Swaasa</b><small>Wedding Rentals</small></span></a>
        <span>Thoughtfully chosen for your celebrations · Thiruvananthapuram, Kerala</span><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
      </footer>
    </div>
  </main>
}
