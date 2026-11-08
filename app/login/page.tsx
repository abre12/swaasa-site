'use client'
import { useState } from 'react'
import { supa } from '@/lib/supabase/client'
export default function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [busy, setBusy] = useState(false)
  const [err, setErr] = useState(typeof window !== 'undefined' && location.search.includes('denied') ? 'This login does not have access to the site.' : '')
  async function go(ev?: React.FormEvent) {
    ev?.preventDefault(); if (busy) return
    if (!email.trim() || !pw) return setErr('Enter your work email and password.')
    setBusy(true); setErr('')
    const { error } = await supa().auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) { setBusy(false); setErr('Incorrect email or password.') } else location.replace('/admin')   // signing in always opens the admin dashboard
  }
  return <main className="lg">
    <header className="lg-top"><span className="lg-brand"><img src="/logo-mark.png" alt="" />SWAASA</span><span className="lg-tag">Staff access only</span></header>
    <div className="lg-body">
      <section className="lg-hero" aria-label="Swaasa staff workspace"><div><span className="lg-eyebrow">Swaasa · Staff workspace</span>
        <h1>Every look, ready for its next occasion.</h1><p>Browse the collection, check availability and create rental bookings for your customers.</p></div></section>
      <section className="lg-side"><form className="lg-card" onSubmit={go} noValidate>
        <h2>Staff sign in</h2><p className="lg-sub">Sign in to open your dashboard.</p>
        <label>Work email<input type="email" autoComplete="username" placeholder="name@swaasa.in" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" placeholder="Enter your password" value={pw} onChange={e => setPw(e.target.value)} /></label>
        {err && <p className="lg-err" role="alert">{err}</p>}
        <button className="lg-btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to workspace →'}</button>
        <p className="lg-note"><b>For staff use only.</b> Collection and customer booking details are available after sign in.</p>
      </form></section>
    </div>
  </main>
}
