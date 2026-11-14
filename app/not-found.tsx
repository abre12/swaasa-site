// N-4: a friendly page for a wrong address.
export default function NotFound() {
  return <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
    <div><h1 style={{ margin: '0 0 8px', fontSize: 22 }}>We could not find that page</h1>
      <p style={{ margin: '0 0 16px', color: 'var(--mut, #6b6169)' }}>The address may be wrong, or the dress is no longer listed.</p>
      <a className="btn" href="/" style={{ display: 'inline-block' }}>Go to the home page</a></div>
  </main>
}
