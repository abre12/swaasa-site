'use client'

import { useRef, useState, type FormEvent } from 'react'

export default function BookingIdEntry() {
  const [open, setOpen] = useState(false)
  const [bookingId, setBookingId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function toggle() {
    if (!open) window.setTimeout(() => inputRef.current?.focus(), 0)
    setOpen(!open)
  }

  function continueToTracker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = bookingId.trim()
    if (!value) return
    window.dispatchEvent(new CustomEvent('swaasa:prefill-booking', { detail: { bookingId: value } }))
    setOpen(false)
    document.getElementById('track-booking')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return <div className={'rn-track-entry' + (open ? ' open' : '')}>
    <button className="rn-track-toggle" type="button" aria-expanded={open} aria-controls="rn-track-entry-form" onClick={toggle}>
      Track your booking
    </button>
    {open && <form className="rn-track-entry-form" id="rn-track-entry-form" onSubmit={continueToTracker}>
      <label className="sr-only" htmlFor="rn-track-booking-id">Booking ID</label>
      <input ref={inputRef} id="rn-track-booking-id" value={bookingId} onChange={event => setBookingId(event.target.value)} placeholder="Enter your booking ID" autoComplete="off" maxLength={32} required />
      <button className="ch-button" type="submit">Continue <span aria-hidden="true">↗</span></button>
      <small>We’ll ask for the mobile number used for the booking next.</small>
    </form>}
  </div>
}
