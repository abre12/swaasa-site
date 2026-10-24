'use client'
import { useState } from 'react'
import { dmy, PREP, todayIST } from '@/lib/util'
const days = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 864e5)
export function PendingDeliveries({ ctx, filter = 'all' }: { ctx: any; filter?: string }) {
  const today = todayIST()
  const list = ctx.B.filter((b: any) => filter === 'today-del' ? b.start_date === today && ['confirmed', 'out', 'returned'].includes(b.status)
    : filter === 'overdue' ? b.status === 'confirmed' && b.start_date < today : b.status === 'confirmed').sort((a: any, b: any) => a.start_date.localeCompare(b.start_date))
  return (<div className="box" style={{ margin: 0 }}><h3 style={{ letterSpacing: '.08em' }}>PENDING DELIVERY <span className="mut" style={{ fontSize: 14 }}>({list.length})</span></h3>
    <div className="scroll"><table><thead><tr><th>Dress</th><th>Customer</th><th>Delivery date</th><th>Ref</th><th>Preparation</th><th></th></tr></thead><tbody>
      {list.map((b: any) => { const od = b.status === 'confirmed' && b.start_date < today; return <tr key={b.id} style={od ? { background: '#b4493f14' } : undefined}>
        <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ctx.thumb(ctx.dmap[b.dress_id])}<span>{b.dress_code}<br /><span className="mut" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 160 }}>{b.dress_name}</span></span></div></td>
        <td>{b.customer_name}<br /><a href={'tel:' + b.phone}>{b.phone}</a></td>
        <td>{dmy(b.start_date)}{od && <div className="bad"><b>OVERDUE {days(b.start_date, today)} day(s)</b></div>}{b.status !== 'confirmed' && <div className="ok">Delivered ✓</div>}</td>
        <td><a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(b.id) }}>{b.id}</a>{b.alteration_notes && <div title={b.alteration_notes}>✂ Alterations</div>}</td>
        <td>{PREP[b.prep_status] || b.prep_status}</td>
        <td style={{ whiteSpace: 'normal' }}>{b.status === 'confirmed' && <button className="btn sm" onClick={() => ctx.pickup(b)}>Mark delivered</button>} <button className="btn alt sm" onClick={() => ctx.openBooking(b.id)}>Details</button></td></tr> })}
      {!list.length && <tr><td colSpan={6} className="mut">No pending deliveries.</td></tr>}</tbody></table></div></div>)
}
export function PendingReturns({ ctx, filter = 'all' }: { ctx: any; filter?: string }) {
  const today = todayIST()
  const list = ctx.B.filter((b: any) => filter === 'today-ret' ? b.end_date === today && ['out', 'returned'].includes(b.status)
    : filter === 'overdue' ? b.status === 'out' && b.end_date < today : b.status === 'out' && b.end_date <= today).sort((a: any, b: any) => a.end_date.localeCompare(b.end_date))
  return (<div className="box" style={{ margin: 0 }}><h3 style={{ letterSpacing: '.08em' }}>PENDING RETURN <span className="mut" style={{ fontSize: 14 }}>({list.length})</span></h3>
    <div className="scroll"><table><thead><tr><th>Dress</th><th>Customer</th><th>Return date</th><th>Ref</th><th></th></tr></thead><tbody>
      {list.map((b: any) => { const od = b.status === 'out' && b.end_date < today; return <tr key={b.id} style={od ? { background: '#b4493f14' } : undefined}>
        <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ctx.thumb(ctx.dmap[b.dress_id])}<span>{b.dress_code}<br /><span className="mut" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 160 }}>{b.dress_name}</span></span></div></td>
        <td>{b.customer_name}<br /><a href={'tel:' + b.phone}>{b.phone}</a></td>
        <td>{dmy(b.end_date)}{od ? <div className="bad"><b>{days(b.end_date, today)} day(s) overdue</b></div> : b.status === 'returned' ? <div className="ok">Returned ✓</div> : <div style={{ color: '#c58a2b' }}>Due today</div>}</td>
        <td><a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(b.id) }}>{b.id}</a></td>
        <td style={{ whiteSpace: 'normal' }}>{b.status === 'out' && <button className="btn sm" onClick={() => ctx.ret(b)}>Mark returned</button>} <button className="btn alt sm" onClick={() => ctx.openBooking(b.id)}>Details</button></td></tr> })}
      {!list.length && <tr><td colSpan={5} className="mut">No pending returns.</td></tr>}</tbody></table></div></div>)
}
export default function Deliveries({ ctx, filter: initial = 'all' }: { ctx: any; filter?: string }) {
  const [filter, setFilter] = useState(initial)
  return (<div><div className="flt" style={{ justifyContent: 'flex-start' }}>{[['all', 'All pending'], ['today-del', "Today's deliveries"], ['today-ret', "Today's returns"], ['overdue', 'Overdue only']].map(([k, l]) => <button key={k} className={'btn sm' + (filter === k ? '' : ' alt')} onClick={() => setFilter(k)}>{l}</button>)}</div>
    <div style={{ display: 'grid', gap: 16 }}>{filter !== 'today-ret' && <PendingDeliveries ctx={ctx} filter={filter} />}{filter !== 'today-del' && <PendingReturns ctx={ctx} filter={filter} />}</div></div>)
}
