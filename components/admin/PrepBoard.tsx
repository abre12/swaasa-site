'use client'
import { useEffect, useState } from 'react'
import { addD, dmy, MAIN_CATS, mainCatOf, PREP, todayIST } from '@/lib/util'
// UPCOMING DELIVERY PREPARATION: confirmed bookings due for delivery in the next 7 days, plus any already overdue and not ready.
export default function PrepBoard({ ctx, compact }: { ctx: any; compact?: boolean }) {
  const [rows, setRows] = useState<any[]>([]); const [err, setErr] = useState(''); const [f, setF] = useState({ date: '', status: '', cat: '', alt: '' })
  const today = todayIST(), tomorrow = addD(today, 1)
  useEffect(() => { ctx.sb.rpc('prep_list', { p_days: 7 }).then(({ data, error }: any) => { if (error) setErr('Could not load the preparation list. Please refresh.'); else { setErr(''); setRows(data || []) } }) }, [ctx.tick])
  async function setPrep(r: any, v: string) {
    const { error } = await ctx.sb.rpc('set_prep_status', { p_id: r.id, p_status: v })
    if (error) ctx.say('Could not update the preparation status.'); else { ctx.say(`${r.dress_code}: ${PREP[v]}`); ctx.load() }
  }
  const shown = rows.filter(r => (!f.date || r.start_date === f.date) && (!f.status || r.prep_status === f.status) && (!f.cat || mainCatOf(r.category) === f.cat) && (!f.alt || (f.alt === 'yes') === !!r.alteration_notes))
  const late = (r: any) => r.start_date < today && r.prep_status !== 'ready'
  const soon = (r: any) => !late(r) && r.start_date <= tomorrow && r.prep_status !== 'ready'
  const overdue = shown.filter(late), rest = shown.filter(r => !late(r))
  const card = (r: any) => <div key={r.id} onClick={() => ctx.openBooking(r.id, r)} style={{ display: 'flex', gap: 12, padding: 10, border: `1px solid ${late(r) ? 'var(--bad)' : soon(r) ? 'var(--warn, #c58a2b)' : 'var(--line)'}`, background: late(r) ? '#b4493f14' : soon(r) ? '#c58a2b14' : 'var(--bg)', cursor: 'pointer', marginBottom: 8 }}>
    {ctx.thumb({ images: r.image ? [r.image] : [] }, 64, 84)}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}><b>{dmy(r.start_date)}{r.start_date === today ? ' · TODAY' : r.start_date === tomorrow ? ' · TOMORROW' : ''}</b>
        {late(r) ? <span className="bad"><b>OVERDUE PREPARATION</b></span> : soon(r) ? <span style={{ color: '#c58a2b' }}><b>DUE WITHIN 24 HOURS · NOT READY</b></span> : null}</div>
      <div>{r.dress_code} · {r.dress_name}</div>
      <div className="mut" style={{ fontSize: 13 }}>{r.customer_name} · Ref {r.id} · Return {dmy(r.end_date)}</div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 4, ...(compact ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>{r.alteration_notes ? <>✂ {r.alteration_notes}</> : <span className="mut">No alteration notes</span>}</div>
      <div onClick={e => e.stopPropagation()} style={{ marginTop: 6 }}><select value={r.prep_status} onChange={e => setPrep(r, e.target.value)}>{['not_started', 'alterations_pending', 'cleaning_pending', 'ready'].map(k => <option key={k} value={k}>{PREP[k]}</option>)}</select></div>
    </div></div>
  return (<div className="box" style={{ margin: 0 }}>
    <h3 style={{ letterSpacing: '.08em' }}>UPCOMING DELIVERY PREPARATION</h3>
    <p className="mut" style={{ fontSize: 13, margin: '2px 0 10px' }}>Confirmed deliveries from today to {dmy(addD(today, 7))}. {rows.filter(r => r.prep_status === 'ready').length} of {rows.length} ready.</p>
    <div className="flt" style={{ justifyContent: 'flex-start' }}>
      <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} aria-label="Delivery date" />
      <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="">Any preparation status</option>{['not_started', 'alterations_pending', 'cleaning_pending', 'ready'].map(k => <option key={k} value={k}>{PREP[k]}</option>)}</select>
      <select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">All categories</option>{MAIN_CATS.map(m => <option key={m.key}>{m.label}</option>)}</select>
      <select value={f.alt} onChange={e => setF({ ...f, alt: e.target.value })}><option value="">Alterations: any</option><option value="yes">With alterations</option><option value="no">No alterations</option></select>
      {(f.date || f.status || f.cat || f.alt) && <button className="btn alt sm" onClick={() => setF({ date: '', status: '', cat: '', alt: '' })}>Clear</button>}</div>
    {err && <p className="bad">{err}</p>}
    {overdue.length > 0 && <><b className="bad">Overdue preparation ({overdue.length})</b><div style={{ marginTop: 6 }}>{overdue.map(card)}</div></>}
    {rest.length > 0 ? <div style={{ marginTop: overdue.length ? 12 : 0 }}>{rest.map(card)}</div> : !overdue.length && <p className="mut">Nothing to prepare for these filters.</p>}
  </div>)
}
