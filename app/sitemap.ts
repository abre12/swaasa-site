import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'
// Only the public landing page is listed (audit M2). The collection, dress pages, booking tracker, login and admin are private and are not in the sitemap;
// robots.ts blocks them too. Add a page here only when it is meant to appear in Google.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/`, changeFrequency: 'monthly', priority: 1 }]
}
