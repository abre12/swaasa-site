import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ user: null as any, rpc: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ supaServer: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) }, rpc: m.rpc }) }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: m.send }))
import { POST } from '@/app/api/close-day/route'

const call = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request('https://swaasa.test/api/close-day', { method: 'POST', body, headers: { host: 'swaasa.test', origin: 'https://swaasa.test', ...headers } }) as any)
const row = { day: '2026-11-24', closed_by_name: 'Sruthi', cash_tallied: true, cash_difference: 0, tomorrow_deliveries: 2, tomorrow_not_ready: 0, tomorrow_checked: true, overdue_returns: 0, overdue_called: 0, note: '' }

beforeEach(() => { vi.clearAllMocks(); m.user = { id: 'u1' }; m.rpc.mockResolvedValue({ data: row, error: null }); m.send.mockResolvedValue(undefined); delete process.env.TELEGRAM_OWNER_CHAT_ID; delete process.env.TELEGRAM_BOT_TOKEN })

describe('/api/close-day', () => {
  it('refuses another website, including a "null" origin, with 403', async () => {
    expect((await call('{}', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('{}', { origin: 'null' })).status).toBe(403)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('needs a signed-in person', async () => { m.user = null; expect((await call('{"day":"2026-11-24"}')).status).toBe(401) })
  it('answers 400 for a body that is not a JSON object', async () => {
    for (const b of ['{', '', '[]', 'null', '"x"']) expect((await call(b)).status, b).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('passes tidy numbers to the database and reports the saved row', async () => {
    const r = await call(JSON.stringify({ day: '2026-11-24', notReady: -3, called: '2.4', checked: 1, note: 'ok' })); expect(r.status).toBe(200)
    expect(m.rpc).toHaveBeenCalledWith('close_day', expect.objectContaining({ p_day: '2026-11-24', p_tomorrow_not_ready: 0, p_overdue_called: 2, p_tomorrow_checked: true }))
    expect(await r.json()).toMatchObject({ ok: true, sent: false })
  })
  it('tells the owner on Telegram when it is set up, and still saves if Telegram fails', async () => {
    process.env.TELEGRAM_OWNER_CHAT_ID = '1'; process.env.TELEGRAM_BOT_TOKEN = 't'
    expect((await (await call('{"day":"2026-11-24"}')).json()).sent).toBe(true)
    m.send.mockRejectedValue(new Error('down')); const r = await call('{"day":"2026-11-24"}'); expect(r.status).toBe(200); expect((await r.json()).sent).toBe(false)
  })
  it('maps a database refusal to 403 or 400', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } }); expect((await call('{"day":"x"}')).status).toBe(403)
    m.rpc.mockResolvedValue({ data: null, error: { message: 'BAD_DAY' } }); expect((await call('{"day":"x"}')).status).toBe(400)
  })
})
