import { describe, expect, it } from 'vitest'
import { buildCustomers } from '@/lib/customers'

const b = (o: object) => ({ id: 'SW1', customer_name: 'Anjali', phone: '98765 43210', email: 'a@x.in', status: 'confirmed', rent: 1000, start_date: '2026-11-10', end_date: '2026-11-12', ...o })
const TODAY = '2026-11-24'

describe('buildCustomers', () => {
  it('joins one customer\'s bookings, however the phone is written, and totals the rent', () => {
    const r = buildCustomers([b({ id: 'A' }), b({ id: 'B', phone: '+91 9876543210', rent: 500, start_date: '2026-11-20' })], true, TODAY)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ n: 'Anjali', c: 2, s: 1500, last: '2026-11-20' })
  })
  it('counts a cancelled booking but not its rent', () => {
    const r = buildCustomers([b({ id: 'A' }), b({ id: 'B', status: 'cancelled', rent: 700 })], true, TODAY)
    expect(r[0]).toMatchObject({ c: 2, s: 1000 })
  })
  it('keeps people with no phone apart, by booking id', () => {
    expect(buildCustomers([b({ id: 'A', phone: null }), b({ id: 'B', phone: '' })], true, TODAY)).toHaveLength(2)
  })
  it('shows a manager only this month and next, and no cancelled bookings; the owner sees everything', () => {
    const rows = [
      b({ id: 'OLD', phone: '9000000001', start_date: '2026-08-01', end_date: '2026-08-03' }),
      b({ id: 'NOW', phone: '9000000002', start_date: '2026-11-30', end_date: '2026-12-02' }),
      b({ id: 'NEXT', phone: '9000000003', start_date: '2026-12-31', end_date: '2026-12-31' }),
      b({ id: 'FAR', phone: '9000000004', start_date: '2027-01-02', end_date: '2027-01-04' }),
      b({ id: 'CANC', phone: '9000000005', start_date: '2026-11-30', end_date: '2026-12-02', status: 'cancelled' }),
    ]
    expect(buildCustomers(rows, false, TODAY).map(c => c.p).sort()).toEqual(['9000000002', '9000000003'])
    expect(buildCustomers(rows, true, TODAY)).toHaveLength(5)
  })
})
