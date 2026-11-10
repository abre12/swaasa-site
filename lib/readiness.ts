// One place that answers two questions for every screen:
//   1. Where is this dress and what state is it in?            → dressStage()
//   2. Can this booking be handed over today, and if not, why? → bookingReadiness()
// Both are DERIVED from the live records (bookings, alteration jobs, cleaning queue, dress status), exactly like the alert engine.
// Nothing is stored, so the Dashboard, Calendar, Deliveries, Inventory, the booking popup and Mark delivered can never disagree.
// (The old bookings.prep_status field is no longer read anywhere.)
import { ALT_STAGE, altStatus, activeCleaning, CLEAN_STAGE } from './bookingAction'
import { dmy, todayIST } from './util'

export const ALT_OPEN = ['pending_dispatch', 'at_unit', 'quality_check']
export const CLEAN_OPEN = ['to_be_sent', 'sent', 'returned_pending_check']
const AWAY_STATUS = ['unavailable', 'retired', 'archived']

export type Reason = { code: 'previous_out' | 'alteration' | 'repair' | 'cleaning' | 'damaged' | 'unavailable'; label: string; hard?: boolean; module?: 'alteration' | 'cleaning'; id?: string }
export type Readiness = { applicable: boolean; ready: boolean; reasons: Reason[]; summary: string; hard: boolean }

const dressOf = (ctx: any, id: string) => ctx.dmap?.[id] || (ctx.D || []).find((x: any) => x.id === id)

/** Is this booking ready to be handed to the customer? Only meaningful before delivery (pending / confirmed). */
export function bookingReadiness(ctx: any, b: any): Readiness {
  if (!b || !['pending', 'confirmed'].includes(b.status)) return { applicable: false, ready: true, reasons: [], summary: '', hard: false }
  const reasons: Reason[] = [], jobs: any[] = (ctx.AJ || []).filter((j: any) => ALT_OPEN.includes(j.status)), d = dressOf(ctx, b.dress_id)
  const prev = (ctx.B || []).find((x: any) => x.dress_id === b.dress_id && x.id !== b.id && x.status === 'out')
  if (prev) reasons.push({ code: 'previous_out', hard: true, label: `Still with ${prev.customer_name || 'the previous customer'}${prev.end_date ? ` (due back ${dmy(prev.end_date)}${prev.end_date < todayIST() ? ', overdue' : ''})` : ''}` })
  const alt = jobs.find(j => j.booking_id === b.id && j.source !== 'damage')
  if (alt) reasons.push({ code: 'alteration', label: `Alteration: ${altStatus(alt).label}`, module: 'alteration', id: alt.id })
  const rep = jobs.find(j => j.dress_id === b.dress_id && j.source === 'damage')
  if (rep) reasons.push({ code: 'repair', label: `Repair: ${altStatus(rep).label}`, module: 'alteration', id: rep.id })
  else if (d?.status === 'maintenance') reasons.push({ code: 'damaged', label: 'Dress is marked damaged' })
  const cr = activeCleaning(ctx, b)
  if (cr) reasons.push({ code: 'cleaning', label: `Dry cleaning: ${CLEAN_STAGE[cr.status] || cr.status}`, module: 'cleaning', id: cr.id })
  if (d && AWAY_STATUS.includes(d.status)) reasons.push({ code: 'unavailable', label: `Dress is ${d.status}` })
  const summary = reasons.length ? reasons[0].label + (reasons.length > 1 ? ` +${reasons.length - 1} more` : '') : 'Ready'
  return { applicable: true, ready: !reasons.length, reasons, summary, hard: reasons.some(r => r.hard) }
}

export type Stage = { key: 'ready' | 'needs_work' | 'at_tailor' | 'at_cleaner' | 'with_customer' | 'damaged' | 'unavailable'; label: string; detail?: string; tone: 'ok' | 'warn' | 'busy' | 'bad' | 'off' }

/** Where is this dress right now? */
export function dressStage(ctx: any, d: any): Stage {
  const where = d.location ? `Kept: ${d.location}` : undefined
  if (AWAY_STATUS.includes(d.status)) return { key: 'unavailable', label: d.status === 'unavailable' ? 'Unavailable' : d.status === 'retired' ? 'Retired' : 'Archived', tone: 'off' }
  const out = (ctx.B || []).find((b: any) => b.dress_id === d.id && b.status === 'out')
  if (out) return { key: 'with_customer', label: 'With customer', detail: out.end_date < todayIST() ? `Overdue since ${dmy(out.end_date)}` : `Due back ${dmy(out.end_date)}`, tone: out.end_date < todayIST() ? 'bad' : 'busy' }
  const jobs: any[] = (ctx.AJ || []).filter((j: any) => j.dress_id === d.id && ALT_OPEN.includes(j.status))
  const rep = jobs.find(j => j.source === 'damage')
  if (rep) return rep.status === 'at_unit' ? { key: 'at_tailor', label: 'At tailor (repair)', detail: ALT_STAGE.at_unit, tone: 'bad' } : { key: 'damaged', label: 'Damaged', detail: `Repair: ${altStatus(rep).label}`, tone: 'bad' }
  if (d.status === 'maintenance') return { key: 'damaged', label: 'Damaged', detail: where, tone: 'bad' }
  const alt = jobs.find(j => j.source !== 'damage')
  if (alt) return alt.status === 'at_unit' ? { key: 'at_tailor', label: 'At tailor', detail: altStatus(alt).hint, tone: 'busy' } : { key: 'needs_work', label: alt.status === 'quality_check' ? 'Alteration: quality check' : 'Needs alteration', detail: altStatus(alt).label, tone: 'warn' }
  const cr = (ctx.CR || []).find((r: any) => r.dress_id === d.id && CLEAN_OPEN.includes(r.status))
  if (cr) return cr.status === 'sent' ? { key: 'at_cleaner', label: 'At cleaner', tone: 'busy' } : { key: 'needs_work', label: cr.status === 'to_be_sent' ? 'Needs dry cleaning' : 'Check cleaned dress', detail: where, tone: 'warn' }
  return { key: 'ready', label: 'In store · ready', detail: where, tone: 'ok' }
}

/** When a repair is finished the dress may leave "Damaged". Other work (alteration, cleaning) never changes the stored status. */
export function shouldClearDamaged(ctx: any, dress: any, closingJob: any): boolean {
  if (!dress || dress.status !== 'maintenance' || closingJob?.source !== 'damage') return false
  return !(ctx.AJ || []).some((j: any) => j.id !== closingJob.id && j.dress_id === dress.id && j.source === 'damage' && ALT_OPEN.includes(j.status))
}

