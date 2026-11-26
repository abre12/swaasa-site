import * as Sentry from '@sentry/nextjs'
import { IGNORED_ERRORS, scrubEvent } from '@/lib/sentryScrub'

// Error monitoring in the browser (public pages and the staff app). Does nothing until NEXT_PUBLIC_SENTRY_DSN is set.
// Session replay is deliberately NOT enabled: the staff screens show customer names, phone numbers and payments.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERRORS,
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i, /extensions\//i],
    beforeSend: scrubEvent,
  })
}
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
