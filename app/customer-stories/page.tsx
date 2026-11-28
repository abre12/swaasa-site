import type { Metadata } from 'next'
import Link from 'next/link'
import PhotoCarousel from './PhotoCarousel'
import { getCustomerStories } from '@/lib/customer-stories'
import { shareMeta } from '@/lib/site'

const title = 'Customer Stories | Swaasa Wedding Rentals'
const description = 'Read customer stories and see real celebration photos from Swaasa Wedding Rentals in Trivandrum.'
export const metadata: Metadata = { title, description, alternates: { canonical: '/customer-stories' }, ...shareMeta(title, description, '/customer-stories') }

function quoteText(text: string) {
  return text.split(/(@swaasa_rentals)/gi).map((part, index) => part.toLowerCase() === '@swaasa_rentals'
    ? <a href="https://www.instagram.com/swaasa_rentals/" target="_blank" rel="noopener noreferrer" key={`${part}-${index}`}>{part}</a>
    : part)
}

export default async function CustomerStoriesPage() {
  const stories = await getCustomerStories()
  const reviews = stories.filter(story => story.customerName.trim() && story.quote.trim())
  const photos = stories.filter(story => story.showInGallery).flatMap(story => story.photos)

  return <main className="cs-page">
    <header className="cs-nav">
      <Link className="cs-brand" href="/" aria-label="Swaasa home"><img src="/logo-mark.png" alt="" /><span><b>Swaasa</b><small>Wedding Rentals</small></span></Link>
      <nav aria-label="Customer stories navigation"><Link href="/">Home</Link><Link href="/#looks">Find your look</Link><Link className="cs-nav-cta" href="/#plan-a-visit">Plan a visit <span aria-hidden="true">↗</span></Link></nav>
    </header>
    <section className="cs-intro" aria-labelledby="cs-title">
      <p className="cs-kicker">SWAASA · TRIVANDRUM</p>
      <h1 id="cs-title">Customer <em>Stories</em></h1>
      <p>Celebration looks, kind words and moments made in Swaasa.</p>
    </section>

    {reviews.length > 0 ? <section className="cs-stories" aria-label="Customer reviews">
      {reviews.map(story => {
        const isLong = story.quote.length > 340
        return <article className="cs-story-card" key={story.id}>
          <PhotoCarousel photos={story.photos} label={`${story.customerName} photos`} />
          <div className="cs-story-copy">
            <p className="cs-kicker">CUSTOMER STORY</p>
            <h2>{story.customerName}</h2>
            <blockquote>
              {isLong ? <><p>{quoteText(`${story.quote.slice(0, 300).trimEnd()}…`)}</p><details><summary>Read the full story</summary><p>{quoteText(story.quote)}</p></details></> : <p>{quoteText(story.quote)}</p>}
            </blockquote>
          </div>
        </article>
      })}
    </section> : <p className="cs-empty">Customer stories are being added. Please check back soon.</p>}

    {photos.length > 0 && <section className="cs-gallery" aria-labelledby="cs-gallery-title">
      <div className="cs-gallery-heading"><p className="cs-kicker">MOMENTS IN SWAASA</p><h2 id="cs-gallery-title">A gallery of celebrations</h2></div>
      <div className="cs-photo-gallery" aria-label="Customer photos only">
        {photos.map((photo, index) => <figure key={`${photo.url}-gallery-${index}`}><img src={photo.url} alt={photo.alt} loading="lazy" decoding="async" /></figure>)}
      </div>
    </section>}

    <footer className="cs-footer"><Link href="/">← Back to Swaasa</Link><span>Thoughtfully chosen for your celebrations · Thiruvananthapuram, Kerala</span><Link href="/#plan-a-visit">Plan a visit ↗</Link></footer>
  </main>
}
