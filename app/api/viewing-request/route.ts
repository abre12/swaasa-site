import { NextResponse, type NextRequest } from 'next/server'
import { manyEnquiriesMessage, parseViewingRequest, viewingMessage } from '@/lib/viewing'
import { sendTelegram } from '@/lib/telegram'
import { sameOrigin } from '@/lib/apiGuard'
import { supaAdmin } from '@/lib/supabase/server'
import { verifyTurnstile } from '@/lib/turnstile'
import { visitorHash, visitorIp } from '@/lib/visitor'
import { report } from '@/lib/monitor'

// Public "Plan a visit / Call me back" form. It is open to everyone, so before anything is saved it:
//  - checks the form came from this website and is small
//  - drops bots that fill the hidden field (they are told it worked)
//  - checks the Cloudflare Turnstile token (when TURNSTILE_SECRET_KEY is set)
// Then ONE database call (lead_submit, migration v33) does the rest, so the limits are shared by every server instance and survive a cold start:
//  - a repeat of the same request within ten minutes returns the first one
//  - one visitor can send 4 an hour, one phone number 3 a day
//  - the enquiry is saved with status "new" BEFORE Telegram is tried, so a Telegram outage can no longer lose a customer
// There is no site-wide cap: a spammer can no longer use up the allowance and block real enquiries. Only the Telegram message is throttled
// (after 20 an hour the team gets one "many enquiries" message). Nothing about the visitor is written to the logs.
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const FALLBACK = 'Please call or WhatsApp us instead.'

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: 'Not allowed.' }, 403)
  if (Number(request.headers.get('content-length') || 0) > 6144) return reply({ error: 'Your message is too long.' }, 413)

  let body: unknown
  try { body = await request.json() } catch { return reply({ error: 'Please fill in your name and mobile number.' }, 400) }
  const parsed = parseViewingRequest(body)
  if (!parsed.ok) return parsed.spam ? reply({ ok: true }) : reply({ error: parsed.error }, 400)

  const ip = visitorIp(request)
  const human = await verifyTurnstile((body as Record<string, unknown>).turnstileToken, ip)
  if (human === 'fail') return reply({ error: 'We could not confirm you are a person. Please refresh the page and try again, or call or WhatsApp us.' }, 400)
  if (human === 'unavailable') console.warn('Turnstile could not be reached; the request was allowed and the database limits still apply.')

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) { report(new Error('SUPABASE_SERVICE_ROLE_KEY is not set for this deployment'), { where: 'viewing-request:config' }); return reply({ error: `Online requests are not available right now. ${FALLBACK}` }, 503) }   // the log line names the missing setting
  const v = parsed.value
  const sb = supaAdmin()

  let outcome: string | undefined, leadId: number | null = null, action = 'none'
  try {
    const { data, error } = await sb.rpc('lead_submit', {
      p_ip_hash: visitorHash(ip, serviceKey), p_kind: v.kind, p_name: v.name, p_phone: v.phone, p_looking_for: v.lookingFor === 'Not specified' ? '' : v.lookingFor,
      p_event_date: v.eventDate, p_visit_date: v.visitDate, p_call_time: v.callTime || '', p_note: v.note,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    outcome = row?.outcome; leadId = row?.lead_id ?? null; action = row?.tg_action || 'none'
  } catch (e) {
    report(e, { where: 'viewing-request:save' })
    return reply({ error: `We could not save your request. ${FALLBACK}` }, 503)
  }

  if (outcome === 'limited_visitor') return reply({ error: `Too many requests just now. ${FALLBACK}` }, 429)
  // A repeat, or a phone number that already has its three for the day: we already have them, so say thank you and send nothing more.
  if (outcome !== 'created') return reply({ ok: true })

  // The lead is safe in the database. Telegram is a notification on top; its failure is recorded, not shown to the customer.
  if (action !== 'none') {
    const chats = [...new Set([process.env.TELEGRAM_OWNER_CHAT_ID, process.env.TELEGRAM_STAFF_CHAT_ID].map(c => (c || '').trim()).filter(Boolean))]
    const text = action === 'summary' ? manyEnquiriesMessage() : viewingMessage(v, leadId)
    let sent = false
    if (process.env.TELEGRAM_BOT_TOKEN && chats.length) {
      const results = await Promise.allSettled(chats.map(chat => sendTelegram(chat, text)))
      sent = results.some(r => r.status === 'fulfilled')
      if (!sent) report((results[0] as PromiseRejectedResult).reason, { where: 'viewing-request:telegram' })
    }
    if (action === 'send' && leadId) {
      const { error } = await sb.rpc('lead_mark_telegram', { p_id: leadId, p_ok: sent })
      if (error) report(new Error(error.message), { where: 'viewing-request:mark' })
    }
  }
  return reply({ ok: true })
}
