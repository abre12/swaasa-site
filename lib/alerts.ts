// Swaasa Action Center: the central alert engine.
// Every alert is DERIVED from the live bookings, dresses, alteration jobs and cleaning records, so it appears, escalates and
// disappears by itself when the real status changes. Nothing is stored except who has read what (see Notifications.tsx).
import { addD, dmy } from './util'

export type Level = 'risk' | 'critical' | 'high' | 'summary'
export type AlertAction = { label: string; kind: 'booking' | 'workflow' | 'day'; bookingId?: string; module?: 'alteration' | 'cleaning'; id?: string; date?: string }
export type Alert = {
  key: string            // stable id: type + dress/booking context. The same unresolved issue always has the same key.
  level: Level           // which group it sits in
  rank: number           // urgency, higher first (also used to re-mark an alert unread when it escalates)
  short: string          // short name used in group summaries, e.g. "Delivery risk"
  tag: string            // headline, e.g. "DELIVERY RISK · 3 DAYS LEFT"
  dress: string          // "LH541223 · Blush Pink Bridal Lehenga"
  dressId: string
  body: string           // one or two lines of context
  meta?: string          // delivery / deadline line
  more: string[]         // other issues on the same dress (the most urgent one is shown, the rest are listed)
  action: AlertAction
}
export type Summary = { key: string; date: string; total: number; ready: number; alteration: number; prep: number }

const ALT_ACTIVE = ['pending_dispatch', 'at_unit', 'quality_check']
const CLEAN_ACTIVE = ['to_be_sent', 'sent', 'returned_pending_check']
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
const HORIZON = 7   // how far ahead a pending task can matter

