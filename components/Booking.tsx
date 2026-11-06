'use client'
import { useEffect, useMemo, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { dmy, inr, PAY_MODES, price, todayIST } from '@/lib/util'

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: 'Fit & Size', items: [['waist', 'Waist Adjustment'], ['bust', 'Bust Adjustment'], ['hem', 'Length / Hem']] },
  { title: 'Upper Body', items: [['shoulder', 'Shoulder Adjustment'], ['strap', 'Strap Adjustment'], ['sleeve', 'Sleeve Adjustment']] },
  { title: 'Bridal Wear', items: [['blouse', 'Blouse Fitting'], ['padding', 'Padding Adjustment'], ['hooks', 'Hooks / Zip Adjustment']] },
  { title: 'Other', items: [['other', 'Other Alteration']] },
]
const LABELS = Object.fromEntries(GROUPS.flatMap(g => g.items))
const MEASUREMENTS = [['bust', 'Bust'], ['waist', 'Waist'], ['hip', 'Hip'], ['length', 'Length'], ['other', 'Other']]
const FRIENDLY_ERROR: Record<string, string> = {
  BAD_DATES: 'Review the booking and event dates, then try again.', BAD_CONTACT: 'Enter the customer’s name and a valid mobile number.',
  DATES_TAKEN: 'Those dates were just taken. Choose another date range.', GAP_CLASH: 'The cleaning and preparation buffer conflicts with another booking.',
  NOT_AVAILABLE: 'This dress is no longer available for booking.', OWNER_ONLY: 'Only the owner can apply a discount.', FORBIDDEN: 'Your staff access is no longer active. Sign in again.',
}

type Step = 0 | 1 | 2 | 3
type Form = { bookingDate: string; eventType: string; eventDate: string; name: string; phone: string; email: string; notes: string; alterationNotes: string; custom: string; amount: string; mode: string; reference: string; discount: string }

