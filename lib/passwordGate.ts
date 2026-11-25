// "Choose your own password" gate. The owner sets a temporary password for a new staff login or after a reset and marks the login with
// app_metadata.must_change_password = true. app_metadata can only be written with the server (service) key, so the person cannot clear it
// themselves from the browser; only /api/account/password clears it, after checking the new password.

export const CHANGE_PASSWORD_PAGE = '/account/password'
export const CHANGE_PASSWORD_API = '/api/account/password'

export const mustChangePassword = (user?: { app_metadata?: Record<string, unknown> | null } | null): boolean => user?.app_metadata?.must_change_password === true

/** True for the only two addresses a person who must change their password may still use. */
export const isPasswordChangePath = (path: string): boolean => path === CHANGE_PASSWORD_PAGE || path === CHANGE_PASSWORD_PAGE + '/' || path === CHANGE_PASSWORD_API
