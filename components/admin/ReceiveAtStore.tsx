'use client'
import { useState } from 'react'
import { dmy, todayIST } from '@/lib/util'
import { LBL, MEAS, QC } from './AlterationDrawer'

export type ReceiveResult = { action: 'ready' | 'check' | 'back'; received: string; note: string; qc: Record<string, boolean> } | null

// "Receive at Store": the dress is back from the tailoring unit. The alterations that were requested are shown as a note, so the person
// receiving it can check the work against them right there. If every check passes, the alteration can be closed as Ready straight away;
// otherwise the dress is booked in and waits for the quality check, or goes back to the tailor.
export default function ReceiveAtStore({ ctx, job, onClose }: { ctx: any; job: any; onClose: (v: ReceiveResult) => void }) {
  const b = ctx.B.find((x: any) => x.id === job.booking_id), d = ctx.dmap[job.dress_id], dmg = job.source === 'damage', today = todayIST()
  const items: { label: string; note: string }[] = (job.checklist || []).map((c: any) => ({ label: LBL[c.k] || c.k, note: c.note || '' }))
  const meas = MEAS.map(([k, l]) => [l, (job.measurements || {})[k]] as [string, string]).filter(([, v]) => String(v || '').trim())
  const [received, setReceived] = useState(today), [note, setNote] = useState(''), [qc, setQc] = useState<Record<string, boolean>>({}), [err, setErr] = useState('')
  const all = QC.every(([k]) => qc[k])

  function submit(action: 'ready' | 'check' | 'back') {
    if (!received) return setErr('Enter the date the dress was received.')
    if (received > today) return setErr('The received date cannot be in the future.')
    if (action === 'ready' && !all) return setErr('Tick every quality check to mark the alteration Ready, or choose “Received – check later”.')
    if (action === 'back' && !note.trim()) return setErr('Say what needs to be corrected in the notes, so the tailor knows.')
    onClose({ action, received, note: note.trim(), qc })
  }

  return <div className="cxl-back" role="dialog" aria-modal="true" aria-labelledby="rcv-title" onKeyDown={e => e.key === 'Escape' && onClose(null)}>
    <div className="box rcv">
      <h3 id="rcv-title">Receive at Store · Quality check</h3>
      <div className="rcv-who">{ctx.thumb(d, 44, 58)}<div><b>{d?.name || '—'}</b><small>SKU: {d?.code || '—'} · Booking {job.booking_id}{b?.customer_name ? ` · ${b.customer_name}` : ''}</small>{b && !dmg && <small>Delivery: {dmy(b.start_date)}</small>}</div></div>

      <div className="rcv-note" role="note"><b>{dmg ? 'Repair requested' : 'Alterations requested'} · check the dress against this</b>
        {items.length > 0 && <ul>{items.map((i, n) => <li key={n}><b>{i.label}</b>{i.note && <span> — {i.note}</span>}</li>)}</ul>}
        {job.requirements && <p><span>{dmg ? 'Damage notes' : 'Booking notes'}:</span> {job.requirements}</p>}
        {job.notes && <p><span>Job notes:</span> {job.notes}</p>}
        {!items.length && !job.requirements && <p>No alteration details were recorded.</p>}
        {meas.length > 0 && <p><span>Measurements:</span> {meas.map(([l, v]) => `${l} ${v}`).join(' · ')}</p>}
      </div>

      <label>Date received back at the store<input type="date" value={received} max={today} onChange={e => setReceived(e.target.value)} /></label>
      <fieldset className="rcv-qc"><legend>Quality check</legend>
        {QC.map(([k, l]) => <label key={k} className="rcv-chk"><input type="checkbox" checked={!!qc[k]} onChange={e => setQc({ ...qc, [k]: e.target.checked })} />{l}</label>)}
      </fieldset>
      <label>Return notes<input value={note} onChange={e => setNote(e.target.value)} placeholder="Anything to record about the finished work (required if sending back)" /></label>
      {err && <p className="cxl-err" role="alert">{err}</p>}
      <div className="rcv-actions">
        <button type="button" className="btn" disabled={!all} title={all ? '' : 'Tick every quality check first'} onClick={() => submit('ready')}>Quality check passed · Mark Ready</button>
        <button type="button" className="btn alt" onClick={() => submit('check')}>Received – check later</button>
        <button type="button" className="btn alt" onClick={() => submit('back')}>Not right – send back to tailor</button>
        <button type="button" className="btn alt" onClick={() => onClose(null)}>Cancel</button>
      </div>
    </div>
  </div>
}
