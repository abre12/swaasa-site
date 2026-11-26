import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'
import { guidePages } from '@/lib/seo-content'
// The public landing page and the public guide pages are listed (audit M2). The collection, dress pages, booking tracker, login and admin are private and are not in the sitemap;
// robots.ts blocks them too. Add a page here only when it is meant to appear in Google. /pricing appears only once prices exist (lib/seo-content.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl()}/`, changeFrequency: 'monthly', priority: 1 },
    ...guidePages().map(g => ({ url: `${siteUrl()}${g.path}`, changeFrequency: 'monthly' as const, priority: g.priority })),
  ]
}
