import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ send: vi.fn() }))
// An empty shop: every table answers with no rows, so the reminder text can be checked without any data.
const table = (): any => new Proxy({}, { get: (_t, prop) => prop === 'then' ? (done: any) => done({ data: [], error: null })
  : prop === 'single' || prop === 'range' || prop === 'maybeSingle' ? async () => ({ data: prop === 'single' ? {} : [], error: null }) : () => table() })
vi.mock('@/lib/supabase/server', () => ({ supaAdmin: () => ({ from: () => table() }) }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: m.send }))
import { GET, POST } from '@/app/api/cron/digest/route'
import { GET as time } from '@/app/api/time/route'

const call = (qs: string, auth?: string, fn: any = GET) => fn(new Request(`https://swaasa.test/api/cron/digest${qs}`, { headers: auth ? { authorization: auth } : {} }))
beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = 's3cret-value'; process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_OWNER_CHAT_ID = '1'; process.env.TELEGRAM_STAFF_CHAT_ID = '2' })

describe('/api/cron/digest', () => {
  it('is closed when CRON_SECRET is not set (503) and to anyone without it (401)', async () => {
    delete process.env.CRON_SECRET; expect((await call('?slot=morning', 'Bearer x')).status).toBe(503)
    process.env.CRON_SECRET = 's3cret-value'
    expect((await call('?slot=morning')).status).toBe(401)
    expect((await call('?slot=morning', 'Bearer wrong')).status).toBe(401)
    expect((await call('?slot=morning', 's3cret-value')).status).toBe(401)
    expect(m.send).not.toHaveBeenCalled()
  })
  it('refuses an unknown slot', async () => { expect((await call('?slot=midnight', 'Bearer s3cret-value')).status).toBe(400) })
  it('a dry run returns the text and sends nothing', async () => {
    const r = await call('?slot=morning&dry=1', 'Bearer s3cret-value'); expect(r.status).toBe(200)
    expect(JSON.stringify(await r.json())).toMatch(/All clear|Swaasa/); expect(m.send).not.toHaveBeenCalled()
  })
  it('POST is the same as GET', async () => { expect((await call('?slot=morning&dry=1', 'Bearer s3cret-value', POST)).status).toBe(200) })
})

describe('/api/time', () => {
  it('gives the server clock and is never cached', async () => {
    const r = await time(); expect(r.headers.get('cache-control')).toBe('no-store')
    expect(Math.abs((await r.json()).now - Date.now())).toBeLessThan(5000)
  })
})
