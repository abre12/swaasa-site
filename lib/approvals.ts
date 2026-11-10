// Shared wording for approval requests: used by the notification bell and the Approvals page.
import { inr } from './util'

export type ApprovalKind = 'discount' | 'refund' | 'booking_cancellation' | 'shortfall'
export const approvalIcon = (t: string) => t === 'discount' ? 'percent' : t === 'refund' ? 'ret' : t === 'booking_cancellation' ? 'xc' : 'wallet'
export const approvalName = (t: string) => t === 'discount' ? 'Discount' : t === 'refund' ? 'Refund' : t === 'booking_cancellation' ? 'Booking Cancellation' : 'Short Payment'
export const approvalTitle = (t: string) => `${approvalName(t)} Approval Required`
// money going out or a booking being cancelled cannot be undone, so the bell asks for a second tap there
export const needsConfirm = (t: string) => t === 'refund'   // approving a cancellation opens its own decision screen, which is the confirmation

/** What the owner is being asked to approve, in one line. */
export function approvalDetail(a: any, bookings: any[] = []): string {
  const d = a.request_details || {}
  if (a.action_type === 'shortfall') return `Short by ${inr(a.shortfall || 0)}`
  if (a.action_type === 'discount') return `Additional discount: ${inr(d.amount || 0)}`
  if (a.action_type === 'refund') return `${d.kind === 'deposit_refund' ? 'Deposit' : 'Rent'} refund: ${inr(d.amount || 0)} (${d.mode || 'Cash'})`
  if (a.action_type === 'booking_cancellation') {
    const r = Math.round(d.rent_refund ?? d.refund_amount ?? 0), dp = Math.round(d.deposit_refund ?? 0)
    return ['Cancel booking', r + dp > 0 ? `staff recommend refund: ${[r > 0 ? `rent ${inr(r)}` : '', dp > 0 ? `deposit ${inr(dp)}` : ''].filter(Boolean).join(' + ')}` : 'no refund recommended (policy)'].join(' · ')
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
