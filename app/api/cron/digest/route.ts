import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supaAdmin } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/fetchAll'
import { computeAlerts } from '@/lib/alerts'
import { bookingReadiness } from '@/lib/readiness'
import { addD, dmy, todayIST } from '@/lib/util'

// Scheduled reminders. GitHub Actions (.github/workflows/reminders.yml) calls this at set times; it reads the live records with the
// server key, applies the SAME alert and readiness rules as the app (lib/alerts.ts, lib/readiness.ts) and posts a message to Telegram,
// so the team is told even when nobody has the app open. There is no browser login here: the caller must send CRON_SECRET.
//   GET /api/cron/digest?slot=morning|dminus1|noon|afternoon|evening      add &dry=1 to see the text without sending it
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SLOTS = ['morning', 'dminus1', 'noon', 'afternoon', 'evening'] as const
type Slot = typeof SLOTS[number]
const AUDIENCE: Record<Slot, 'both' | 'owner'> = { morning: 'both', dminus1: 'both', noon: 'owner', afternoon: 'both', evening: 'both' }
const OPEN = ['pending', 'confirmed']
const money = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN')
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
const hourIST = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })) % 24

async function send(chat: string, text: string) {
  const parts: string[] = []; let cur = ''
  for (const ln of text.split('\n')) { if ((cur + '\n' + ln).length > 3800) { parts.push(cur); cur = ln } else cur = cur ? cur + '\n' + ln : ln }
  if (cur) parts.push(cur)
  for (const p of parts) {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: p, disable_web_page_preview: true }) })
    if (!r.ok) throw new Error(`Telegram said ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
}

export async function POST(req: Request) { return GET(req) }
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set on the server.' }, { status: 503 })
  if (!same(req.headers.get('authorization') || '', `Bearer ${secret}`)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 })
  const url = new URL(req.url), slot = url.searchParams.get('slot') as Slot, dry = url.searchParams.get('dry') === '1'
  if (!SLOTS.includes(slot)) return NextResponse.json({ error: `slot must be one of ${SLOTS.join(', ')}` }, { status: 400 })

  const sb = supaAdmin()
  const [bk, ds, aj, cr, dc, se] = await Promise.all([
    fetchAll(() => sb.from('booking_view').select('*').in('status', ['pending', 'confirmed', 'out']).order('start_date').order('id')),
    fetchAll(() => sb.from('dresses').select('id,code,name,status,location').order('id')),
    fetchAll(() => sb.from('alteration_jobs').select('*').in('status', ['pending_dispatch', 'at_unit', 'quality_check']).order('id')),
    fetchAll(() => sb.from('dry_clean_requests').select('*').in('status', ['to_be_sent', 'sent', 'returned_pending_check']).order('id')),
    fetchAll(() => sb.from('dry_cleanings').select('*').is('returned_on', null).order('id')),
    sb.from('settings').select('*').single(),
  ])
  const bad = [bk, ds, aj, cr, dc, se].find((r: any) => r.error)
  if (bad) return NextResponse.json({ error: 'Could not read the data: ' + (bad as any).error.message }, { status: 500 })
  const B: any[] = bk.data || [], D: any[] = ds.data || [], AJ: any[] = aj.data || [], CR: any[] = cr.data || [], DC: any[] = dc.data || [], st = se.data
  const dmap = Object.fromEntries(D.map(d => [d.id, d])), today = todayIST(), tmr = addD(today, 1), hour = hourIST()
  const rctx = { B, D, AJ, CR, DC, dmap }
  const live = B.filter(b => b.status !== 'cancelled')
  const delToday = live.filter(b => OPEN.includes(b.status) && b.start_date === today), delTmr = live.filter(b => OPEN.includes(b.status) && b.start_date === tmr)
  const missed = live.filter(b => OPEN.includes(b.status) && b.start_date < today)
  const retToday = live.filter(b => b.status === 'out' && b.end_date === today), retTmr = live.filter(b => b.status === 'out' && b.end_date === tmr), overdue = live.filter(b => b.status === 'out' && b.end_date < today)
  const { alerts, summary } = computeAlerts({ B, D, AJ, CR, DC, st }, today, hour)
  const urgent = alerts.filter(a => a.level === 'risk' || a.level === 'critical')

  const name = (b: any) => `${b.dress_code || ''} ${b.dress_name || ''}`.trim()
  const who = (b: any) => `${b.customer_name || ''}${b.phone ? ' · ' + b.phone : ''}`
  const how = (b: any) => [b.delivery_slot || 'no time slot', b.delivery_assignee || null, b.delivery_mode === 'courier' ? 'we deliver' + (b.delivery_address ? ': ' + b.delivery_address : '') : 'customer collects'].filter(Boolean).join(' · ')
  const due = (b: any) => Math.max(0, (b.rent || 0) + (b.charges || 0) - (b.paid || 0))
  const delivery = (b: any) => { const rd = bookingReadiness(rctx, b); return [`• ${name(b)}`, `  ${who(b)}`, `  ${how(b)}`, `  ${rd.ready ? 'Ready' : 'NOT READY: ' + rd.reasons.map(r => r.label).join('; ')}${b.packed_at ? ' · packed' : rd.ready ? ' · not packed yet' : ''}${due(b) > 0 ? ' · balance ' + money(due(b)) : ''}`].join('\n') }
  const ret = (b: any) => `• ${name(b)}\n  ${who(b)}\n  ${b.end_date < today ? 'overdue since ' + dmy(b.end_date) : 'due ' + dmy(b.end_date)}`
  const block = (title: string, rows: string[], cap = 12) => rows.length ? `${title} (${rows.length})\n${rows.slice(0, cap).join('\n')}${rows.length > cap ? `\n…and ${rows.length - cap} more. Open the app.` : ''}` : ''
  const alertLine = (a: any) => `• ${a.tag}\n  ${a.dress}\n  ${a.body}`
  const head = `Swaasa · ${new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}`
  const parts: string[] = []

  if (slot === 'morning') {
    parts.push(block('DELIVERIES TODAY', delToday.sort((a, b) => (a.delivery_slot || '~').localeCompare(b.delivery_slot || '~')).map(delivery)), block('MISSED DELIVERIES (not recorded)', missed.map(b => `• ${name(b)} · ${who(b)} · was due ${dmy(b.start_date)}`)),
      block('RETURNS DUE TODAY', retToday.map(ret)), block('OVERDUE RETURNS', overdue.map(ret)), block('NEEDS ATTENTION FIRST', urgent.map(alertLine), 8))
    if (!parts.some(Boolean)) parts.push('No deliveries or returns today and nothing urgent. All clear.')
  } else if (slot === 'dminus1') {
    const notReady = delTmr.filter(b => { const rd = bookingReadiness(rctx, b); return !rd.ready || !b.packed_at })
    const early = alerts.filter(a => /^(chk|altsoon|altover|prep)/.test(a.key))
    parts.push(block('TOMORROW: NOT READY OR NOT PACKED', notReady.map(delivery)), block('STEPS RUNNING LATE', [...urgent, ...early.filter(a => !urgent.includes(a))].map(alertLine), 10))
  } else if (slot === 'noon') {
    parts.push(block('TODAY: STILL NOT READY', delToday.filter(b => !bookingReadiness(rctx, b).ready).map(delivery)))
  } else if (slot === 'afternoon') {
    parts.push(block('NOT YET DELIVERED TODAY', delToday.map(delivery)), block('MISSED DELIVERIES', missed.map(b => `• ${name(b)} · ${who(b)} · was due ${dmy(b.start_date)}`)))
  } else {
    if (delTmr.length || retTmr.length) {
      const packed = delTmr.filter(b => b.packed_at).length
      parts.push(`TOMORROW (${dmy(tmr)})\n• ${delTmr.length} deliver${delTmr.length === 1 ? 'y' : 'ies'}${summary ? `: ${summary.ready} ready, ${summary.alteration} waiting on alteration, ${summary.prep} on cleaning or repair, ${summary.notBack} dress not back yet` : ''}\n• ${packed} of ${delTmr.length} packed and checked\n• ${retTmr.length} return${retTmr.length === 1 ? '' : 's'} due`)
      parts.push(block('NOT READY FOR TOMORROW', delTmr.filter(b => !bookingReadiness(rctx, b).ready).map(delivery)), block('STILL TO PACK', delTmr.filter(b => bookingReadiness(rctx, b).ready && !b.packed_at).map(b => `• ${name(b)} · ${who(b)}`)))
    }
    parts.push(block('OVERDUE RETURNS (call the customer)', overdue.map(ret)))
  }
  const body = parts.filter(Boolean).join('\n\n')
  if (!body) return NextResponse.json({ ok: true, slot, sent: 0, note: 'Nothing to report, nothing sent.' })
  const text = `${head} · ${({ morning: 'Morning briefing', dminus1: 'Tomorrow check', noon: 'Midday check', afternoon: '4 PM check', evening: 'Evening summary' } as Record<Slot, string>)[slot]}\n\n${body}`
  if (dry) return NextResponse.json({ ok: true, slot, dry: true, text })

  if (!process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set on the server.' }, { status: 503 })
  const owner = process.env.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_STAFF_CHAT_ID, staff = process.env.TELEGRAM_STAFF_CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID
  const to = [...new Set(AUDIENCE[slot] === 'owner' ? [owner] : [owner, staff])].filter(Boolean) as string[]
  if (!to.length) return NextResponse.json({ error: 'Set TELEGRAM_OWNER_CHAT_ID and/or TELEGRAM_STAFF_CHAT_ID.' }, { status: 503 })
  try { for (const c of to) await send(c, text) } catch (e: any) { return NextResponse.json({ error: String(e?.message || e) }, { status: 502 }) }
  return NextResponse.json({ ok: true, slot, sent: to.length })
}
