import { describe, expect, it } from 'vitest'
import { generatePassword, passwordProblem, MIN_PASSWORD } from '@/lib/password'
import { isPasswordChangePath, mustChangePassword } from '@/lib/passwordGate'

describe('passwordProblem', () => {
  it('accepts a sensible password', () => { expect(passwordProblem('Tulip-Harbour-48', 'sales1@swaasa.in')).toBeNull() })
  it('refuses short and very long passwords', () => {
    expect(passwordProblem('Short1!')).toMatch(/at least 10/)
    expect(passwordProblem('a1'.repeat(40))).toMatch(/at most 72/)
    expect(passwordProblem(undefined as any)).toMatch(/at least/)
  })
  it('refuses repeated characters and the usual first choices', () => {
    expect(passwordProblem('aaaaaaaaaaaa')).toMatch(/different characters/)
    expect(passwordProblem('Password123')).toMatch(/easy to guess/)
    expect(passwordProblem('Swaasa@1234')).toMatch(/easy to guess/)
    expect(passwordProblem('qwerty1234')).toMatch(/easy to guess/)
  })
  it('refuses a password built from the login name', () => {
    expect(passwordProblem('Sruthi!Rocks77', 'sruthi.k@swaasa.in')).toMatch(/email name/)
    expect(passwordProblem('Sruthi!Rocks77')).toBeNull()                    // no email given: nothing to compare
    expect(passwordProblem('abcd-Fresh-Mango-9', 'ab@x.in')).toBeNull()      // a very short name is not worth matching
  })
})

describe('generatePassword', () => {
  it('makes passwords that always pass the rules', () => {
    for (let i = 0; i < 200; i++) { const p = generatePassword(); expect(p.length).toBe(14); expect(passwordProblem(p)).toBeNull() }
  })
  it('never makes one shorter than the minimum, never repeats, avoids look-alike characters', () => {
    expect(generatePassword(4).length).toBe(MIN_PASSWORD)
    const seen = new Set(Array.from({ length: 50 }, () => generatePassword()))
    expect(seen.size).toBe(50)
    expect([...seen].join('')).not.toMatch(/[01OIl]/)
  })
})

describe('password gate helpers', () => {
  it('reads only the server-controlled flag', () => {
    expect(mustChangePassword({ app_metadata: { must_change_password: true } })).toBe(true)
    expect(mustChangePassword({ app_metadata: { must_change_password: false } })).toBe(false)
    expect(mustChangePassword({ app_metadata: {} })).toBe(false)
    expect(mustChangePassword({ app_metadata: { must_change_password: 'true' } })).toBe(false)
    expect(mustChangePassword(null)).toBe(false)
    expect(mustChangePassword(undefined)).toBe(false)
  })
  it('allows only the change-password page and its API while the flag is on', () => {
    expect(isPasswordChangePath('/account/password')).toBe(true)
    expect(isPasswordChangePath('/account/password/')).toBe(true)
    expect(isPasswordChangePath('/api/account/password')).toBe(true)
    for (const p of ['/admin', '/collection', '/api/staff', '/account', '/account/password/x', '/api/account']) expect(isPasswordChangePath(p)).toBe(false)
  })
})
