// "Request a private viewing" form on the public home page: checks what the visitor typed and writes the Telegram message for the team.
// Pure functions with no imports, so the rules can be unit tested on their own. The route app/api/viewing-request/route.ts does the sending.

export const LOOKING_FOR = ['Bridal lehenga', 'Gown', 'Saree', 'Bridesmaid looks', 'Other'] as const
// The form has two ways in: visit the studio on a chosen day, or just ask the team to ring back. Times are loose windows on purpose, so the site
// never promises opening hours it does not know.
export const REQUEST_KINDS = ['viewing', 'callback'] as const
export const CALL_TIMES = ['Any time', 'Morning', 'Afternoon', 'Evening'] as const
export type ViewingRequest = {
  kind: 'viewing' | 'callback'
  callTime: string | null     // one of CALL_TIMES; always set for a call-back request, and for a viewing only when the visitor chose one
  name: string
  phone: string               // "+91" and ten digits for an Indian mobile; "+" and the digits for an overseas number
  lookingFor: string          // one of LOOKING_FOR, or 'Not specified'
  eventDate: string | null    // YYYY-MM-DD
  visitDate: string | null    // YYYY-MM-DD (only for a viewing request)
  note: string
}
export type ViewingParse = { ok: true; value: ViewingRequest } | { ok: false; error: string; spam?: boolean }

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const oneLine = (v: unknown, max: number) => String(v ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Today's date in India (YYYY-MM-DD). The server may run in another time zone. */
export const istToday = (now = Date.now()) => new Date(now + 330 * 60 * 1000).toISOString().slice(0, 10)

function validDate(s: string, today: string, label: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return `Please choose a valid ${label}.`
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return `Please choose a valid ${label}.`
  if (s < today) return `The ${label} cannot be in the past.`
  const limit = new Date(`${today}T00:00:00Z`); limit.setUTCFullYear(limit.getUTCFullYear() + 3)
  if (d > limit) return `Please choose a ${label} within the next three years.`
  return null
}

/** Indian mobile numbers (with or without +91 / 91 / 0) and overseas numbers written with a leading +. Anything else is refused. */
export function normalisePhone(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  const digits = text.replace(/\D/g, '')
  if (text.startsWith('+') && !digits.startsWith('91')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  const national = digits.replace(/^(?:91|0)(?=\d{10}$)/, '').replace(/^0+(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null
}

export function parseViewingRequest(body: unknown, today = istToday()): ViewingParse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Please fill in your name and mobile number.' }
  const b = body as Record<string, unknown>
  // A real visitor never sees this field. Anything in it is a bot: the caller pretends it worked and sends nothing.
  if (String(b.website ?? '').trim()) return { ok: false, error: '', spam: true }

  const name = oneLine(b.name, 80)
  if (name.length < 2) return { ok: false, error: 'Please enter your name.' }
  const phone = normalisePhone(b.phone)
  if (!phone) return { ok: false, error: 'Please enter a valid mobile number, for example 98765 43210.' }

  const kindRaw = oneLine(b.kind, 12) || 'viewing'
  if (!(REQUEST_KINDS as readonly string[]).includes(kindRaw)) return { ok: false, error: 'Please choose one of the options listed.' }
  const kind = kindRaw as ViewingRequest['kind']
  const callRaw = oneLine(b.callTime, 12)
  if (callRaw && !(CALL_TIMES as readonly string[]).includes(callRaw)) return { ok: false, error: 'Please choose one of the options listed.' }

  const lookingRaw = oneLine(b.lookingFor, 40)
  if (lookingRaw && !(LOOKING_FOR as readonly string[]).includes(lookingRaw)) return { ok: false, error: 'Please choose one of the options listed.' }

  const dates: Record<'eventDate' | 'visitDate', string | null> = { eventDate: null, visitDate: null }
  for (const [key, label] of [['eventDate', 'event date'], ['visitDate', 'visit date']] as const) {
    if (key === 'visitDate' && kind === 'callback') continue      // a call-back has no visit day, so a leftover value is ignored, not checked
    const raw = oneLine(b[key], 10)
    if (!raw) continue
    const bad = validDate(raw, today, label)
    if (bad) return { ok: false, error: bad }
    dates[key] = raw
  }

  const note = String(b.note ?? '').replace(CONTROL, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 500)
  return { ok: true, value: { kind, callTime: callRaw || (kind === 'callback' ? 'Any time' : null), name, phone, lookingFor: lookingRaw || 'Not specified', eventDate: dates.eventDate, visitDate: dates.visitDate, note } }
}

const show = (s: string | null) => s ? new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not given'

/** Plain text (no formatting characters), so nothing a visitor types can change how the message is shown. */
export function viewingMessage(v: ViewingRequest, leadId?: number | null): string {
  const wa = `https://wa.me/${v.phone.replace(/\D/g, '')}`
  const ref = leadId ? [`Enquiry number: ${leadId} (also saved under Enquiries in the app)`] : []
  if (v.kind === 'callback') return [
    'New call-back request from the website',
    `Name: ${v.name}`,
    `Mobile: ${v.phone}`,
    `WhatsApp: ${wa}`,
    `Best time to call: ${v.callTime || 'Any time'}`,
    `Looking for: ${v.lookingFor}`,
    `Event date: ${show(v.eventDate)}`,
    ...(v.note ? [`Note: ${v.note}`] : []),
    ...ref,
    'Please call them back. They have not picked a visit day yet.',
  ].join('\n')
  return [
    'New viewing request from the website',
    `Name: ${v.name}`,
    `Mobile: ${v.phone}`,
    `WhatsApp: ${wa}`,
    `Looking for: ${v.lookingFor}`,
    `Event date: ${show(v.eventDate)}`,
    `Preferred visit day: ${show(v.visitDate)}`,
    ...(v.callTime && v.callTime !== 'Any time' ? [`Best time to call: ${v.callTime}`] : []),
    ...(v.note ? [`Note: ${v.note}`] : []),
    ...ref,
    'Please call or message them to fix a time.',
  ].join('\n')
}

/** Sent once when more than 20 enquiries arrive in an hour. The enquiries themselves are all saved; this just says where to read them. */
export const manyEnquiriesMessage = () => 'Many website enquiries have arrived in the last hour. They are all saved: open Enquiries in the app to read and call them. Individual messages are paused until things quieten down.'
