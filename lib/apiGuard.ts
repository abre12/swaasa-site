// Shared checks for the API routes that change something. One place, so every route answers the same way.
import { NextResponse } from 'next/server'

/**
 * True when a browser request really comes from this website.
 *  - An Origin header must be present-and-parseable-and-match the host, or the request is refused. The browser sends the literal text "null"
 *    for sandboxed or privacy-stripped pages; that (and anything else that is not a web address) is refused instead of crashing.
 *  - With no Origin header at all, only a request the browser marks as same-origin (Sec-Fetch-Site) or that is not from a browser at all
 *    is let through. A cross-site browser request always carries an Origin or a Sec-Fetch-Site header, so it cannot slip in by omitting both.
 * This is defence in depth on top of the SameSite cookie, not a replacement for signing in.
 */
export function sameOrigin(req: Request): boolean {
  let host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (!host) { try { host = new URL(req.url).host } catch { host = null } }
  const origin = req.headers.get('origin')
  if (origin !== null) {
    try { return !!host && new URL(origin).host === host } catch { return false }
  }
  const site = req.headers.get('sec-fetch-site')
  return site === null || site === 'same-origin' || site === 'none'
}

/** A JSON error reply. */
export const failWith = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status })

/** The request body as a plain JSON object, or null if it is missing, not JSON, or not an object (an array, a string, a number, null). */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await req.json()
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch { return null }
}
