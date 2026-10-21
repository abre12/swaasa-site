'use client'
import { useEffect, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { addD, inr, iso, price } from '@/lib/util'
export default function Booking({ dress, advancePct }: { dress: any; advancePct: number }) {
  const [s, setS] = useState(''); const [e, setE] = useState(''); const [busy, setBusy] = useState<any[]>([])
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '' }); const [msg, setMsg] = useState(''); const [id, setId] = useState(''); const [wait, setWait] = useState(false)
  useEffect(() => { supa().rpc('dress_busy', { p_dress: dress.id }).then(({ data }) => setBusy(data || [])) }, [dress.id])
  const valid = s && e && e >= s
  const free = valid && dress.status === 'available' && !busy.some(b => s <= b.hold_end && e >= b.start_date)
  const p = valid ? price(dress, s, e) : null
  async function book() {
    setWait(true); setMsg('')
    const r = await fetch('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dress: dress.id, start: s, end: e, ...f }) })
    const j = await r.json(); setWait(false)
    if (j.id) setId(j.id); else setMsg(j.error || 'Could not complete the booking.')
  }
  if (id) return <div className="box"><h2>Booking requested ✓</h2><h1 style={{ color: 'var(--gold)' }}>{id}</h1><p>Keep this ID and your mobile number to check your booking. The store will confirm once your advance is received.</p></div>
  return (<div className="box"><h3>Check availability</h3>
    <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}><input type="date" min={iso(new Date())} value={s} onChange={x => setS(x.target.value)} /><input type="date" min={s || iso(new Date())} value={e} onChange={x => setE(x.target.value)} /></div>
    {valid && !free && <p className="bad"><b>Not available</b> for those dates. Try nearby dates or browse similar dresses.</p>}
    {valid && free && p && <>
      <p className="ok"><b>Available</b> for {p.n} day(s).</p>
      <div className="row"><span>Rent total</span><b>{inr(p.rent)}</b></div><div className="row"><span>Refundable deposit (at pickup)</span><span>{inr(dress.deposit)}</span></div>
      <div className="row"><span>Advance to confirm ({advancePct}%)</span><span>{inr(p.rent * advancePct / 100)}</span></div>
      <div style={{ marginTop: 12 }}><input placeholder="Full name *" value={f.name} onChange={x => setF({ ...f, name: x.target.value })} />
        <input placeholder="Mobile number *" type="tel" value={f.phone} onChange={x => setF({ ...f, phone: x.target.value })} />
        <input placeholder="Email (optional)" value={f.email} onChange={x => setF({ ...f, email: x.target.value })} />
        <textarea placeholder="Alteration notes / requirements" value={f.notes} onChange={x => setF({ ...f, notes: x.target.value })} />
        <button className="btn" disabled={wait} onClick={book}>{wait ? 'Checking availability…' : 'Request booking'}</button></div></>}
    {msg && <p className="bad">{msg}</p>}</div>)
}
