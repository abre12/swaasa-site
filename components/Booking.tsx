'use client'
import { useEffect, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { inr, PAY_MODES, price, todayIST } from '@/lib/util'
const GAP = 'Check dates for Cleaning & Preparation Period'
const ERR: Record<string, string> = {
  GAP_CLASH: GAP, DATES_TAKEN: 'Those dates are already booked or blocked for this dress.', OWNER_ONLY: 'Only the owner can give discounts.',
  BAD_CONTACT: 'Please enter the name and a valid 10-digit mobile number.', BAD_DATES: 'Please choose valid dates.', NOT_AVAILABLE: 'This dress is not available for booking.', FORBIDDEN: 'Please sign in as staff.',
}
const lab: React.CSSProperties = { fontSize: 13, color: 'var(--mut)', margin: '10px 0 2px' }
export default function Booking({ dress, advancePct, advanceMin = 1000, staff, initialFrom, initialTo }: { dress: any; advancePct: number; advanceMin?: number; staff?: string | null; initialFrom?: string; initialTo?: string }) {
  const [s, setS] = useState(initialFrom || ''); const [e, setE] = useState(initialTo || ''); const [busy, setBusy] = useState<any[]>([])
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '', advance: '', mode: '', discount: '', custom: '' })
  const [msg, setMsg] = useState(''); const [id, setId] = useState(''); const [wait, setWait] = useState(false); const [checked, setChecked] = useState(false); const [warn, setWarn] = useState('')
  useEffect(() => { supa().rpc('dress_busy', { p_dress: dress.id }).then(({ data }) => setBusy(data || [])) }, [dress.id])
  const valid = !!(s && e && e >= s)
  const clash = valid ? busy.filter(b => s <= b.hold_end && e >= b.start_date) : []
  const realClash = clash.some(b => !b.end_date || (s <= b.end_date && e >= b.start_date))   // genuinely booked: nobody can override
  const gapOnly = clash.length > 0 && !realClash                                               // only inside a cleaning gap
  const avail = dress.status === 'available'
  const free = valid && avail && clash.length === 0
  const p = valid ? price(dress, s, e) : null
  // Refundable deposit: the higher of a percentage of the rent (50%) or a minimum (₹1,000), worked out on the rent after any discount.
  const net = p ? Math.max(0, p.rent - (+f.discount || 0)) : 0
  const depDue = p ? Math.max(Math.round(net * advancePct / 100), advanceMin) : 0
  const cust = Math.max(0, Math.round(+f.custom || 0))      // customization charge: collected in addition to the rental
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
    const amt = +f.advance
    const dep = Math.min(amt || 0, depDue), rentPaid = Math.max(0, (amt || 0) - dep)   // the refundable deposit is taken first; anything above it counts as rent paid
    if (!f.name.trim() || f.phone.replace(/\D/g, '').length < 10) return setMsg(ERR.BAD_CONTACT)
    if (!(amt > 0)) return setMsg('Amount received is required. Enter the amount collected now.')
    if (!f.mode) return setMsg('Please select the payment mode (Cash, GPay / UPI or Card).')
    if (amt < depDue) return setMsg(`Amount received must be at least the refundable deposit of ${inr(depDue)}.`)
    if (rentPaid > net + cust) return setMsg('Amount received cannot be more than the refundable deposit plus the rent and customization charge.')
    setWait(true); setMsg('')
    const { data, error } = await supa().rpc('staff_create_booking', { p_dress: dress.id, p_start: s, p_end: e, p_name: f.name, p_phone: f.phone, p_email: f.email || null, p_notes: f.notes || null,
      p_advance: Math.min(rentPaid, net), p_mode: f.mode, p_discount: +f.discount || 0, p_override: gapOnly && checked, p_custom: cust })
    setWait(false)
    if (error) { const k = Object.keys(ERR).find(k => error.message.includes(k)); setMsg(k ? ERR[k] : 'Something went wrong. Please try again.') } else {
      if (dep > 0) {   // deposit is recorded as its own payment, separate from the rent advance
        const r = await supa().from('payments').insert({ booking_id: data, amount: dep, kind: 'deposit', purpose: 'deposit', mode: f.mode })
        if (r.error) setWarn(`The booking is saved, but the ${inr(dep)} deposit could not be recorded automatically. Record it when the dress is picked up.`)
      }
      const custPaid = rentPaid - Math.min(rentPaid, net)       // anything above the rent goes to the customization charge, as its own line
      if (custPaid > 0) { const r = await supa().from('payments').insert({ booking_id: data, amount: custPaid, kind: 'rent', purpose: 'customization', mode: f.mode }); if (r.error) setWarn(`The booking is saved, but the ${inr(custPaid)} customization payment could not be recorded automatically. Record it from the booking.`) }
      setId(data)
    }
  }

  if (id) return <div className="box"><h2>{staff ? 'Booking confirmed' : 'Booking requested'} ✓</h2><h1 style={{ color: 'var(--gold)' }}>{id}</h1>
    <p>{staff ? 'The booking is confirmed and shows on the calendar.' : 'Keep this ID and your mobile number to check your booking. The store will contact you to confirm the booking and the refundable deposit.'}</p>{warn && <p className="bad">{warn}</p>}{staff && <a className="btn alt sm" href="/admin">Open admin</a>}</div>
  const total = net + cust, received = +f.advance || 0, balance = Math.max(0, total - Math.max(0, received - depDue))
  return (<div>
    <section className="bk-sec"><h3>Select dates</h3>
      <div className="bk-dates">
        <label className="bk-f">From<input type="date" min={todayIST()} value={s} onChange={dates(setS)} /></label>
        <label className="bk-f">To<input type="date" min={s || todayIST()} value={e} onChange={dates(setE)} /></label>
        <div className="bk-dur">Duration{valid && p ? <span className="pill">{p.n} day{p.n === 1 ? '' : 's'}</span> : <span className="pill" style={{ opacity: .4 }}>–</span>}</div></div>
      {valid && !avail && <div className="bk-avail no"><div><b>Not available</b><span>This dress is currently marked {dress.status}.</span></div></div>}
      {valid && avail && realClash && <div className="bk-avail no"><div><b>Not available for those dates</b><span>Try nearby dates or browse similar dresses.</span></div></div>}
      {valid && avail && gapOnly && <><div className="bk-avail no"><div><b>{GAP}</b><span>Each dress needs a day for cleaning and preparation between rentals.{!staff && ' Please start a little later or end a little earlier.'}</span></div></div>
        {staff && <label style={{ display: 'block', margin: '10px 0 0', fontSize: 14 }}><input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={checked} onChange={x => setChecked(x.target.checked)} />I have checked and confirmed availability. Book inside the cleaning period.</label>}</>}
      {free && <div className="bk-avail"><div><b>Available</b><span>Free on the selected dates</span></div></div>}
    </section>
    {showForm && p && <>
      <section className="bk-sec"><h3>Customer details</h3>
        <div className="bk-g2">
          <label className="bk-f">Name *<input value={f.name} onChange={x => set('name', x.target.value)} /></label>
          <label className="bk-f">Mobile *<input type="tel" inputMode="numeric" value={f.phone} onChange={x => set('phone', x.target.value)} /></label>
          <label className="bk-f bk-span">Email (optional)<input type="email" placeholder="Email address" value={f.email} onChange={x => set('email', x.target.value)} /></label></div></section>
      <section className="bk-sec"><h3>Booking details</h3>
        <div className="bk-g2">
          <label className="bk-f bk-span">Alteration notes (optional)<textarea rows={3} placeholder="e.g. shorten sleeves, tighten waist" value={f.notes} onChange={x => set('notes', x.target.value)} /></label>
          {staff && <>
            <label className="bk-f bk-span">Customization charge (₹), optional<input type="number" min="0" placeholder="e.g. stitching, design changes" value={f.custom} onChange={x => set('custom', x.target.value)} /></label>
            <label className="bk-f">Payment received now (₹) *<input type="number" min="1" value={f.advance} onChange={x => set('advance', x.target.value)} /><small>Deposit of {inr(depDue)} is taken first; the rest counts as rent.</small></label>
            <label className="bk-f">Payment mode *<select value={f.mode} onChange={x => set('mode', x.target.value)}><option value="">Select mode</option>{PAY_MODES.map(m => <option key={m}>{m}</option>)}</select></label>
            {staff === 'owner' && <label className="bk-f">Discount (₹), optional<input type="number" min="0" placeholder="Amount (if any)" value={f.discount} onChange={x => set('discount', x.target.value)} /><small>Owner only</small></label>}</>}</div></section>
      <section className="bk-sum">
        <div><div className="row"><span>Rent{p.n ? ` (${p.n} day${p.n === 1 ? '' : 's'})` : ''}</span><span>{inr(p.rent)}</span></div>
          {net !== p.rent && <div className="row"><span>Discount</span><span>−{inr(p.rent - net)}</span></div>}
          {staff && cust > 0 && <div className="row"><span>Customization</span><span>{inr(cust)}</span></div>}
          <div className="row tot"><span>Total</span><span>{inr(total)}</span></div></div>
        <div><div className="row"><span>Refundable deposit{staff ? '' : ' (at pickup)'}</span><span>{inr(depDue)}</span></div>
          {staff && <><div className="row" style={{ color: 'var(--ok)' }}><span>Received now</span><span>{inr(received)}</span></div>
            <div className="row bk-due"><span>Balance due at delivery</span><span>{inr(balance)}</span></div></>}</div></section>
      <div className="bk-act"><button className="btn alt" onClick={() => window.history.back()}>Cancel</button>
        <button className="btn wine" disabled={wait} onClick={staff ? staffBook : customerBook}>{wait ? 'Checking availability…' : staff ? '✓ Confirm booking' : 'Request booking'}</button></div></>}
    {msg && <p className="bad" style={{ marginTop: 10 }}>{msg}</p>}</div>)
}
