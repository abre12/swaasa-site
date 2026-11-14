'use client'
// N-4: last resort, used only if the page frame itself fails.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, padding: 24, textAlign: 'center' }}>
    <div style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
      <p>The page could not be shown. Please try again.</p>
      <button onClick={() => reset()} style={{ padding: '10px 18px', fontSize: 16 }}>Try again</button>
    </div>
  </body></html>
}
