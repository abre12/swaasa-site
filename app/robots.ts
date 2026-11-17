import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'
// The landing page is public; inventory, dress pages, staff tools and APIs are private.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: ['/'], disallow: ['/collection', '/dress/', '/admin', '/booking', '/login', '/api/'] }], sitemap: `${siteUrl()}/sitemap.xml` }
}
