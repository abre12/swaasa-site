import { describe, expect, it } from 'vitest'
import { computeAlerts } from '@/lib/alerts'

// The scenarios the owner cares about. Today is fixed so the dates in each case are easy to read.
const TODAY = '2026-11-13'
const D = [{ id: 'd1', code: 'D1', name: 'Gown' }, { id: 'd2', code: 'D2', name: 'Lehenga' }]
const run = (B: any[], opts: { AJ?: any[]; hour?: number; st?: any } = {}) => computeAlerts({ B, D, AJ: opts.AJ || [], CR: [], DC: [], st: opts.st ?? { buffer_days: 1 } }, TODAY, opts.hour ?? 10)
const out = (end: string, extra: any = {}) => ({ id: 'O', status: 'out', dress_id: 'd1', start_date: '2026-11-10', end_date: end, customer_name: 'Swathi', dress_code: 'D1', ...extra })
const next = (start: string, extra: any = {}) => ({ id: 'N', status: 'confirmed', dress_id: 'd1', start_date: start, end_date: '2026-11-20', customer_name: 'Ganesh', dress_code: 'D1', ...extra })

describe('dress still out (DA-5)', () => {
  it('is quiet when the dress is due back in time, even with a delivery 3 days away', () => expect(run([out('2026-11-14'), next('2026-11-16')]).alerts).toHaveLength(0))
  it('alerts when the return plus the cleaning day runs into the next delivery', () => {
    const r = run([out('2026-11-14'), next('2026-11-15')]); expect(r.alerts).toHaveLength(1); expect(r.alerts[0].level).toBe('critical')
  })
  it('alerts when the dress is overdue and a delivery is close', () => expect(run([out('2026-11-12'), next('2026-11-15')]).alerts[0].level).toBe('critical'))
  it('uses the cleaning days from Settings', () => {
    expect(run([out('2026-11-13'), next('2026-11-14')], { st: { buffer_days: 0 } }).alerts[0].short).toBe('Confirm return')
    expect(run([out('2026-11-13'), next('2026-11-14')], { st: { buffer_days: 1 } }).alerts[0].level).toBe('risk')
  })
  it('names both customers on the card (CH-3)', () => {
    const body = run([out('2026-11-12'), next('2026-11-15')]).alerts[0].body; expect(body).toContain('Swathi'); expect(body).toContain('Ganesh')
  })
})

describe('event date (DA-8)', () => {
  it('shows the event and raises a High alert to Critical within 3 days of it', () => {
    const a = run([out('2026-11-13'), next('2026-11-14', { event_date: '2026-11-15', event_type: 'Wedding' })], { st: { buffer_days: 0 } }).alerts[0]
    expect(a.level).toBe('critical'); expect(a.event).toBe('Wedding in 2 days')
  })
  it('does not raise it when the event is far away', () => {
    expect(run([out('2026-11-13'), next('2026-11-14', { event_date: '2026-12-25' })], { st: { buffer_days: 0 } }).alerts[0].level).toBe('high')
  })
})

describe('same-day check (DA-11)', () => {
  const todays = [{ id: 'N', status: 'confirmed', dress_id: 'd2', start_date: TODAY, end_date: '2026-11-16', customer_name: 'G', dress_code: 'D2' }]
  it('stays quiet in the morning', () => expect(run(todays, { hour: 10 }).alerts).toHaveLength(0))
  it('says "not delivered yet" from 4 PM', () => expect(run(todays, { hour: 16 }).alerts[0].short).toBe('Not delivered yet'))
})

describe('alterations and repairs', () => {
  const b = { id: 'N', status: 'confirmed', dress_id: 'd2', start_date: '2026-11-15', end_date: '2026-11-17', customer_name: 'G', dress_code: 'D2' }
  it('flags a quality check still pending 2 days before delivery', () => {
    const r = run([b], { AJ: [{ id: 'J', booking_id: 'N', dress_id: 'd2', status: 'quality_check', source: 'alteration' }] })
    expect(r.all.some(a => a.short === 'Quality check pending')).toBe(true)
  })
  it('flags a repair that has not been sent 2 days before delivery', () => {
    const r = run([b], { AJ: [{ id: 'R', booking_id: null, dress_id: 'd2', status: 'pending_dispatch', source: 'damage' }] })
    expect(r.alerts[0].short).toBe('Repair not sent')
  })
  it('keeps every issue in "all" but shows one card per dress', () => {
    const r = run([b], { AJ: [{ id: 'J', booking_id: 'N', dress_id: 'd2', status: 'quality_check', source: 'alteration' }] })
    expect(r.all.length).toBeGreaterThanOrEqual(r.alerts.length); expect(new Set(r.alerts.map(a => a.dressId)).size).toBe(r.alerts.length)
  })
})
