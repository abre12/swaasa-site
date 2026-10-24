'use client'
import { useEffect, useState } from 'react'
import { addD, dmy, PREP, todayIST } from '@/lib/util'
// ALTERATIONS TO COMPLETE: only confirmed deliveries in the next 7 days (plus overdue ones) that carry alteration notes.
export default function PrepBoard({ ctx, compact }: { ctx: any; compact?: boolean }) {
  const [rows, setRows] = useState<any[]>([]); const [err, setErr] = useState('')
  const today = todayIST(), tomorrow = addD(today, 1)
  useEffect(() => { ctx.sb.rpc('prep_list', { p_days: 7 }).then(({ data, error }: any) => { if (error) setErr('Could not load the list. Please refresh.'); else { setErr(''); setRows((data || []).filter((r: any) => (r.alteration_notes || '').trim())) } }) }, [ctx.tick])
  async function setPrep(r: any, v: string) {
    const { error } = await ctx.sb.rpc('set_prep_status', { p_id: r.id, p_status: v })
    if (error) ctx.say('Could not update the status.'); else { ctx.say(`${r.dress_code}: ${PREP[v]}`); ctx.load() }
  }
  const late = (r: any) => r.start_date < today && r.prep_status !== 'ready'
  const soon = (r: any) => !late(r) && r.start_date <= tomorrow && r.prep_status !== 'ready'
  const open = rows.filter(r => r.prep_status !== 'ready'), done = rows.filter(r => r.prep_status === 'ready')
  return (<div>
    <p className="mut" style={{ fontSize: 13, margin: '0 0 8px' }}>Deliveries up to {dmy(addD(today, 7))} that need stitching or fitting. {open.length ? <b className={open.some(late) ? 'bad' : ''}>{open.length} still to do.</b> : <b className="ok">All done.</b>}</p>
    {err && <p className="bad">{err}</p>}
    {[...open, ...done].map(r => <div key={r.id} onClick={() => ctx.openBooking(r.id, r)} style={{ display: 'flex', gap: 10, padding: '8px 10px', border: `1px solid ${late(r) ? 'var(--bad)' : soon(r) ? '#c58a2b' : 'var(--line)'}`, background: late(r) ? '#b4493f14' : soon(r) ? '#c58a2b14' : 'transparent', cursor: 'pointer', marginBottom: 6, opacity: r.prep_status === 'ready' ? 0.6 : 1 }}>
      {ctx.thumb({ images: r.image ? [r.image] : [] }, 40, 52)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}><b>{dmy(r.start_date)}{r.start_date === today ? ' · TODAY' : r.start_date === tomorrow ? ' · TOMORROW' : ''}</b>
          <span>{r.dress_code} · {r.dress_name}</span><span className="mut" style={{ fontSize: 13 }}>{r.customer_name} · {r.id}</span>
          {late(r) ? <b className="bad">OVERDUE</b> : soon(r) ? <b style={{ color: '#c58a2b' }}>DUE WITHIN 24 HOURS · NOT READY</b> : null}</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 2, ...(compact ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>✂ {r.alteration_notes}</div></div>
      <div onClick={e => e.stopPropagation()} style={{ alignSelf: 'center' }}><select value={r.prep_status} onChange={e => setPrep(r, e.target.value)} style={{ width: 'auto' }}>{['not_started', 'alterations_pending', 'cleaning_pending', 'ready'].map(k => <option key={k} value={k}>{PREP[k]}</option>)}</select></div>
    </div>)}
    {!rows.length && !err && <p className="mut">No deliveries with alteration notes in the next 7 days.</p>}
  </div>)
}
