'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { LOOKING_FOR } from '@/lib/viewing'

// Customer-facing request for a private viewing. The visitor leaves a name and number; the team is messaged on Telegram and calls back.
// whatsapp and phoneHref are optional: when the shop has no number set up, the form still works and the fallback lines are left out.
export default function ViewingRequest({ whatsapp, phoneHref }: { whatsapp?: string; phoneHref?: string }) {
  const [form, setForm] = useState({ name: '', phone: '', lookingFor: '', eventDate: '', visitDate: '', note: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState<{ name: string; phone: string } | null>(null)
  const [today, setToday] = useState('')
  useEffect(() => { setToday(new Date().toLocaleDateString('en-CA')) }, [])
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => { setForm(f => ({ ...f, [key]: event.target.value })); setMessage('') }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/viewing-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const payload = await response.json().catch(() => ({}))
      if (response.ok) setSent({ name: form.name.trim().split(/\s+/)[0], phone: form.phone.trim() })
      else setMessage(payload.error || 'We could not send your request. Please try again, or call or WhatsApp us.')
    } catch {
      setMessage('We could not send your request. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="ch-viewing" id="private-viewing" aria-labelledby="ch-viewing-title">
    <div className="ch-viewing-copy">
      <h3 id="ch-viewing-title">Plan a private viewing</h3>
      <p>Tell us a little about your celebration. We will call you to find a time that suits you and have a few looks ready to try.</p>
      {whatsapp && <a className="ch-viewing-wa" href={whatsapp} target="_blank" rel="noopener noreferrer">Prefer WhatsApp? Message us</a>}
      <small>We use your number only to arrange your visit.</small>
    </div>

    <div className="ch-viewing-panel">
      {sent ? <div className="ch-viewing-done" role="status">
        <b>Thank you{sent.name ? `, ${sent.name}` : ''}.</b>
        <p>Your request has reached us. We will call {sent.phone} to confirm a time for your visit.</p>
        {(whatsapp || phoneHref) && <p>Need something sooner? {phoneHref && <a href={phoneHref}>Call us</a>}{phoneHref && whatsapp && ' or '}{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">message us on WhatsApp</a>}.</p>}
      </div> : <form className="ch-viewing-form" onSubmit={submit}>
        <label>Your name
          <input value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} maxLength={80} />
        </label>
        <label>Mobile number
          <input value={form.phone} onChange={set('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required maxLength={20} />
        </label>
        <label>What are you looking for? <span>(optional)</span>
          <select value={form.lookingFor} onChange={set('lookingFor')}><option value="">Not sure yet</option>{LOOKING_FOR.map(o => <option key={o} value={o}>{o}</option>)}</select>
        </label>
        <label>Event date <span>(optional)</span>
          <input value={form.eventDate} onChange={set('eventDate')} type="date" min={today || undefined} />
        </label>
        <label>Preferred day to visit <span>(optional)</span>
          <input value={form.visitDate} onChange={set('visitDate')} type="date" min={today || undefined} />
        </label>
        <label className="ch-viewing-wide">Anything we should know? <span>(optional)</span>
          <textarea value={form.note} onChange={set('note')} rows={3} maxLength={500} placeholder="Size, colours you like, how many people are coming" />
        </label>
        {/* Hidden from people. A bot that fills every field fills this one too, and its request is dropped. */}
        <div className="ch-viewing-hp" aria-hidden="true"><label>Leave this empty<input value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" /></label></div>
        <button className="ch-button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Request a viewing'}</button>
        <p className="ch-viewing-message" role="alert">{message}</p>
      </form>}
    </div>
  </section>
}
