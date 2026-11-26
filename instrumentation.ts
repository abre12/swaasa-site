import * as Sentry from '@sentry/nextjs'

// Next.js calls register() once when a server starts. This loads the matching Sentry settings for the runtime it is in.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

// Errors thrown while a server page or route handler runs (including inside nested server components) are reported from here.
export const onRequestError = Sentry.captureRequestError
