import * as Sentry from '@sentry/nextjs'
import { IGNORED_ERRORS, scrubEvent } from '@/lib/sentryScrub'

// Same settings for the edge runtime (the sign-in middleware runs there).
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
