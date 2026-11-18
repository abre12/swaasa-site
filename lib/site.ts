// One place for the facts search engines and link previews read about the business (audit M2).
// The sitemap, robots file, page tags and structured data all come from here so they cannot disagree.
import { INSTAGRAM_URL } from '@/lib/reels'

// The public address of the site, with no trailing slash.
//  1. SITE_URL if set (use it once a custom domain is connected, e.g. https://www.swaasa.in)
//  2. otherwise the production domain Vercel exposes, so Preview deployments still point at the real site
//  3. otherwise the current Vercel address (local development uses localhost)
export function siteUrl(): string {
  const set = (process.env.SITE_URL || '').trim().replace(/\/+$/, '')
  if (set) return /^https?:\/\//i.test(set) ? set : `https://${set}`
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim().replace(/\/+$/, '')
  if (vercel) return `https://${vercel}`
  return process.env.NODE_ENV === 'production' ? 'https://swaasa-site.vercel.app' : 'http://localhost:3000'
}

export const SITE_NAME = 'Swaasa Wedding Rentals'
export const HOME_TITLE = 'Swaasa Wedding Rentals | A Private Bridal Wardrobe'
// People search for both spellings of the city, so the description carries both. Kept under about 160 characters so Google shows it whole.
export const HOME_DESCRIPTION = 'Discover Swaasa Wedding Rentals in Thiruvananthapuram (Trivandrum). Arrange a private viewing for bridal and occasion wear, with personal fitting support.'
export const SITE_DESCRIPTION = 'Bridal and occasion wear rentals in Thiruvananthapuram (Trivandrum), Kerala.'

// Link-preview picture for WhatsApp, Instagram, Facebook, X and Google. 1200x630 is the size they all handle well.
export const OG_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630, alt: 'Swaasa: Breathe your fashion' }

// Open Graph (WhatsApp, Facebook, Instagram, LinkedIn) and Twitter/X card tags. A page that sets its own openGraph replaces the layout's whole
// object rather than merging, so every page that needs them calls this for the complete set.
export function shareMeta(title: string, description: string, path?: string) {
  return {
    openGraph: { type: 'website' as const, siteName: SITE_NAME, locale: 'en_IN', ...(path ? { url: path } : {}), title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image' as const, title, description, images: [OG_IMAGE.url] },
  }
}

export const ADDRESS = {
  streetAddress: '2nd Floor, SWAASA Boutique, opposite India Post, Karamana',
  addressLocality: 'Thiruvananthapuram',
  addressRegion: 'Kerala',
  postalCode: '695002',
  addressCountry: 'IN',
}

// Map pin of the boutique, supplied by the owner. Used for the structured data and for the "Get directions" link, so a customer lands on the exact door.
export const GEO = { latitude: 8.481036937748145, longitude: 76.96942945344524 }
export const MAPS_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${GEO.latitude},${GEO.longitude}`
export const MAPS_PIN_URL = `https://www.google.com/maps/search/?api=1&query=${GEO.latitude},${GEO.longitude}`

// Opening hours and price level. Left empty until the owner confirms them: nothing is published (in the page or in Google's data) while they are empty.
//   OPENING_HOURS: one entry per block of identical days, times in 24-hour "HH:MM", e.g.
//     { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '10:00', closes: '19:00' }
//   PRICE_RANGE: the usual rupee scale, e.g. '₹₹₹'.
export type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
export type OpeningHours = { days: DayName[]; opens: string; closes: string }
export const OPENING_HOURS: OpeningHours[] = []
export const PRICE_RANGE = ''

const WEEK: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const clock = (t: string) => { const h = Number(t.slice(0, 2)), m = t.slice(3, 5); return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}` }

/** Printed form of the hours, e.g. "Mon–Sat, 10:00 am – 7:00 pm". Empty string when no hours are set. */
export function hoursText(hours: OpeningHours[] = OPENING_HOURS): string {
  return hours.map(h => {
    const idx = h.days.map(d => WEEK.indexOf(d)).filter(i => i >= 0).sort((a, b) => a - b)
    const run = idx.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
    const short = (i: number) => WEEK[i].slice(0, 3)
    const days = run ? `${short(idx[0])}–${short(idx[idx.length - 1])}` : idx.map(short).join(', ')
    return `${days}, ${clock(h.opens)} – ${clock(h.closes)}`
  }).join('; ')
}

// WhatsApp wants the number with its country code and nothing else. A bare Indian mobile number (10 digits starting 6-9) gets 91;
// landlines and anything that is not plausibly a mobile number give no link, so the page never shows a WhatsApp button that cannot work.
export function whatsappNumber(raw?: string | null): string | undefined {
  const d = (raw || '').replace(/\D/g, '').replace(/^0+/, '')
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`
  if (/^91[6-9]\d{9}$/.test(d)) return d
  return d.length >= 11 && d.length <= 15 ? d : undefined
}
export function whatsappHref(raw?: string | null, text = 'Hello Swaasa, I would like to arrange a private viewing.'): string | undefined {
  const n = whatsappNumber(raw)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : undefined
}

// International format for the structured data. A bare 10-digit Indian number gets +91; anything else is passed through as typed.
export function schemaPhone(raw?: string | null): string | undefined {
  const n = (raw || '').replace(/[^\d+]/g, '')
  if (!n) return undefined
  return /^\d{10}$/.test(n) ? `+91${n}` : n
}

// Structured data (schema.org) that lets Google show the business as a local listing.
// Only facts the owner has supplied are used. Opening hours and price range appear only once they are filled in above.
export function localBusinessGraph(phone?: string | null, extra: { hours?: OpeningHours[]; priceRange?: string } = {}) {
  const base = siteUrl(), telephone = schemaPhone(phone), hours = extra.hours ?? OPENING_HOURS, priceRange = extra.priceRange ?? PRICE_RANGE
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: SITE_NAME, alternateName: ['Swaasa', 'SWAASA Boutique'], inLanguage: 'en-IN', publisher: { '@id': `${base}/#business` } },
      {
        '@type': 'LocalBusiness', '@id': `${base}/#business`, url: `${base}/`,
        name: SITE_NAME, alternateName: 'SWAASA Boutique', description: HOME_DESCRIPTION, slogan: 'Breathe your fashion',
        image: `${base}${OG_IMAGE.url}`, logo: `${base}/icon-512.png`,
        ...(telephone ? { telephone } : {}),
        address: { '@type': 'PostalAddress', ...ADDRESS },
        geo: { '@type': 'GeoCoordinates', ...GEO }, hasMap: MAPS_PIN_URL,
        ...(hours.length ? { openingHoursSpecification: hours.map(h => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days, opens: h.opens, closes: h.closes })) } : {}),
        ...(priceRange ? { priceRange } : {}),
        areaServed: { '@type': 'City', name: 'Thiruvananthapuram', alternateName: 'Trivandrum' },
        sameAs: [INSTAGRAM_URL],
      },
    ],
  }
}

// JSON for a <script type="application/ld+json"> tag. "<" is escaped so no text can ever close the script tag early.
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c')
