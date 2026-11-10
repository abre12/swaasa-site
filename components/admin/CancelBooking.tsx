'use client'
import { useState } from 'react'
import { dmy, inr, PAY_MODES } from '@/lib/util'

export type CancelResult = { rent: number; deposit: number; mode: string; reason: string; note: string }

// Cancellation popup. POLICY: no refund. The rent received and the security deposit are kept unless the owner decides otherwise.
// Owner: chooses any refund (default ₹0) and it is applied straight away.
// Staff: can only RECOMMEND a refund (default ₹0, with a reason); the booking stays active until the owner decides.
export default function CancelBooking({ b, owner, onClose }: { b: any; owner: boolean; onClose: (v: CancelResult | null) => void }) {
  const paid = Math.max(0, Math.round(b.paid || 0)), dep = Math.max(0, Math.round(b.deposit_held || 0))
  const [reason, setReason] = useState(''), [open, setOpen] = useState(false), [rent, setRent] = useState('0'), [dp, setDp] = useState('0'), [mode, setMode] = useState(''), [note, setNote] = useState(''), [err, setErr] = useState('')
  const askRefund = owner || open
  const rr = askRefund ? Math.round(+rent || 0) : 0, dr = askRefund ? Math.round(+dp || 0) : 0, back = rr + dr, kept = paid + dep - back

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!reason.trim()) return setErr('Please give the reason for the cancellation.')
    if (rr < 0 || rr > paid) return setErr(`Rent refund must be between ₹0 and ${inr(paid)}.`)
    if (dr < 0 || dr > dep) return setErr(`Deposit refund must be between ₹0 and ${inr(dep)}.`)
    if (!owner && back > 0 && !note.trim()) return setErr('Please say why you recommend a refund, so the owner can decide.')
    if (owner && back > 0 && !mode) return setErr('Select how the refund will be paid.')
    onClose({ rent: rr, deposit: dr, mode: mode || 'Cash', reason: reason.trim(), note: note.trim() })
  }

  const fields = <>
    {paid > 0 && <label>{owner ? 'Rent to refund (₹)' : 'Rent refund you recommend (₹)'}<input type="number" min="0" max={paid} value={rent} onChange={e => setRent(e.target.value)} /><small className="mut">Received: {inr(paid)}</small></label>}
    {dep > 0 && <label>{owner ? 'Security deposit to refund (₹)' : 'Deposit refund you recommend (₹)'}<input type="number" min="0" max={dep} value={dp} onChange={e => setDp(e.target.value)} /><small className="mut">Held: {inr(dep)}</small></label>}
    {owner && back > 0 && <label>Refund payment mode<select value={mode} onChange={e => setMode(e.target.value)}><option value="">Select…</option>{PAY_MODES.map(m => <option key={m}>{m}</option>)}</select></label>}
    {!owner && <label>Why do you recommend it?<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Family emergency, event postponed by the family" /></label>}
  </>

  return <div className="cxl-back" role="dialog" aria-modal="true" aria-labelledby="cxl-title">
    <form className="box cxl" onSubmit={submit}>
      <h3 id="cxl-title">Cancel booking {b.id}</h3>
      <p className="cxl-note">{b.dress_code} · {b.customer_name} · {dmy(b.start_date)} – {dmy(b.end_date)}. The dress becomes available again for these dates.</p>
      <div className="cxl-sum"><div><span>Rent received</span><b>{inr(paid)}</b></div><div><span>Security deposit held</span><b>{inr(dep)}</b></div></div>
      <p className="cxl-note"><b>Policy: no refund.</b> The rent and the security deposit are kept unless the owner decides to refund some or all of it.</p>

      <label>Reason for cancellation<input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Customer changed the event date" /></label>

      {paid + dep === 0 ? <p className="cxl-note">Nothing has been received on this booking, so there is nothing to refund.</p>
        : owner ? <fieldset className="cxl-ask"><legend>Refund to the customer (your decision)</legend>{fields}</fieldset>
        : <>
          <label className="cxl-opt"><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} /><span><b>Recommend a refund to the owner</b><br /><small className="mut">Leave this off if no refund is due. Only the owner can approve a refund.</small></span></label>
          {open && <fieldset className="cxl-ask"><legend>Your recommendation</legend>{fields}</fieldset>}
        </>}

      {paid + dep > 0 && <div className="cxl-total"><span>{owner ? 'To hand back to the customer' : 'Refund recommended'}</span><b>{inr(back)}</b></div>}
      {paid + dep > 0 && owner && <p className="cxl-note">Kept under the cancellation policy: <b>{inr(kept)}</b></p>}
      <p className="cxl-note">{owner ? 'As the owner, your decision is applied straight away.' : 'This request goes to the owner. The booking stays active, and nothing is refunded, until the owner decides.'}</p>
      {err && <p className="cxl-err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn">{owner ? 'Cancel booking' : 'Send to owner for decision'}</button><button type="button" className="btn alt" onClick={() => onClose(null)}>Keep booking</button></div>
    </form>
  </div>
}
