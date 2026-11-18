'use client'
import { useEffect } from 'react'

// N-4 / audit M6: a failure while drawing a public page shows this instead of a blank white screen.
// It is written for customers: no staff wording, a way back to the home page, and a way to reach the shop.
// (Staff screens have their own error page, in the admin folder.)
// NEXT_PUBLIC_STORE_PHONE is filled from STORE_PHONE in next.config.js.
const PHONE = (process.env.NEXT_PUBLIC_STORE_PHONE || '').trim()
const PHONE_HREF = PHONE ? `tel:${PHONE.replace(/[^\d+]/g, '')}` : ''
const INSTAGRAM = process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/swaasa_rentals/'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
    <div style={{ maxWidth: 440 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Sorry, something went wrong</h1>
      <p style={{ margin: '0 0 18px', color: 'var(--mut, #6b5f4e)', fontSize: 16 }}>We could not show this page just now. Please try again in a moment, or go back to our home page.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => reset()}>Try again</button>
        <a className="btn alt" href="/" style={{ display: 'inline-block', textDecoration: 'none' }}>Back to home page</a>
      </div>
      <p style={{ margin: '22px 0 0', color: 'var(--mut, #6b5f4e)', fontSize: 15 }}>
        {PHONE_HREF
          ? <>Need help with a booking? Call us on <a href={PHONE_HREF} style={{ fontWeight: 600 }}>{PHONE}</a>.</>
          : <>Need help with a booking? <a href={INSTAGRAM} rel="noopener" style={{ fontWeight: 600 }}>Message us on Instagram</a>.</>}
      </p>
      {error.digest && <p style={{ marginTop: 14, fontSize: 12, color: 'var(--mut, #6b5f4e)' }}>If you contact us, please quote this reference: {error.digest}</p>}
    </div>
  </main>
}
