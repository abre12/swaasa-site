const { buildCsp } = require('./csp')

// SA-5: security headers on every page.
//  - frame-ancestors / X-Frame-Options: the site cannot be shown inside another website's page (stops click-jacking of the staff screens)
//  - nosniff, referrer, permissions: standard hardening; the camera, microphone and location are not used by the site
//  - HSTS: the browser keeps using https
//  - Content-Security-Policy-Report-Only: the full policy from csp.js, in REPORT-ONLY mode. Nothing is blocked; violations are posted to
//    /api/csp-report so the policy can be tested against every page, photo and video before it is enforced (see README-fixes-2026-11-25.md).
//    The enforced header below still carries frame-ancestors 'none', exactly as before.
const headers = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Content-Security-Policy-Report-Only', value: buildCsp() },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]
// The shop phone number is already public on the home page. Passing it to the browser build lets the public error page show it (error pages run in the browser).
const nextConfig = { poweredByHeader: false, env: { NEXT_PUBLIC_STORE_PHONE: process.env.STORE_PHONE || '' }, async headers() { return [{ source: '/:path*', headers }] } }

// Error monitoring (Sentry). Wrapping adds the /monitoring tunnel (browser reports go through this site, so ad blockers and the CSP do not get in
// the way) and, when SENTRY_AUTH_TOKEN is set in Vercel, uploads source maps so errors show real file and line numbers. If the package is not
// installed yet the site still builds, without monitoring.
let config = nextConfig
try {
  const { withSentryConfig } = require('@sentry/nextjs')
  config = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT, authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI, telemetry: false, widenClientFileUpload: true, tunnelRoute: '/monitoring',
  })
} catch (e) {
  if (e && e.code !== 'MODULE_NOT_FOUND') throw e
  console.warn('[next.config] @sentry/nextjs is not installed: building without error monitoring.')
}
module.exports = config
