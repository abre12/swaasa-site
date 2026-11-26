// Reports an unexpected failure to Sentry, and always to the server log. Safe to call anywhere on the server: if Sentry is not configured
// (no NEXT_PUBLIC_SENTRY_DSN) it does nothing, and the SDK is loaded only when something actually fails, so normal requests never pay for it.
// Never pass customer details in `context`; use short labels such as the route name.
export function report(error: unknown, context: Record<string, string> = {}): void {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error(`[${context.where || 'server'}]`, err.message)
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  void import('@sentry/nextjs').then(S => S.captureException(err, { tags: context })).catch(() => { /* monitoring must never break a request */ })
}
