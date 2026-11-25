'use client'
import { useCallback, useEffect, useState } from 'react'

// Two-step login with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy). Free on every Supabase plan.
// Once switched on, signing in needs the password AND the 6-digit code (the middleware and the login page enforce it).
// Owner and manager logins must have it on (lib/mfa.ts), so for them there is no "Turn off" button here.
// If the phone is lost: remove the factor (Supabase dashboard, Authentication, Users, or the SQL in docs/ACCOUNT-RECOVERY.md). Nothing else is locked:
// at the next sign-in the person is taken through setup again with a new phone.
export default function MfaSetup({ sb, required = false }: { sb: any; required?: boolean }) {
  const [on, setOn] = useState<boolean | null>(null), [factorId, setFactorId] = useState(''), [qr, setQr] = useState(''), [secret, setSecret] = useState('')
  const [pending, setPending] = useState(''), [code, setCode] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    const { data } = await sb.auth.mfa.listFactors(); const t = (data?.totp || [])[0]
    setOn(!!t); setFactorId(t?.id || '')
  }, [sb])
  useEffect(() => { refresh() }, [refresh])

  async function start() {
    setBusy(true); setMsg('')
    const all = (await sb.auth.mfa.listFactors()).data?.all || []
    for (const f of all.filter((x: any) => x.status === 'unverified')) await sb.auth.mfa.unenroll({ factorId: f.id })   // clear an unfinished earlier attempt
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', issuer: 'SWAASA Wedding Rentals', friendlyName: 'Swaasa owner ' + new Date().toISOString().slice(0, 10) })
    setBusy(false)
    if (error || !data) return setMsg('Could not start. ' + (error?.message || ''))
    setPending(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setCode('')
  }
  async function confirm() {
    if (!/^\d{6}$/.test(code.trim())) return setMsg('Enter the 6-digit code shown in your app.')
    setBusy(true); setMsg('')
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: pending, code: code.trim() })
    setBusy(false)
    if (error) return setMsg('That code is not right. Wait for the next code in your app and try again.')
    setPending(''); setQr(''); setSecret(''); setMsg('Two-step login is now on. From the next sign-in you will be asked for the code.'); refresh()
  }
  async function turnOff() {
    if (!window.confirm('Turn off two-step login? Signing in will need only the password again.')) return
    setBusy(true); const { error } = await sb.auth.mfa.unenroll({ factorId }); setBusy(false)
    setMsg(error ? 'Could not turn it off. ' + error.message : 'Two-step login is off.'); refresh()
  }
  if (on === null) return null
  return <section className="stg-mfa">
    <h3 className="stg-gh">Two-step login (owner)</h3>
    {on && !pending && <>
      <p><b>On.</b> Signing in needs your password and the 6-digit code from your authenticator app.</p>
      {required ? <p className="mut" style={{ fontSize: 13, margin: 0 }}>Required for owner and manager logins, so it cannot be turned off here.</p>
        : <button className="btn alt" disabled={busy} onClick={turnOff}>Turn off</button>}</>}
    {!on && !pending && <>
      <p className="mut" style={{ fontSize: 13 }}>Adds a 6-digit code from your phone to the password. Strongly recommended for the owner login, which can approve refunds and cancellations.</p>
      <button className="btn" disabled={busy} onClick={start}>Turn on two-step login</button></>}
    {pending && <div style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
      <p style={{ margin: 0 }}>1. Open an authenticator app on your phone and scan this code.</p>
      {qr && <img src={qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: '#fff', padding: 6, borderRadius: 8 }} />}
      <p className="mut" style={{ fontSize: 12, margin: 0, wordBreak: 'break-all' }}>Cannot scan? Enter this key in the app: <b>{secret}</b>. Keep a copy somewhere safe: it is the only way to set the app up again on a new phone.</p>
      <label style={{ margin: 0 }}>2. Enter the 6-digit code shown<input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ display: 'block' }} /></label>
      <div style={{ display: 'flex', gap: 8 }}><button className="btn" disabled={busy} onClick={confirm}>Confirm and turn on</button>
        <button className="btn alt" disabled={busy} onClick={async () => { await sb.auth.mfa.unenroll({ factorId: pending }); setPending(''); setQr(''); setSecret('') }}>Cancel</button></div></div>}
    {msg && <p role="status" style={{ margin: '8px 0 0' }}>{msg}</p>}
  </section>
}
