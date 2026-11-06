// Shared, data-driven financial summary for a booking. Used by every booking detail view so they all show the same thing.
// Booking money fields (from booking_view): rent (after discount), discount, custom_charge, late_fee, damage_charge,
// charges (= custom + late + damage + other), paid (rent received), deposit (required), deposit_held (currently held).

/** True only for a real, non-zero amount. Rejects null, undefined, '', NaN, 0 and non-numeric text. */
export const hasApplicableFinancialValue = (v: unknown): boolean => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string' && v.trim() === '') return false
  const n = Number(v)
  return Number.isFinite(n) && n !== 0
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export type PayItem = { label: string; value: number; type: 'charge' | 'discount' }

export function buildPaymentSummary(b: any) {
  const rent = num(b.rent), disc = num(b.discount), late = num(b.late_fee), dmg = num(b.damage_charge), custom = num(b.custom_charge), charges = num(b.charges)
  const other = Math.max(0, charges - late - dmg - custom)
  const items = ([
    { label: 'Original Rental Price', value: disc > 0 ? rent + disc : 0, type: 'charge' },
    { label: 'Discount', value: disc, type: 'discount' },
    { label: 'Rental Charges', value: rent, type: 'charge' },
    { label: 'Customisation Charges', value: custom, type: 'charge' },
    { label: 'Late Return Charges', value: late, type: 'charge' },
    { label: 'Damage / Repair Charges', value: dmg, type: 'charge' },
    { label: 'Other Charges', value: other, type: 'charge' },
  ] as PayItem[]).filter(i => hasApplicableFinancialValue(i.value))
  const total = rent + charges, paid = num(b.paid), balance = total - paid
  return { items, total, paid, due: Math.max(0, balance), over: Math.max(0, -balance), showTotal: total > 0 || paid > 0 }
}

export type DepositInfo = { amount: number; held: number; status: string; tone: 'ok' | 'warn' | 'neutral'; detail: string[]; toRefund: number }

/** Security deposit card data, or null when no deposit applies. `payments` (optional) gives an exact status. */
export function buildDeposit(b: any, payments?: any[] | null): DepositInfo | null {
  const amount = num(b.deposit), held = num(b.deposit_held)
  if (!hasApplicableFinancialValue(amount) && !hasApplicableFinancialValue(held)) return null
  const sum = (k: string) => (payments || []).filter(p => p.kind === k).reduce((t, p) => t + num(p.amount), 0)
  const collected = sum('deposit'), refunded = sum('deposit_refund'), applied = sum('charge')
  const known = !!payments
  let status: string, tone: DepositInfo['tone'] = 'neutral'
  if (held > 0) {
    if (known && refunded > 0) { status = 'Partially Refunded'; tone = 'warn' }
    else if (known && applied > 0) { status = 'Partly adjusted against charges'; tone = 'warn' }
    else if (held >= amount) { status = 'Collected'; tone = 'ok' }
    else { status = 'Partially collected'; tone = 'warn' }
  } else if (known) {
    if (collected <= 0) { status = 'Pending'; tone = 'warn' }
    else if (refunded > 0 && applied > 0) status = 'Refunded, remainder adjusted against charges'
    else if (applied > 0) status = 'Adjusted against charges'
    else if (refunded > 0) status = 'Refunded'
    else status = 'Refunded or adjusted'
  } else if (b.status === 'returned' || b.status === 'cancelled') status = 'Refunded or adjusted'
  else { status = 'Pending'; tone = 'warn' }
  const detail: string[] = []
  if (known) { if (refunded > 0) detail.push('refunded'); if (applied > 0) detail.push('applied') }
  const owing = Math.max(0, num(b.rent) + num(b.charges) - num(b.paid))
  return { amount: amount || held, held, status, tone, detail, toRefund: held > 0 ? Math.max(0, held - owing) : 0 }
}
