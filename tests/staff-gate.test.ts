import { describe, expect, it } from 'vitest'
import { GATE_SECONDS, readGate, signGate } from '@/lib/staffGate'

const UID = '11111111-2222-3333-4444-555555555555', SECRET = 'service-key'

describe('staff gate cookie', () => {
  it('accepts a note it just made, for the same user, and returns the role', async () => {
    expect(await readGate(SECRET, await signGate(SECRET, UID, 'manager'), UID)).toBe('manager')
  })
  it('expires after a minute', async () => {
    const t = Date.now(), note = await signGate(SECRET, UID, 'owner', t)
    expect(await readGate(SECRET, note, UID, t + (GATE_SECONDS - 1) * 1000)).toBe('owner')
    expect(await readGate(SECRET, note, UID, t + (GATE_SECONDS + 1) * 1000)).toBeNull()
  })
  it('refuses a note made for another person, a changed role or expiry, a wrong key, and rubbish', async () => {
    const note = await signGate(SECRET, UID, 'preparation')
    expect(await readGate(SECRET, note, 'someone-else')).toBeNull()
    expect(await readGate(SECRET, note.replace('.preparation.', '.owner.'), UID)).toBeNull()
    const [v, id, role, exp, sig] = note.split('.'); expect(await readGate(SECRET, [v, id, role, String(Number(exp) + 3600), sig].join('.'), UID)).toBeNull()
    expect(await readGate('other-key', note, UID)).toBeNull()
    for (const bad of ['', 'v1', 'a.b.c.d.e', note + 'x', note.slice(0, -2), undefined, null]) expect(await readGate(SECRET, bad as any, UID)).toBeNull()
    expect(await readGate('', note, UID)).toBeNull()
  })
})
