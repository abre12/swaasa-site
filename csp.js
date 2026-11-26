// Content-Security-Policy for the site, built from what the pages actually load. It is sent REPORT-ONLY first (next.config.js): the browser
// does not block anything, it just posts a short report to /api/csp-report for each thing the policy would have blocked. After a few weeks
// with no reports for things you care about, switch the header name to "Content-Security-Policy" (the steps are in README-fixes-2026-11-25.md).
//
// What is allowed, and why
//   scripts   this site; Cloudflare Turnstile (the enquiry form's bot check); 'unsafe-inline' because Next.js writes small inline scripts into
//             every page. Removing it needs a per-request nonce, which makes every page render on demand: a deliberate second step, not this one.
//   styles    this site and inline styles (the pages use many).
//   images    this site, data: and blob: (photo previews), the Supabase project (dress photos come through /api/media, but older links and the
//             public reel posters can still point at Supabase), and Google's picture hosts for reviewer photos.
//   media     this site, blob:, the Supabase project (reel videos), and the host of NEXT_PUBLIC_REELS_VIDEO_BASE_URL / NEXT_PUBLIC_HERO_VIDEO if set.
//   connect   this site, the Supabase project (REST, storage and realtime websocket), Cloudflare Turnstile. Sentry goes through the /monitoring tunnel.
//   frames    only Cloudflare's challenge frame. frame-ancestors 'none' keeps the site from being framed (that part is also enforced already).
const origin = v => { try { return v ? new URL(v).origin : '' } catch { return '' } }

function buildCsp(env = process.env) {
  const supabase = origin(env.NEXT_PUBLIC_SUPABASE_URL)
  const supabaseWs = supabase ? supabase.replace(/^http/, 'ws') : ''
  const extraMedia = [origin(env.NEXT_PUBLIC_REELS_VIDEO_BASE_URL), origin(env.NEXT_PUBLIC_HERO_VIDEO)].filter(Boolean)
  const uniq = list => [...new Set(list.filter(Boolean))]
  const d = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': uniq(["'self'", 'data:', 'blob:', supabase, 'https://*.googleusercontent.com']),
    'media-src': uniq(["'self'", 'blob:', supabase, ...extraMedia]),
    'font-src': ["'self'", 'data:'],
    'connect-src': uniq(["'self'", supabase, supabaseWs, 'https://challenges.cloudflare.com']),
    'frame-src': ['https://challenges.cloudflare.com'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(d).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ') + '; report-uri /api/csp-report'
}

module.exports = { buildCsp }
