// SA-5: security headers on every page.
//  - frame-ancestors / X-Frame-Options: the site cannot be shown inside another website's page (stops click-jacking of the staff screens)
//  - nosniff, referrer, permissions: standard hardening; the camera, microphone and location are not used by the site
//  - HSTS: the browser keeps using https
// A full Content-Security-Policy is deliberately not set yet: it needs testing against every page, photo and video first (see docs/RELEASE.md).
const headers = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]
// The shop phone number is already public on the home page. Passing it to the browser build lets the public error page show it (error pages run in the browser).
module.exports = { poweredByHeader: false, env: { NEXT_PUBLIC_STORE_PHONE: process.env.STORE_PHONE || '' }, async headers() { return [{ source: '/:path*', headers }] } }
