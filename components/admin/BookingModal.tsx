'use client'
import { useState } from 'react'
import { dmy, inr, istTime, PREP, todayIST } from '@/lib/util'
const STATUS: Record<string, string> = { pending: 'Awaiting confirmation', confirmed: 'Confirmed', out: 'Delivered (with customer)', returned: 'Returned', cancelled: 'Cancelled' }
// Full booking details. `limited` (preparation staff) hides phone numbers, money and history.
export default function BookingModal({ ctx, b, limited, onClose }: { ctx: any; b: any; limited: boolean; onClose: () => void }) {
  const [edit, setEdit] = useState(false); const [txt, setTxt] = useState<string>(b.alteration_notes || '')
  const [saved, setSaved] = useState<any>(null); const [prep, setPrep] = useState<string>(b.prep_status)
  const dress = ctx.dmap[b.dress_id], img = dress?.images?.[0] || b.image
  const notes = saved ? saved.notes : b.alteration_notes, by = saved ? saved.by : b.alteration_updated_by, at = saved ? saved.at : b.alteration_updated_at
  const overdue = b.status === 'out' && b.end_date < todayIST()
  async function saveNotes() {
    const { error } = await ctx.sb.rpc('set_alteration_notes', { p_id: b.id, p_notes: txt })
    if (error) return ctx.say('Could not save the alteration notes.')
    setSaved({ notes: txt.trim() || null, by: ctx.name, at: new Date().toISOString() }); setEdit(false); ctx.say('Alteration notes saved'); ctx.load()
  }
  async function setPrepStatus(v: string) {
    const { error } = await ctx.sb.rpc('set_prep_status', { p_id: b.id, p_status: v })
    if (error) return ctx.say('Could not update the preparation status.')
    setPrep(v); ctx.say('Preparation: ' + PREP[v]); ctx.load()
  }
  const row = (l: string, v: any) => <div className="row"><span className="mut">{l}</span><span style={{ textAlign: 'right' }}>{v}</span></div>
  const due = b.rent + b.charges - b.paid
  return (<div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 65, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 16 }}>
    <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 640, width: '100%', margin: 0 }}>
      <div className="row"><h3 style={{ margin: 0 }}>Booking {b.id}</h3><button className="btn alt sm" onClick={onClose}>Close</button></div>
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        {img ? <a href={img} target="_blank" rel="noopener noreferrer" title="Open full size"><img src={img} alt={b.dress_name} style={{ width: 130, height: 174, objectFit: 'cover', border: '1px solid var(--line)' }} /></a> : <div style={{ width: 130, height: 174, background: 'var(--blush)' }} />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <b style={{ fontSize: 18 }}>{b.dress_code} · {b.dress_name}</b>
          <div style={{ marginTop: 6 }}><span className="tag" style={{ background: overdue ? 'var(--bad)' : undefined, color: overdue ? '#fff' : undefined }}>{overdue ? 'OVERDUE RETURN' : STATUS[b.status] || b.status}</span></div>
          <div style={{ marginTop: 8 }}>{row('Customer', b.customer_name)}{!limited && row('Phone', <a href={'tel:' + b.phone}>{b.phone}</a>)}
            {row('Delivery date', dmy(b.start_date))}{row('Return date', dmy(b.end_date))}
            {b.created_at && row('Booked on', dmy(b.created_at.slice(0, 10) === b.created_at ? b.created_at : new Date(b.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })))}
            {b.returned_at && row('Returned on', dmy(new Date(b.returned_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })))}</div>
        </div>
      </div>
      {b.status === 'confirmed' ? <div style={{ marginTop: 12 }}><label style={{ fontSize: 13 }}>Preparation status<select value={prep} onChange={e => setPrepStatus(e.target.value)} style={{ display: 'block' }}>{['not_started', 'alterations_pending', 'cleaning_pending', 'ready'].map(k => <option key={k} value={k}>{PREP[k]}</option>)}</select></label></div>
        : <div style={{ marginTop: 12 }} className="mut">Preparation: {PREP[prep] || prep}</div>}
      <div className="box" style={{ background: notes ? 'var(--blush)' : undefined }}>
        <div className="row"><b>✂ Alteration notes</b>{b.status !== 'cancelled' && !edit && <button className="btn alt sm" onClick={() => { setTxt(notes || ''); setEdit(true) }}>{notes ? 'Edit' : 'Add notes'}</button>}</div>
        {edit ? <><textarea rows={5} value={txt} onChange={e => setTxt(e.target.value)} placeholder="e.g. Shorten sleeves, tighten waist, blouse measurements…" style={{ width: '100%', border: '1px solid var(--line)', padding: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn sm" onClick={saveNotes}>Save notes</button><button className="btn alt sm" onClick={() => setEdit(false)}>Cancel</button></div></>
          : notes ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, marginTop: 6 }}>{notes}</div> : <div className="mut" style={{ marginTop: 6 }}>No alteration notes</div>}
        {at && <div className="mut" style={{ fontSize: 12, marginTop: 6 }}>Last updated {dmy(new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))} {istTime(at)}{by ? ` by ${by}` : ''}</div>}
      </div>
      {!limited && (() => { const who = (id?: string | null, ts?: string | null) => id ? `${ctx.staffName(id)}${ts ? ' · ' + dmy(new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) : ''}` : '–'
        return <div className="box"><b>Handled by</b>{row('Booking taken by', b.taken_by ? who(b.taken_by, b.created_at) : b.log?.[0]?.m === 'Requested online' ? 'Online (customer)' : '–')}{row('Prepared by', who(b.prepared_by, b.prepared_at))}{row('Delivered by', who(b.delivered_by, b.picked_up_at))}{row('Return processed by', who(b.returned_by, b.returned_at))}</div> })()}
      {b.return_notes && <div className="box"><b>Return condition / damage notes</b><div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{b.return_notes}</div></div>}
      {!limited && <>
        <div className="box"><b>Payments</b>
          {row('Original rental price', inr(b.rent + b.discount))}{b.discount > 0 && row('Discount', '− ' + inr(b.discount))}{row('Net rental charge', inr(b.rent))}
          {b.late_fee > 0 && row('Late-return fee', inr(b.late_fee))}{b.damage_charge > 0 && row('Damage / repair charge', inr(b.damage_charge))}
          {b.charges - b.late_fee - b.damage_charge > 0 && row('Other charges', inr(b.charges - b.late_fee - b.damage_charge))}
          {row('Received so far', inr(b.paid))}<div className="row"><b>{due >= 0 ? 'Balance due' : 'Overpaid'}</b><b>{inr(Math.abs(due))}</b></div>
          {row('Security deposit held', `${inr(b.deposit_held)} of ${inr(b.deposit)}`)}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{ctx.sel(b)}</div>
        {!!b.log?.length && <details style={{ marginTop: 12 }}><summary className="mut" style={{ cursor: 'pointer' }}>History</summary>
          {b.log.slice().reverse().map((l: any, i: number) => <div key={i} className="mut" style={{ fontSize: 12, padding: '2px 0' }}>{new Date(l.t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {l.m}{l.by ? ` · ${l.by}` : ''}</div>)}</details>}</>}
    </div></div>)
}
