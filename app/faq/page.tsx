import type { Metadata } from 'next'
import GuidePage from '@/components/GuidePage'
import { breadcrumbSchema, FAQ, faqSchema } from '@/lib/seo-content'
import { jsonLdString, shareMeta, SITE_NAME } from '@/lib/site'

const TITLE = `Wedding Rental Questions Answered | ${SITE_NAME}, Trivandrum`
const DESCRIPTION = 'Answers to the questions we hear most about renting bridal lehengas, gowns and sarees from Swaasa in Karamana, Thiruvananthapuram: viewings, fitting, dates and tracking a booking.'
export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: '/faq' }, ...shareMeta(TITLE, DESCRIPTION, '/faq') }

export default function FaqPage() {
  return <GuidePage crumb="Questions">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([faqSchema(), breadcrumbSchema('Questions', '/faq')]) }} />
    <p className="ch-kicker">GOOD TO KNOW</p>
    <h1>Questions about renting <em>from Swaasa</em></h1>
    <p className="ch-doc-lead">The things people ask us most before a first visit to our studio in Karamana, Thiruvananthapuram (Trivandrum).</p>
    {FAQ.map(f => <section key={f.q}><h2>{f.q}</h2><p>{f.a}</p></section>)}
  </GuidePage>
}
