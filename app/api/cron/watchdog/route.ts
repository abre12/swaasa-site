import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supaAdmin } from '@/lib/supabase/server'
import { sendTelegram } from '@/lib/telegram'
import { todayIST } from '@/lib/util'
import { pingHeartbeat } from '@/lib/heartbeat'
import { report } from '@/lib/monitor'
import { missedSlots, SLOT_LABEL } from '@/lib/reminderSlots'

// The daily watchdog. The five reminders are started by GitHub Actions, which can start late or skip a run, and nothing used to tell anyone when
// the morning briefing just did not arrive. Vercel Cron (a different company's scheduler, set in vercel.json) calls this once a day in the evening.
// It reads the reminder_runs log (migration v34) and, if any of today's reminders never ran, messages the OWNER on Telegram saying which.
// It also tidies old enquiry-limiter rows and old spam enquiries (leads_housekeeping).
// Vercel's free plan allows one cron a day, at any time within that hour, which is all this needs. Vercel sends "Authorization: Bearer <CRON_SECRET>".
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
const minutesIST = () => { const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number); return (h % 24) * 60 + m }

export async function POST(req: Request) { return GET(req) }
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set on the server.' }, { status: 503 })
  if (!same(req.headers.get('authorization') || '', `Bearer ${secret}`)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 })

  const sb = supaAdmin(), today = todayIST()
  const { data, error } = await sb.from('reminder_runs').select('slot,outcome').eq('run_date', today)
  if (error) { report(new Error('watchdog: ' + error.message), { where: 'watchdog:read' }); return NextResponse.json({ error: 'Could not read the reminder log (has migration v34 been applied?).' }, { status: 500 }) }

  const missed = missedSlots(data || [], minutesIST())
  let told = false
  if (missed.length) {
    const chat = (process.env.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_STAFF_CHAT_ID || '').trim()
    const text = ['Swaasa · Reminder check', '', `These reminders did not run today (${today}):`, ...missed.map(s => `• ${SLOT_LABEL[s]}`), '',
      'To send one now: GitHub > Actions > "Telegram reminders" > Run workflow, then pick the reminder and turn Dry run off. If this keeps happening, tell your developer.'].join('\n')
    try { if (process.env.TELEGRAM_BOT_TOKEN && chat) { await sendTelegram(chat, text); told = true } } catch (e) { report(e, { where: 'watchdog:telegram' }) }
    report(new Error(`Reminders missing: ${missed.join(', ')}`), { where: 'watchdog:missed' })   // also lands in Sentry, so it is seen even if Telegram is down
  }
  let tidied: number | null = null
  try { const r = await sb.rpc('leads_housekeeping'); if (!r.error) tidied = r.data as number } catch { /* migration v33 not applied yet: nothing to tidy */ }
  try { await sb.from('reminder_runs').insert({ slot: 'watchdog', run_date: today, outcome: missed.length ? 'error' : 'nothing', error: missed.length ? ('missing: ' + missed.join(',')).slice(0, 300) : null, source: 'vercel' }) } catch { /* the log is a convenience */ }
  await pingHeartbeat('watchdog')
  return NextResponse.json({ ok: true, today, missed, told, tidied })
}
