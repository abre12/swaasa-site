import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanMoneyText, hourIST, setClockOffset, todayIST } from '@/lib/util'
import { prepSteps } from '@/lib/countdown'
import { receiptHtml, receiptText, whatsappLink } from '@/lib/receipt'

describe('one money symbol (N-17)', () => {
  it('shows old "Rs" history lines with the rupee sign', () => {
    expect(cleanMoneyText('Delivered. Deposit Rs 5000 collected (Cash)')).toBe('Delivered. Deposit ₹5000 collected (Cash)')
    expect(cleanMoneyText('Late fee Rs. 500 and Rs1,500')).toBe('Late fee ₹500 and ₹1,500')
  })
  it('leaves other words and the rupee sign alone', () => {
    expect(cleanMoneyText('Hers 5 left; ₹200 paid')).toBe('Hers 5 left; ₹200 paid'); expect(cleanMoneyText(null)).toBe('')
  })
})

describe("server clock (OP-6): 'today' does not depend on the phone", () => {
  afterEach(() => { setClockOffset(0); vi.useRealTimers() })
  it('uses the phone clock when there is no offset', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T20:00:00Z'))      // 01:30 on 14 Nov in India
    expect(todayIST()).toBe('2026-11-14'); expect(hourIST()).toBe(1)
  })
  it('corrects a phone that is 2 hours fast', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T20:00:00Z'))
    setClockOffset(-2 * 3600e3)                                                   // the server is 2 hours behind this phone: really 23:30 on 13 Nov in India
    expect(todayIST()).toBe('2026-11-13'); expect(hourIST()).toBe(23)
  })
  it('ignores an absurd offset', () => { setClockOffset(1e15); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T05:00:00Z')); expect(todayIST()).toBe('2026-11-13') })
})

describe('preparation progress (SU-1)', () => {
  const b = { id: 'N', dress_id: 'd1', status: 'confirmed', start_date: '2026-11-20', created_at: '2026-11-01' }
  const ctx = (AJ: any[] = [], CR: any[] = []) => ({ B: [b], AJ, CR })
  const state = (c: any) => prepSteps(c, b).map(s => s.state).join(',')
  it('shows steps that do not apply as "not needed" and a clean dress as cleaned', () => expect(state(ctx())).toBe('na,na,na,done'))
  it('a job not yet sent to the tailor', () => expect(state(ctx([{ id: 'J', booking_id: 'N', status: 'pending_dispatch', measurements_pending: false }]))).toBe('done,todo,todo,done'))
  it('a job waiting for measurements', () => expect(state(ctx([{ id: 'J', booking_id: 'N', status: 'pending_dispatch', measurements_pending: true }]))).toBe('todo,todo,todo,done'))
  it('a job at the tailor', () => expect(state(ctx([{ id: 'J', booking_id: 'N', status: 'at_unit' }]))).toBe('done,doing,todo,done'))
  it('a job back and being checked, then finished', () => {
    expect(state(ctx([{ id: 'J', booking_id: 'N', status: 'quality_check' }]))).toBe('done,done,doing,done'); expect(state(ctx([{ id: 'J', booking_id: 'N', status: 'ready' }]))).toBe('done,done,done,done')
  })
  it('a dress at the dry cleaner', () => expect(state(ctx([], [{ id: 'C', dress_id: 'd1', status: 'sent' }]))).toBe('na,na,na,doing'))
  it('ignores cancelled jobs and repair jobs', () => expect(state(ctx([{ id: 'J', booking_id: 'N', status: 'cancelled' }, { id: 'R', booking_id: 'N', status: 'at_unit', source: 'damage' }]))).toBe('na,na,na,done'))
})

describe('receipt and agreement (BP-3)', () => {
  const b = { id: 'SW1', customer_name: 'Ganesh <b>', phone: '98765 43210', dress_code: 'D1', dress_name: 'Gown', start_date: '2026-11-13', end_date: '2026-11-17', rent: 8500, charges: 0, paid: 5000, deposit: 4250, deposit_held: 4250, discount: 0, status: 'confirmed' }
  const input = { b, payments: [{ kind: 'rent', amount: 5000, mode: 'Cash', created_at: '2026-11-07T10:00:00Z' }, { kind: 'deposit', amount: 4250, mode: 'Cash', created_at: '2026-11-07T10:00:00Z' }], dress: { extra_day_fee: 500 }, shop: { name: 'Swaasa', phone: '9999999999', address: 'MG Road' }, terms: '1. Be kind.\n2. Return on time.', issuedOn: '2026-11-13' }
  it('shows the booking, the balance and the terms', () => {
    const h = receiptHtml(input); expect(h).toContain('SW1'); expect(h).toContain('₹3,500'); expect(h).toContain('1. Be kind.'); expect(h).toContain('Late return fee'); expect(h).toContain('Customer signature')
  })
  it('does not let a customer name inject HTML', () => { const h = receiptHtml(input); expect(h).not.toContain('<b>Ganesh'); expect(h).toContain('Ganesh &lt;b&gt;') })
  it('the message has the same totals', () => { const t = receiptText(input); expect(t).toContain('Balance due ₹3,500'); expect(t).toContain('Booking SW1') })
  it('builds a WhatsApp link for an Indian and an international number', () => {
    expect(whatsappLink('98765 43210', 'hi')).toBe('https://wa.me/919876543210?text=hi'); expect(whatsappLink('+44 7700 900123', 'hi')).toBe('https://wa.me/447700900123?text=hi')
  })
})
