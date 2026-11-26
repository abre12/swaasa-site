// Takes personal details out of an error report before it leaves the server or the browser. Reports exist to say WHAT broke and WHERE, never WHO.
// Customer names and phone numbers pass through this site (enquiry form, tracker) and staff screens show payments, so nothing from a request is kept:
// no form data, no cookies, no query string, no IP address, no user, and any long digit sequence in a message is replaced.
const NUMBER = /\+?\d[\d\s().-]{6,}\d/g

type Obj = Record<string, any>
const clean = (s: unknown) => typeof s === 'string' ? s.replace(NUMBER, '[number]') : s

export function scrubEvent<T extends Obj>(event: T): T {
  const e = event as Obj
  if (e.request) {
    delete e.request.data; delete e.request.cookies; delete e.request.query_string
    if (e.request.headers) for (const h of Object.keys(e.request.headers)) if (/^(cookie|authorization|x-forwarded-for|x-real-ip|x-vercel-forwarded-for|x-vercel-ip.*)$/i.test(h)) delete e.request.headers[h]
    if (typeof e.request.url === 'string') e.request.url = e.request.url.split('?')[0].split('#')[0]
  }
  delete e.user
  if (e.message) e.message = clean(e.message)
  for (const ex of e.exception?.values || []) ex.value = clean(ex.value)
  for (const b of e.breadcrumbs || []) { if (b.message) b.message = clean(b.message); if (b.data) delete b.data.body }
  return event
}

/** Errors that are noise, not bugs: browser extensions, flaky networks and the like. */
export const IGNORED_ERRORS: (string | RegExp)[] = [
  'ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications.',
  /^Non-Error promise rejection captured/, /Failed to fetch/, /NetworkError when attempting to fetch resource/, /Load failed/, /AbortError/,
]
