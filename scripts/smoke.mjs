#!/usr/bin/env node
// Automatic smoke test for the parts of the site that need NO sign-in. Safe to run against the live site: it never creates a booking, a lead or a
// message (every write it tries is refused before anything is saved).
//
//   npm run smoke                       against http://localhost:3000 (start the site first: npm run build && npm start)
//   npm run smoke -- https://your.site  against any address (staging or live)
//
// It covers the "signed out" half of docs/SMOKE-TEST.md. The signed-in half (money, returns, approvals) still needs a person on staging.
const base = (process.argv[2] || process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
const host = new URL(base).host
const results = []
const check = async (name, fn) => {
  try { await fn(); results.push([true, name]) } catch (e) { results.push([false, name, e.message]) }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg) }
const get = (p, init = {}) => fetch(base + p, { redirect: 'manual', ...init })
const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const same = { origin: `${new URL(base).protocol}//${host}` }, evil = { origin: 'https://evil.example' }
const goesToLogin = async p => { const r = await get(p); ok([301, 302, 303, 307, 308].includes(r.status), `${p}: expected a redirect, got ${r.status}`); ok(new URL(r.headers.get('location'), base).pathname === '/login', `${p}: redirected to ${r.headers.get('location')}, not /login`) }

await check('home page loads with a heading and the booking tracker and viewing form', async () => {
  const r = await get('/'); ok(r.status === 200, `status ${r.status}`)
  const html = await r.text()
  ok(/<h1[\s>]/i.test(html), 'no <h1>'); ok(html.includes('id="track-booking"'), 'tracker missing'); ok(html.includes('id="private-viewing"'), 'viewing form missing')
})
await check('/booking loads and is kept out of search results', async () => { const r = await get('/booking'); ok(r.status === 200, `status ${r.status}`) })
await check('/login loads', async () => { const r = await get('/login'); ok(r.status === 200, `status ${r.status}`) })
await check('an unknown address never crashes (a 404 page, or the login page for a signed-out visitor)', async () => {
  const r = await get('/no-such-page-xyz'); ok(r.status === 404 || (r.status >= 300 && r.status < 400 && new URL(r.headers.get('location'), base).pathname === '/login'), `status ${r.status}`)
})
await check('robots.txt keeps the staff areas out of search and names the sitemap', async () => {
  const t = await (await get('/robots.txt')).text(); for (const p of ['/admin', '/collection', '/api/', '/account/']) ok(t.includes('Disallow: ' + p), `missing Disallow: ${p}`); ok(/Sitemap:/i.test(t), 'no Sitemap line')
})
await check('sitemap.xml is valid and lists the home page', async () => { const r = await get('/sitemap.xml'); ok(r.status === 200, `status ${r.status}`); ok((await r.text()).includes('<urlset'), 'not a sitemap') })
await check('security headers are on', async () => {
  const h = (await get('/')).headers
  ok(/frame-ancestors 'none'/.test(h.get('content-security-policy') || ''), 'frame-ancestors missing'); ok(h.get('x-frame-options') === 'DENY', 'X-Frame-Options'); ok(h.get('x-content-type-options') === 'nosniff', 'nosniff')
  ok(!!h.get('strict-transport-security'), 'HSTS'); ok(!!h.get('referrer-policy'), 'Referrer-Policy'); ok(!h.get('x-powered-by'), 'X-Powered-By is exposed')
})
for (const p of ['/admin', '/admin/performance', '/collection', '/dress/00000000-0000-0000-0000-000000000000', '/account/password']) await check(`${p} needs a login`, () => goesToLogin(p))
for (const [m, p] of [['GET', '/api/time'], ['POST', '/api/staff'], ['POST', '/api/close-day'], ['POST', '/api/account/password']]) {
  await check(`${m} ${p} refuses a signed-out caller`, async () => { const r = await fetch(base + p, { method: m, redirect: 'manual', headers: { 'content-type': 'application/json' }, body: m === 'POST' ? '{}' : undefined }); ok(r.status === 401, `status ${r.status}`) })
}
await check('the daily reminder address is closed to anyone without the secret', async () => { const r = await get('/api/cron/digest?slot=morning'); ok(r.status === 401 || r.status === 503, `status ${r.status}`) })
await check('the viewing form refuses another website and bad input (and sends nothing)', async () => {
  ok((await post('/api/viewing-request', { name: 'Test Person', phone: '9876543210' }, evil)).status === 403, 'cross-site request was not refused')
  ok((await post('/api/viewing-request', '{', same)).status === 400, 'broken JSON was not a 400')
  ok((await post('/api/viewing-request', { name: 'A', phone: '1' }, same)).status === 400, 'invalid details were not a 400')
})
await check('the booking tracker refuses another website and bad input', async () => {
  ok((await post('/api/customer-booking/track', { bookingId: 'SW1A2B3C4', phone: '9876543210' }, evil)).status === 403, 'cross-site request was not refused')
  ok((await post('/api/customer-booking/track', '{', same)).status === 400, 'broken JSON was not a 400')
  ok((await post('/api/customer-booking/track', { bookingId: 'x', phone: '1' }, same)).status === 400, 'invalid details were not a 400')
})
await check('the removed booking and try-on routes stay removed', async () => { for (const p of ['/api/book', '/api/tryon']) { const r = await post(p, {}, same); ok(r.status === 401 || r.status === 404, `${p} answered ${r.status}`) } })

const failed = results.filter(r => !r[0])
for (const [good, name, why] of results) console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : '\n        ' + why}`)
console.log(`\n${results.length - failed.length} of ${results.length} checks passed against ${base}`)
process.exit(failed.length ? 1 : 0)
