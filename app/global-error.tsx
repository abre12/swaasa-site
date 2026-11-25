'use client'
// N-4 / audit M6: last resort, used only if the page frame itself fails. Written for customers.
// The page's own styles may not be available here, so everything is styled inline.
const PHONE = (process.env.NEXT_PUBLIC_STORE_PHONE || '').trim()
const PHONE_HREF = PHONE ? `tel:${PHONE.replace(/[^\d+]/g, '')}` : ''
const INSTAGRAM = process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/swaasa_rentals/'
const BTN = { padding: '12px 20px', fontSize: 16, borderRadius: 6, cursor: 'pointer', textDecoration: 'none', display: 'inline-block', fontFamily: 'inherit' } as const

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui, sans-serif', color: '#2b241c', background: '#faf6ef', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, padding: 24, textAlign: 'center' }}>
    <div style={{ maxWidth: 440 }}>
      <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Sorry, something went wrong</h1>
      <p style={{ margin: '0 0 18px', color: '#6b5f4e', fontSize: 16 }}>We could not show this page just now. Please try again in a moment, or go back to our home page.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => reset()} style={{ ...BTN, background: '#2b241c', color: '#faf6ef', border: '1px solid #2b241c' }}>Try again</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load on purpose: it starts the site clean after an error */}
        <a href="/" style={{ ...BTN, background: 'transparent', color: '#2b241c', border: '1px solid #2b241c' }}>Back to home page</a>
      </div>
      <p style={{ margin: '22px 0 0', color: '#6b5f4e', fontSize: 15 }}>
        {PHONE_HREF
          ? <>Need help with a booking? Call us on <a href={PHONE_HREF} style={{ color: '#2b241c', fontWeight: 600 }}>{PHONE}</a>.</>
          : <>Need help with a booking? <a href={INSTAGRAM} rel="noopener" style={{ color: '#2b241c', fontWeight: 600 }}>Message us on Instagram</a>.</>}
      </p>
    </div>
  </body></html>
}
