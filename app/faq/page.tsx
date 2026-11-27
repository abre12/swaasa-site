import type { Metadata } from 'next'
import GuidePage from '@/components/GuidePage'
import { breadcrumbSchema, faqSchema } from '@/lib/seo-content'
import { getPublicFaqs } from '@/lib/faq-data'
import { jsonLdString, shareMeta, SITE_NAME } from '@/lib/site'

const TITLE = `Wedding Rental Questions Answered | ${SITE_NAME}, Trivandrum`
const DESCRIPTION = 'Answers to the questions we hear most about renting bridal lehengas, gowns and sarees from Swaasa in Karamana, Thiruvananthapuram: visits, fitting, dates and tracking a booking.'
export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: '/faq' }, ...shareMeta(TITLE, DESCRIPTION, '/faq') }

export default async function FaqPage() {
  const faqs = await getPublicFaqs()
  return <GuidePage crumb="Questions">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([faqSchema(faqs), breadcrumbSchema('Questions', '/faq')]) }} />
    <p className="ch-kicker">GOOD TO KNOW</p>
    <h1>Questions about renting <em>from Swaasa</em></h1>
    <p className="ch-doc-lead">The things people ask us most before a first visit to our studio in Karamana, Thiruvananthapuram (Trivandrum).</p>
    {faqs.map(f => <section key={f.id}><h2>{f.q}</h2><p>{f.a}</p></section>)}
  </GuidePage>
}
