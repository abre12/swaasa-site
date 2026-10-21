'use client'
import { useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { inr } from '@/lib/util'
export default function Lookup() {
  const [id, setId] = useState(''); const [ph, setPh] = useState(''); const [r, setR] = useState<any>(null); const [none, setNone] = useState(false)
  async function go() { const { data } = await supa().rpc('lookup_booking', { p_id: id, p_phone: ph }); setR(data?.[0] || null); setNone(!data?.length) }
  return (<section className="sec" style={{ maxWidth: 460 }}><h2>Find my booking</h2><div className="box">
    <input placeholder="Booking ID" value={id} onChange={e => setId(e.target.value)} /><input placeholder="Mobile number" type="tel" value={ph} onChange={e => setPh(e.target.value)} />
    <button className="btn" onClick={go}>Look up</button>
    {r && <p><b>{r.id}</b><br />{r.dress_name}<br />{r.start_date} → {r.end_date}<br />Status: {r.status}<br />Rent {inr(r.rent)} · Paid {inr(r.paid)}</p>}
    {none && <p className="bad">No booking found for those details.</p>}</div></section>)
}
