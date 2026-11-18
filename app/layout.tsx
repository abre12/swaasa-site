import './globals.css'
import Link from 'next/link'
import type { Metadata } from 'next'
import { SITE_DESCRIPTION, SITE_NAME, shareMeta, siteUrl } from '@/lib/site'
import { fontVariables } from './fonts'
const TITLE = 'Swaasa Wedding Rentals · Breathe your fashion'
// metadataBase turns every relative link in the page tags (canonical, share image) into a full address. Audit M2: favicon, app icons and default share tags.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()), applicationName: SITE_NAME, title: TITLE, description: SITE_DESCRIPTION,
  icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] },
  ...shareMeta(TITLE, SITE_DESCRIPTION),
}
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' as const }
export default function Root({ children }: { children: React.ReactNode }) {
  return (<html lang="en" className={fontVariables}><head>{process.env.NEXT_PUBLIC_SUPABASE_URL && <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="" />}</head>
    <body><header className="top"><Link href="/" className="brand"><img src="/logo-mark.png" alt="" />SWAASA</Link>
      <nav><Link href="/collection">Collection</Link><Link href="/admin">Admin</Link></nav></header>
      {children}
      <footer>© Swaasa Wedding Rentals, Trivandrum · <a href="https://www.instagram.com/swaasa_rentals/" target="_blank" rel="noopener">Instagram</a> · {process.env.STORE_PHONE}</footer></body></html>)
}
