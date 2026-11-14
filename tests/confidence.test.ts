import { describe, expect, it } from 'vitest'
import { readinessSnapshot, REASON_LABEL } from '@/lib/confidence'

const TODAY = '2026-11-13'
const D = [{ id: 'd1', code: 'D1', name: 'Gown', status: 'available' }]
const ctx = (B: any[], extra: any = {}) => ({ B, D, AJ: [], CR: [], DC: [], dmap: { d1: D[0] }, ...extra })
const bk = (id: string, start: string) => ({ id, status: 'confirmed', dress_id: 'd1', start_date: start, end_date: start, customer_name: 'A', dress_code: 'D1' })

describe('daily readiness snapshot (IN-1 / IN-3)', () => {
  it('records one stage per delivery that is 0, 1 or 2 days away', () => {
    const B = [bk('a', '2026-11-13'), bk('b', '2026-11-14'), bk('c', '2026-11-15'), bk('d', '2026-11-16')]
    const rows = readinessSnapshot(ctx(B), B, TODAY)
    expect(rows.map(r => `${r.booking_id}:${r.stage}`).sort()).toEqual(['a:D-0', 'b:D-1', 'c:D-2'].sort())
  })
  it('ignores deliveries that already happened or were cancelled', () => {
    const B = [{ ...bk('a', '2026-11-13'), status: 'out' }, { ...bk('b', '2026-11-14'), status: 'cancelled' }]
    expect(readinessSnapshot(ctx(B), B, TODAY)).toHaveLength(0)
  })
  it('has a plain label for every reason code', () => {
    for (const c of ['previous_out', 'alteration', 'repair', 'cleaning', 'damaged', 'unavailable']) expect(REASON_LABEL[c]).toBeTruthy()
  })
})
