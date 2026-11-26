import * as Sentry from '@sentry/nextjs'
import { IGNORED_ERRORS, scrubEvent } from '@/lib/sentryScrub'

// Error monitoring on the server (pages, route handlers, middleware's Node parts). Does nothing until NEXT_PUBLIC_SENTRY_DSN is set.
// No performance tracing, no session replay, no personal data: see lib/sentryScrub.ts.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERRORS,
    beforeSend: scrubEvent,
  })
}
