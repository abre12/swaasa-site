// Cloudflare Turnstile (the bot check on the enquiry form). The browser widget gives the visitor a one-use token; the server asks Cloudflare
// whether it is genuine before saving anything. The secret key stays on the server (TURNSTILE_SECRET_KEY).
//
// Result:
//   'disabled'     no secret key is set, so the check is skipped (the database limits still apply). This keeps the form working until the keys are added.
//   'pass'         Cloudflare confirmed the token.
//   'fail'         Cloudflare said the token is missing, wrong, expired or already used: refuse the request.
//   'unavailable'  Cloudflare could not be reached or answered with an error. The request is let through (a customer is worth more than a
//                  few minutes of weaker bot protection) and the database limits still apply. The caller logs it.
export type TurnstileResult = 'disabled' | 'pass' | 'fail' | 'unavailable'

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const TURNSTILE_ACTION = 'lead'
const MAX_TOKEN = 2048     // Cloudflare's documented maximum token length

export async function verifyTurnstile(token: unknown, ip: string | null, fetcher: typeof fetch = fetch, secret = process.env.TURNSTILE_SECRET_KEY): Promise<TurnstileResult> {
  const key = (secret || '').trim()
  if (!key) return 'disabled'
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN) return 'fail'
  try {
    const res = await fetcher(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: key, response: token, ...(ip && ip !== 'unknown' ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    if (!res.ok) return 'unavailable'
    const data = await res.json() as { success?: boolean; action?: string }
    if (data.success !== true) return 'fail'
    // A token made for another form is not accepted here. Cloudflare's test keys return an empty action, which is allowed.
    if (data.action && data.action !== TURNSTILE_ACTION) return 'fail'
    return 'pass'
  } catch {
    return 'unavailable'
  }
}
