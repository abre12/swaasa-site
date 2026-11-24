// What the customer booking tracker shows. Pure functions, so the rules can be unit tested on their own.
// The database (customer_booking_track, migration v32) works out `prepStatus` from the live alteration, cleaning and repair records;
// this file only turns the status pair into a step and a sentence.

export const TRACKING_STEPS = ['Request received', 'Confirmed', 'Being prepared', 'Ready', 'Rental in progress', 'Returned'] as const

export type TrackedBooking = { bookingStatus: string; prepStatus: string }

const low = (v: string | null | undefined) => String(v ?? '').toLowerCase()

/** Index of the step that is under way. Every step before it is ticked. A returned booking returns the number of steps, so all of them are ticked. */
export function currentStep(b: TrackedBooking): number {
  const status = low(b.bookingStatus), prep = low(b.prepStatus)
  if (status === 'returned') return TRACKING_STEPS.length
  if (status === 'out' || (prep === 'delivered' && status !== 'cancelled' && status !== 'pending')) return 4
  if (status === 'confirmed') {
    if (prep === 'ready') return 3
    if (prep === 'alterations_pending' || prep === 'cleaning_pending') return 2
    return 1
  }
  return 0   // a request that is not confirmed yet: preparation stages are never shown
}

export function statusLabel(b: TrackedBooking): string {
  const status = low(b.bookingStatus), prep = low(b.prepStatus)
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'returned') return 'Returned to Swaasa'
  if (status === 'out' || (prep === 'delivered' && status !== 'pending')) return 'Rental in progress'
  if (status === 'confirmed') {
    if (prep === 'ready') return 'Ready for collection or delivery'
    if (prep === 'cleaning_pending') return 'Final preparation'
    if (prep === 'alterations_pending') return 'Alterations in progress'
    return 'Booking confirmed'
  }
  return 'Request received'
}
