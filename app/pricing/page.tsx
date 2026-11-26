import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import GuidePage from '@/components/GuidePage'
import { breadcrumbSchema, hasPricing, PRICE_GUIDE, PRICING_NOTES } from '@/lib/seo-content'
import { jsonLdString, shareMeta, SITE_NAME } from '@/lib/site'

const TITLE = `Wedding Outfit Rental Prices in Trivandrum | ${SITE_NAME}`
const DESCRIPTION = 'A guide to what it costs to rent bridal lehengas, gowns, sarees and other wedding looks from Swaasa in Karamana, Thiruvananthapuram.'
export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: '/pricing' }, ...shareMeta(TITLE, DESCRIPTION, '/pricing') }

// This page exists only once real prices have been added to lib/seo-content.ts (PRICE_GUIDE). Until then it answers 404 and is not in the sitemap.
export default function PricingPage() {
  if (!hasPricing()) notFound()
  return <GuidePage crumb="Rental prices">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbSchema('Rental prices', '/pricing')) }} />
    <p className="ch-kicker">RENTAL PRICES</p>
    <h1>What it costs to rent <em>with Swaasa</em></h1>
    <p className="ch-doc-lead">A guide to our rental prices in Thiruvananthapuram. The exact price depends on the design and your dates, and we will confirm it before you decide.</p>
    <div className="ch-doc-table" role="region" aria-label="Rental price guide" tabIndex={0}>
      <table><thead><tr><th scope="col">Look</th><th scope="col">Price</th><th scope="col">Notes</th></tr></thead>
        <tbody>{PRICE_GUIDE.map(r => <tr key={r.look}><th scope="row">{r.look}</th><td>{r.from}</td><td>{r.note || ''}</td></tr>)}</tbody></table>
    </div>
    {PRICING_NOTES.map(n => <p key={n}>{n}</p>)}
  </GuidePage>
}
