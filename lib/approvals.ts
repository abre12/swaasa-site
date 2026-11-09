// Shared wording for approval requests: used by the notification bell and the Approvals page.
import { inr } from './util'

export type ApprovalKind = 'discount' | 'refund' | 'booking_cancellation' | 'shortfall'
export const approvalIcon = (t: string) => t === 'discount' ? 'percent' : t === 'refund' ? 'ret' : t === 'booking_cancellation' ? 'xc' : 'wallet'
export const approvalName = (t: string) => t === 'discount' ? 'Discount' : t === 'refund' ? 'Refund' : t === 'booking_cancellation' ? 'Booking Cancellation' : 'Short Payment'
export const approvalTitle = (t: string) => `${approvalName(t)} Approval Required`
// money going out or a booking being cancelled cannot be undone, so the bell asks for a second tap there
export const needsConfirm = (t: string) => t === 'refund' || t === 'booking_cancellation'

/** What the owner is being asked to approve, in one line. */
export function approvalDetail(a: any, bookings: any[] = []): string {
  const d = a.request_details || {}
  if (a.action_type === 'shortfall') return `Short by ${inr(a.shortfall || 0)}`
  if (a.action_type === 'discount') return `Additional discount: ${inr(d.amount || 0)}`
  if (a.action_type === 'refund') return `${d.kind === 'deposit_refund' ? 'Deposit' : 'Rent'} refund: ${inr(d.amount || 0)} (${d.mode || 'Cash'})`
  if (a.action_type === 'booking_cancellation') {
    const bk = bookings.find(x => x.id === a.booking_id), dep = Math.max(0, bk?.deposit_held || 0), r = Math.round(d.refund_amount || 0)
    return ['Cancel booking', r > 0 ? `rent refund ${inr(r)} (${d.mode || 'Cash'})` : 'no rent refund', dep > 0 ? `deposit ${inr(dep)} returned` : ''].filter(Boolean).join(' · ')
  }
  return 'Review requested'
}
export const approvalReason = (a: any) => String(a.reason || a.request_details?.reason || '').trim()

export function ago(iso?: string | null, now = Date.now()): string {
  if (!iso) return ''
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24); return `${d} day${d === 1 ? '' : 's'} ago`
}