export function computeAlerts(ctx: { B?: any[]; D?: any[]; AJ?: any[]; CR?: any[]; DC?: any[] }, today: string, hourIST: number): { alerts: Alert[]; summary: Summary | null } {
  const dm = new Map<string, any>((ctx.D || []).map(d => [d.id, d]))
  const live = (ctx.B || []).filter(b => b.status !== 'cancelled')
  const upcoming = (b: any) => b.status === 'pending' || b.status === 'confirmed'   // not yet delivered
  const label = (b: any) => { const n = dm.get(b.dress_id)?.name || b.dress_name || ''; return `${b.dress_code || dm.get(b.dress_id)?.code || ''}${n ? ' · ' + n : ''}` }
  const out: Alert[] = []

  const cleaningOf = (dressId: string) => {
    const r = (ctx.CR || []).find(x => x.dress_id === dressId && CLEAN_ACTIVE.includes(x.status)); if (!r) return null
    const dc = (ctx.DC || []).find(x => x.dress_id === dressId && !x.returned_on)
    const need = r.status === 'to_be_sent' ? 3 : r.status === 'sent' ? Math.max(1, dc?.expected_back ? days(today, dc.expected_back) + 1 : 2) : 1
    return { id: r.id as string, status: r.status as string, need, expected: dc?.expected_back as string | undefined }
  }

  // ---- A + B: dress is out with a customer ----
  for (const o of live.filter(b => b.status === 'out')) {
    const overdue = o.end_date < today
    const nb = live.filter(b => b.dress_id === o.dress_id && b.status === 'confirmed' && b.id !== o.id && b.start_date > o.start_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    const left = nb ? days(today, nb.start_date) : 99
    if (nb && left <= 3) {
      const [level, rank, tag, short] = left <= 0 ? ['risk', 100, 'DELIVERY AT RISK · DELIVERY TODAY', 'Delivery at risk'] as const
        : left === 1 ? ['risk', 90, 'IMMEDIATE ATTENTION · DELIVERY TOMORROW', 'Delivery at risk'] as const
        : left === 2 ? ['critical', 70, 'URGENT · 2 DAYS LEFT', 'Delivery risk'] as const
        : ['critical', 60, 'DELIVERY RISK · 3 DAYS LEFT', 'Delivery risk'] as const
      out.push({ key: `risk:${o.dress_id}:${nb.id}`, level, rank, short, tag, dress: label(o), dressId: o.dress_id,
        body: `Still not returned and required for delivery on ${dmy(nb.start_date)}.`,
        meta: overdue ? `Expected back ${dmy(o.end_date)}` : `With customer until ${dmy(o.end_date)}`, more: [],
        action: { label: 'View Details', kind: 'booking', bookingId: o.id } })
    } else if (overdue) {
      out.push({ key: `overdue:${o.id}`, level: 'critical', rank: 55, short: 'Overdue return', tag: 'OVERDUE RETURN', dress: label(o), dressId: o.dress_id,
        body: `Expected back on ${dmy(o.end_date)} and has not been returned.`, more: [], action: { label: 'View Booking', kind: 'booking', bookingId: o.id } })
    }
  }

  // ---- C2: an alteration is still open although the dress is already with the customer ----
  // Alterations are never done on a dress that has gone out, so this is always a record-keeping mistake (High, not Critical).
  for (const a of (ctx.AJ || []).filter(j => ALT_ACTIVE.includes(j.status) && j.source !== 'damage')) {
    const b = live.find(x => x.id === a.booking_id); if (!b || b.status !== 'out') continue
    out.push({ key: `altopen:${a.id}`, level: 'high', rank: 45, short: 'Alteration left open', tag: 'ALTERATION STILL OPEN · DRESS ALREADY DELIVERED', dress: label(b), dressId: b.dress_id, more: [],
      body: 'The dress is already with the customer, but its alteration is still open. Please close it as completed, skipped or missed.', meta: `Delivered · due back ${dmy(b.end_date)}`,
      action: { label: 'View Workflow', kind: 'workflow', module: 'alteration', id: a.id } })
  }

  // ---- C: alterations ----
  for (const a of (ctx.AJ || []).filter(j => ALT_ACTIVE.includes(j.status) && j.source !== 'damage')) {
    const b = live.find(x => x.id === a.booking_id); if (!b || !upcoming(b)) continue
    const due = addD(b.start_date, -1), dleft = days(today, due)
    const pend = a.measurements_pending ? ' Measurements are still pending.' : ''
    const base = { dress: label(b), dressId: b.dress_id, more: [] as string[], meta: `Delivery ${dmy(b.start_date)} · Alteration due ${dmy(due)}`, action: { label: 'View Workflow', kind: 'workflow', module: 'alteration', id: a.id } as AlertAction }
    if (today >= b.start_date) out.push({ ...base, key: `altrisk:${a.id}`, level: 'risk', rank: 95, short: 'Delivery at risk', tag: 'DELIVERY AT RISK · ALTERATION PENDING', body: `Alteration is not complete and the dress is due for delivery ${today === b.start_date ? 'today' : 'on ' + dmy(b.start_date)}.${pend}` })
    else if (a.status === 'at_unit' && a.expected_return && a.expected_return < today) out.push({ ...base, key: `altover:${a.id}`, level: 'critical', rank: 64, short: 'Overdue alteration', tag: 'ALTERATION OVERDUE', body: `Expected back from the tailor on ${dmy(a.expected_return)} and is not back yet.` })
    else if (dleft <= 0) out.push({ ...base, key: `altover:${a.id}`, level: 'critical', rank: 62, short: 'Overdue alteration', tag: 'ALTERATION DUE TODAY', body: `Alteration must be completed today, one day before delivery.${pend}` })
    else if (dleft <= 2) out.push({ ...base, key: `altsoon:${a.id}`, level: 'high', rank: 40, short: 'Alteration due soon', tag: 'ALTERATION DUE SOON', body: `Alteration must be completed by ${dmy(due)} for delivery on ${dmy(b.start_date)}.${pend}` })
  }

  // ---- D: delivery preparation (dry cleaning, damage) for the next confirmed booking ----
  const nextByDress = new Map<string, any>()
  for (const b of live.filter(x => x.status === 'confirmed').sort((a, b) => a.start_date.localeCompare(b.start_date))) if (!nextByDress.has(b.dress_id)) nextByDress.set(b.dress_id, b)
  for (const [dressId, nb] of nextByDress) {
    const left = days(today, nb.start_date); if (left > HORIZON) continue
    const dress = dm.get(dressId), cl = cleaningOf(dressId)
    const act = (kind: 'cleaning' | 'booking'): AlertAction => kind === 'cleaning' && cl ? { label: 'View Workflow', kind: 'workflow', module: 'cleaning', id: cl.id } : { label: 'View Details', kind: 'booking', bookingId: nb.id }
    const common = { dress: label(nb), dressId, more: [] as string[], meta: `Delivery ${dmy(nb.start_date)}` }
    if (dress?.status === 'maintenance') {
      const lvl = left <= 3 ? 'critical' : 'high'
      out.push({ ...common, key: `prep:${dressId}:${nb.id}:damaged`, level: left <= 0 ? 'risk' : lvl, rank: left <= 0 ? 92 : lvl === 'critical' ? 58 : 38, short: 'Preparation risk', tag: left <= 0 ? 'DELIVERY AT RISK · DRESS DAMAGED' : 'DELIVERY PREPARATION RISK', body: `Marked as damaged and not yet repaired. Needed for delivery on ${dmy(nb.start_date)}.`, action: act('booking') })
    }
    if (cl) {
      const what = cl.status === 'to_be_sent' ? 'Requires dry cleaning' : cl.status === 'sent' ? 'At the cleaner' + (cl.expected ? `, expected back ${dmy(cl.expected)}` : '') : 'Back from the cleaner and waiting to be checked'
      if (left <= 0) out.push({ ...common, key: `prep:${dressId}:${nb.id}:clean`, level: 'risk', rank: 93, short: 'Delivery at risk', tag: 'DELIVERY AT RISK · NOT READY', body: `${what}, and the dress is due for delivery ${left === 0 ? 'today' : 'on ' + dmy(nb.start_date)}.`, action: act('cleaning') })
      else if (left <= cl.need) out.push({ ...common, key: `prep:${dressId}:${nb.id}:clean`, level: 'critical', rank: 57, short: 'Preparation risk', tag: 'DELIVERY PREPARATION RISK', body: `${what} before delivery on ${dmy(nb.start_date)}. Not enough time left.`, action: act('cleaning') })
      else out.push({ ...common, key: `prep:${dressId}:${nb.id}:clean`, level: 'high', rank: 35, short: 'Dry cleaning needed', tag: 'UPCOMING DRY-CLEANING REQUIREMENT', body: `${what} before delivery on ${dmy(nb.start_date)}.`, action: act('cleaning') })
    }
  }

  // ---- one card per dress: show the most urgent, list the rest ----
  const byDress = new Map<string, Alert[]>()
  for (const a of out) byDress.set(a.dressId, [...(byDress.get(a.dressId) || []), a])
  const alerts: Alert[] = []
  for (const list of byDress.values()) {
    list.sort((a, b) => b.rank - a.rank)
    alerts.push({ ...list[0], more: [...new Set(list.slice(1).map(x => x.short))].filter(s => s !== list[0].short) })
  }
  alerts.sort((a, b) => b.rank - a.rank || a.dress.localeCompare(b.dress))

  // ---- Tomorrow's deliveries: one summary, from 5:00 PM IST ----
  let summary: Summary | null = null
  if (hourIST >= 17) {
    const tmr = addD(today, 1)
    const tb = live.filter(b => upcoming(b) && b.start_date === tmr)
    if (tb.length) {
      let alteration = 0, prep = 0
      for (const b of tb) {
        if ((ctx.AJ || []).some(j => j.booking_id === b.id && ALT_ACTIVE.includes(j.status) && j.source !== 'damage')) alteration++
        else if (cleaningOf(b.dress_id) || dm.get(b.dress_id)?.status === 'maintenance') prep++
      }
      summary = { key: `tomorrow:${tmr}`, date: tmr, total: tb.length, alteration, prep, ready: tb.length - alteration - prep }
    }
  }
  return { alerts, summary }
}
