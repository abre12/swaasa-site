'use client'
import { useEffect, useMemo, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { dmy, inr, PAY_MODES, price, todayIST } from '@/lib/util'
import { GROUPS } from '@/components/admin/AlterationDrawer'

const GAP = 'Check dates for Cleaning & Preparation Period'
const ERR: Record<string, string> = {
  GAP_CLASH: GAP, DATES_TAKEN: 'Those dates are already booked or blocked for this dress.', OWNER_ONLY: 'Only the owner can give discounts.',
  PAST_START: 'The delivery date cannot be in the past.', BAD_CONTACT: 'Please enter the name and a valid 10-digit mobile number.', BAD_DATES: 'Please choose valid dates.', NOT_AVAILABLE: 'This dress is not available for booking.', FORBIDDEN: 'Please sign in as staff.',
}
const EVENTS = ['Wedding', 'Engagement', 'Reception', 'Sangeet / Mehendi', 'Haldi', 'Pre-wedding shoot', 'Party / Other']
const MEAS: [string, string][] = [['bust', 'Bust'], ['waist', 'Waist'], ['hip', 'Hip'], ['length', 'Length'], ['other', 'Other']]
const LBL: Record<string, string> = Object.fromEntries(GROUPS.flatMap(g => g.items))
const STEPS = ['Booking', 'Alterations (optional)', 'Payment']
type Alt = 'none' | 'now' | 'later'
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

export default function BookingFlow({ dress, advancePct, advanceMin = 1000, staff, initialFrom, initialTo, left, info }: { dress: any; advancePct: number; advanceMin?: number; staff: string; initialFrom?: string; initialTo?: string; left: React.ReactNode; info: React.ReactNode }) {
  const [step, setStep] = useState<'check' | 1 | 2 | 3 | 'done'>('check')
  const [s, setS] = useState(initialFrom || ''), [e, setE] = useState(initialTo || ''), [busy, setBusy] = useState<any[]>([]), [checked, setChecked] = useState(false)
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '', eventType: 'Wedding', eventDate: '', dMode: '', dAddr: '', advance: '', mode: '', ref: '', discount: '', custom: '' })
  const [eventTouched, setEventTouched] = useState(false)
  const [alt, setAlt] = useState<Alt>('none'), [items, setItems] = useState<Record<string, string>>({}), [meas, setMeas] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState(''), [warns, setWarns] = useState<string[]>([]), [wait, setWait] = useState(false), [done, setDone] = useState<any>(null)
  const [known, setKnown] = useState<{ name: string; email: string; n: number } | null>(null), [showDisc, setShowDisc] = useState(false)

  useEffect(() => { supa().rpc('dress_busy', { p_dress: dress.id }).then(({ data }) => setBusy(data || [])) }, [dress.id])
  // What is happening with this dress RIGHT NOW (not just which dates are taken). Shown as a heads-up; it never blocks the booking.
  const [now, setNow] = useState<{ out: any | null; clean: any | null }>({ out: null, clean: null })
  useEffect(() => {
    const sb = supa()
    Promise.all([
      sb.from('bookings').select('id,end_date,customer_name').eq('dress_id', dress.id).eq('status', 'out').limit(1),
      sb.from('dry_clean_requests').select('status').eq('dress_id', dress.id).in('status', ['to_be_sent', 'sent', 'returned_pending_check']).limit(1)])
      .then(([o, c]) => setNow({ out: o.data?.[0] || null, clean: c.data?.[0] || null }))
  }, [dress.id])
  const heads: string[] = []
  if (now.out) { const late = now.out.end_date < todayIST(); if (late || (s && now.out.end_date >= addDays(s, -2))) heads.push(`This dress is still with ${now.out.customer_name || 'another customer'}, due back ${dmy(now.out.end_date)}${late ? ' (overdue)' : ''}. It may not be back in time for the new booking.`) }
  if (now.clean && s && s <= addDays(todayIST(), 7)) heads.push(`This dress is in the cleaning workflow (${now.clean.status === 'to_be_sent' ? 'waiting to be sent to the cleaner' : now.clean.status === 'sent' ? 'with the cleaner' : 'back from the cleaner, to be checked'}). Check it will be ready by the delivery date.`)
  const valid = !!(s && e && e >= s)
  const clash = valid ? busy.filter(b => s <= b.hold_end && e >= b.start_date) : []
  const realClash = clash.some(b => !b.end_date || (s <= b.end_date && e >= b.start_date))
  const gapOnly = clash.length > 0 && !realClash
  const avail = dress.status === 'available'
  const free = valid && avail && clash.length === 0
  const canBook = valid && avail && (free || (gapOnly && checked))
  const p = valid ? price(dress, s, e) : null
  const net = p ? Math.max(0, p.rent - (+f.discount || 0)) : 0
  const depDue = p ? Math.max(Math.round(net * advancePct / 100), advanceMin) : 0
  const cust = Math.max(0, Math.round(+f.custom || 0))
  const total = net + cust, received = +f.advance || 0, balance = Math.max(0, total - Math.max(0, received - depDue))
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }))
  const setDates = (fn: (v: string) => void) => (x: any) => { fn(x.target.value); setChecked(false); setMsg('') }

  // Event date follows the delivery date until the staff member sets it themselves.
  useEffect(() => { if (!eventTouched && s) setF(x => ({ ...x, eventDate: e && addDays(s, 1) > e ? s : addDays(s, 1) })) }, [s, e, eventTouched])
  // Returning customers: look the mobile number up in earlier bookings so details are not typed twice.
  useEffect(() => {
    const d = f.phone.replace(/\D/g, '').slice(-10); setKnown(null); if (d.length < 10) return
    const t = setTimeout(async () => { const { data } = await supa().from('booking_view').select('*').ilike('phone', '%' + d).order('start_date', { ascending: false }).limit(20); if (data?.length) setKnown({ name: data[0].customer_name, email: data[0].email || '', n: data.length }) }, 350)
    return () => clearTimeout(t)
  }, [f.phone])

  const altText = useMemo(() => {
    const picked = Object.entries(items).map(([k, n]) => `${LBL[k] || k}${n.trim() ? ` (${n.trim()})` : ''}`).join('; ')
    return alt === 'none' ? '' : picked || 'Alterations needed – details to be confirmed'
  }, [alt, items])
  const hasMeas = Object.values(meas).some(v => v.trim())

  function step1ok() {
    setMsg('')
    if (!valid || !canBook) { setMsg('Choose dates that are available for this dress.'); return false }
    if (!f.name.trim() || f.phone.replace(/\D/g, '').length < 10) { setMsg(ERR.BAD_CONTACT); return false }
    if (!f.eventDate) { setMsg('Event date is required.'); return false }
    if (f.dMode === 'courier' && !f.dAddr.trim()) { setMsg('Please enter the delivery address, or choose that the customer collects from the store.'); return false }
    if (f.eventDate < s || f.eventDate > e) { setMsg(`The event date must fall between delivery (${dmy(s)}) and return (${dmy(e)}).`); return false }
    return true
  }
  function step2ok() {
    setMsg(''); if (alt === 'now' && !Object.keys(items).length) { setMsg('Tick at least one alteration, or choose “measurements to be taken later”.'); return false }
    return true
  }
  async function confirm() {
    const amt = +f.advance, dep = Math.min(amt || 0, depDue), rentPaid = Math.max(0, (amt || 0) - dep)
    if (!(amt > 0)) return setMsg('Amount received is required. Enter the amount collected now.')
    if (!f.mode) return setMsg('Please select the payment mode (Cash, GPay / UPI or Card).')
    if (amt < depDue) return setMsg(`Amount received must be at least the refundable deposit of ${inr(depDue)}.`)
    if (rentPaid > net + cust) return setMsg('Amount received cannot be more than the refundable deposit plus the rent and customization charge.')
    setWait(true); setMsg('')
    const sb = supa(), w: string[] = []
    // ONE database call creates the booking, its payments, event and delivery details and the alteration job together:
    // either everything is saved or nothing is, so there is no half-created booking to repair by hand.
    const checklist = Object.entries(items).map(([k, note]) => ({ k, note: note.trim() })), measurements = Object.fromEntries(Object.entries(meas).filter(([, v]) => v.trim()))
    const hasDelivery = f.dMode === 'courier'   // nothing set = the customer collects from the store
    const { data: id, error } = await sb.rpc('staff_create_booking_full', {
      p_dress: dress.id, p_start: s, p_end: e, p_name: f.name, p_phone: f.phone, p_email: f.email || null, p_alt_notes: altText || null, p_advance: Math.min(rentPaid, net), p_mode: f.mode,
      p_discount: +f.discount || 0, p_override: gapOnly && checked, p_custom: cust, p_deposit: dep, p_deposit_ref: f.ref.trim() || null, p_cust_paid: rentPaid - Math.min(rentPaid, net),
      p_event_date: f.eventDate, p_event_type: f.eventType, p_notes: f.notes || null,
      p_alt: alt !== 'none' ? { requirements: altText, checklist, measurements, measurements_pending: alt === 'later' && !hasMeas } : null,
      p_delivery: hasDelivery ? { mode: 'courier', address: f.dAddr } : null })
    if (error) { setWait(false); const k = Object.keys(ERR).find(k => error.message.includes(k)); return setMsg(k ? ERR[k] : /Could not find the function|PGRST202|staff_create_booking_full/i.test(error.message) ? 'The booking update (migration-v17) has not been applied to the database yet, so nothing was saved.' : 'Something went wrong, so nothing was saved. Please try again.') }
    setWait(false); setWarns(w); setDone({ id, total, received: amt, balance, depDue })
    setStep('done')
  }

  const stepper = (typeof step === 'number') && <ol className="bf-steps" aria-label="Booking progress">{STEPS.map((l, i) => <li key={l} className={step === i + 1 ? 'cur' : step > i + 1 ? 'done' : ''}><i>{step > i + 1 ? '✓' : i + 1}</i><span>{l}</span></li>)}</ol>
  const avBanner = <>
    {valid && !avail && <div className="bk-avail no"><div><b>Not available</b><span>This dress is currently marked {dress.status}.</span></div></div>}
    {valid && avail && realClash && <div className="bk-avail no"><div><b>Not available for those dates</b><span>Try nearby dates or browse similar dresses.</span></div></div>}
    {valid && avail && gapOnly && <><div className="bk-avail no"><div><b>{GAP}</b><span>Each dress needs a day for cleaning and preparation between rentals.</span></div></div>
      <label className="bf-check"><input type="checkbox" checked={checked} onChange={x => setChecked(x.target.checked)} />I have checked and confirmed availability. Book inside the cleaning period.</label></>}
    {free && <div className="bk-avail"><div><b>Available</b><span>Free on the selected dates</span></div></div>}
    {e && s && e < s && <div className="bk-avail no"><div><b>Return is before delivery</b><span>Choose a return date on or after the delivery date.</span></div></div>}
    {valid && avail && !realClash && heads.length > 0 && <div className="bk-avail no" style={{ borderColor: '#c58a2b', background: '#c58a2b14' }}><div><b>Check before confirming</b>{heads.map(h => <span key={h} style={{ display: 'block' }}>{h}</span>)}</div></div>}</>
  const datePair = (min: boolean) => <div className="bk-g2">
    <label className="bk-f">Delivery / pickup date *<input type="date" min={todayIST()} value={s} onChange={setDates(setS)} /></label>
    <label className="bk-f">Return date *<input type="date" min={s || todayIST()} value={e} onChange={setDates(setE)} /></label>
    {min && <div className="bk-dur">Duration{valid && p ? <span className="pill">{p.n} day{p.n === 1 ? '' : 's'}</span> : <span className="pill" style={{ opacity: .4 }}>–</span>}</div>}</div>

  if (step === 'done' && done) {
    const digits = f.phone.replace(/\D/g, '').slice(-10)
    const text = `Swaasa Wedding Rentals — booking confirmed\nBooking ID: ${done.id}\n${dress.name} (${dress.code})\nDelivery: ${dmy(s)}  ·  Return: ${dmy(e)}\nEvent: ${f.eventType}, ${dmy(f.eventDate)}\nTotal ${inr(done.total)}  ·  Received ${inr(done.received)}  ·  Balance at delivery ${inr(done.balance)}\nThank you!`
    return <section className="sec"><div className="bf-done"><div className="bf-tick">✓</div><h1>Booking confirmed</h1><p className="mut">Give this booking ID to the customer. It also shows on the calendar.</p>
      <div className="bf-id" aria-label="Booking ID">{done.id}</div>
      <dl className="bf-sum"><div><dt>Dress</dt><dd>{dress.name} · {dress.code}</dd></div><div><dt>Customer</dt><dd>{f.name} · {f.phone}</dd></div><div><dt>Delivery → Return</dt><dd>{dmy(s)} → {dmy(e)}</dd></div><div><dt>Event</dt><dd>{f.eventType} · {dmy(f.eventDate)}</dd></div>
        <div><dt>Total / Received</dt><dd>{inr(done.total)} / {inr(done.received)}</dd></div><div><dt>Balance at delivery</dt><dd><b>{inr(done.balance)}</b></dd></div>
        {alt !== 'none' && <div><dt>Alterations</dt><dd>{altText}{alt === 'later' && !hasMeas && <span className="bf-flag">Measurements pending</span>}</dd></div>}</dl>
      {warns.map(w => <p key={w} className="bad">{w}</p>)}
      <div className="bf-actions"><a className="btn wine" href={`https://wa.me/91${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        <button className="btn alt" onClick={() => navigator.clipboard?.writeText(text)}>Copy details</button><a className="btn alt" href="/admin">Open admin</a><a className="btn alt" href="/collection">Take another booking</a></div></div></section>
  }

  return <section className="sec">
    <div className="bk-top"><h1>Take Booking</h1>{stepper}<span className="chip-id">Dress ID: {dress.code}</span></div>
    <div className="bk-page"><div>{left}</div><div>
      {step === 'check' && <>
        <div className="bf-info">{info}</div>
        <div className="bf-panel"><h3>Check availability</h3>{datePair(true)}{avBanner}
          <p className="mut" style={{ fontSize: 12, margin: '10px 0 0' }}>Availability includes the cleaning and preparation day after each booking.</p></div>
        <button className="btn wine" style={{ marginTop: 16 }} disabled={!canBook} onClick={() => { setMsg(''); setStep(1) }}>Book now →</button>
        <p className="mut" style={{ fontSize: 12 }}>Your selected dates carry into the booking form. Availability is checked again when you confirm.</p></>}

      {step === 1 && <div className="bf-panel"><h3>Booking &amp; customer details</h3>
        <div className="bk-g2"><label className="bk-f">Booking date<input type="date" value={todayIST()} disabled /></label><span />
          <label className="bk-f">Delivery date *<input type="date" min={todayIST()} value={s} onChange={setDates(setS)} /></label>
          <label className="bk-f">Return date *<input type="date" min={s || todayIST()} value={e} onChange={setDates(setE)} /></label>
          <label className="bk-f">Event type<select value={f.eventType} onChange={x => set('eventType', x.target.value)}>{EVENTS.map(v => <option key={v}>{v}</option>)}</select></label>
          <label className="bk-f">Event date *<input type="date" value={f.eventDate} onChange={x => { setEventTouched(true); set('eventDate', x.target.value) }} /></label></div>
        {avBanner}
        <h4 className="bf-h">Customer details</h4>
        <div className="bk-g2"><label className="bk-f">Mobile *<input type="tel" inputMode="numeric" placeholder="10-digit contact number" value={f.phone} onChange={x => set('phone', x.target.value)} /></label>
          <label className="bk-f">Name *<input placeholder="Customer name" value={f.name} onChange={x => set('name', x.target.value)} /></label></div>
        {known && !f.name && <div className="bf-known">Returning customer · {known.n} earlier booking{known.n === 1 ? '' : 's'} <button type="button" className="textlink" onClick={() => setF(x => ({ ...x, name: known.name, email: x.email || known.email }))}>Use {known.name}</button></div>}
        <label className="bk-f" style={{ marginTop: 10 }}>Email (optional)<input type="email" placeholder="Email address" value={f.email} onChange={x => set('email', x.target.value)} /></label>
        <div className="bk-g2" style={{ marginTop: 10 }}>
          <label className="bk-f">Delivery<select value={f.dMode} onChange={x => set('dMode', x.target.value)}><option value="">Customer collects from store</option><option value="courier">We deliver to the customer</option></select></label>
        </div>
        {f.dMode === 'courier' && <label className="bk-f" style={{ marginTop: 8 }}>Delivery address *<textarea rows={2} value={f.dAddr} onChange={x => set('dAddr', x.target.value)} /></label>}
        <label className="bk-f" style={{ marginTop: 10 }}>Booking notes (optional, internal)<textarea rows={2} placeholder="For the team only. The tailor does not see this. Alteration details are entered above." value={f.notes} onChange={x => set('notes', x.target.value)} /></label>
        {msg && <p className="bad">{msg}</p>}
        <div className="bk-act"><button className="btn alt" onClick={() => { setMsg(''); setStep('check') }}>Back</button>
          <button className="btn alt" onClick={() => { if (step1ok()) { setAlt('none'); setStep(3) } }}>No alterations needed</button>
          <button className="btn wine" onClick={() => { if (step1ok()) { if (alt === 'none') setAlt('now'); setStep(2) } }}>Continue to alterations →</button></div></div>}

      {step === 2 && <div className="bf-panel"><h3>Alterations</h3>
        {f.notes.trim() && <p className="bf-note"><b>Booking notes:</b> {f.notes}</p>}
        <div className="bf-modes" role="radiogroup" aria-label="Alterations">{([['now', 'Alterations needed', 'Add the details now'], ['later', 'Measurements to be taken later', 'Book now; measurements are added before dispatch'], ['none', 'No alterations needed', 'Skip this step']] as [Alt, string, string][]).map(([k, t, sub]) =>
          <button key={k} role="radio" aria-checked={alt === k} className={'bf-mode' + (alt === k ? ' on' : '')} onClick={() => { setAlt(k); setMsg('') }}><i /><span><b>{t}</b><small>{sub}</small></span></button>)}</div>
        {alt === 'later' && <p className="bf-note warn">The booking will be flagged <b>Measurements pending</b>. The alteration appears in the Alterations queue with a reminder, and staff are warned if it is sent to the tailor before measurements are recorded. Take measurements at least 3 days before delivery ({dmy(addDays(s, -3))}).</p>}
        {alt !== 'none' && <div className="bf-alt">
          <div><h4 className="bf-h">Alteration requirements</h4>{GROUPS.map(g => <div key={g.title} className="bf-grp"><span>{g.title}</span>{g.items.map(([k, l]) => <div key={k} className="bf-it"><label><input type="checkbox" checked={k in items} onChange={() => setItems(x => { const n = { ...x }; if (k in n) delete n[k]; else n[k] = ''; return n })} />{l}</label>{k in items && <input placeholder="Add notes…" value={items[k]} onChange={x => setItems({ ...items, [k]: x.target.value })} />}</div>)}</div>)}</div>
          <div><details className="bf-meas" open={alt === 'now'}><summary>Measurements (optional)</summary><div className="bk-g2">{MEAS.map(([k, l]) => <label key={k} className="bk-f">{l}<input placeholder={k === 'other' ? 'e.g. shoulder 15 in' : 'inches'} value={meas[k] || ''} onChange={x => setMeas({ ...meas, [k]: x.target.value })} /></label>)}</div></details>
            <label className="bk-f" style={{ marginTop: 12 }}>Customization charge (₹), optional<input type="number" min="0" placeholder="e.g. 300" value={f.custom} onChange={x => set('custom', x.target.value)} /></label></div></div>}
        {msg && <p className="bad">{msg}</p>}
        <div className="bk-act"><button className="btn alt" onClick={() => { setMsg(''); setStep(1) }}>← Booking details</button><button className="btn wine" onClick={() => { if (step2ok()) setStep(3) }}>Continue to payment →</button></div></div>}

      {step === 3 && <div className="bf-panel"><h3>Payment details</h3>
        <div className="bk-g2"><label className="bk-f">Payment received now (₹) *<input type="number" min="1" value={f.advance} onChange={x => set('advance', x.target.value)} /></label>
          <label className="bk-f">Payment mode *<select value={f.mode} onChange={x => set('mode', x.target.value)}><option value="">Select mode</option>{PAY_MODES.map(m => <option key={m}>{m}</option>)}</select></label></div>
        <label className="bk-f" style={{ marginTop: 10 }}>Payment reference (optional)<input placeholder="UPI reference / note" value={f.ref} onChange={x => set('ref', x.target.value)} /></label>
        {staff === 'owner' && <><button type="button" className="textlink" style={{ marginTop: 10 }} onClick={() => setShowDisc(v => !v)}>{showDisc ? '▾' : '▸'} Add discount</button>
          {showDisc && <label className="bk-f" style={{ marginTop: 6 }}>Discount (₹)<input type="number" min="0" placeholder="Amount (if any)" value={f.discount} onChange={x => set('discount', x.target.value)} /></label>}</>}
        <p className="mut" style={{ fontSize: 13 }}>Refundable deposit of {inr(depDue)} is collected first; any amount above it counts toward rent.</p>
        {p && <section className="bk-sum"><div><div className="row"><span>Rent (selected dates)</span><span>{inr(p.rent)}</span></div>{net !== p.rent && <div className="row"><span>Discount</span><span>−{inr(p.rent - net)}</span></div>}
          <div className="row"><span>Customization</span><span>{inr(cust)}</span></div><div className="row tot"><span>Total</span><span>{inr(total)}</span></div></div>
          <div><div className="row"><span>Refundable deposit</span><span>{inr(depDue)}</span></div><div className="row" style={{ color: 'var(--ok)' }}><span>Received now</span><span>{inr(received)}</span></div><div className="row bk-due"><span>Balance due at delivery</span><span>{inr(balance)}</span></div></div></section>}
        {alt === 'later' && !hasMeas && <p className="bf-note warn">Measurements are still to be taken. The booking will be flagged <b>Measurements pending</b>.</p>}
        {msg && <p className="bad">{msg}</p>}
        <div className="bk-act"><button className="btn alt" onClick={() => { setMsg(''); setStep(alt === 'none' ? 1 : 2) }}>← {alt === 'none' ? 'Booking details' : 'Alterations'}</button><button className="btn wine" disabled={wait} onClick={confirm}>{wait ? 'Confirming…' : '✓ Confirm booking'}</button></div></div>}
    </div></div></section>
}
