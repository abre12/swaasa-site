'use client'
import { useCallback, useEffect, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { addD, CATS, inr, iso, nDays } from '@/lib/util'
const today = () => iso(new Date())
const state = (b: any) => b.status === 'out' && b.end_date < today() ? 'overdue' : b.status
const COL: any = { pending: '#c58a2b', confirmed: '#4d6d9a', out: '#7a5aa6', returned: '#4f8a5b', overdue: '#b4493f', block: '#8c8c8c' }
export default function AdminApp({ role, name }: { role: string; name: string }) {
  const sb = supa(); const owner = role === 'owner'
  const [tab, setTab] = useState('bookings'); const [B, setB] = useState<any[]>([]); const [K, setK] = useState<any[]>([]); const [D, setD] = useState<any[]>([])
  const [flt, setFlt] = useState('all'); const [ref, setRef] = useState(today().slice(0, 7)); const [note, setNote] = useState('')
  const load = useCallback(async () => {
    const [b, k, d] = await Promise.all([sb.from('booking_view').select('*').order('start_date', { ascending: false }), sb.from('blocks').select('*'), sb.from('dresses').select('*').order('code')])
    setB(b.data || []); setK(k.data || []); setD(d.data || [])
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [load])   // calendar stays fresh across devices
  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 3500) }
  async function patch(b: any, p: any, msg: string) {
    const { error } = await sb.from('bookings').update({ ...p, log: [...b.log, { t: new Date().toISOString(), m: msg }] }).eq('id', b.id)
    say(error ? (error.message.includes('OWNER_ONLY') ? 'Only the owner can change prices.' : error.message.includes('no_double') ? 'Dates clash with another booking.' : error.message) : msg); load()
  }
  async function pay(b: any, kind: string) {
    const a = +(prompt(kind === 'rent' ? 'Amount received (₹)' : 'Deposit received (₹)', String(kind === 'rent' ? Math.max(0, b.rent + b.charges - b.paid) : b.deposit)) || 0); if (!a) return
    const mode = prompt('Mode: Cash / UPI / Bank transfer', 'UPI')
    const { error } = await sb.from('payments').insert({ booking_id: b.id, amount: a, kind, mode }); say(error ? error.message : `${inr(a)} recorded`); load()
  }
  async function ret(b: any) {
    const c = +(prompt('Late fee + damage/cleaning charges (₹)', '0') || 0), n = prompt('Condition notes (optional)', '') || ''
    await patch(b, { status: 'returned', returned_at: new Date().toISOString(), charges: b.charges + (owner ? c : 0) }, `Returned${n ? ': ' + n : ''}${c && !owner ? ` (charges ${inr(c)} to be set by owner)` : ''}`)
    if (n) await sb.from('dresses').update({ condition: n }).eq('id', b.dress_id)
  }
  async function resched(b: any) {
    const s = prompt('New start (YYYY-MM-DD)', b.start_date), e = s && prompt('New return (YYYY-MM-DD)', b.end_date); if (!s || !e || e < s) return
    await patch(b, { start_date: s, end_date: e }, `Rescheduled to ${s} → ${e}`)
  }
  async function block() {
    const id = prompt('Dress code to block (e.g. SW-G001)'); const d = D.find(x => x.code === id); if (!d) return say('Dress not found')
    const s = prompt('From (YYYY-MM-DD)'), e = s && prompt('To (YYYY-MM-DD)'), r = prompt('Reason (repair, cleaning, photoshoot, personal)', 'Cleaning'); if (!s || !e) return
    const { error } = await sb.from('blocks').insert({ dress_id: d.id, start_date: s, end_date: e, reason: r }); say(error ? 'Clashes with an existing booking' : 'Blocked'); load()
  }
  async function addDress(e: any) {
    e.preventDefault(); const f = new FormData(e.currentTarget), imgs: string[] = []
    for (const file of f.getAll('photos') as File[]) { if (!file.size) continue; const path = `${Date.now()}-${file.name.replace(/\W/g, '_')}`; const up = await sb.storage.from('dress-images').upload(path, file); if (!up.error) imgs.push(sb.storage.from('dress-images').getPublicUrl(path).data.publicUrl) }
    const g = (k: string) => String(f.get(k) || '')
    const { error } = await sb.from('dresses').insert({ code: g('code'), name: g('name'), category: g('category'), colour: g('colour'), sizes: g('sizes').split(',').map(s => s.trim()).filter(Boolean), price: +g('price'), deposit: +g('deposit'), included_days: +g('days') || 3, extra_day_fee: +g('extra'), description: g('description'), images: imgs, try_on_image: imgs[0] || null })
    say(error ? error.message : 'Dress added'); if (!error) e.currentTarget.reset(); load()
  }
  const sel = (b: any) => <>{b.status === 'pending' && <button className="btn sm" onClick={() => patch(b, { status: 'confirmed' }, 'Confirmed')}>Confirm</button>}
    {b.status === 'confirmed' && <button className="btn sm" onClick={() => patch(b, { status: 'out', picked_up_at: new Date().toISOString() }, 'Picked up')}>Picked up</button>}
    {b.status === 'out' && <button className="btn sm" onClick={() => ret(b)}>Return</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => pay(b, 'rent')}>Payment</button>}
    {['pending', 'confirmed'].includes(b.status) && <><button className="btn alt sm" onClick={() => resched(b)}>Reschedule</button><button className="btn alt sm" onClick={() => confirm('Cancel this booking?') && patch(b, { status: 'cancelled' }, 'Cancelled')}>Cancel</button></>}</>
  const F: any = { all: () => true, pending: (b: any) => b.status === 'pending', upcoming: (b: any) => b.status === 'confirmed' && b.start_date >= today(), out: (b: any) => b.status === 'out', overdue: (b: any) => state(b) === 'overdue', owing: (b: any) => b.status !== 'cancelled' && b.rent + b.charges - b.paid > 0, done: (b: any) => b.status === 'returned', cancelled: (b: any) => b.status === 'cancelled' }
  const live = B.filter(b => b.status !== 'cancelled'); const od = B.filter(F.overdue)
  const stats: [string, any][] = [['Dresses', D.length], ['Rented out', B.filter(F.out).length], ['Overdue', od.length], ['Pending', B.filter(F.pending).length], ['Pickups today', live.filter(b => b.start_date === today() && b.status === 'confirmed').length], ['Returns today', live.filter(b => b.end_date === today() && b.status === 'out').length],
    ...(owner ? [['Collected', inr(B.reduce((a, b) => a + b.paid, 0))], ['Outstanding', inr(live.filter(b => b.status !== 'returned').reduce((a, b) => a + Math.max(0, b.rent + b.charges - b.paid), 0))]] as [string, any][] : [])]
  const first = new Date(ref + '-01T00:00:00Z'); const start = addD(iso(first), -first.getUTCDay()); const cells = Array.from({ length: 42 }, (_, i) => addD(start, i))
  const items = [...B.filter(b => b.status !== 'cancelled').map(b => ({ s: b.start_date, e: b.end_date, label: b.dress_code, c: COL[state(b)] })), ...K.map(k => ({ s: k.start_date, e: k.end_date, label: D.find(d => d.id === k.dress_id)?.code + ' ' + (k.reason || ''), c: COL.block }))]
  async function csv() { const q = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"'; const rows = [['ID', 'Dress', 'Customer', 'Phone', 'Start', 'End', 'Rent', 'Paid', 'Status'], ...B.map(b => [b.id, b.dress_code, b.customer_name, b.phone, b.start_date, b.end_date, b.rent, b.paid, b.status])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')])); a.download = 'bookings.csv'; a.click() }
  const tabs = ['bookings', 'calendar', 'dresses', ...(owner ? ['reports'] : [])]
  return (<section className="sec"><div className="row"><span>Signed in: <b>{name}</b> ({role})</span><button className="btn alt sm" onClick={async () => { await sb.auth.signOut(); location.href = '/login' }}>Sign out</button></div>
    <div className="flt" style={{ marginTop: 16 }}>{tabs.map(t => <button key={t} className={'btn sm' + (tab === t ? '' : ' alt')} onClick={() => setTab(t)}>{t}</button>)}<button className="btn alt sm" onClick={block}>Block a dress</button></div>
    {note && <p><b>{note}</b></p>}
    <div className="flt">{stats.map(([l, v]) => <div key={l} className="box" style={{ margin: 0, minWidth: 120 }}>{l}<h2 className={l === 'Overdue' && v ? 'bad' : ''}>{v}</h2></div>)}</div>
    {od.length > 0 && <div className="box"><b className="bad">Overdue returns</b>{od.map(b => <div key={b.id} className="row"><span>{b.dress_code} · {b.customer_name} · <a href={'tel:' + b.phone}>{b.phone}</a></span><span>due {b.end_date}</span></div>)}</div>}
    {tab === 'bookings' && <><div className="flt" style={{ marginTop: 16 }}><select value={flt} onChange={e => setFlt(e.target.value)}>{Object.keys(F).map(k => <option key={k}>{k}</option>)}</select></div>
      <div className="scroll"><table><thead><tr><th>ID</th><th>Dress</th><th>Customer</th><th>Dates</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>
        {B.filter(F[flt]).map(b => <tr key={b.id}><td>{b.id}</td><td>{b.dress_code}</td><td>{b.customer_name}<br /><a href={'tel:' + b.phone}>{b.phone}</a></td><td>{b.start_date} → {b.end_date}</td><td>{inr(b.rent + b.charges - b.paid)}<br /><span className="mut">deposit held {inr(b.deposit_held)}/{inr(b.deposit)}</span></td>
          <td style={{ color: COL[state(b)] }}>{state(b)}</td><td style={{ whiteSpace: 'normal' }}>{sel(b)}{['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => pay(b, 'deposit')}>Deposit</button>}</td></tr>)}</tbody></table></div></>}
    {tab === 'calendar' && <><div className="flt"><input type="month" value={ref} onChange={e => setRef(e.target.value)} /></div>
      <div className="cal">{'SMTWTFS'.split('').map((d, i) => <b key={i} style={{ textAlign: 'center' }}>{d}</b>)}{cells.map(d => <div key={d} className="cell" style={d === today() ? { borderColor: 'var(--gold)' } : {}}><span className="mut">{+d.slice(8)}</span>{items.filter(i => d >= i.s && d <= i.e).map((i, n) => <span key={n} className="chip" style={{ background: i.c }}>{i.label}</span>)}</div>)}</div>
      <p className="mut" style={{ fontSize: 12 }}>{Object.entries(COL).map(([k, c]: any) => <span key={k} style={{ color: c, marginRight: 12 }}>■ {k}</span>)}</p></>}
    {tab === 'dresses' && <>{owner && <form className="box" onSubmit={addDress}><h3>Add a dress</h3><div className="flt"><input name="code" placeholder="Code *" required /><input name="name" placeholder="Name *" required /><select name="category">{CATS.map(c => <option key={c}>{c}</option>)}</select><input name="colour" placeholder="Colour" /><input name="sizes" placeholder="Sizes (S, M, L)" /><input name="price" type="number" placeholder="Rent ₹" required /><input name="deposit" type="number" placeholder="Deposit ₹" /><input name="days" type="number" placeholder="Included days" /><input name="extra" type="number" placeholder="Extra day ₹" /><input name="description" placeholder="Description" /><input name="photos" type="file" accept="image/*" multiple /></div><button className="btn">Save dress</button></form>}
      <div className="scroll"><table><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Rent</th><th>Status</th></tr></thead><tbody>{D.map(d => <tr key={d.id}><td>{d.code}</td><td>{d.name}</td><td>{d.category}</td><td>{inr(d.price)}</td><td><select value={d.status} onChange={async e => { await sb.rpc('set_dress_status', { p_id: d.id, p_status: e.target.value }); load() }}>{['available', 'maintenance', 'unavailable', 'retired', 'archived'].map(s => <option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div></>}
    {tab === 'reports' && owner && <div className="box"><h3>Revenue by category</h3>{Object.entries(live.reduce((m: any, b) => (m[b.category] = (m[b.category] || 0) + b.rent + b.charges, m), {})).map(([k, v]: any) => <div key={k} className="row"><span>{k}</span><span>{inr(v)}</span></div>)}
      <div className="row"><span>Cancellation rate</span><span>{B.length ? Math.round(100 * B.filter(F.cancelled).length / B.length) : 0}%</span></div><br /><button className="btn" onClick={csv}>Export bookings (CSV)</button></div>}</section>)
}
