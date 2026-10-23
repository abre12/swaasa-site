'use client'
import { useEffect, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { inr, iso, price } from '@/lib/util'
const GAP = 'Check dates for Cleaning & Preparation Period'
const ERR: Record<string, string> = {
  GAP_CLASH: GAP, DATES_TAKEN: 'Those dates are already booked or blocked for this dress.', OWNER_ONLY: 'Only the owner can give discounts.',
  BAD_CONTACT: 'Please enter the name and a valid 10-digit mobile number.', BAD_DATES: 'Please choose valid dates.', NOT_AVAILABLE: 'This dress is not available for booking.', FORBIDDEN: 'Please sign in as staff.',
}
export default function Booking({ dress, advancePct, staff }: { dress: any; advancePct: number; staff?: string | null }) {
  const [s, setS] = useState(''); const [e, setE] = useState(''); const [busy, setBusy] = useState<any[]>([])
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '', advance: '', deposit: String(dress.deposit || 0), mode: '', discount: '' })
  const [msg, setMsg] = useState(''); const [id, setId] = useState(''); const [wait, setWait] = useState(false); const [checked, setChecked] = useState(false); const [warn, setWarn] = useState('')
  useEffect(() => { supa().rpc('dress_busy', { p_dress: dress.id }).then(({ data }) => setBusy(data || [])) }, [dress.id])
  const valid = !!(s && e && e >= s)
  const clash = valid ? busy.filter(b => s <= b.hold_end && e >= b.start_date) : []
  const realClash = clash.some(b => !b.end_date || (s <= b.end_date && e >= b.start_date))   // genuinely booked: nobody can override
  const gapOnly = clash.length > 0 && !realClash                                               // only inside a cleaning gap
  const avail = dress.status === 'available'
  const free = valid && avail && clash.length === 0
  const p = valid ? price(dress, s, e) : null
  const showForm = valid && avail && (free || (!!staff && gapOnly && checked))
  const set = (k: string, v: string) => setF({ ...f, [k]: v })
  const dates = (fn: (v: string) => void) => (x: any) => { fn(x.target.value); setChecked(false); setMsg('') }

  async function customerBook() {
    setWait(true); setMsg('')
    const r = await fetch('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dress: dress.id, start: s, end: e, name: f.name, phone: f.phone, email: f.email, notes: f.notes }) })
    const j = await r.json(); setWait(false)
    if (j.id) setId(j.id); else setMsg(j.error || 'Could not complete the booking.')
  }
  async function staffBook() {
    const adv = +f.advance, net = Math.max(0, (p?.rent || 0) - (+f.discount || 0))
    if (!f.name.trim() || f.phone.replace(/\D/g, '').length < 10) return setMsg(ERR.BAD_CONTACT)
    if (!(adv > 0)) return setMsg('Advance received is required. Enter the amount collected now.')
    if (!f.mode) return setMsg('Please select the payment mode (Cash, UPI, Card or Bank transfer).')
    if (adv > net) return setMsg('Advance cannot be more than the rent total.')
    const dep = +f.deposit || 0
    if (dress.deposit > 0 && !(dep > 0)) return setMsg('Deposit collected is required. Enter the security deposit received now.')
    if (dep > dress.deposit) return setMsg('Deposit collected cannot be more than the security deposit.')
    setWait(true); setMsg('')
    const { data, error } = await supa().rpc('staff_create_booking', { p_dress: dress.id, p_start: s, p_end: e, p_name: f.name, p_phone: f.phone, p_email: f.email || null, p_notes: f.notes || null,
      p_advance: +f.advance || 0, p_mode: f.mode, p_discount: +f.discount || 0, p_override: gapOnly && checked })
    setWait(false)
    if (error) { const k = Object.keys(ERR).find(k => error.message.includes(k)); setMsg(k ? ERR[k] : 'Something went wrong. Please try again.') } else {
      if (dep > 0) {   // deposit is recorded as its own payment, separate from the rent advance
        const r = await supa().from('payments').insert({ booking_id: data, amount: dep, kind: 'deposit', mode: f.mode })
        if (r.error) setWarn(`The booking is saved, but the ${inr(dep)} deposit could not be recorded automatically. Record it when the dress is picked up.`)
      }
      setId(data)
    }
  }

  if (id) return <div className="box"><h2>{staff ? 'Booking confirmed' : 'Booking requested'} ✓</h2><h1 style={{ color: 'var(--gold)' }}>{id}</h1>
    <p>{staff ? 'The booking is confirmed and shows on the calendar.' : 'Keep this ID and your mobile number to check your booking. The store will confirm once your advance is received.'}</p>{warn && <p className="bad">{warn}</p>}{staff && <a className="btn alt sm" href="/admin">Open admin</a>}</div>
  return (<div className="box"><h3>{staff ? 'Check availability and book (staff)' : 'Check availability'}</h3>
    <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}><input type="date" min={iso(new Date())} value={s} onChange={dates(setS)} /><input type="date" min={s || iso(new Date())} value={e} onChange={dates(setE)} /></div>
    {valid && !avail && <p className="bad"><b>Not available.</b> This dress is currently marked {dress.status}.</p>}
    {valid && avail && realClash && <p className="bad"><b>Not available</b> for those dates. Try nearby dates or browse similar dresses.</p>}
    {valid && avail && gapOnly && <>
      <p className="bad"><b>{GAP}.</b> Each dress needs a day for cleaning and preparation between rentals.{!staff && ' Please choose dates that start a little later or end a little earlier.'}</p>
      {staff && <label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" style={{ width: 'auto' }} checked={checked} onChange={x => setChecked(x.target.checked)} /> I have checked and confirmed availability. Book inside the cleaning period.</label>}</>}
    {free && <p className="ok"><b>Available</b> for {p!.n} day(s).</p>}
    {showForm && p && <>
      <div className="row"><span>Rent total</span><b>{inr(p.rent)}</b></div><div className="row"><span>{staff ? 'Refundable deposit' : 'Refundable deposit (collected at pickup)'}</span><span>{inr(dress.deposit)}</span></div>
      {staff && <><div className="row"><span>Advance received now</span><span>{inr(+f.advance || 0)}</span></div>
        <div className="row"><b>Balance rent after advance</b><b>{inr(Math.max(0, p.rent - (+f.discount || 0) - (+f.advance || 0)))}</b></div>
        <div className="row"><span>Deposit collected now</span><span>{inr(+f.deposit || 0)}</span></div>
        <div className="row"><b>Total collected now</b><b>{inr((+f.advance || 0) + (+f.deposit || 0))}</b></div></>}
      {!staff && <div className="row"><span>Advance to confirm ({advancePct}%)</span><span>{inr(p.rent * advancePct / 100)}</span></div>}
      <div style={{ marginTop: 12 }}><input placeholder="Full name *" value={f.name} onChange={x => set('name', x.target.value)} />
        <input placeholder="Mobile number *" type="tel" value={f.phone} onChange={x => set('phone', x.target.value)} />
        <input placeholder="Email (optional)" value={f.email} onChange={x => set('email', x.target.value)} />
        <textarea placeholder="Alteration notes / requirements" value={f.notes} onChange={x => set('notes', x.target.value)} />
        {staff && <><input placeholder="Advance received now (₹) *" type="number" min="1" value={f.advance} onChange={x => set('advance', x.target.value)} />
          <input placeholder={`Deposit collected now (₹) *. Deposit is ${inr(dress.deposit)}`} type="number" min="0" value={f.deposit} onChange={x => set('deposit', x.target.value)} />
          <select value={f.mode} onChange={x => set('mode', x.target.value)}><option value="">Payment mode (advance and deposit) *</option><option>Cash</option><option>UPI</option><option>Card</option><option>Bank transfer</option></select>
          {staff === 'owner' && <input placeholder="Discount (₹, owner only)" type="number" value={f.discount} onChange={x => set('discount', x.target.value)} />}</>}
        <button className="btn" disabled={wait} onClick={staff ? staffBook : customerBook}>{wait ? 'Checking availability…' : staff ? 'Confirm booking' : 'Request booking'}</button></div></>}
    {msg && <p className="bad">{msg}</p>}</div>)
}
