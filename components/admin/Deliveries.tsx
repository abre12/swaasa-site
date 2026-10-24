'use client'
import { dmy, PREP, todayIST, addD } from '@/lib/util'
const days = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 864e5)
// filter: 'next7' (due in the next 7 days, plus anything already overdue) | 'today-del' | 'overdue' | 'all'
export function PendingDeliveries({ ctx, filter = 'all' }: { ctx: any; filter?: string }) {
  const today = todayIST()
  const list = ctx.B.filter((b: any) => filter === 'today-del' ? b.start_date === today && ['confirmed', 'out', 'returned'].includes(b.status)
    : filter === 'overdue' ? b.status === 'confirmed' && b.start_date < today : filter === 'next7' ? b.status === 'confirmed' && b.start_date <= addD(today, 7) : b.status === 'confirmed').sort((a: any, b: any) => a.start_date.localeCompare(b.start_date))
  return (<div className="scroll"><table><thead><tr><th>Dress</th><th>Customer</th><th>Delivery date</th><th>Ref</th><th>Alterations</th><th></th></tr></thead><tbody>
    {list.map((b: any) => { const od = b.status === 'confirmed' && b.start_date < today; return <tr key={b.id} style={od ? { background: '#b4493f14' } : undefined}>
      <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ctx.thumb(ctx.dmap[b.dress_id])}<span>{b.dress_code}<br /><span className="mut" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 160 }}>{b.dress_name}</span></span></div></td>
      <td>{b.customer_name}<br /><a href={'tel:' + b.phone}>{b.phone}</a></td>
      <td>{dmy(b.start_date)}{od && <div className="bad"><b>OVERDUE {days(b.start_date, today)} day(s)</b></div>}{b.status !== 'confirmed' && <div className="ok">Delivered ✓</div>}</td>
      <td><a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(b.id) }}>{b.id}</a></td>
      <td style={{ whiteSpace: 'normal', minWidth: 150 }}>{b.alteration_notes ? <>✂ {PREP[b.prep_status] || b.prep_status}</> : <span className="mut">–</span>}</td>
      <td style={{ whiteSpace: 'normal' }}>{b.status === 'confirmed' && <button className="btn sm" onClick={() => ctx.pickup(b)}>Mark delivered</button>} <button className="btn alt sm" onClick={() => ctx.openBooking(b.id)}>Details</button></td></tr> })}
    {!list.length && <tr><td colSpan={6} className="mut">Nothing here.</td></tr>}</tbody></table></div>)
}
// filter: 'all' (every dress currently out with a customer) | 'today-ret' | 'overdue'
export function PendingReturns({ ctx, filter = 'all' }: { ctx: any; filter?: string }) {
  const today = todayIST()
  const list = ctx.B.filter((b: any) => filter === 'today-ret' ? b.end_date === today && ['out', 'returned'].includes(b.status)
    : filter === 'overdue' ? b.status === 'out' && b.end_date < today : b.status === 'out').sort((a: any, b: any) => a.end_date.localeCompare(b.end_date))
  return (<div className="scroll"><table><thead><tr><th>Dress</th><th>Customer</th><th>Return date</th><th>Ref</th><th></th></tr></thead><tbody>
    {list.map((b: any) => { const od = b.status === 'out' && b.end_date < today; return <tr key={b.id} style={od ? { background: '#b4493f14' } : undefined}>
      <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ctx.thumb(ctx.dmap[b.dress_id])}<span>{b.dress_code}<br /><span className="mut" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 160 }}>{b.dress_name}</span></span></div></td>
      <td>{b.customer_name}<br /><a href={'tel:' + b.phone}>{b.phone}</a></td>
      <td>{dmy(b.end_date)}{od ? <div className="bad"><b>{days(b.end_date, today)} day(s) overdue</b></div> : b.status === 'returned' ? <div className="ok">Returned ✓</div> : b.end_date === today ? <div style={{ color: '#c58a2b' }}>Due today</div> : null}</td>
      <td><a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(b.id) }}>{b.id}</a></td>
      <td style={{ whiteSpace: 'normal' }}>{b.status === 'out' && <button className="btn sm" onClick={() => ctx.ret(b)}>Mark returned</button>} <button className="btn alt sm" onClick={() => ctx.openBooking(b.id)}>Details</button></td></tr> })}
    {!list.length && <tr><td colSpan={5} className="mut">Nothing here.</td></tr>}</tbody></table></div>)
}
