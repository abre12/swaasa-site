// The words on the guide pages (/faq, /bridal-lehenga-rental-trivandrum, /pricing). Only things the site already says about itself are used here.
// Nothing that needs the owner's confirmation (prices, deposit, opening hours, delivery) is written in: add it below and it appears on the pages.
import { siteUrl } from '@/lib/site'

export type Faq = { q: string; a: string }

export const FAQ: Faq[] = [
  { q: 'Where is Swaasa Wedding Rentals?', a: 'We are at SWAASA Boutique, 2nd Floor, opposite India Post, Karamana, Thiruvananthapuram (Trivandrum), Kerala 695002. The home page has a Get directions link that opens the exact door in Google Maps.' },
  { q: 'What can I rent?', a: 'Bridal lehengas, gowns and sarees, styles for bridesmaids, and looks for other celebrations. Our collection is shown in person, at a private viewing.' },
  { q: 'Can I see the outfits before I decide?', a: 'Yes. We arrange private studio viewings with personal guidance. Ask for a viewing on our home page and we will call you to fix a time, or call or message us on WhatsApp. We keep some looks ready for your visit.' },
  { q: 'Do you help with fitting and alterations?', a: 'Yes. We offer fitting and alteration support, so you can talk through the fit before you decide.' },
  { q: 'Can I choose my own rental dates?', a: 'Rental dates are flexible, so you can plan around your celebration. Tell us your event date when you ask for a viewing and we will take it from there.' },
  { q: 'I have already booked. How do I check my booking?', a: 'Use Track a booking on the home page. Enter your booking ID and the mobile number you shared with us, and you will see the latest status and key dates for that booking.' },
  { q: 'Is my phone number safe with you?', a: 'We use your number only to arrange your visit or call. The tracking page shows only the progress and dates for the booking that matches both your booking ID and your number.' },
]

// ---- Add these when you are ready; each switches on the matching part of the site. ----
// Prices. When this list has at least one row, the /pricing page appears (and is added to the sitemap and the menu). Example row:
//   { look: 'Bridal lehengas', from: 'From ₹8,000', note: 'Rent for the event day. Price depends on the design.' }
// Use only prices you are happy to publish.
export type PriceRow = { look: string; from: string; note?: string }
export const PRICE_GUIDE: PriceRow[] = []
// Short plain sentences shown under the price table, for example how the refundable deposit works and what is included. Leave empty for none.
export const PRICING_NOTES: string[] = []

export const hasPricing = () => PRICE_GUIDE.length > 0

/** The guide pages that exist right now, for the sitemap and the footer links. */
export function guidePages(): { path: string; label: string; priority: number }[] {
  return [
    { path: '/bridal-lehenga-rental-trivandrum', label: 'Bridal lehenga rental in Trivandrum', priority: 0.9 },
    ...(hasPricing() ? [{ path: '/pricing', label: 'Rental prices', priority: 0.8 }] : []),
    { path: '/faq', label: 'Rental questions answered', priority: 0.7 },
  ]
}

export function faqSchema(items: Faq[] = FAQ) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
}
export function breadcrumbSchema(name: string, path: string) {
  const base = siteUrl()
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Swaasa Wedding Rentals', item: `${base}/` },
    { '@type': 'ListItem', position: 2, name, item: `${base}${path}` },
  ] }
}
