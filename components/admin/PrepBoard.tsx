'use client'
import { useEffect, useState } from 'react'
import { addD, dmy, todayIST } from '@/lib/util'
import { altStatus } from '@/lib/bookingAction'
// ALTERATIONS TO COMPLETE: the live alteration and repair jobs (the same records the Alterations page and the alerts use).
// Read from prep_jobs(), which works for the Preparation role too and shows no phone numbers or money.
// Moving a job to its next stage is done by the manager in Alterations, so this list can never disagree with it.
export default function PrepBoard({ ctx, compact }: { ctx: any; compact?: boolean }) {
  const [rows, setRows] = useState<any[]>([]); const [err, setErr] = useState('')
  const today = todayIST(), tomorrow = addD(today, 1)
  useEffect(() => { ctx.sb.rpc('prep_jobs').then(({ data, error }: any) => { if (error) setErr('Could not load the list. Please refresh (or run migration-v17).'); else { setErr(''); setRows(data || []) } }) }, [ctx.tick, ctx.sb])
  const isRepair = (r: any) => r.source === 'damage'
  const late = (r: any) => !isRepair(r) && !!r.delivery_date && r.delivery_date < today
  const soon = (r: any) => !isRepair(r) && !late(r) && !!r.delivery_date && r.delivery_date <= tomorrow
  const tone = (t: string) => t === 'warn' ? 'var(--bad)' : t === 'check' ? 'var(--blue)' : '#c58a2b'
  return (<div>
    <p className="mut" style={{ fontSize: 13, margin: '0 0 8px' }}>{rows.length ? <b className={rows.some(late) ? 'bad' : ''}>{rows.length} job(s) still open.</b> : <b className="ok">All done.</b>} Updates are made in Alterations, so this list always matches it.</p>
    {err && <p className="bad">{err}</p>}
    {rows.map(r => { const st = altStatus(r); return <div key={r.id} onClick={() => ctx.ops && ctx.focusWorkflow('alteration', r.id)} style={{ display: 'flex', gap: 10, padding: '8px 10px', border: `1px solid ${late(r) ? 'var(--bad)' : soon(r) ? '#c58a2b' : 'var(--line)'}`, background: late(r) ? '#b4493f14' : soon(r) ? '#c58a2b14' : 'transparent', cursor: ctx.ops ? 'pointer' : 'default', marginBottom: 6 }}>
      {ctx.thumb(ctx.dmap[r.dress_id] || { images: r.image ? [r.image] : [] }, 40, 52)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <b>{isRepair(r) ? 'Repair' : r.delivery_date ? `${dmy(r.delivery_date)}${r.delivery_date === today ? ' · TODAY' : r.delivery_date === tomorrow ? ' · TOMORROW' : ''}` : 'No delivery date'}</b>
          <span>{r.dress_code} · {r.dress_name}</span><span className="mut" style={{ fontSize: 13 }}>{r.customer_name} · {r.booking_id}</span>
          {late(r) ? <b className="bad">OVERDUE</b> : soon(r) ? <b style={{ color: '#c58a2b' }}>DELIVERY WITHIN 24 HOURS</b> : null}</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 2, ...(compact ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>✂ {r.requirements}</div></div>
      <div style={{ alignSelf: 'center', fontWeight: 600, color: tone(st.tone), textAlign: 'right' }} title={st.hint}>{st.label}</div>
    </div> })}
    {!rows.length && !err && <p className="mut">No open alteration or repair jobs.</p>}
  </div>)
}
