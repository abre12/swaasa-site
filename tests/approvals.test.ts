import { describe, expect, it } from 'vitest'
import { approvalDetail, approvalName, approvalRef } from '@/lib/approvals'

describe('approval wording (SA-3)', () => {
  it('names the cleaning-gap override', () => expect(approvalName('gap_override')).toBe('Cleaning-Gap Override'))
  it('describes it with the dress and dates', () => {
    const t = approvalDetail({ action_type: 'gap_override', request_details: { dress_code: 'D1', start: '2026-11-20', end: '2026-11-22' } })
    expect(t).toContain('D1'); expect(t).toContain('2026-11-20')
  })
  it('shows the dress when there is no booking yet', () => expect(approvalRef({ booking_id: null, request_details: { dress_code: 'D1', dress_name: 'Gown' } })).toBe('D1 · Gown'))
  it('shows the booking and customer when there is one', () => expect(approvalRef({ booking_id: 'SW1' }, 'Ganesh')).toBe('SW1 · Ganesh'))
})
