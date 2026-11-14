'use client'
import { useEffect } from 'react'
// N-4: if the admin screen fails, the person sees this, not a blank page. Saved work is in the database and is not affected.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
    <div style={{ maxWidth: 440 }}><h1 style={{ margin: '0 0 8px', fontSize: 22 }}>The admin screen hit a problem</h1>
      <p style={{ margin: '0 0 16px', color: 'var(--mut, #6b6169)' }}>Anything you had saved is safe. Reload to carry on. If it happens again, note what you were doing and tell the owner.</p>
      <button className="btn" onClick={() => reset()}>Reload the screen</button>
      {error.digest && <p style={{ marginTop: 14, fontSize: 12, color: 'var(--mut, #6b6169)' }}>Reference: {error.digest}</p>}</div></main>
}
