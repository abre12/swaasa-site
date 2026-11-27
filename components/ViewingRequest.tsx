'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { CALL_TIMES, LOOKING_FOR } from '@/lib/viewing'
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile'
import { trackEvent } from '@/lib/track'

// Customer-facing request to visit the studio or to be called back. The visitor leaves a name and number; the team is messaged on Telegram and calls.
// whatsapp and phoneHref are optional: when the shop has no number set up, the form still works and the fallback lines are left out.
type Kind = 'viewing' | 'callback'
type Form = { kind: Kind; name: string; phone: string; lookingFor: string; eventDate: string; visitDate: string; callTime: string; note: string; website: string }

const MODES: { id: Kind; title: string; note: string }[] = [
  { id: 'viewing', title: 'Visit the studio', note: '' },
  { id: 'callback', title: 'Call me back', note: '' },
]

export default function ViewingRequest({ whatsapp, phoneHref }: { whatsapp?: string; phoneHref?: string }) {
  const [form, setForm] = useState<Form>({ kind: 'viewing', name: '', phone: '', lookingFor: '', eventDate: '', visitDate: '', callTime: 'Any time', note: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState<{ name: string; phone: string; kind: Kind; callTime: string } | null>(null)
  const [today, setToday] = useState('')
  useEffect(() => { setToday(new Date().toLocaleDateString('en-CA')) }, [])
  // Bot check: the button waits for the invisible check to finish. If it never does (an ad blocker, a very slow connection), it unlocks after
  // eight seconds and the server decides, so a real customer is never stuck behind a widget that did not load.
  const [token, setToken] = useState(''), [tsKey, setTsKey] = useState(0), [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || token) { setGaveUp(false); return }
    const t = setTimeout(() => setGaveUp(true), 8000); return () => clearTimeout(t)
  }, [token, tsKey])
  const checking = !!TURNSTILE_SITE_KEY && !token && !gaveUp
  const set = (key: keyof Form) => (event: { target: { value: string } }) => { setForm(f => ({ ...f, [key]: event.target.value })); setMessage('') }
  const callback = form.kind === 'callback'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/viewing-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(callback ? { ...form, visitDate: '' } : form), turnstileToken: token }) })
      const payload = await response.json().catch(() => ({}))
      if (response.ok) { setSent({ name: form.name.trim().split(/\s+/)[0], phone: form.phone.trim(), kind: form.kind, callTime: form.callTime }); trackEvent('enquiry_sent', { kind: form.kind }) }
      else setMessage(payload.error || 'We could not send your request. Please try again, or call or WhatsApp us.')
    } catch {
      setMessage('We could not send your request. Please check your connection and try again.')
    } finally {
      setBusy(false); setTsKey(k => k + 1)      // a bot-check token works once: get a fresh one for any next try
    }
  }

  const when = sent && sent.callTime !== 'Any time' ? ` in the ${sent.callTime.toLowerCase()}` : ''
  return <section className="ch-viewing" id="plan-a-visit" aria-labelledby="ch-viewing-title">
    <div className="ch-viewing-head">
      <div>
        <h3 id="ch-viewing-title">Plan a <em>visit.</em></h3>
        <p className="ch-viewing-lead">Tell us a little and we will call you to fix a time.</p>
      </div>
      {(whatsapp || phoneHref) && <p className="ch-viewing-alt">Prefer to talk now? {phoneHref && <a href={phoneHref}>Call us</a>}{phoneHref && whatsapp && ' or '}{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp us</a>}</p>}
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
            <b>{m.title}</b>
          </label>)}
        </fieldset>
        <label className="vf-a vf-n"><span className="ch-vf-l">Your name</span>
          <input value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} maxLength={80} />
        </label>
        <label className="vf-a vf-n"><span className="ch-vf-l">Mobile number</span>
          <input value={form.phone} onChange={set('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required maxLength={20} />
        </label>
        <details className="ch-viewing-details ch-viewing-wide">
          <summary>Share a few details <i>(optional)</i></summary>
          <div className="ch-viewing-extra">
            <label><span className="ch-vf-l">Looking for</span>
              <select value={form.lookingFor} onChange={set('lookingFor')}><option value="">Not sure yet</option>{LOOKING_FOR.map(o => <option key={o} value={o}>{o}</option>)}</select>
            </label>
            <label><span className="ch-vf-l">Event date</span>
              <input value={form.eventDate} onChange={set('eventDate')} type="date" min={today || undefined} />
            </label>
            {!callback && <label><span className="ch-vf-l">Day to visit</span>
              <input value={form.visitDate} onChange={set('visitDate')} type="date" min={today || undefined} />
            </label>}
            <label><span className="ch-vf-l">When to call</span>
              <select value={form.callTime} onChange={set('callTime')}>{CALL_TIMES.map(o => <option key={o} value={o}>{o}</option>)}</select>
            </label>
            <label className="ch-viewing-wide"><span className="ch-vf-l">Anything else we should know?</span>
              <textarea value={form.note} onChange={set('note')} rows={2} maxLength={500} placeholder={callback ? 'Styles you have in mind, dates, or any questions' : 'Sizes, colours you like, or who is coming with you'} />
            </label>
          </div>
        </details>
        {/* Hidden from people. A bot that fills every field fills this one too, and its request is dropped. */}
        <div className="ch-viewing-hp" aria-hidden="true"><label>Leave this empty<input value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" /></label></div>
        <Turnstile onToken={setToken} resetKey={tsKey} />
        <div className="ch-viewing-foot ch-viewing-wide">
          <button className="ch-button" type="submit" disabled={busy || checking}>{busy ? 'Sending…' : checking ? 'Checking…' : callback ? 'Request a call' : 'Request a visit'}</button>
          <small>We use your number only to arrange your visit or call.</small>
        </div>
        <p className="ch-viewing-message" role="alert">{message}</p>
      </form>}
    </div>
  </section>
}
