'use client'
import { useEffect, useState } from 'react'
import { supa } from '@/lib/supabase/client'
export default function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'pw' | 'code'>('pw'), [code, setCode] = useState('')
  useEffect(() => { if (location.search.includes('mfa=1')) setStep('code') }, [])   // signed in with the password, still waiting for the 6-digit code
  const [err, setErr] = useState(typeof window !== 'undefined' && location.search.includes('denied') ? 'This login does not have access to the site.' : '')
  async function go(ev?: React.FormEvent) {
    ev?.preventDefault(); if (busy) return
    if (!email.trim() || !pw) return setErr('Enter your work email and password.')
    setBusy(true); setErr('')
    const { error } = await supa().auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) { setBusy(false); setErr('Incorrect email or password.'); return }
    const { data: a } = await supa().auth.mfa.getAuthenticatorAssuranceLevel()
    if (a?.nextLevel === 'aal2' && a.currentLevel !== 'aal2') { setBusy(false); setStep('code'); return }   // two-step login is on for this person
    location.replace('/admin')   // signing in always opens the admin dashboard
  }
  async function verify(ev?: React.FormEvent) {
    ev?.preventDefault(); if (busy) return
    if (!/^\d{6}$/.test(code.trim())) return setErr('Enter the 6-digit code from your authenticator app.')
    setBusy(true); setErr('')
    const sb = supa(), { data: f } = await sb.auth.mfa.listFactors(), factor = f?.totp?.[0]
    if (!factor) { setBusy(false); return setErr('No authenticator is set up for this login. Sign in again.') }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
    if (error) { setBusy(false); setCode(''); setErr('That code is not right or has expired. Enter the new code shown in your app.') } else location.replace('/admin')
  }
  async function other() { await supa().auth.signOut(); setStep('pw'); setCode(''); setPw(''); setErr(''); history.replaceState(null, '', '/login') }
  return <main className="lg">
    <header className="lg-top"><span className="lg-brand"><img src="/logo-mark.png" alt="" />SWAASA</span><span className="lg-tag">Staff access only</span></header>
    <div className="lg-body">
      <section className="lg-hero" aria-label="Swaasa staff workspace"><div><span className="lg-eyebrow">Swaasa · Staff workspace</span>
        <h1>Every look, ready for its next occasion.</h1><p>Browse the collection, check availability and create rental bookings for your customers.</p></div></section>
      <section className="lg-side">{step === 'code' ? <form className="lg-card" onSubmit={verify} noValidate>
        <h2>Two-step verification</h2><p className="lg-sub">Open your authenticator app and enter the 6-digit code for Swaasa.</p>
        <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></label>
        {err && <p className="lg-err" role="alert">{err}</p>}
        <button className="lg-btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Verify and continue →'}</button>
        <p className="lg-note"><button type="button" className="textlink" onClick={other}>Use a different account</button></p>
      </form> : <form className="lg-card" onSubmit={go} noValidate>
        <h2>Staff sign in</h2><p className="lg-sub">Sign in to open your dashboard.</p>
        <label>Work email<input type="email" autoComplete="username" placeholder="name@swaasa.in" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" placeholder="Enter your password" value={pw} onChange={e => setPw(e.target.value)} /></label>
        {err && <p className="lg-err" role="alert">{err}</p>}
        <button className="lg-btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to workspace →'}</button>
        <p className="lg-note"><b>For staff use only.</b> Collection and customer booking details are available after sign in.</p>
      </form>}</section>
    </div>
  </main>
}
