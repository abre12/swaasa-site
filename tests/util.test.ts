import { describe, expect, it } from 'vitest'
import { addD, dbMsg, modeGroup, nDays, phoneKey, phoneValid, price } from '@/lib/util'

describe('dates', () => {
  it('adds days across a month end', () => expect(addD('2026-11-29', 3)).toBe('2026-12-02'))
  it('counts both the first and the last day', () => { expect(nDays('2026-11-13', '2026-11-13')).toBe(1); expect(nDays('2026-11-13', '2026-11-17')).toBe(5) })
})

describe('phone numbers (N-3)', () => {
  it('reduces Indian numbers to 10 digits whatever the prefix', () => {
    expect(phoneKey('+91 98765 43210')).toBe('9876543210'); expect(phoneKey('09876543210')).toBe('9876543210'); expect(phoneKey('98765-43210')).toBe('9876543210')
  })
  it('keeps international numbers whole', () => expect(phoneKey('+44 7700 900123')).toBe('+447700900123'))
  it('accepts real mobiles', () => { expect(phoneValid('9876543210')).toBe(true); expect(phoneValid('+44 7700 900123')).toBe(true) })
  it('rejects numbers that are not mobiles', () => { for (const bad of ['', '12345', '1234567890', '5876543210', 'abc', '+12']) expect(phoneValid(bad)).toBe(false) })
})

describe('payment mode groups', () => {
  it('groups the common spellings', () => { expect(modeGroup('cash')).toBe('Cash'); expect(modeGroup('GPay / UPI')).toBe('GPay / UPI'); expect(modeGroup('Google Pay')).toBe('GPay / UPI'); expect(modeGroup('Card')).toBe('Card') })
})

describe('price', () => {
  it('charges extra days beyond the included days', () => {
    const p = price({ included_days: 3, rent: 3000, extra_day_fee: 500 }, '2026-11-10', '2026-11-14')
    expect(p.n).toBe(5); expect(p.extraDays).toBe(2)
  })
})

describe('database messages', () => {
  it('turns database codes into plain words', () => {
    expect(dbMsg('BAD_PHONE')).toMatch(/valid mobile number/); expect(dbMsg('MODE_REQUIRED')).toMatch(/payment mode/); expect(dbMsg('FORBIDDEN')).toMatch(/not allowed/i)
  })
  it('says plainly when the database update is missing', () => expect(dbMsg('Could not find the function public.deliver_booking')).toMatch(/migration-v26/))
})
