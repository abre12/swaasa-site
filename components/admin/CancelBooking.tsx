'use client'
import { useState } from 'react'
import { dmy, inr, PAY_MODES } from '@/lib/util'

export type CancelResult = { refund: number; mode: string; reason: string }

// Cancellation popup. Asks whether the customer gets a refund, how much and in which mode, and why the booking is cancelled.
// Staff: the answers go to the owner for approval and the booking stays active until then. Owner: applied straight away.
export default function CancelBooking({ b, owner, onClose }: { b: any; owner: boolean; onClose: (v: CancelResult | null) => void }) {
  const paid = Math.max(0, Math.round(b.paid || 0)), dep = Math.max(0, Math.round(b.deposit_held || 0))
  const [give, setGive] = useState<'no' | 'yes'>('no'), [amt, setAmt] = useState(String(paid)), [mode, setMode] = useState(''), [reason, setReason] = useState(''), [err, setErr] = useState('')
  const refund = give === 'yes' ? Math.round(+amt || 0) : 0
  const total = refund + dep

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!reason.trim()) return setErr('Please give the reason for the cancellation.')
    if (give === 'yes' && !(refund > 0 && refund <= paid)) return setErr(`Enter a refund between ₹1 and ${inr(paid)}.`)
    if (total > 0 && !mode) return setErr('Select how the refund will be paid.')
    onClose({ refund, mode: mode || 'Cash', reason: reason.trim() })
  }

  return <div className="cxl-back" role="dialog" aria-modal="true" aria-labelledby="cxl-title">
    <form className="box cxl" onSubmit={submit}>
      <h3 id="cxl-title">Cancel booking {b.id}</h3>
      <p className="cxl-note">{b.dress_code} · {b.customer_name} · {dmy(b.start_date)} – {dmy(b.end_date)}. Cancelling is for rare cases only; the dress becomes available again for these dates.</p>
      <div className="cxl-sum"><div><span>Rent received</span><b>{inr(paid)}</b></div><div><span>Refundable deposit held</span><b>{inr(dep)}</b></div></div>

      {paid > 0 && <fieldset className="cxl-ask"><legend>Refund any of the rent to the customer?</legend>
        <label className={'cxl-opt' + (give === 'no' ? ' on' : '')}><input type="radio" name="give" checked={give === 'no'} onChange={() => setGive('no')} /><span><b>No refund</b><br /><small className="mut">The rent received is kept.</small></span></label>
        <label className={'cxl-opt' + (give === 'yes' ? ' on' : '')}><input type="radio" name="give" checked={give === 'yes'} onChange={() => setGive('yes')} /><span><b>Yes, refund</b><br /><small className="mut">Up to {inr(paid)}.</small></span></label>
        {give === 'yes' && <label>Rent to refund (₹)<input type="number" min="1" max={paid} value={amt} onChange={e => setAmt(e.target.value)} /></label>}
      </fieldset>}
      {paid === 0 && dep === 0 && <p className="cxl-note">Nothing has been received on this booking, so there is nothing to refund.</p>}
      {dep > 0 && <p className="cxl-note">The refundable deposit of {inr(dep)} is returned to the customer in full.</p>}

      {total > 0 && <>
        <label>Refund payment mode<select value={mode} onChange={e => setMode(e.target.value)}><option value="">Select…</option>{PAY_MODES.map(m => <option key={m}>{m}</option>)}</select></label>
        <div className="cxl-total"><span>Total to hand back to the customer</span><b>{inr(total)}</b></div>
      </>}

      <label>Reason for cancellation<input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Customer changed the event date" /></label>
      <p className="cxl-note">{owner ? 'As the owner, your decision is applied straight away.' : 'This request goes to the owner. The booking stays active, and no refund is paid, until the owner approves.'}</p>
      {err && <p className="cxl-err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn">{owner ? 'Cancel booking' : 'Send to owner for approval'}</button><button type="button" className="btn alt" onClick={() => onClose(null)}>Keep booking</button></div>
    </form>
  </div>
}
