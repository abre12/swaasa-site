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

// International format for the structured data. A bare 10-digit Indian number gets +91; anything else is passed through as typed.
export function schemaPhone(raw?: string | null): string | undefined {
  const n = (raw || '').replace(/[^\d+]/g, '')
  if (!n) return undefined
  return /^\d{10}$/.test(n) ? `+91${n}` : n
}

// Structured data (schema.org) that lets Google show the business as a local listing.
// Only facts already printed on the site are used. Opening hours and map coordinates are left out until the owner supplies them.
export function localBusinessGraph(phone?: string | null) {
  const base = siteUrl(), telephone = schemaPhone(phone)
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
        areaServed: { '@type': 'City', name: 'Thiruvananthapuram', alternateName: 'Trivandrum' },
        sameAs: [INSTAGRAM_URL],
      },
    ],
  }
}

// JSON for a <script type="application/ld+json"> tag. "<" is escaped so no text can ever close the script tag early.
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c')
