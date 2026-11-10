'use client'
import { useState } from 'react'
import { dmy, inr, PAY_MODES } from '@/lib/util'

export type DecisionResult = { rent: number; deposit: number; mode: string; note: string }

// The owner's decision on a cancellation staff asked for. POLICY: no refund, unless the owner chooses to refund some or all.
// The boxes start at what staff recommended (₹0 if they recommended nothing); the owner can change both amounts freely.
export default function CancelDecision({ a, b, onClose }: { a: any; b: any; onClose: (v: DecisionResult | null) => void }) {
  const d = a.request_details || {}, paid = Math.max(0, Math.round(b?.paid || 0)), dep = Math.max(0, Math.round(b?.deposit_held || 0))
  const recR = Math.min(paid, Math.max(0, Math.round(d.rent_refund ?? d.refund_amount ?? 0))), recD = Math.min(dep, Math.max(0, Math.round(d.deposit_refund ?? 0)))
  const [rent, setRent] = useState(String(recR)), [dp, setDp] = useState(String(recD)), [mode, setMode] = useState(d.mode || ''), [note, setNote] = useState(''), [err, setErr] = useState('')
  const rr = Math.round(+rent || 0), dr = Math.round(+dp || 0), back = rr + dr, kept = paid + dep - back

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (rr < 0 || rr > paid) return setErr(`Rent refund must be between ₹0 and ${inr(paid)}.`)
    if (dr < 0 || dr > dep) return setErr(`Deposit refund must be between ₹0 and ${inr(dep)}.`)
    if (back > 0 && !mode) return setErr('Select how the refund will be paid.')
    onClose({ rent: rr, deposit: dr, mode: mode || 'Cash', note: note.trim() })
  }
  return <div className="cxl-back" role="dialog" aria-modal="true" aria-labelledby="cxd-title">
    <form className="box cxl" onSubmit={submit}>
      <h3 id="cxd-title">Cancellation decision: {a.booking_id}</h3>
      <p className="cxl-note">{b?.dress_code} · {b?.customer_name} · {b ? `${dmy(b.start_date)} – ${dmy(b.end_date)}` : ''}</p>
      <p className="cxl-note"><b>Reason given:</b> {a.reason || d.reason || '–'}<br /><b>Staff recommend:</b> {recR + recD > 0 ? `refund ${[recR > 0 ? `rent ${inr(recR)}` : '', recD > 0 ? `deposit ${inr(recD)}` : ''].filter(Boolean).join(' and ')}${d.justification ? ` because ${d.justification}` : ''}` : 'no refund'}</p>
      <div className="cxl-sum"><div><span>Rent received</span><b>{inr(paid)}</b></div><div><span>Security deposit held</span><b>{inr(dep)}</b></div></div>
      <p className="cxl-note"><b>Policy: no refund.</b> Set an amount only if you decide to refund.</p>
      {paid > 0 && <label>Rent to refund (₹)<input type="number" min="0" max={paid} value={rent} onChange={e => setRent(e.target.value)} /></label>}
      {dep > 0 && <label>Security deposit to refund (₹)<input type="number" min="0" max={dep} value={dp} onChange={e => setDp(e.target.value)} /></label>}
      {back > 0 && <label>Refund payment mode<select value={mode} onChange={e => setMode(e.target.value)}><option value="">Select…</option>{PAY_MODES.map(m => <option key={m}>{m}</option>)}</select></label>}
      <label>Note for the team (optional)<input value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="cxl-total"><span>{back > 0 ? 'Staff hand back to the customer' : 'Refund'}</span><b>{inr(back)}</b></div>
      <p className="cxl-note">Kept under the cancellation policy: <b>{inr(kept)}</b></p>
      {err && <p className="cxl-err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn">Approve cancellation</button><button type="button" className="btn alt" onClick={() => onClose(null)}>Back</button></div>
    </form>
  </div>
}
