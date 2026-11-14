// N-4: shown while a page is being prepared, instead of a blank screen.
export default function Loading() {
  return <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'var(--mut, #6b6169)' }} aria-busy="true"><p>Loading…</p></main>
}