export default function Booking({ dress, advancePct, advanceMin = 1000, staff, initialFrom, initialTo }: { dress: any; advancePct: number; advanceMin?: number; staff: string | null; initialFrom?: string; initialTo?: string }) {
  const [step, setStep] = useState<Step>(0)
  const [start, setStart] = useState(initialFrom || '')
  const [end, setEnd] = useState(initialTo || '')
  const [busy, setBusy] = useState<any[] | null>(null)
  const [checked, setChecked] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [measure, setMeasure] = useState<Record<string, string>>({})
  const [form, setForm] = useState<Form>({ bookingDate: todayIST(), eventType: 'Wedding', eventDate: initialFrom || '', name: '', phone: '', email: '', notes: '', alterationNotes: '', custom: '', amount: '', mode: '', reference: '', discount: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [bookingId, setBookingId] = useState('')
  const update = (key: keyof Form, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    let alive = true
    supa().rpc('dress_busy', { p_dress: dress.id }).then(({ data, error: e }) => { if (alive) { if (e) setError('Could not load booked dates. Refresh the page and try again.'); else setBusy(data || []) } })
    return () => { alive = false }
  }, [dress.id])

  const validDates = !!(start && end && end >= start && start >= todayIST())
  const duration = validDates ? Math.round((+new Date(end + 'T00:00:00Z') - +new Date(start + 'T00:00:00Z')) / 86400000) + 1 : 0
  const busyDates = useMemo(() => validDates ? (busy || []).filter(b => start <= b.hold_end && end >= b.start_date) : [], [validDates, busy, start, end])
  const actualConflict = busyDates.some(b => !b.end_date || (start <= b.end_date && end >= b.start_date))
  const cleaningConflict = busyDates.length > 0 && !actualConflict
  const available = dress.status === 'available' && busy !== null && validDates && duration <= 31 && !actualConflict && (!cleaningConflict || (!!staff && checked))
  const pricing = validDates && duration <= 31 ? price(dress, start, end) : null
  const discount = Math.max(0, Math.round(+form.discount || 0))
  const rentAfterDiscount = Math.max(0, (pricing?.rent || 0) - discount)
  const customization = Math.max(0, Math.round(+form.custom || 0))
  const total = rentAfterDiscount + customization
  const deposit = pricing ? Math.max(Math.round(rentAfterDiscount * advancePct / 100), advanceMin) : 0
  const received = Math.max(0, Math.round(+form.amount || 0))
  const balance = Math.max(0, total - Math.max(0, received - deposit))
  const dateLabel = (s: string) => s ? dmy(s) : '—'

  const setDates = (which: 'start' | 'end', value: string) => {
    if (which === 'start') { setStart(value); if (!form.eventDate || form.eventDate < value) update('eventDate', value) }
    else setEnd(value)
    setChecked(false)
    setError('')
  }

  function validateBooking() {
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 10) return 'Enter the customer’s name and a valid mobile number.'
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address or leave it blank.'
    if (!form.eventDate || form.eventDate < start || form.eventDate > end) return 'Choose an event date between delivery and return.'
    return ''
  }

  function changeStep(next: Step) { setError(''); setStep(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  async function confirmBooking() {
    const amount = Math.round(+form.amount || 0)
    if (discount > (pricing?.rent || 0)) return setError('Discount cannot be greater than the rental price.')
    if (!form.mode) return setError('Select the payment mode.')
    if (amount < deposit) return setError(`Collect at least ${inr(deposit)} for the refundable deposit.`)
    if (amount > deposit + total) return setError('Amount received cannot exceed the booking total plus the refundable deposit.')
    if (selected.includes('other') && !form.alterationNotes.trim()) return setError('Describe the other alteration selected.')
    setSaving(true); setError('')
    const checklist = selected.map(k => ({ k, note: k === 'other' ? form.alterationNotes.trim() : '' }))
    const measurements = Object.fromEntries(Object.entries(measure).filter(([, value]) => value.trim()))
    const { data, error: saveError } = await supa().rpc('staff_create_booking_v2', {
      p_dress: dress.id, p_start: start, p_end: end, p_booking_date: form.bookingDate,
      p_event_type: form.eventType, p_event_date: form.eventDate, p_name: form.name.trim(), p_phone: form.phone,
      p_email: form.email.trim() || null, p_notes: form.notes.trim() || null,
      p_alteration_notes: [selected.map(k => LABELS[k]).join(', '), form.alterationNotes.trim()].filter(Boolean).join(' · ') || null,
      p_checklist: checklist, p_measurements: measurements, p_custom: customization, p_amount_received: amount,
      p_mode: form.mode, p_payment_reference: form.reference.trim() || null, p_discount: discount, p_override: cleaningConflict && checked,
    })
    setSaving(false)
    if (saveError || !data) {
      const match = Object.keys(FRIENDLY_ERROR).find(key => saveError?.message.includes(key))
      setError(match ? FRIENDLY_ERROR[match] : 'The booking could not be saved. Your details are still here; please try again.')
      return
    }
    setBookingId(String(data))
    changeStep(3)
  }

  if (!staff) return <section className="bk-sec"><h3>Staff sign-in required</h3><p>Please sign in with an active staff account to create a booking.</p><a className="btn wine" href="/login">Staff sign in</a></section>

  const stepNames = ['Dress & dates', 'Booking', 'Alterations', 'Payment']
  const status = busy === null ? ['Checking booked dates…', 'Availability will appear here.']
    : dress.status !== 'available' ? ['Not available', `This dress is marked ${dress.status}.`]
      : !start || !end ? ['Select dates', 'Choose delivery and return dates to check availability.']
        : start < todayIST() ? ['Choose a future date', 'Delivery / pickup cannot be in the past.']
          : end < start ? ['Check the date range', 'Return date must be on or after delivery.']
            : duration > 31 ? ['Date range is too long', 'A booking can be up to 31 rental days.']
              : actualConflict ? ['Not available for those dates', 'Try nearby dates or browse another dress.']
                : cleaningConflict && !checked ? ['Cleaning and preparation buffer', 'Choose different dates, or confirm the availability check to override.']
                  : ['Available', cleaningConflict ? 'Staff confirmed availability for this exception.' : 'Free on the selected dates.']

  return <div className="staff-booking">
    {step === 0 && <>
      <section className="bk-sec dress-description-panel"><h3>Dress details</h3><p className="dress-description">{dress.description || 'No description has been added for this dress yet.'}</p>
        <dl className="dress-facts"><dt>Colour</dt><dd>{dress.colour || '—'}</dd><dt>Sizes</dt><dd>{dress.sizes?.length ? dress.sizes.join(', ') : '—'}</dd><dt>Alterations</dt><dd>{dress.alterations || 'On request'}</dd></dl></section>
      <section className="bk-sec"><h3>Check availability</h3><div className="bk-dates">
        <label className="bk-f">Delivery / pickup<input type="date" min={todayIST()} value={start} onChange={e => setDates('start', e.target.value)} /></label>
        <label className="bk-f">Return<input type="date" min={start || todayIST()} value={end} onChange={e => setDates('end', e.target.value)} /></label>
        <div className="bk-dur">Duration<span className="pill">{duration ? `${duration} day${duration === 1 ? '' : 's'}` : '—'}</span></div></div>
        <div className={`bk-avail ${status[0] !== 'Available' ? 'no' : ''}`} role="status"><div><b>{status[0]}</b><span>{status[1]}</span></div></div>
        <p className="mut buffer-note">Availability includes the cleaning and preparation day after each booking.</p>
        {cleaningConflict && staff && <label className="gap-override"><input type="checkbox" checked={checked} onChange={e => { setChecked(e.target.checked); setError('') }} />I checked the calendar and confirmed this exception with the team.</label>}
        {validDates && !pricing && <p className="bad">This booking can be up to 31 rental days.</p>}
      </section>
      <button className="btn wine" disabled={!available || !pricing} onClick={() => changeStep(1)}>Book now →</button>
      <p className="mut booking-hint">The selected dates and dress will carry into the staff booking form.</p>
    </>}

    {step > 0 && <>
      <nav className="booking-stepper" aria-label="Booking progress">{stepNames.slice(1).map((label, i) => { const n = i + 1; return <span key={label} className={step === n ? 'active' : step > n ? 'done' : ''}><i>{step > n ? '✓' : n}</i>{label}</span> })}</nav>
      {step === 1 && <section className="bk-sec"><h3>Booking &amp; customer details</h3><div className="bk-g2">
        <label className="bk-f">Booking date *<input type="date" max={todayIST()} value={form.bookingDate} onChange={e => update('bookingDate', e.target.value)} /></label>
        <label className="bk-f">Delivery date *<input type="date" value={start} readOnly /></label>
        <label className="bk-f">Return date *<input type="date" value={end} readOnly /></label>
        <label className="bk-f">Event type<select value={form.eventType} onChange={e => update('eventType', e.target.value)}>{['Wedding', 'Reception', 'Engagement', 'Bridesmaid event', 'Other'].map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="bk-f">Event date *<input type="date" min={start} max={end} value={form.eventDate} onChange={e => update('eventDate', e.target.value)} /></label>
        <div className="bk-form-label bk-span">Customer details</div>
        <label className="bk-f">Name *<input autoComplete="name" value={form.name} onChange={e => update('name', e.target.value)} /></label>
        <label className="bk-f">Mobile *<input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => update('phone', e.target.value)} /></label>
        <label className="bk-f bk-span">Email <span className="mut">(optional)</span><input type="email" autoComplete="email" placeholder="Email address" value={form.email} onChange={e => update('email', e.target.value)} /></label>
        <label className="bk-f bk-span">Booking notes <span className="mut">(optional)</span><textarea rows={3} placeholder="Notes for this booking" value={form.notes} onChange={e => update('notes', e.target.value)} /></label>
      </div><div className="bk-act"><button className="btn alt" onClick={() => changeStep(0)}>← Dress &amp; dates</button><button className="btn alt" onClick={() => { setSelected([]); setMeasure({}); update('alterationNotes', ''); changeStep(3) }}>No alterations needed</button><button className="btn wine" onClick={() => { const e = validateBooking(); if (e) setError(e); else changeStep(2) }}>Continue to alterations →</button></div></section>}

      {step === 2 && <section className="bk-sec"><h3>Alteration requirements</h3><div className="booking-note-preview"><b>Booking notes:</b> {form.notes.trim() || 'No notes added'}</div><div className="alteration-layout">
        <div className="alteration-options">{GROUPS.map(group => <fieldset key={group.title}><legend>{group.title}</legend>{group.items.map(([key, label]) => <label className="alteration-choice" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={e => setSelected(items => e.target.checked ? [...items, key] : items.filter(item => item !== key))} /><span>{label}</span></label>)}</fieldset>)}
          {selected.includes('other') && <label className="bk-f other-alteration">Describe the other alteration *<textarea rows={3} value={form.alterationNotes} onChange={e => update('alterationNotes', e.target.value)} /></label>}
          {!selected.includes('other') && <label className="bk-f other-alteration">Additional tailoring notes <span className="mut">(optional)</span><textarea rows={3} value={form.alterationNotes} onChange={e => update('alterationNotes', e.target.value)} /></label>}
        </div>
        <div className="measurement-options"><h4>Measurements <span>(optional)</span></h4><p className="mut">Enter measurements in inches. These are added to the alteration record.</p><div className="bk-g2">{MEASUREMENTS.map(([key, label]) => <label className="bk-f" key={key}>{label}<input inputMode="decimal" value={measure[key] || ''} placeholder={key === 'other' ? 'Any other measurement' : 'Inches'} onChange={e => setMeasure(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}</div></div>
      </div><label className="bk-f custom-charge">Customization charge (₹), optional<input type="number" min="0" value={form.custom} onChange={e => update('custom', e.target.value)} /></label>
        <div className="bk-act"><button className="btn alt" onClick={() => changeStep(1)}>← Booking details</button><button className="btn wine" onClick={() => changeStep(3)}>Continue to payment →</button></div></section>}

      {step === 3 && !bookingId && <section className="bk-sec"><h3>Payment details</h3><div className="bk-g2">
        <label className="bk-f">Payment received now (₹) *<input type="number" min={deposit} value={form.amount} onChange={e => update('amount', e.target.value)} /><small>Refundable deposit of {inr(deposit)} is collected first; any extra counts toward rent.</small></label>
        <label className="bk-f">Payment mode *<select value={form.mode} onChange={e => update('mode', e.target.value)}><option value="">Select mode</option>{PAY_MODES.map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="bk-f bk-span">Payment reference (Optional)<input value={form.reference} onChange={e => update('reference', e.target.value)} /></label>
      </div>
      {staff === 'owner' && <details className="discount-option"><summary>Add discount</summary><label className="bk-f">Discount (₹)<input type="number" min="0" max={pricing?.rent || 0} value={form.discount} onChange={e => update('discount', e.target.value)} /><small>Owner only</small></label></details>}
      <p className="mut deposit-help">The refundable deposit is collected first. Any amount above it goes toward the rent and customization.</p>
      <section className="bk-sum booking-summary" aria-label="Payment summary"><div><div className="row"><span>Rent ({pricing?.n || 0} days)</span><span>{inr(pricing?.rent || 0)}</span></div>{discount > 0 && <div className="row"><span>Discount</span><span>−{inr(discount)}</span></div>}<div className="row"><span>Customization</span><span>{inr(customization)}</span></div><div className="row tot"><span>Total</span><span>{inr(total)}</span></div></div><div><div className="row"><span>Refundable deposit</span><span>{inr(deposit)}</span></div><div className="row received-row"><span>Received now</span><span>{inr(received)}</span></div><div className="row bk-due"><span>Balance due at delivery</span><span>{inr(balance)}</span></div></div></section>
      <div className="bk-act"><button className="btn alt" onClick={() => changeStep(2)}>← Alterations</button><button className="btn wine" disabled={saving} onClick={confirmBooking}>{saving ? 'Saving booking…' : '✓ Confirm booking'}</button></div></section>}

      {!!bookingId && <section className="bk-sec booking-confirmation"><span className="confirm-mark">✓</span><h2>Booking confirmed</h2><p>The booking is saved and available in the staff workspace.</p><strong className="confirm-ref">Booking reference · {bookingId}</strong><dl><dt>Customer</dt><dd>{form.name}</dd><dt>Dress</dt><dd>{dress.code} · {dress.name}</dd><dt>Rental dates</dt><dd>{dateLabel(start)} – {dateLabel(end)}</dd><dt>Event</dt><dd>{form.eventType} · {dateLabel(form.eventDate)}</dd><dt>Balance due at delivery</dt><dd>{inr(balance)}</dd></dl><a className="btn wine" href="/admin">Open staff workspace →</a><a className="btn alt" href="/">Start another booking</a></section>}
    </>}
    {error && <p className="bad booking-error" role="alert">{error}</p>}
  </div>
}
