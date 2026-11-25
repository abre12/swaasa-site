import { todayIST } from '@/lib/util'

export type CustomerSummary = { n: string; p: string; e: string; c: number; s: number; last: string }

/**
 * One row per customer (matched on the last 10 digits of the phone), with their booking count, total rent (cancelled bookings add to the count, not the rent)
 * and latest start date. The owner sees every booking; a manager sees only this month and next month, and no cancelled ones.
 */
export function buildCustomers(bookings: any[], owner: boolean, today: string = todayIST()): CustomerSummary[] {
  const mStart = today.slice(0, 7) + '-01'
  const nEnd = (() => {
    const d = new Date(mStart + 'T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + 2)
    d.setUTCDate(0)
    return d.toISOString().slice(0, 10)
  })()
  const rows = owner ? bookings : bookings.filter(b => b.status !== 'cancelled' && b.start_date <= nEnd && b.end_date >= mStart)
  return Object.values(
    rows.reduce((m: Record<string, CustomerSummary>, b) => {
      const phone = String(b.phone ?? ''),
        k = phone.replace(/\D/g, '').slice(-10) || String(b.id)
      const c = (m[k] ??= { n: b.customer_name, p: phone, e: b.email, c: 0, s: 0, last: '' })
      c.c++
      if (b.status !== 'cancelled') c.s += b.rent
      if (b.start_date > c.last) c.last = b.start_date
      return m
    }, {})
  )
}
