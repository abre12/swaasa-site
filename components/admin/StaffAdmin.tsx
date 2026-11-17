'use client'
import { useState } from 'react'
const ROLE: Record<string, string> = { owner: 'Owner', manager: 'Staff', preparation: 'Preparation only (no longer used)' }
// Owner only: one login per person, so every booking, preparation, delivery and return is recorded against the right name.
export default function StaffAdmin({ ctx }: { ctx: any }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'manager' }); const [busy, setBusy] = useState(false)
  async function add() {
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email) || f.password.length < 10) return ctx.say('Enter a name, an email and a password of at least 10 characters.')
    setBusy(true); const r = await fetch('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); const j = await r.json().catch(() => ({})); setBusy(false)
    if (r.ok) { ctx.say(`${f.name} can now sign in with ${f.email}`); setF({ ...f, name: '', email: '', password: '' }); ctx.load() } else ctx.say(j.error || 'Could not create the login.')
  }
  async function rename(s: any, v: string) {
    const name = v.trim(); if (!name || name === s.name) return
    const { error } = await ctx.sb.from('staff').update({ name }).eq('user_id', s.user_id); ctx.say(error ? error.message : `Renamed to ${name}. Past records now show the new name.`); ctx.load()
  }
  async function toggle(s: any) {
    if (s.active && !(await ctx.askYes(`Turn off ${s.name}?`, 'They will no longer be able to sign in or see anything. Their past records stay.', 'Turn off'))) return
    const { error } = await ctx.sb.from('staff').update({ active: !s.active }).eq('user_id', s.user_id); ctx.say(error ? error.message : s.active ? `${s.name} turned off` : `${s.name} turned on`); ctx.load()
  }
  async function remove(s: any) {
    if (!(await ctx.askYes(`Delete ${s.name}?`, 'They will never be able to sign in again. Everything they did stays on record under their name. This cannot be undone.', 'Delete'))) return
    const r = await fetch('/api/staff', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: s.user_id }) }); const j = await r.json().catch(() => ({}))
    ctx.say(r.ok ? `${s.name} deleted. Their records are kept.` : j.error || 'Could not delete.'); ctx.load()
  }
  async function reset(s: any) {
    const v = await ctx.ask(`New password for ${s.name}`, [{ name: 'p', label: 'New password (at least 10 characters)', required: true }], { ok: 'Set password' }); if (!v) return
    const r = await fetch('/api/staff', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: s.user_id, password: v.p }) }); const j = await r.json().catch(() => ({}))
    ctx.say(r.ok ? `Password changed for ${s.name}` : j.error || 'Could not change the password.')
  }
  const team = ctx.STAFF.filter((s: any) => !s.deleted_at)
  return (<div className="stg-staff">
    <div className="stg-grp"><h3 className="stg-gh">Staff logins</h3>
      <p className="stg-gd">Every booking, preparation, delivery, return and payment is recorded under the name of whoever did it. Change a name here at any time and all past records show the new name.</p>
      <div className="scroll stg-table"><table><thead><tr><th>Name</th><th>Login email</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>
        {team.map((s: any) => <tr key={s.user_id}><td><input className="stg-in" key={s.name} defaultValue={s.name || ''} onBlur={e => rename(s, e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Name" /></td><td>{s.email || <span className="mut">–</span>}</td><td>{ROLE[s.role] || s.role}</td>
          <td>{s.role === 'owner' ? <span className="ok">Always on</span> : <button type="button" className={'btn sm' + (s.active ? ' alt' : '')} onClick={() => toggle(s)}>{s.active ? 'On · turn off' : 'Off · turn on'}</button>}</td>
          <td style={{ whiteSpace: 'normal' }}>{s.role !== 'owner' && <div className="stg-row-act"><button type="button" className="btn alt sm" onClick={() => reset(s)}>Reset password</button><button type="button" className="btn alt sm" onClick={() => remove(s)}>Delete</button></div>}</td></tr>)}</tbody></table></div>
      {ctx.STAFF.some((s: any) => s.deleted_at) && <p className="mut" style={{ fontSize: 12, margin: 0 }}>Former staff (records kept): {ctx.STAFF.filter((s: any) => s.deleted_at).map((s: any) => s.name).join(', ')}</p>}
    </div>
    <div className="stg-grp"><h3 className="stg-gh">Add a person</h3>
      <div className="stg-grid">
        <label className="stg-f"><span className="stg-l">Name</span><input placeholder="e.g. Staff 1" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label className="stg-f"><span className="stg-l">Login email</span><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label className="stg-f"><span className="stg-l">Password</span><input placeholder="At least 10 characters" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
        <label className="stg-f"><span className="stg-l">Role</span><select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option value="manager">Staff (bookings, payments, deliveries, returns)</option></select></label>
      </div>
      <p className="stg-gd" style={{ margin: 0 }}>The email can be any address you control (for example sales1@yourdomain.in). No email is sent. Give the person their email and password, and ask them to keep the password private.</p>
      <div className="stg-actions"><button type="button" className="btn" disabled={busy} onClick={add}>{busy ? 'Creating…' : 'Create login'}</button></div>
    </div>
  </div>)
}
