'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { CALL_TIMES, LOOKING_FOR } from '@/lib/viewing'

// Customer-facing request to visit the studio or to be called back. The visitor leaves a name and number; the team is messaged on Telegram and calls.
// whatsapp and phoneHref are optional: when the shop has no number set up, the form still works and the fallback lines are left out.
type Kind = 'viewing' | 'callback'
type Form = { kind: Kind; name: string; phone: string; lookingFor: string; eventDate: string; visitDate: string; callTime: string; note: string; website: string }

const MODES: { id: Kind; title: string; note: string }[] = [
  { id: 'viewing', title: 'Visit the studio', note: 'Choose a day that suits you' },
  { id: 'callback', title: 'Call me back', note: 'Talk it through first' },
]
const STEPS = [
  { n: '01', title: 'We call you', note: 'To talk through what you have in mind.' },
  { n: '02', title: 'Fix a time', note: 'A day that suits you and your family.' },
  { n: '03', title: 'Try a few looks', note: 'We keep some ready for your visit.' },
]

export default function ViewingRequest({ whatsapp, phoneHref }: { whatsapp?: string; phoneHref?: string }) {
  const [form, setForm] = useState<Form>({ kind: 'viewing', name: '', phone: '', lookingFor: '', eventDate: '', visitDate: '', callTime: 'Any time', note: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState<{ name: string; phone: string; kind: Kind; callTime: string } | null>(null)
  const [today, setToday] = useState('')
  useEffect(() => { setToday(new Date().toLocaleDateString('en-CA')) }, [])
  const set = (key: keyof Form) => (event: { target: { value: string } }) => { setForm(f => ({ ...f, [key]: event.target.value })); setMessage('') }
  const callback = form.kind === 'callback'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/viewing-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(callback ? { ...form, visitDate: '' } : form) })
      const payload = await response.json().catch(() => ({}))
      if (response.ok) setSent({ name: form.name.trim().split(/\s+/)[0], phone: form.phone.trim(), kind: form.kind, callTime: form.callTime })
      else setMessage(payload.error || 'We could not send your request. Please try again, or call or WhatsApp us.')
    } catch {
      setMessage('We could not send your request. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const when = sent && sent.callTime !== 'Any time' ? ` in the ${sent.callTime.toLowerCase()}` : ''
  return <section className="ch-viewing" id="private-viewing" aria-labelledby="ch-viewing-title">
    <div className="ch-viewing-copy">
      <p className="ch-kicker">PRIVATE STUDIO VIEWINGS</p>
      <h3 id="ch-viewing-title">Plan a <em>private viewing.</em></h3>
      <p className="ch-viewing-lead">Tell us a little about your celebration. Choose a day to visit, or simply ask us to call you.</p>
      <ol className="ch-viewing-steps" aria-label="What happens next">
        {STEPS.map(s => <li key={s.n}><span>{s.n}</span><div><b>{s.title}</b><small>{s.note}</small></div></li>)}
      </ol>
      {(whatsapp || phoneHref) && <p className="ch-viewing-alt">Prefer to reach us now? {phoneHref && <a href={phoneHref}>Call us</a>}{phoneHref && whatsapp && ' or '}{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">message us on WhatsApp</a>}</p>}
      <small>We use your number only to arrange your visit or call.</small>
    </div>

    <div className="ch-viewing-panel">
      {sent ? <div className="ch-viewing-done" role="status">
        <b>Thank you{sent.name ? `, ${sent.name}` : ''}.</b>
        {sent.kind === 'callback'
          ? <p>Your request has reached us. We will call {sent.phone}{when}.</p>
          : <p>Your request has reached us. We will call {sent.phone}{when} to confirm a time for your visit.</p>}
        {(whatsapp || phoneHref) && <p>Need something sooner? {phoneHref && <a href={phoneHref}>Call us</a>}{phoneHref && whatsapp && ' or '}{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">message us on WhatsApp</a>}.</p>}
      </div> : <form className="ch-viewing-form" onSubmit={submit}>
        <fieldset className="ch-vf-mode ch-viewing-wide">
          <legend>How would you like to start?</legend>
          {MODES.map(m => <label key={m.id} className={'ch-vf-opt' + (form.kind === m.id ? ' on' : '')}>
            <input type="radio" name="kind" value={m.id} checked={form.kind === m.id} onChange={set('kind')} />
            <b>{m.title}</b><small>{m.note}</small>
          </label>)}
        </fieldset>
        <label><span className="ch-vf-l">Your name</span>
          <input value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} maxLength={80} />
        </label>
        <label><span className="ch-vf-l">Mobile number</span>
          <input value={form.phone} onChange={set('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required maxLength={20} />
        </label>
        <label><span className="ch-vf-l">What are you looking for? <i>(optional)</i></span>
          <select value={form.lookingFor} onChange={set('lookingFor')}><option value="">Not sure yet</option>{LOOKING_FOR.map(o => <option key={o} value={o}>{o}</option>)}</select>
        </label>
        <label><span className="ch-vf-l">Event date <i>(optional)</i></span>
          <input value={form.eventDate} onChange={set('eventDate')} type="date" min={today || undefined} />
        </label>
        {!callback && <label><span className="ch-vf-l">Preferred day to visit <i>(optional)</i></span>
          <input value={form.visitDate} onChange={set('visitDate')} type="date" min={today || undefined} />
        </label>}
        <label className={callback ? 'ch-viewing-wide' : undefined}><span className="ch-vf-l">Best time for our call <i>(optional)</i></span>
          <select value={form.callTime} onChange={set('callTime')}>{CALL_TIMES.map(o => <option key={o} value={o}>{o}</option>)}</select>
        </label>
        <label className="ch-viewing-wide"><span className="ch-vf-l">{callback ? 'What would you like to talk about?' : 'Anything we should know?'} <i>(optional)</i></span>
          <textarea value={form.note} onChange={set('note')} rows={3} maxLength={500} placeholder={callback ? 'Styles you have in mind, budget, dates, any questions' : 'Size, colours you like, how many people are coming'} />
        </label>
        {/* Hidden from people. A bot that fills every field fills this one too, and its request is dropped. */}
        <div className="ch-viewing-hp" aria-hidden="true"><label>Leave this empty<input value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" /></label></div>
        <button className="ch-button" type="submit" disabled={busy}>{busy ? 'Sending…' : callback ? 'Request a call' : 'Request a viewing'}</button>
        <p className="ch-viewing-message" role="alert">{message}</p>
      </form>}
    </div>
  </section>
}
