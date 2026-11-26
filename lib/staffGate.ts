// A short-lived, signed note that "this person was checked and is active staff", kept in a cookie so the sign-in middleware does not have to
// ask the database "is this user staff?" on EVERY request (that was a database round trip on every page, image and API call).
//
//  - It holds the user id, the role and an expiry 60 seconds ahead, signed with HMAC-SHA-256 using the server key. A browser cannot make or
//    change one, and one made for another person is refused (the id must match the signed-in user).
//  - Only a positive result is remembered. Someone who is not staff is looked up every time, so a newly added person is let in at once.
//  - Cost of caching: if the owner switches a login off, the screens can stay reachable for up to 60 more seconds. The data itself is not:
//    the database's own access rules check "active" on every query, so a switched-off login reads and writes nothing.
// Web Crypto only, so it runs in the middleware's edge runtime.
export const GATE_COOKIE = 'sw_gate'
export const GATE_SECONDS = 60
const enc = new TextEncoder()

const hmacKey = (secret: string) => crypto.subtle.importKey('raw', enc.encode('swaasa-staff-gate:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string): Uint8Array | null => /^[0-9a-f]+$/.test(h) && h.length % 2 === 0 ? Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16)) : null

export async function signGate(secret: string, uid: string, role: string, now = Date.now()): Promise<string> {
  const body = `v1.${uid}.${role}.${Math.floor(now / 1000) + GATE_SECONDS}`
  return `${body}.${toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)))}`
}

/** The role in a valid, unexpired note made for exactly this user, otherwise null. */
export async function readGate(secret: string, value: string | undefined | null, uid: string, now = Date.now()): Promise<string | null> {
  if (!secret || !value) return null
  const parts = value.split('.')
  if (parts.length !== 5 || parts[0] !== 'v1' || parts[1] !== uid || !/^[a-z_]{3,20}$/.test(parts[2]) || !(Number(parts[3]) * 1000 > now)) return null
  const sig = fromHex(parts[4]); if (!sig) return null
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig as BufferSource, enc.encode(parts.slice(0, 4).join('.')))
  return ok ? parts[2] : null
}
