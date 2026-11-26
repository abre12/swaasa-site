import Link from 'next/link'
import type { Metadata } from 'next'
import GuidePage from '@/components/GuidePage'
import { breadcrumbSchema, hasPricing } from '@/lib/seo-content'
import { ADDRESS, hoursText, jsonLdString, MAPS_DIRECTIONS_URL, shareMeta, SITE_NAME } from '@/lib/site'

const TITLE = `Bridal Lehenga Rental in Trivandrum | ${SITE_NAME}`
const DESCRIPTION = 'Rent a bridal lehenga in Trivandrum (Thiruvananthapuram). Private viewings, fitting and alteration support and flexible dates at Swaasa, Karamana.'
const PATH = '/bridal-lehenga-rental-trivandrum'
export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: PATH }, ...shareMeta(TITLE, DESCRIPTION, PATH) }

export default function BridalLehengaRentalPage() {
  const hours = hoursText()
  return <GuidePage crumb="Bridal lehenga rental in Trivandrum">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbSchema('Bridal lehenga rental in Trivandrum', PATH)) }} />
    <p className="ch-kicker">BRIDAL LEHENGA RENTAL</p>
    <h1>Bridal lehenga rental in <em>Trivandrum</em></h1>
    <p className="ch-doc-lead">Swaasa is a private bridal wardrobe in Karamana, Thiruvananthapuram. Come in, try bridal lehengas with someone who helps you with fit, and rent the one that feels like yours for the days you need it.</p>

    <h2>Why rent a bridal lehenga</h2>
    <p>A bridal lehenga is worn for a few hours and kept for years. Renting lets you choose the look you love for the day without buying something you will not wear again, and you can plan a second look, such as a reception gown or a saree, in the same visit.</p>

    <h2>How renting with Swaasa works</h2>
    <ol>
      <li><b>Ask for a private viewing.</b> Use the form on our home page, or call or message us on WhatsApp. Tell us your event date and what you have in mind.</li>
      <li><b>We call you.</b> We talk through what you are looking for and fix a day that suits you and your family.</li>
      <li><b>Try a few looks.</b> We keep some ready for your visit, so you are not searching alone.</li>
      <li><b>Fit and alterations.</b> We offer fitting and alteration support, so you can talk through the fit before you decide.</li>
      <li><b>Choose your dates.</b> Rental dates are flexible, so you can plan around your celebration.</li>
    </ol>

    <h2>More than lehengas</h2>
    <p>The same studio visit covers gowns for receptions and celebrations, sarees for meaningful occasions, styles for bridesmaids, and looks for other celebrations. Bring the people who will be standing beside you.</p>
    {hasPricing() && <p>See our <Link href="/pricing">rental price guide</Link> for what to expect.</p>}

    <h2>Visit our studio in Karamana</h2>
    <p>{ADDRESS.streetAddress}, {ADDRESS.addressLocality}, {ADDRESS.addressRegion} {ADDRESS.postalCode}. <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">Get directions in Google Maps</a>.{hours ? ` Open ${hours}.` : ''}</p>
    <p>Questions first? Read <Link href="/faq">our answers to the most common questions</Link>.</p>
  </GuidePage>
}
