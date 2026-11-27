'use client'

import { useState, type FormEvent } from 'react'
import { currentStep, statusLabel, TRACKING_STEPS } from '@/lib/tracking'

type BookingResult = {
  bookingId: string
  bookingStatus: string
  prepStatus: string
  startDate: string
  endDate: string
  eventDate: string | null
  eventType: string | null
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CustomerBookingTracker() {
  const [bookingId, setBookingId] = useState('')
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<BookingResult | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    setMessage('')
    setBusy(true)
    try {
      const response = await fetch('/api/customer-booking/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, phone }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 404) setMessage('We could not find a booking with those details. Check your booking ID and mobile number and try again.')
      else if (response.status === 429) setMessage('There have been several attempts. Please wait a little and try again.')
      else if (!response.ok) setMessage(payload.error || 'We could not check your booking right now. Please try again shortly.')
      else setResult(payload as BookingResult)
    } catch {
      setMessage('We could not check your booking right now. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const isCancelled = result?.bookingStatus.toLowerCase() === 'cancelled'
  const activeStep = result ? currentStep(result) : -1

  return <section className="ch-tracking" aria-labelledby="ch-tracking-title">
    <div className="ch-tracking-copy">
      <p className="ch-kicker">ALREADY BOOKED?</p>
      <h2 id="ch-tracking-title">Track your <em>booking.</em></h2>
      <p>Enter your booking ID and mobile number.</p>
      <small>We show only the progress and dates of the matching booking.</small>
    </div>

    <div className="ch-tracking-panel">
      <form className="ch-tracking-form" onSubmit={lookup}>
        <label>Booking ID
          <input value={bookingId} onChange={event => { setBookingId(event.target.value); setResult(null); setMessage('') }} placeholder="e.g. SW1A2B3C4" autoComplete="off" required maxLength={32} />
        </label>
        <label>Mobile number used for booking
          <input value={phone} onChange={event => { setPhone(event.target.value); setResult(null); setMessage('') }} placeholder="10-digit mobile number" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} />
        </label>
        <button className="ch-button" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Track booking'} <span aria-hidden="true">↗</span></button>
      </form>
      <p className="ch-tracking-message" aria-live="polite">{message}</p>

      {result && <div className="ch-tracking-result" aria-live="polite">
        <div className="ch-tracking-result-head"><span>BOOKING {result.bookingId}</span><b className={isCancelled ? 'cancelled' : ''}>{statusLabel(result)}</b></div>
        {!isCancelled && <ol className="ch-tracking-steps" aria-label="Booking progress">{TRACKING_STEPS.map((step, index) => <li key={step} className={index < activeStep ? 'done' : index === activeStep ? 'current' : ''}><span>{index < activeStep ? '✓' : index + 1}</span><small>{step}</small></li>)}</ol>}
        <div className="ch-tracking-dates">
          {result.eventDate && <div><small>Event date</small><b>{formatDate(result.eventDate)}{result.eventType ? ` · ${result.eventType}` : ''}</b></div>}
          <div><small>Rental period</small><b>{formatDate(result.startDate)} – {formatDate(result.endDate)}</b></div>
        </div>
      </div>}
    </div>
  </section>
}
