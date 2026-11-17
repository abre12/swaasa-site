// Two-step login policy (audit H1). One place decides who must use it, so the middleware, the admin page and the login page agree.
//
// Supabase reports two levels for a signed-in session:
//   currentLevel: 'aal1' = password only, 'aal2' = password AND the 6-digit code were checked in this session.
//   nextLevel:    'aal2' only when the person already has a verified authenticator; otherwise 'aal1'.
// Before this change the site only asked for the code when nextLevel was 'aal2', so anyone who had never switched
// two-step on got in with the password alone. Owner and manager logins now must enrol before they can use the site.
// The preparation role is left optional: it can only see the alteration list and limited booking details.
export const MFA_REQUIRED_ROLES: readonly string[] = ['owner', 'manager']

export const mfaRequired = (role?: string | null): boolean => !!role && MFA_REQUIRED_ROLES.includes(role)

type Aal = { currentLevel?: string | null; nextLevel?: string | null } | null | undefined

// 'ok'         let them in
// 'need_code'  they have an authenticator but have not entered the code in this session: ask for it
// 'need_setup' their role requires two-step login and they have not set it up yet: send them to enrol
export type MfaGate = 'ok' | 'need_code' | 'need_setup'

export function mfaGate(role: string | null | undefined, aal: Aal): MfaGate {
  const required = mfaRequired(role)
  // If Supabase could not tell us the level, a required role fails closed (asks for the code) instead of waving them through.
  if (!aal) return required ? 'need_code' : 'ok'
  if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return 'need_code'
  if (required && aal.nextLevel !== 'aal2') return 'need_setup'
  return 'ok'
}
