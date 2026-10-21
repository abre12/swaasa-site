'use client'
import { useState } from 'react'
import { supa } from '@/lib/supabase/client'
export default function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState('')
  async function go() { const { error } = await supa().auth.signInWithPassword({ email, password: pw }); if (error) setErr('Incorrect email or password.'); else location.href = '/admin' }
  return (<section className="sec" style={{ maxWidth: 400 }}><h2>Staff login</h2><div className="box">
    <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /><input placeholder="Password" type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
    <button className="btn" onClick={go}>Sign in</button>{err && <p className="bad">{err}</p>}</div></section>)
}
