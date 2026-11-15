import type { MetadataRoute } from 'next'
// SA-5: search engines may list the public collection and dress pages, never the sign-in, staff or API addresses.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: ['/', '/collection', '/dress/'], disallow: ['/admin', '/login', '/api/'] }] }
}
