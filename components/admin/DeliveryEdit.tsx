'use client'
import { useState } from 'react'

export type DeliveryResult = { mode: 'pickup' | 'courier'; address: string }

// One choice, and an address only when we deliver. Nothing set = the customer collects from the store.
export default function DeliveryEdit({ b, onClose }: { b: any; onClose: (v: DeliveryResult | null) => void }) {
  const [mode, setMode] = useState<'pickup' | 'courier'>(b.delivery_mode === 'courier' ? 'courier' : 'pickup'), [addr, setAddr] = useState(b.delivery_address || ''), [err, setErr] = useState('')
  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (mode === 'courier' && !addr.trim()) return setErr('Please enter the delivery address.')
    onClose({ mode, address: mode === 'courier' ? addr.trim() : '' })
  }
  return <div className="cxl-back" role="dialog" aria-modal="true" aria-labelledby="dlv-title">
    <form className="box cxl" onSubmit={submit}>
      <h3 id="dlv-title">Delivery: {b.id}</h3>
      <fieldset className="cxl-ask">
        <label className={'cxl-opt' + (mode === 'pickup' ? ' on' : '')}><input type="radio" name="dm" checked={mode === 'pickup'} onChange={() => setMode('pickup')} /><span><b>Collect from store</b></span></label>
        <label className={'cxl-opt' + (mode === 'courier' ? ' on' : '')}><input type="radio" name="dm" checked={mode === 'courier'} onChange={() => setMode('courier')} /><span><b>Deliver to the customer</b></span></label>
      </fieldset>
      {mode === 'courier' && <label>Delivery address<textarea rows={3} value={addr} onChange={e => setAddr(e.target.value)} autoFocus /></label>}
      {err && <p className="cxl-err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn">Save</button><button type="button" className="btn alt" onClick={() => onClose(null)}>Cancel</button></div>
    </form>
  </div>
}
