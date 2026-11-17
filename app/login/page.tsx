'use client'
import { useEffect, useRef, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import LoginVideo from '@/components/LoginVideo'
export default function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'pw' | 'code' | 'enroll'>('pw'), [code, setCode] = useState(''), [show, setShow] = useState(false), [forgot, setForgot] = useState(false)
  const [factorId, setFactorId] = useState(''), [qr, setQr] = useState(''), [secret, setSecret] = useState(''), starting = useRef(false)
  useEffect(() => {
    if (location.search.includes('mfa=1')) setStep('code')   // signed in with the password, still waiting for the 6-digit code
    else if (location.search.includes('mfa=setup')) { setStep('enroll'); beginEnroll() }   // owner and manager logins must set up two-step login before they can use the site
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
  // First-time setup of two-step login (audit H1). Allowed with the password session alone because it is the person's first authenticator.
  async function beginEnroll() {
    if (starting.current) return; starting.current = true
    const sb = supa(), { data: u } = await sb.auth.getUser()
    if (!u.user) { starting.current = false; setStep('pw'); return }   // not signed in: the password form is the right place to start
    const { data: a } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    if (a?.currentLevel === 'aal2') { location.replace('/admin'); return }
    const { data: f } = await sb.auth.mfa.listFactors()
    if (f?.totp?.length) { starting.current = false; setStep('code'); return }   // already set up: they only need to enter the code
    setBusy(true); setErr('')
    for (const x of (f?.all || []).filter(x => x.status === 'unverified')) await sb.auth.mfa.unenroll({ factorId: x.id })   // clear an unfinished earlier attempt
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Swaasa ' + new Date().toISOString().slice(0, 19) })
    setBusy(false); starting.current = false
    if (error || !data) return setErr('Could not start the setup. Reload this page and try again.')
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setCode('')
  }
  async function confirmEnroll(ev?: React.FormEvent) {
    ev?.preventDefault(); if (busy || !factorId) return
    if (!/^\d{6}$/.test(code.trim())) return setErr('Enter the 6-digit code shown in your authenticator app.')
    setBusy(true); setErr('')
    const { error } = await supa().auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    if (error) { setBusy(false); setCode(''); setErr('That code is not right or has expired. Enter the new code shown in your app.') } else location.replace('/admin')
  }
  async function other() { await supa().auth.signOut(); setStep('pw'); setCode(''); setPw(''); setErr(''); setFactorId(''); setQr(''); setSecret(''); starting.current = false; history.replaceState(null, '', '/login') }
  const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  return <main className="lg">
    <div className="lg-stage">
      <LoginVideo>
        <div className="lg-brand"><img src="/logo-mark.png" alt="" /><span><b>Swaasa</b><i>Wedding Rentals</i></span></div>
        <div className="lg-cap"><h1>Elegant Bridal Looks<br />for Your Special Day</h1><span className="lg-rule" aria-hidden="true" /></div>
      </LoginVideo>
      <section className="lg-side" aria-label="Staff sign in">{step === 'enroll' ? <form className="lg-card" onSubmit={confirmEnroll} noValidate>
        <h2>Set up two-step login</h2><p className="lg-sub">Two-step login is required for your account. You only do this once.</p>
        <p className="lg-help" role="note"><b>1.</b> Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy) and scan this code.</p>
        {qr ? <img className="lg-qr" src={qr} alt="QR code for your authenticator app" width={176} height={176} /> : !err && <p className="lg-sub" role="status">Preparing your code…</p>}
        {secret && <p className="lg-help lg-key">Cannot scan? Enter this key in the app: <b>{secret}</b><br />Keep a copy somewhere safe. It is the only way to set the app up again on a new phone.</p>}
        <p className="lg-help" role="note"><b>2.</b> Enter the 6-digit code your app now shows.</p>
        <label className="lg-f"><span className="lg-in"><svg {...svg}><rect x="4" y="10.5" width="16" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" aria-label="6-digit code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></span></label>
        {err && <p className="lg-err" role="alert">{err}</p>}
        <button className="lg-btn" type="submit" disabled={busy || !factorId}>{busy ? 'Checking…' : 'Turn on and continue'}</button>
        <button type="button" className="lg-link" onClick={other}>Use a different account</button>
      </form> : step === 'code' ? <form className="lg-card" onSubmit={verify} noValidate>
        <h2>Two-step verification</h2><p className="lg-sub">Open your authenticator app and enter the 6-digit code for Swaasa.</p>
        <label className="lg-f"><span className="lg-in"><svg {...svg}><rect x="4" y="10.5" width="16" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" aria-label="6-digit code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></span></label>
        {err && <p className="lg-err" role="alert">{err}</p>}
        <button className="lg-btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Verify and continue'}</button>
        <button type="button" className="lg-link" onClick={other}>Use a different account</button>
      </form> : <form className="lg-card" onSubmit={go} noValidate>
        <h2>Staff Login</h2><p className="lg-sub">Access the Swaasa Wedding Rentals Admin System</p>
        <label className="lg-f"><span className="lg-in"><svg {...svg}><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20c.6-3.7 3.5-5.6 7.2-5.6s6.6 1.9 7.2 5.6" /></svg>
          <input type="email" autoComplete="username" placeholder="Work email" aria-label="Work email" value={email} onChange={e => setEmail(e.target.value)} /></span></label>
        <label className="lg-f"><span className="lg-in"><svg {...svg}><rect x="4" y="10.5" width="16" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
          <input type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" aria-label="Password" value={pw} onChange={e => setPw(e.target.value)} />
          <button type="button" className="lg-eye" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
            {show ? <svg {...svg}><path d="M3 3l18 18" /><path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c5 0 8.5 4.2 9.6 6-.5.9-1.5 2.2-2.9 3.4M6.3 7.7C4.2 9.1 2.8 11 2.4 12c1.1 1.8 4.6 6 9.6 6 1.4 0 2.7-.3 3.8-.8" /><path d="M9.9 10a3 3 0 0 0 4.1 4.1" /></svg>
              : <svg {...svg}><path d="M2.4 12C3.5 10.2 7 6 12 6s8.5 4.2 9.6 6c-1.1 1.8-4.6 6-9.6 6S3.5 13.8 2.4 12Z" /><circle cx="12" cy="12" r="3" /></svg>}</button></span></label>
        {err && <p className="lg-err" role="alert">{err}</p>}
        <button className="lg-btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
        <button type="button" className="lg-link" onClick={() => setForgot(v => !v)} aria-expanded={forgot}>Forgot Password?</button>
        {forgot && <p className="lg-help" role="note">Passwords are reset by the owner. Ask them to use <b>Reset password</b> in Staff Admin, then sign in with the new password.</p>}
      </form>}</section>
    </div>
  </main>
}
