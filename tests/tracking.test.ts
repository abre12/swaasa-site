import { describe, it, expect } from 'vitest'
import { currentStep, statusLabel, TRACKING_STEPS } from '@/lib/tracking'

const b = (bookingStatus: string, prepStatus = 'not_started') => ({ bookingStatus, prepStatus })

describe('customer tracker steps', () => {
  it('walks a booking through every step', () => {
    expect(currentStep(b('pending'))).toBe(0)
    expect(currentStep(b('confirmed'))).toBe(1)
    expect(currentStep(b('confirmed', 'alterations_pending'))).toBe(2)
    expect(currentStep(b('confirmed', 'cleaning_pending'))).toBe(2)
    expect(currentStep(b('confirmed', 'ready'))).toBe(3)
    expect(currentStep(b('out', 'delivered'))).toBe(4)
  })
  it('ticks every step, including Returned, once the dress is back', () => {
    expect(currentStep(b('returned', 'delivered'))).toBe(TRACKING_STEPS.length)
  })
  it('never shows a preparation stage for a request that is not confirmed', () => {
    expect(currentStep(b('pending', 'ready'))).toBe(0)
    expect(statusLabel(b('pending', 'ready'))).toBe('Request received')
    expect(statusLabel(b('pending', 'alterations_pending'))).toBe('Request received')
  })
  it('words each stage for the customer', () => {
    expect(statusLabel(b('confirmed'))).toBe('Booking confirmed')
    expect(statusLabel(b('confirmed', 'alterations_pending'))).toBe('Alterations in progress')
    expect(statusLabel(b('confirmed', 'cleaning_pending'))).toBe('Final preparation')
    expect(statusLabel(b('confirmed', 'ready'))).toBe('Ready for collection or delivery')
    expect(statusLabel(b('out', 'delivered'))).toBe('Rental in progress')
    expect(statusLabel(b('returned', 'delivered'))).toBe('Returned to Swaasa')
    expect(statusLabel(b('cancelled'))).toBe('Cancelled')
  })
  it('is not case sensitive', () => {
    expect(currentStep(b('CONFIRMED', 'READY'))).toBe(3)
  })
})
