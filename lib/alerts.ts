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
  bookingId?: string     // the booking (and so the customer) this alert is about, when there is one
  body: string           // one or two lines of context
  meta?: string          // delivery / deadline line
  more: string[]         // other issues on the same dress (the most urgent one is shown, the rest are listed)
  event?: string         // the customer's event, e.g. "Wedding in 5 days" (shown as a chip so staff see what is at stake)
  action: AlertAction
}
export type Summary = { key: string; date: string; total: number; ready: number; alteration: number; prep: number; notBack: number; returns: number }

const ALT_ACTIVE = ['pending_dispatch', 'at_unit', 'quality_check']
const CLEAN_ACTIVE = ['to_be_sent', 'sent', 'returned_pending_check']
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
// Timing that used to be fixed in the code. The owner changes it under Settings (settings.alert_*_days); these are the defaults.
export type AlertCfg = { horizon: number; idle: number; cleanLead: number; altSoon: number; measureBy: number; sendBy: number }
const num = (v: any, d: number) => Number.isFinite(+v) && +v >= 1 ? Math.round(+v) : d
export const alertCfg = (st?: any): AlertCfg => ({ horizon: num(st?.alert_horizon_days, 7), idle: num(st?.alert_idle_days, 3), cleanLead: num(st?.clean_lead_days, 3), altSoon: num(st?.alt_soon_days, 2), measureBy: num(st?.measure_by_days, 5), sendBy: num(st?.send_by_days, 4) })

// The customer's event date makes a late dress more serious: a wedding in 3 days outranks a party next month (DA-8).
export function eventNote(b: any, today: string): string | undefined {
  if (!b?.event_date) return undefined
  const n = days(today, b.event_date); if (n < 0 || n > 14) return undefined
  return `${b.event_type || 'Event'} ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}`
}

