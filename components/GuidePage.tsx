import Link from 'next/link'
import type { ReactNode } from 'react'
import Analytics from '@/components/Analytics'
import { guidePages } from '@/lib/seo-content'
import { INSTAGRAM_URL } from '@/lib/reels'
import { MAPS_DIRECTIONS_URL } from '@/lib/site'

// The frame shared by the public guide pages: the same top bar and footer as the home page, a plain readable column in between, and one clear next step.
export default function GuidePage({ crumb, children }: { crumb: string; children: ReactNode }) {
  const phone = (process.env.STORE_PHONE || '').trim(), phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : ''
  return <main className="customer-home">
    <div className="ch-shell">
      <header className="ch-nav">
        <Link className="ch-brand" href="/" aria-label="Swaasa Wedding Rentals home"><img src="/logo-mark.png" alt="" width={200} height={196} /><span><b>Swaasa</b><small>Wedding Rentals</small></span></Link>
        <nav aria-label="Main navigation"><Link href="/">Home</Link><Link className="ch-nav-cta" href="/#private-viewing">Request a viewing <span aria-hidden="true">↗</span></Link></nav>
      </header>
      <nav className="ch-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true"> / </span><span aria-current="page">{crumb}</span></nav>
      <article className="ch-doc">{children}</article>
      <aside className="ch-doc-cta" aria-label="Next step">
        <h2>See the looks in person</h2>
        <p>Ask for a private viewing and we will call you to fix a time that suits you and your family.</p>
        <div><Link className="ch-button" href="/#private-viewing">Request a viewing <span aria-hidden="true">↗</span></Link>{phoneHref && <a className="ch-directions" href={phoneHref}>Call us</a>}<a className="ch-directions" href={MAPS_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a></div>
      </aside>
      <footer className="ch-footer"><Link className="ch-brand" href="/" aria-label="Swaasa home"><img src="/logo-mark.png" alt="" width={200} height={196} /><span><b>Swaasa</b><small>Wedding Rentals</small></span></Link>
        <span>{guidePages().map((g, i) => <span key={g.path}>{i > 0 && ' · '}<Link href={g.path}>{g.label}</Link></span>)}</span><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
      </footer>
    </div>
    <Analytics />
  </main>
}
