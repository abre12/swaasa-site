'use client'
import { useEffect } from 'react'

// N-4: a failure while drawing a page shows this instead of a blank white screen.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
    <div style={{ maxWidth: 420 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Something went wrong</h1>
      <p style={{ margin: '0 0 16px', color: 'var(--mut, #6b6169)' }}>This page could not be shown. Nothing you saved has been lost. Please try again. If it keeps happening, tell the owner what you were doing.</p>
      <button className="btn" onClick={() => reset()}>Try again</button>{' '}
      <a className="btn alt" href="/admin" style={{ display: 'inline-block' }}>Go to the start</a>
      {error.digest && <p style={{ marginTop: 14, fontSize: 12, color: 'var(--mut, #6b6169)' }}>Reference: {error.digest}</p>}
    </div>
  </main>
}
