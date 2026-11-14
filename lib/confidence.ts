// IN-1 / IN-3: Delivery Confidence. One place decides what the daily readiness snapshot is, and what the codes are called.
import { bookingReadiness } from './readiness'

export const REASON_LABEL: Record<string, string> = {
  previous_out: 'Dress not back from the previous customer',
  alteration: 'Alteration not finished',
  repair: 'Repair not finished',
  cleaning: 'Dry cleaning not finished',
  damaged: 'Dress marked damaged',
  unavailable: 'Dress away or unavailable',
}
export const STAGE_LABEL: Record<string, string> = { 'D-2': '2 days before', 'D-1': 'The day before', 'D-0': 'On the day' }

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5)

/** One row per delivery that is 0, 1 or 2 days away, saying whether the dress is ready right now and why not. */
export function readinessSnapshot(ctx: any, bookings: any[], today: string) {
  const rows: any[] = []
  for (const b of bookings) {
    if (!['pending', 'confirmed'].includes(b.status)) continue
    const n = daysBetween(today, b.start_date); if (n < 0 || n > 2) continue
    const rd = bookingReadiness(ctx, b); if (!rd.applicable) continue
    rows.push({ booking_id: b.id, dress_id: b.dress_id, delivery_date: b.start_date, stage: `D-${n}`, ready: rd.ready,
      reason_codes: Array.from(new Set(rd.reasons.map(r => r.code))), reasons: rd.reasons.map(r => r.label).join('; ') || null })
  }
  return rows
}
