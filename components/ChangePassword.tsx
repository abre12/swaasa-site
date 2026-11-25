'use client'
import { useState, type FormEvent } from 'react'
import { passwordProblem } from '@/lib/password'

// Shown (1) automatically the first time someone signs in with a password the owner typed for them, and (2) whenever a signed-in person
// opens /account/password to change their own. While it is required the rest of the site is closed (middleware.ts).
export default function ChangePassword({ forced, email }: { forced: boolean; email: string }) {
  const [pw, setPw] = useState(''), [again, setAgain] = useState(''), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  async function submit(ev: FormEvent) {
    ev.preventDefault(); if (busy) return
    const problem = passwordProblem(pw, email)
    if (problem) return setErr(problem)
    if (pw !== again) return setErr('The two passwords are not the same.')
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setBusy(false); return setErr(j.error || 'Could not change the password. Please try again.') }
      location.replace('/admin')
    } catch { setBusy(false); setErr('Could not reach the server. Check your connection and try again.') }
  }
  return <main style={{ display: 'grid', placeItems: 'center', padding: '32px 16px' }}>
    <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 400 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>{forced ? 'Choose your own password' : 'Change your password'}</h1>
      <p className="mut" style={{ margin: 0 }}>{forced
        ? 'You signed in with a temporary password. Choose a new one that only you know before you continue.'
        : 'Choose a new password for your login.'}</p>
      <label>New password<input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} aria-describedby="pw-help" autoFocus /></label>
      <label>Type it again<input type={show ? 'text' : 'password'} autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} /></label>
      <p id="pw-help" className="mut" style={{ margin: 0, fontSize: 13 }}>At least 10 characters. Use something others cannot guess, and not your email name. A password manager can make one for you.</p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} style={{ width: 'auto' }} />Show the password</label>
      {err && <p role="alert" style={{ margin: 0, color: '#b42318' }}>{err}</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : forced ? 'Save and continue' : 'Save password'}</button>
      {!forced && <a href="/admin" className="mut">Cancel</a>}
    </form>
  </main>
}
