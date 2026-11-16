'use client'

import { useRef, useState } from 'react'
import type { GoogleReview } from '@/lib/reviews'

const Chev = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const Stars = () => <span className="ch-rv-stars" role="img" aria-label="5 out of 5 stars">★★★★★</span>

export default function ReviewsCarousel({ reviews, rating, total, mapsUrl }: { reviews: GoogleReview[]; rating: number | null; total: number | null; mapsUrl: string }) {
  const track = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  if (!reviews.length) return null

  const step = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(260, el.clientWidth * 0.8), behavior: 'smooth' })
  }
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return <section className="ch-reviews" aria-labelledby="ch-reviews-title">
    <div className="ch-reviews-head">
      <div>
        <p className="ch-kicker">LOVED BY OUR BRIDES</p>
        <h3 id="ch-reviews-title">What customers say <em>on Google</em></h3>
      </div>
      <div className="ch-reviews-side">
        {rating !== null && <p className="ch-reviews-score"><b>{rating.toFixed(1)}</b><Stars />{total !== null && <small>{total} Google reviews</small>}</p>}
        <div className="ch-reviews-arrows">
          <button type="button" onClick={() => step(-1)} aria-label="Previous reviews"><Chev d="m15 6-6 6 6 6" /></button>
          <button type="button" onClick={() => step(1)} aria-label="Next reviews"><Chev d="m9 6 6 6-6 6" /></button>
        </div>
      </div>
    </div>

    <ul className="ch-reviews-track" ref={track} aria-label="Google reviews" tabIndex={0}>
      {reviews.map(r => {
        const long = r.text.length > 190
        const expanded = open.has(r.id)
        return <li className="ch-review" key={r.id}>
          <Stars />
          <p className={long && !expanded ? 'ch-review-text is-clamped' : 'ch-review-text'}>{r.text}</p>
          {long && <button type="button" className="ch-review-more" onClick={() => toggle(r.id)} aria-expanded={expanded}>{expanded ? 'Show less' : 'Read more'}</button>}
          <div className="ch-review-by">
            {r.photo
              ? <img src={r.photo} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" />
              : <span className="ch-review-initial" aria-hidden="true">{r.author.charAt(0).toUpperCase()}</span>}
            <span>
              {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer"><b>{r.author}</b></a> : <b>{r.author}</b>}
              <small>{r.when ? `${r.when} · ` : ''}Google review</small>
            </span>
          </div>
        </li>
      })}
    </ul>

    <a className="ch-reviews-all" href={mapsUrl} target="_blank" rel="noopener noreferrer">See all reviews on Google <span aria-hidden="true">↗</span></a>
  </section>
}
