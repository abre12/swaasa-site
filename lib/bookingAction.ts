// Chooses the single contextual primary action for the booking details modal.
// Booking lifecycle status decides first; for confirmed bookings the current Alterations / Dry Cleaning workflow
// stage takes over when one is active. (booking.prep_status is deliberately NOT used.)

export type ActionKind = 'confirm' | 'deliver' | 'return' | 'alt_dispatch' | 'alt_open' | 'clean_dispatch' | 'clean_open' | 'none'
export type WorkflowRef = { module: 'alteration' | 'cleaning'; id: string; status: string; label: string; repair?: boolean }
export type Primary = { kind: ActionKind; label: string; icon: string; job?: any; req?: any; state?: string; current?: WorkflowRef; secondary?: WorkflowRef; view?: WorkflowRef }

const ALT_ACTIVE = ['pending_dispatch', 'at_unit', 'quality_check']
const CLEAN_ACTIVE = ['to_be_sent', 'sent', 'returned_pending_check']
export const ALT_STAGE: Record<string, string> = { pending_dispatch: 'Pending Dispatch to Tailor', at_unit: 'At Tailoring Unit', quality_check: 'Quality Check at Store', ready: 'Ready', cancelled: 'Cancelled' }
export const CLEAN_STAGE: Record<string, string> = { to_be_sent: 'To Be Sent', sent: 'Sent to Cleaner', returned_pending_check: 'Returned from Cleaner', complete: 'Completed', cancelled: 'Cancelled' }

/** The one clear status of an alteration, in the order the work happens:
 *  Measurements Pending → Pending Dispatch to Tailor → At Tailoring Unit → Quality Check at Store → Ready. */
export function altStatus(j: any): { label: string; hint: string; tone: 'warn' | 'todo' | 'busy' | 'check' | 'done' | 'off' } {
  const pendingMeas = j.status === 'pending_dispatch' && !!j.measurements_pending
  if (pendingMeas) return { label: 'Measurements Pending', hint: 'Take the measurements first, then send the dress to the tailor.', tone: 'warn' }
  if (j.status === 'pending_dispatch') return { label: ALT_STAGE.pending_dispatch, hint: 'Measurements are done. Send the dress to the tailor.', tone: 'todo' }
  if (j.status === 'at_unit') return { label: ALT_STAGE.at_unit, hint: j.expected_return ? `With the tailor. Expected back ${j.expected_return.split('-').reverse().join('/')}.` : 'With the tailor.', tone: 'busy' }
  if (j.status === 'quality_check') return { label: ALT_STAGE.quality_check, hint: 'Back from the tailor. Check the work.', tone: 'check' }
  if (j.status === 'ready') return { label: ALT_STAGE.ready, hint: 'Alterations are complete.', tone: 'done' }
  return { label: ALT_STAGE[j.status] || j.status, hint: '', tone: 'off' }
}

const altRef = (j: any): WorkflowRef => ({ module: 'alteration', id: j.id, status: j.status, label: `${j.source === 'damage' ? 'Repair' : 'Alterations'} · ${altStatus(j).label}`, repair: j.source === 'damage' })
const cleanRef = (r: any): WorkflowRef => ({ module: 'cleaning', id: r.id, status: r.status, label: `Dry Cleaning · ${CLEAN_STAGE[r.status]}` })

/** The active alteration for this booking: its own job first, then active repair work on the same dress. */
export function activeAlteration(ctx: any, b: any) {
  const jobs = (ctx.AJ || []).filter((a: any) => ALT_ACTIVE.includes(a.status))
  return jobs.find((a: any) => a.source !== 'damage' && a.booking_id === b.id) || jobs.find((a: any) => a.source === 'damage' && a.dress_id === b.dress_id && a.booking_id !== b.id)
}
/** Dress-level cleaning applies only to the dress's next upcoming booking, so older work is never mistaken for this one. */
export function activeCleaning(ctx: any, b: any) {
  const upcoming = (ctx.B || []).filter((x: any) => x.dress_id === b.dress_id && ['pending', 'confirmed'].includes(x.status)).sort((x: any, y: any) => x.start_date.localeCompare(y.start_date) || String(x.created_at).localeCompare(String(y.created_at)))
  if (upcoming[0]?.id !== b.id) return undefined
  return (ctx.CR || []).find((r: any) => r.dress_id === b.dress_id && CLEAN_ACTIVE.includes(r.status))
}

export function pickPrimary(ctx: any, b: any): Primary {
  if (b.status === 'pending') return { kind: 'confirm', label: 'Confirm booking', icon: 'checkc' }
  if (b.status === 'out') return { kind: 'return', label: 'Process Return', icon: 'ret' }
  if (b.status === 'cancelled') return { kind: 'none', label: 'Cancelled', icon: 'ban', state: 'cancelled' }
  if (b.status === 'returned') {
    const job = (ctx.AJ || []).find((a: any) => a.source === 'damage' && a.booking_id === b.id && ALT_ACTIVE.includes(a.status))
    const req = (ctx.CR || []).find((r: any) => r.booking_id === b.id && CLEAN_ACTIVE.includes(r.status))
    const view = job ? altRef(job) : req ? cleanRef(req) : undefined
    return { kind: 'none', label: 'Completed', icon: 'checkc', state: 'completed', view }
  }
  const alt = activeAlteration(ctx, b), cr = activeCleaning(ctx, b)
  const altPrimary = (j: any): Primary => j.status === 'pending_dispatch' && j.measurements_pending ? { kind: 'alt_open', label: 'Add Measurements', icon: 'pencil', job: j } : j.status === 'pending_dispatch' ? { kind: 'alt_dispatch', label: 'Send to Tailoring', icon: 'truck', job: j } : { kind: 'alt_open', label: j.status === 'at_unit' ? 'Track Tailoring' : 'Review Alteration', icon: j.status === 'at_unit' ? 'search' : 'checkc', job: j }
  const cleanPrimary = (r: any): Primary => r.status === 'to_be_sent' ? { kind: 'clean_dispatch', label: 'Send to Cleaner', icon: 'sparkle', req: r } : { kind: 'clean_open', label: r.status === 'sent' ? 'Track Dry Cleaning' : 'Confirm Cleaned Item', icon: r.status === 'sent' ? 'search' : 'checkc', req: r }
  // Order: work already under way with the tailor wins; otherwise the dress is cleaned before it is altered.
  const altUnderway = alt && alt.status !== 'pending_dispatch'
  if (alt && (altUnderway || !cr)) return { ...altPrimary(alt), current: altRef(alt), secondary: cr ? cleanRef(cr) : undefined }
  if (cr) return { ...cleanPrimary(cr), current: cleanRef(cr), secondary: alt ? altRef(alt) : undefined }
  return { kind: 'deliver', label: 'Mark as Delivered', icon: 'truck' }
}
