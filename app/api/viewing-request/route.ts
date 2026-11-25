import { NextResponse, type NextRequest } from 'next/server'
import { parseViewingRequest, viewingMessage } from '@/lib/viewing'
import { sendTelegram } from '@/lib/telegram'
import { sameOrigin } from '@/lib/apiGuard'

// Public "Request a private viewing" form. It is open to everyone, so it does three things before anything is sent:
//  - checks the form came from this website (not another site's page) and is small
//  - ignores bots that fill the hidden field, and limits how many requests one visitor (and the whole site) can send per hour
//  - sends one request of each kind (viewing or call-back) per phone number every ten minutes, so a double tap does not message the team twice
// The message goes to the owner's and staff's Telegram chats (the same chats the reminders use). Nothing is stored in the database and
// nothing about the visitor is written to the logs. The limits live in server memory, so they are best-effort: they stop floods and
// repeat taps, not a determined attacker on many connections (a Turnstile check would be the next step for that).
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const HOUR = 60 * 60 * 1000, PER_VISITOR = 4, PER_HOUR_ALL = 40, REPEAT_GAP = 10 * 60 * 1000
const byVisitor = new Map<string, number[]>(), byPhone = new Map<string, number>()
let allTimes: number[] = []

function allowed(visitor: string, now: number) {
  allTimes = allTimes.filter(t => now - t < HOUR)
  const mine = (byVisitor.get(visitor) || []).filter(t => now - t < HOUR)
  if (mine.length >= PER_VISITOR || allTimes.length >= PER_HOUR_ALL) { byVisitor.set(visitor, mine); return false }
  mine.push(now); allTimes.push(now); byVisitor.set(visitor, mine)
  if (byVisitor.size > 500) for (const [k, v] of byVisitor) if (!v.some(t => now - t < HOUR)) byVisitor.delete(k)
  return true
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: 'Not allowed.' }, 403)
  if (Number(request.headers.get('content-length') || 0) > 4096) return reply({ error: 'Your message is too long.' }, 413)

  let body: unknown
  try { body = await request.json() } catch { return reply({ error: 'Please fill in your name and mobile number.' }, 400) }
  const parsed = parseViewingRequest(body)
  if (!parsed.ok) return parsed.spam ? reply({ ok: true }) : reply({ error: parsed.error }, 400)

  const now = Date.now()
  const visitor = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const repeatKey = `${parsed.value.kind}:${parsed.value.phone}`
  const last = byPhone.get(repeatKey)
  if (last && now - last < REPEAT_GAP) return reply({ ok: true })        // already sent a moment ago
  if (!allowed(visitor, now)) return reply({ error: 'Too many requests just now. Please call or WhatsApp us instead.' }, 429)

  const chats = [...new Set([process.env.TELEGRAM_OWNER_CHAT_ID, process.env.TELEGRAM_STAFF_CHAT_ID].map(c => (c || '').trim()).filter(Boolean))]
  if (!process.env.TELEGRAM_BOT_TOKEN || !chats.length) return reply({ error: 'Online requests are not available right now. Please call or WhatsApp us.' }, 503)

  const text = viewingMessage(parsed.value)
  const results = await Promise.allSettled(chats.map(chat => sendTelegram(chat, text)))
  if (!results.some(r => r.status === 'fulfilled')) {
    console.error('Viewing request could not be sent to Telegram:', (results[0] as PromiseRejectedResult).reason?.message || 'unknown error')
    return reply({ error: 'We could not send your request. Please call or WhatsApp us.' }, 502)
  }
  byPhone.set(repeatKey, now)
  if (byPhone.size > 500) for (const [k, t] of byPhone) if (now - t > REPEAT_GAP) byPhone.delete(k)
  return reply({ ok: true })
}
