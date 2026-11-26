import { NextResponse } from 'next/server'

// Receives Content-Security-Policy violation reports (the policy is in csp.js, sent report-only). Each real violation becomes ONE short line in
// the Vercel logs: which rule, which address was blocked, on which page. Reports caused by browser extensions are dropped, there is a cap per
// minute so a noisy page cannot fill the logs, and nothing about the visitor is kept.
export const dynamic = 'force-dynamic'
export const maxDuration = 5

const NOISE = /^(chrome-extension|moz-extension|safari-extension|safari-web-extension|webkit-masked-url|resource|about|chrome|edge|ms-browser-extension):/i
let windowStart = 0, count = 0
const MAX_PER_MINUTE = 60

const strip = (v: unknown) => typeof v === 'string' ? v.split(/[?#]/)[0].slice(0, 200) : ''
const first = (...v: unknown[]) => v.find(x => typeof x === 'string' && x) as string | undefined

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 16384) return new NextResponse(null, { status: 413 })
  let body: any
  try { body = JSON.parse(await request.text()) } catch { return new NextResponse(null, { status: 204 }) }
  // Two shapes exist: {"csp-report": {...}} (report-uri) and [{"type":"csp-violation","body":{...}}] (Reporting API).
  const list: any[] = Array.isArray(body) ? body.map(b => b?.body) : [body?.['csp-report']]
  const now = Date.now()
  if (now - windowStart > 60_000) { windowStart = now; count = 0 }
  for (const r of list) {
    if (!r || typeof r !== 'object') continue
    const blocked = first(r['blocked-uri'], r.blockedURL) || ''
    const source = first(r['source-file'], r.sourceFile) || ''
    if (NOISE.test(blocked) || NOISE.test(source)) continue
    if (++count > MAX_PER_MINUTE) break
    console.warn('[csp-report]', JSON.stringify({
      rule: first(r['effective-directive'], r.effectiveDirective, r['violated-directive']) || '?',
      blocked: strip(blocked) || '(inline or eval)',
      page: strip(first(r['document-uri'], r.documentURL)),
      source: strip(source),
    }))
  }
  return new NextResponse(null, { status: 204 })
}
