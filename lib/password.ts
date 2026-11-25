// Password rules for staff logins, in one place so the server routes and the screens agree.
// The owner types a TEMPORARY password for a new person (or after a reset). The person must replace it the first time they sign in
// (middleware.ts + /account/password), so the owner never knows a password that stays in use.

export const MIN_PASSWORD = 10
export const MAX_PASSWORD = 72   // the limit Supabase (bcrypt) can store

// Passwords people actually choose first. Compared after lower-casing and removing everything that is not a letter or digit.
const COMMON = ['password', 'password1', 'password12', 'password123', 'passw0rd123', 'welcome123', 'welcome1234', 'qwerty1234', 'qwertyuiop', '1234567890',
  '12345678910', 'abcd123456', 'iloveyou123', 'admin12345', 'letmein123', 'swaasa', 'swaasa123', 'swaasa1234', 'swaasa12345', 'swaasa2026', 'swaasa@123']

/** Why a password is not acceptable, in words for the person typing it, or null if it is fine. `email` (optional) is used to refuse passwords built from the login name. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (pw.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`
  if (new Set(pw).size < 5) return 'Use a password with more different characters.'
  const flat = pw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (COMMON.some(c => flat === c || (flat.startsWith(c) && flat.length <= c.length + 2))) return 'That password is too easy to guess. Choose something less common.'
  // The login name as a whole ("sruthik") and each part of it ("sruthi" from sruthi.k): anything of 4+ letters must not appear in the password.
  const name = String(email || '').split('@')[0].toLowerCase()
  const parts = [name.replace(/[^a-z0-9]/g, ''), ...name.split(/[^a-z0-9]+/)].filter(t => t.length >= 4)
  if (parts.some(t => flat.includes(t))) return 'Do not use your email name inside the password.'
  return null
}

// No 0/O, 1/l/I: easy to read out or copy from a phone message.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A random temporary password for the owner to hand over (14 characters, always passes passwordProblem). Uses the browser / Node crypto, never Math.random. */
export function generatePassword(length = 14): string {
  const n = Math.max(MIN_PASSWORD, length), limit = 256 - (256 % ALPHABET.length)   // reject values that would bias the pick
  let out = ''
  while (out.length < n) {
    const bytes = new Uint8Array(n * 2); crypto.getRandomValues(bytes)
    for (const b of bytes) { if (b < limit && out.length < n) out += ALPHABET[b % ALPHABET.length] }
  }
  return passwordProblem(out) ? generatePassword(length) : out
}
