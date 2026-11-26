import { beforeEach, describe, expect, it, vi } from 'vitest'
import { missedSlots, GRACE_MINUTES, SLOT_DUE_MINUTES } from '@/lib/reminderSlots'
import { heartbeatUrl, pingHeartbeat } from '@/lib/heartbeat'

const at = (h: number, m = 0) => h * 60 + m

describe('missedSlots', () => {
  it('calls nothing missing before a reminder is due plus its grace period', () => {
    expect(missedSlots([], at(8, 5) + GRACE_MINUTES - 1)).toEqual([])
    expect(missedSlots([], at(8, 5) + GRACE_MINUTES)).toEqual(['morning'])
  })
  it('names exactly the reminders that have not succeeded by evening', () => {
    const ran = [{ slot: 'morning', outcome: 'sent' }, { slot: 'dminus1', outcome: 'nothing' }, { slot: 'noon', outcome: 'error' }]
    expect(missedSlots(ran, at(19, 0))).toEqual(['noon', 'afternoon', 'evening'])
  })
  it('counts "nothing to report" as a successful run, and ignores watchdog rows', () => {
    const ran = Object.keys(SLOT_DUE_MINUTES).map(slot => ({ slot, outcome: 'nothing' })).concat([{ slot: 'watchdog', outcome: 'error' }])
    expect(missedSlots(ran, at(23, 59))).toEqual([])
  })
})

describe('heartbeat', () => {
  it('builds the address, per reminder when {slot} is present, and refuses anything that is not https', () => {
    expect(heartbeatUrl('morning', 'https://hc-ping.com/KEY/swaasa-{slot}?create=1')).toBe('https://hc-ping.com/KEY/swaasa-morning?create=1')
    expect(heartbeatUrl('noon', 'https://example.test/ping')).toBe('https://example.test/ping')
    expect(heartbeatUrl('noon', 'http://example.test/ping')).toBeNull(); expect(heartbeatUrl('noon', '')).toBeNull(); expect(heartbeatUrl('../x', 'https://a.test/{slot}')).toBeNull()
  })
  it('never throws, and reports whether the ping landed', async () => {
    expect(await pingHeartbeat('morning', vi.fn().mockResolvedValue({ ok: true }) as any, 'https://a.test/x')).toBe(true)
    expect(await pingHeartbeat('morning', vi.fn().mockRejectedValue(new Error('down')) as any, 'https://a.test/x')).toBe(false)
    expect(await pingHeartbeat('morning', vi.fn() as any, '')).toBe(false)
  })
})

const m = vi.hoisted(() => ({ send: vi.fn(), runs: [] as any[], insert: vi.fn(), rpc: vi.fn(), selectError: null as any }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: m.send }))
vi.mock('@/lib/supabase/server', () => ({ supaAdmin: () => ({
  from: () => ({ select: () => ({ eq: async () => ({ data: m.runs, error: m.selectError }) }), insert: m.insert }),
  rpc: m.rpc,
}) }))

describe('/api/cron/watchdog', () => {
  let GET: (r: Request) => Promise<Response>
  const call = (auth?: string) => GET(new Request('https://swaasa.test/api/cron/watchdog', { headers: auth ? { authorization: auth } : {} }))
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); vi.useRealTimers()
    Object.assign(m, { runs: [], selectError: null }); m.insert.mockResolvedValue({ error: null }); m.rpc.mockResolvedValue({ data: 2, error: null })
    process.env.CRON_SECRET = 's3cret'; process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_OWNER_CHAT_ID = '1'; process.env.TELEGRAM_STAFF_CHAT_ID = '2'; delete process.env.HEARTBEAT_URL
    ;({ GET } = await import('@/app/api/cron/watchdog/route'))
  })
  const evening = () => vi.useFakeTimers({ now: new Date('2026-11-25T13:30:00Z') })     // 19:00 in India

  it('is closed without the secret', async () => {
    expect((await call()).status).toBe(401); expect((await call('Bearer nope')).status).toBe(401); delete process.env.CRON_SECRET; expect((await call('Bearer s3cret')).status).toBe(503)
    expect(m.send).not.toHaveBeenCalled()
  })
  it('stays quiet when every reminder ran', async () => {
    evening(); m.runs = ['morning', 'dminus1', 'noon', 'afternoon', 'evening'].map(slot => ({ slot, outcome: 'sent' }))
    const r = await call('Bearer s3cret'); expect(await r.json()).toMatchObject({ ok: true, missed: [], told: false }); expect(m.send).not.toHaveBeenCalled()
  })
  it('tells the OWNER, by name, which reminders never ran', async () => {
    evening(); m.runs = [{ slot: 'dminus1', outcome: 'sent' }, { slot: 'noon', outcome: 'error' }, { slot: 'afternoon', outcome: 'nothing' }, { slot: 'evening', outcome: 'sent' }]
    const body = await (await call('Bearer s3cret')).json()
    expect(body).toMatchObject({ missed: ['morning', 'noon'], told: true })
    expect(m.send).toHaveBeenCalledTimes(1); expect(m.send.mock.calls[0][0]).toBe('1'); expect(m.send.mock.calls[0][1]).toMatch(/Morning briefing[\s\S]*Midday check/)
  })
  it('does not call a reminder missing before its grace period is over', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-25T04:00:00Z') })     // 09:30 in India: the morning one is 85 minutes old
    expect((await (await call('Bearer s3cret')).json()).missed).toEqual([])
  })
  it('tidies old enquiries, writes its own log row, and reports a log it cannot read', async () => {
    evening(); m.runs = ['morning', 'dminus1', 'noon', 'afternoon', 'evening'].map(slot => ({ slot, outcome: 'sent' }))
    expect((await (await call('Bearer s3cret')).json()).tidied).toBe(2); expect(m.rpc).toHaveBeenCalledWith('leads_housekeeping'); expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ slot: 'watchdog', outcome: 'nothing' }))
    m.selectError = { message: 'relation does not exist' }; expect((await call('Bearer s3cret')).status).toBe(500)
  })
})