export function computeAlerts(ctx: { B?: any[]; D?: any[]; AJ?: any[]; CR?: any[]; DC?: any[]; st?: any }, today: string, hourIST: number): { alerts: Alert[]; summary: Summary | null; all: Alert[] } {
  const dm = new Map<string, any>((ctx.D || []).map(d => [d.id, d]))
  const live = (ctx.B || []).filter(b => b.status !== 'cancelled')
  const upcoming = (b: any) => b.status === 'pending' || b.status === 'confirmed'   // not yet delivered
  const label = (b: any) => { const n = dm.get(b.dress_id)?.name || b.dress_name || ''; return `${b.dress_code || dm.get(b.dress_id)?.code || ''}${n ? ' · ' + n : ''}` }
  const out: Alert[] = []

  const C = alertCfg(ctx.st)
  const cleaningOf = (dressId: string) => {
    const r = (ctx.CR || []).find(x => x.dress_id === dressId && CLEAN_ACTIVE.includes(x.status)); if (!r) return null
    const dc = (ctx.DC || []).find(x => x.dress_id === dressId && !x.returned_on)
    const need = r.status === 'to_be_sent' ? C.cleanLead : r.status === 'sent' ? Math.max(1, dc?.expected_back ? days(today, dc.expected_back) + 1 : 2) : 1
    return { id: r.id as string, status: r.status as string, need, expected: dc?.expected_back as string | undefined }
  }

  // ---- A + B: dress is out with a customer ----
  // DA-5: a dress that is due back on schedule is NOT an alert, even if the next delivery is close. It becomes one only when the return is
  // overdue, or when the return day plus the cleaning days (Settings) would run past the next delivery. The day before delivery we add a quiet
  // "confirm the return" note instead, so someone calls the customer.
  const gap = Number.isFinite(+ctx.st?.buffer_days) ? Math.max(0, Math.round(+ctx.st.buffer_days)) : 1
  for (const o of live.filter(b => b.status === 'out')) {
    const overdue = o.end_date < today
    const nb = live.filter(b => b.dress_id === o.dress_id && b.status === 'confirmed' && b.id !== o.id && b.start_date > o.start_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    const left = nb ? days(today, nb.start_date) : 99
    const tooLate = !!nb && addD(o.end_date, gap) >= nb.start_date           // even on time, it is back too late to be ready
    const nextWho = nb ? `${nb.customer_name || 'next customer'}${nb.delivery_slot ? ' · ' + nb.delivery_slot : ''}` : ''
    // CH-3: say both things: who has the dress now, and who is waiting for it.
    const nowLine = `Out with ${o.customer_name || 'the customer'}, ${overdue ? `was due back ${dmy(o.end_date)}` : `due back ${dmy(o.end_date)}`}.`
    if (nb && left <= 3 && (overdue || tooLate)) {
      const [level, rank, tag, short] = left <= 0 ? ['risk', 100, 'DELIVERY AT RISK · DELIVERY TODAY', 'Delivery at risk'] as const
        : left === 1 ? ['risk', 90, 'IMMEDIATE ATTENTION · DELIVERY TOMORROW', 'Delivery at risk'] as const
        : left === 2 ? ['critical', 70, 'URGENT · 2 DAYS LEFT', 'Delivery risk'] as const
        : ['critical', 60, 'DELIVERY RISK · 3 DAYS LEFT', 'Delivery risk'] as const
      out.push({ key: `risk:${o.dress_id}:${nb.id}`, level, rank, short, tag, dress: label(o), dressId: o.dress_id, bookingId: nb.id, event: eventNote(nb, today),
        body: `${nowLine} Next delivery: ${nextWho} on ${dmy(nb.start_date)}.`,
        meta: overdue ? `Not returned · delivery ${dmy(nb.start_date)}` : `Return plus ${gap} cleaning day${gap === 1 ? '' : 's'} is too late for ${dmy(nb.start_date)}`, more: [],
        action: { label: 'View Details', kind: 'booking', bookingId: o.id } })
    } else if (overdue) {
      out.push({ key: `overdue:${o.id}`, level: 'critical', rank: 55, short: 'Overdue return', tag: 'OVERDUE RETURN', dress: label(o), dressId: o.dress_id, bookingId: o.id,
        body: `Expected back on ${dmy(o.end_date)} and has not been returned.`, more: [], action: { label: 'View Booking', kind: 'booking', bookingId: o.id } })
    } else if (nb && left === 1) {
      out.push({ key: `confirmret:${o.id}`, level: 'high', rank: 36, short: 'Confirm return', tag: 'CONFIRM RETURN · DELIVERY TOMORROW', dress: label(o), dressId: o.dress_id, bookingId: nb.id,
        body: `${nowLine} Call to confirm it comes back in time for ${nextWho} tomorrow.`, more: [], action: { label: 'View Booking', kind: 'booking', bookingId: o.id } })
    }
  }

  // ---- C2: an alteration is still open although the dress is already with the customer ----
  // Alterations are never done on a dress that has gone out, so this is always a record-keeping mistake (High, not Critical).
  for (const a of (ctx.AJ || []).filter(j => ALT_ACTIVE.includes(j.status) && j.source !== 'damage')) {
    const b = live.find(x => x.id === a.booking_id); if (!b || b.status !== 'out') continue
    out.push({ key: `altopen:${a.id}`, level: 'high', rank: 45, short: 'Alteration left open', tag: 'ALTERATION STILL OPEN · DRESS ALREADY DELIVERED', dress: label(b), dressId: b.dress_id, bookingId: b.id, more: [],
      body: 'The dress is already with the customer, but its alteration is still open. Please close it as completed, skipped or missed.', meta: `Delivered · due back ${dmy(b.end_date)}`,
      action: { label: 'View Workflow', kind: 'workflow', module: 'alteration', id: a.id } })
  }

  // ---- C: alterations ----
  for (const a of (ctx.AJ || []).filter(j => ALT_ACTIVE.includes(j.status) && j.source !== 'damage')) {
    const b = live.find(x => x.id === a.booking_id); if (!b || !upcoming(b)) continue
    const due = addD(b.start_date, -1), dleft = days(today, due)
    const pend = a.measurements_pending ? ' Measurements are still pending.' : ''
    const base = { dress: label(b), dressId: b.dress_id, bookingId: b.id, event: eventNote(b, today), more: [] as string[], meta: `Delivery ${dmy(b.start_date)} · Alteration due ${dmy(due)}`, action: { label: 'View Workflow', kind: 'workflow', module: 'alteration', id: a.id } as AlertAction }
    if (today >= b.start_date) out.push({ ...base, key: `altrisk:${a.id}`, level: 'risk', rank: 95, short: 'Delivery at risk', tag: 'DELIVERY AT RISK · ALTERATION PENDING', body: `Alteration is not complete and the dress is due for delivery ${today === b.start_date ? 'today' : 'on ' + dmy(b.start_date)}.${pend}` })
    else if (a.status === 'at_unit' && a.expected_return && a.expected_return < today) out.push({ ...base, key: `altover:${a.id}`, level: 'critical', rank: 64, short: 'Overdue alteration', tag: 'ALTERATION OVERDUE', body: `Expected back from the tailor on ${dmy(a.expected_return)} and is not back yet.` })
    else if (dleft <= 0) out.push({ ...base, key: `altover:${a.id}`, level: 'critical', rank: 62, short: 'Overdue alteration', tag: 'ALTERATION DUE TODAY', body: `Alteration must be completed today, one day before delivery.${pend}` })
    else if (dleft <= C.altSoon) out.push({ ...base, key: `altsoon:${a.id}`, level: 'high', rank: 40, short: 'Alteration due soon', tag: 'ALTERATION DUE SOON', body: `Alteration must be completed by ${dmy(due)} for delivery on ${dmy(b.start_date)}.${pend}` })
  }

  // ---- C3: checkpoints for a dress with an alteration (days set under Settings): measured, with the tailor, back in time ----
  // These raise the warning EARLIER than the "due soon" window above, while there is still time to fix it.
  for (const a of (ctx.AJ || []).filter(j => ALT_ACTIVE.includes(j.status) && j.source !== 'damage')) {
    const b = live.find(x => x.id === a.booking_id); if (!b || !upcoming(b)) continue
    const left = days(today, b.start_date); if (left < 1) continue          // delivery day and later are handled above
    const base = { dress: label(b), dressId: b.dress_id, bookingId: b.id, event: eventNote(b, today), more: [] as string[], meta: `Delivery ${dmy(b.start_date)}`, action: { label: 'View Workflow', kind: 'workflow', module: 'alteration', id: a.id } as AlertAction }
    const soon = left <= 3
    if (a.measurements_pending && left <= C.measureBy)
      out.push({ ...base, key: `chkmeasure:${a.id}`, level: soon ? 'critical' : 'high', rank: soon ? 63 : 44, short: 'Measurements pending', tag: `MEASUREMENTS NOT TAKEN · ${left} DAY${left === 1 ? '' : 'S'} TO DELIVERY`,
        body: `Measurements should be taken by ${dmy(addD(b.start_date, -C.measureBy))}. Delivery is on ${dmy(b.start_date)}.` })
    if (a.status === 'pending_dispatch' && left <= C.sendBy)
      out.push({ ...base, key: `chksend:${a.id}`, level: soon ? 'critical' : 'high', rank: soon ? 61 : 43, short: 'Not sent to tailor', tag: `NOT YET SENT TO THE TAILOR · ${left} DAY${left === 1 ? '' : 'S'} TO DELIVERY`,
        body: `The dress should be with the tailor by ${dmy(addD(b.start_date, -C.sendBy))}. Delivery is on ${dmy(b.start_date)}.` })
    if (a.status === 'quality_check' && left <= 2)
      out.push({ ...base, key: `chkqc:${a.id}`, level: 'critical', rank: 59, short: 'Quality check pending', tag: `QUALITY CHECK PENDING · ${left} DAY${left === 1 ? '' : 'S'} TO DELIVERY`,
        body: `The dress is back from the tailor but has not been quality-checked. Delivery is on ${dmy(b.start_date)}.` })
    if (a.status === 'at_unit' && a.expected_return && a.expected_return > addD(b.start_date, -2))
      out.push({ ...base, key: `chklate:${a.id}`, level: soon ? 'critical' : 'high', rank: soon ? 62 : 46, short: 'Tailor return too late', tag: 'TAILOR RETURN TOO LATE FOR DELIVERY',
        body: `Expected back on ${dmy(a.expected_return)}, less than two days before delivery on ${dmy(b.start_date)}. Ask the tailor for an earlier date.` })
  }

  // ---- C5: repairs (damaged dress) that could make the next delivery late ----
  for (const j of (ctx.AJ || []).filter(x => x.source === 'damage' && ALT_ACTIVE.includes(x.status))) {
    const nb = live.filter(x => x.dress_id === j.dress_id && upcoming(x) && x.start_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]; if (!nb) continue
    const left = days(today, nb.start_date), act: AlertAction = { label: 'View Workflow', kind: 'workflow', module: 'alteration', id: j.id }
    const base = { dress: label(nb), dressId: nb.dress_id, bookingId: nb.id, more: [] as string[], meta: `Delivery ${dmy(nb.start_date)}`, action: act }
    if (left <= 1) out.push({ ...base, key: `reprisk:${j.id}`, level: left <= 0 ? 'risk' : 'critical', rank: left <= 0 ? 94 : 66, short: 'Repair not complete', tag: left <= 0 ? 'DELIVERY AT RISK · REPAIR PENDING' : 'REPAIR NOT COMPLETE · DELIVERY TOMORROW', body: `Repair is not complete and delivery is ${left <= 0 ? 'today' : 'tomorrow'}.` })
    else if (j.status === 'at_unit' && j.expected_return && j.expected_return > addD(nb.start_date, -1) && left <= 3) out.push({ ...base, key: `reprisk:${j.id}`, level: 'critical', rank: 56, short: 'Repair back too late', tag: 'REPAIR RETURN TOO LATE FOR DELIVERY', body: `Expected back ${dmy(j.expected_return)}, too close to delivery on ${dmy(nb.start_date)}.` })
    else if (j.status === 'pending_dispatch' && left <= 2) out.push({ ...base, key: `reprisk:${j.id}`, level: 'critical', rank: 54, short: 'Repair not sent', tag: 'REPAIR NOT SENT · DELIVERY SOON', body: `Not yet sent to the tailor and delivery is in ${left} days.` })
  }

  // ---- D: delivery preparation (dry cleaning, damage) for the next confirmed booking ----
  const nextByDress = new Map<string, any>()
  for (const b of live.filter(x => x.status === 'confirmed').sort((a, b) => a.start_date.localeCompare(b.start_date))) if (!nextByDress.has(b.dress_id)) nextByDress.set(b.dress_id, b)
  for (const [dressId, nb] of nextByDress) {
    const left = days(today, nb.start_date); if (left > C.horizon) continue
    const dress = dm.get(dressId), cl = cleaningOf(dressId)
    const act = (kind: 'cleaning' | 'booking'): AlertAction => kind === 'cleaning' && cl ? { label: 'View Workflow', kind: 'workflow', module: 'cleaning', id: cl.id } : { label: 'View Details', kind: 'booking', bookingId: nb.id }
    const common = { dress: label(nb), dressId, bookingId: nb.id, event: eventNote(nb, today), more: [] as string[], meta: `Delivery ${dmy(nb.start_date)}` }
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

  // ---- E: a delivery whose date has passed without the dress going out ----
  for (const b of live.filter(x => upcoming(x) && x.start_date < today)) {
    const n = days(b.start_date, today)
    out.push({ key: `missed:${b.id}`, level: 'risk', rank: 96, short: 'Delivery missed', tag: `DELIVERY MISSED · ${n} DAY${n === 1 ? '' : 'S'} LATE`, dress: label(b), dressId: b.dress_id, bookingId: b.id, more: [],
      body: `Delivery was due on ${dmy(b.start_date)} and has not been recorded. Deliver it, or reschedule or cancel the booking.`, meta: b.customer_name ? `Customer: ${b.customer_name}` : undefined,
      action: { label: 'View Booking', kind: 'booking', bookingId: b.id } })
  }

  // ---- E2: DA-11 delivery date is today and it is 4 PM or later but nothing is recorded: do not wait until tomorrow to say so ----
  if (hourIST >= 16) for (const b of live.filter(x => upcoming(x) && x.start_date === today)) {
    out.push({ key: `undelivered:${b.id}`, level: 'critical', rank: 65, short: 'Not delivered yet', tag: 'NOT DELIVERED YET · DELIVERY TODAY', dress: label(b), dressId: b.dress_id, bookingId: b.id, more: [], event: eventNote(b, today),
      body: `Delivery was due today and is not recorded. If it has gone out, mark it delivered; if not, call the customer.`, meta: b.delivery_slot ? `Slot ${b.delivery_slot}` : undefined,
      action: { label: 'View Booking', kind: 'booking', bookingId: b.id } })
  }

  // ---- F: items stuck with a vendor or waiting to be sent, even when no booking is behind them ----
  const dlabel = (id: string) => { const d = dm.get(id); return d ? `${d.code}${d.name ? ' · ' + d.name : ''}` : '' }
  for (const d of (ctx.DC || []).filter(x => !x.returned_on && x.expected_back && x.expected_back < today)) {
    const cl = cleaningOf(d.dress_id); if (!cl || !dlabel(d.dress_id)) continue
    const n = days(d.expected_back, today)
    out.push({ key: `vendor:clean:${d.dress_id}`, level: 'high', rank: 42, short: 'Cleaner overdue', tag: 'DRY CLEANING OVERDUE', dress: dlabel(d.dress_id), dressId: d.dress_id, more: [],
      body: `Expected back from the cleaner on ${dmy(d.expected_back)}, ${n} day${n === 1 ? '' : 's'} ago.`, action: { label: 'View Workflow', kind: 'workflow', module: 'cleaning', id: cl.id } })
  }
  for (const r of (ctx.CR || []).filter(x => x.status === 'to_be_sent' && x.added_at && days(String(x.added_at).slice(0, 10), today) >= C.idle)) {
    if (!dlabel(r.dress_id)) continue
    const n = days(String(r.added_at).slice(0, 10), today)
    out.push({ key: `vendor:tbs:${r.id}`, level: 'high', rank: 34, short: 'Waiting to be sent', tag: 'WAITING TO BE SENT TO CLEANER', dress: dlabel(r.dress_id), dressId: r.dress_id, more: [],
      body: `Added to the cleaning list ${n} days ago and still not sent.`, action: { label: 'View Workflow', kind: 'workflow', module: 'cleaning', id: r.id } })
  }
  for (const j of (ctx.AJ || []).filter(x => x.source === 'damage' && ALT_ACTIVE.includes(x.status))) {
    if (!dlabel(j.dress_id)) continue
    const act: AlertAction = { label: 'View Workflow', kind: 'workflow', module: 'alteration', id: j.id }
    if (j.status === 'at_unit' && j.expected_return && j.expected_return < today)
      out.push({ key: `vendor:rep:${j.id}`, level: 'high', rank: 41, short: 'Repair overdue', tag: 'REPAIR OVERDUE', dress: dlabel(j.dress_id), dressId: j.dress_id, more: [], body: `Expected back from the tailor on ${dmy(j.expected_return)} and is not back yet.`, action: act })
    else if (j.status === 'pending_dispatch' && j.created_at && days(String(j.created_at).slice(0, 10), today) >= C.idle)
      out.push({ key: `vendor:repsend:${j.id}`, level: 'high', rank: 33, short: 'Repair not sent', tag: 'DAMAGED DRESS WAITING FOR REPAIR', dress: dlabel(j.dress_id), dressId: j.dress_id, more: [], body: `Marked damaged ${days(String(j.created_at).slice(0, 10), today)} days ago and not yet sent for repair.`, action: act })
  }

  // ---- DA-8: the event date decides how urgent a late dress is ----
  // Within 3 days of the event a 'high' item becomes 'critical'; within 7 days the rank rises so it sorts first and shows as unread again.
  const bookingById = new Map<string, any>(live.map(b => [b.id, b]))
  for (const a of out) {
    const bk = a.bookingId ? bookingById.get(a.bookingId) : null; if (!bk?.event_date) continue
    const n = days(today, bk.event_date); a.event = a.event || eventNote(bk, today)
    if (n < 0) continue
    if (n <= 3 && a.level === 'high') { a.level = 'critical'; a.rank += 20 } else if (n <= 3) { a.rank += 8 } else if (n <= 7) { a.rank += 4 }
  }
  const all = [...out]            // every single issue, before the one-card-per-dress grouping (used for counts and by the Alterations page)

  // ---- one card per dress: show the most urgent, list the rest ----
  const byDress = new Map<string, Alert[]>()
  for (const a of out) byDress.set(a.dressId, [...(byDress.get(a.dressId) || []), a])
  const alerts: Alert[] = []
  for (const list of byDress.values()) {
    list.sort((a, b) => b.rank - a.rank)
    alerts.push({ ...list[0], more: [...new Set(list.slice(1).map(x => x.short))].filter(s => s !== list[0].short) })
  }
  alerts.sort((a, b) => b.rank - a.rank || a.dress.localeCompare(b.dress))

  // ---- Tomorrow: one summary from 5:00 PM IST (deliveries, whether each dress is really ready, and returns due) ----
  let summary: Summary | null = null
  if (hourIST >= 17) {
    const tmr = addD(today, 1)
    const tb = live.filter(b => upcoming(b) && b.start_date === tmr), returns = live.filter(b => b.status === 'out' && b.end_date === tmr).length
    if (tb.length || returns) {
      let alteration = 0, prep = 0, notBack = 0
      for (const b of tb) {
        if ((ctx.AJ || []).some(j => j.booking_id === b.id && ALT_ACTIVE.includes(j.status) && j.source !== 'damage')) alteration++
        else if (live.some(x => x.dress_id === b.dress_id && x.status === 'out' && x.id !== b.id)) notBack++
        else if (cleaningOf(b.dress_id) || dm.get(b.dress_id)?.status === 'maintenance') prep++
      }
      summary = { key: `tomorrow:${tmr}`, date: tmr, total: tb.length, alteration, prep, notBack, returns, ready: tb.length - alteration - prep - notBack }
    }
  }
  return { alerts, summary, all }
}
