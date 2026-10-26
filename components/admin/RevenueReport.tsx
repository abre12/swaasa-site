'use client'
import { useEffect, useState } from 'react'
import { dmy, inr, MAIN_CATS, mainCatOf } from '@/lib/util'
import { downloadBlob, makeXlsx, Cell } from '@/lib/xlsx'
export default function RevenueReport({ ctx }: { ctx: any }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [cat, setCat] = useState(''), [st, setSt] = useState('')
  const [rows, setRows] = useState<any[]>([]), [err, setErr] = useState('')
  useEffect(() => { ctx.sb.rpc('revenue_report', { p_from: from || null, p_to: to || null }).then(({ data, error }: any) => { if (error) setErr(error.message.includes('FORBIDDEN') ? 'Only the owner can view this report.' : 'Could not load the report.'); else { setErr(''); setRows(data || []) } }) }, [from, to, ctx.tick])
  const list = rows.filter(r => (!cat || mainCatOf(r.category) === cat) && (!st || r.status === st))
  const S = (k: string, l = list) => l.reduce((s, r) => s + (r[k] || 0), 0)
  const byCat = MAIN_CATS.map(m => { const l = list.filter(r => mainCatOf(r.category) === m.label); return { label: m.label, n: l.length, net: S('net_amount', l) } }).filter(c => c.n)
  async function exportXlsx() {
    const M = (n: number): Cell => ({ n, s: 'money' }), head = ['ID', 'Dress', 'Customer', 'Phone', 'Delivery', 'Return', 'Advance Received', 'Rent Received', 'Late Fees', 'Damages', 'Status', 'Advance Refunded', 'Net Amount'].map(t => ({ t, s: 'head' as const }))
    const body: Cell[][] = list.map(r => [r.id, `${r.dress_code} · ${r.dress_name}`, r.customer_name, r.phone, { d: r.start_date }, { d: r.end_date }, M(r.advance_received), M(r.rent_received), M(r.late_fee), M(r.damage_charge), r.status, M(r.advance_refunded), M(r.net_amount)])
    const tot: Cell[] = [{ t: 'TOTAL', s: 'bold' }, null, null, null, null, null, ...['advance_received', 'rent_received', 'late_fee', 'damage_charge'].map(k => ({ n: S(k), s: 'moneyBold' as const })), null, { n: S('advance_refunded'), s: 'moneyBold' }, { n: S('net_amount'), s: 'moneyBold' }]
    const blob = await makeXlsx('Revenue Report', [[{ t: 'Swaasa Wedding Rentals', s: 'title' }], [{ t: 'Recognised rental revenue', s: 'bold' }], [{ t: 'Net Amount = Advance Received + Rent Received + Late Fees + Damage Charges − Advance Refunded' }], [{ t: 'Delivery dates', s: 'bold' }, from ? { d: from } : 'All', to ? { d: to } : 'All'], [], head, ...body, tot], [14, 34, 22, 16, 14, 14, 18, 16, 12, 12, 12, 18, 16])
    downloadBlob(blob, 'swaasa-revenue-report.xlsx')
  }
  return (<div className="box" style={{ margin: 0 }}><h3>Recognised rental revenue</h3>
    <p className="mut" style={{ fontSize: 12, marginTop: 0 }}><b>Net Amount = Advance Received + Rent Received + Late Fees + Damage Charges − Advance Refunded.</b> Advance is the first rent payment on a booking and Rent Received is every later one. Security deposits are not included. Unconfirmed (pending) bookings are not listed. Filtered by delivery date.</p>
    <div className="flt" style={{ justifyContent: 'flex-start' }}><label style={{ margin: 0, fontSize: 12 }}>Delivery from<input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ display: 'block' }} /></label><label style={{ margin: 0, fontSize: 12 }}>to<input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ display: 'block' }} /></label>
      <select value={cat} onChange={e => setCat(e.target.value)}><option value="">All categories</option>{MAIN_CATS.map(m => <option key={m.key}>{m.label}</option>)}</select>
      <select value={st} onChange={e => setSt(e.target.value)}><option value="">All statuses</option>{['confirmed', 'out', 'returned', 'cancelled'].map(s => <option key={s}>{s}</option>)}</select>
      <button className="btn sm" onClick={exportXlsx}>Export to Excel</button></div>
    {err && <p className="bad">{err}</p>}
    {list.filter(r => r.status === 'returned' && r.advance_received + r.rent_received < r.rental_amount).length > 0 && <p className="bad" style={{ fontSize: 13 }}><b>{list.filter(r => r.status === 'returned' && r.advance_received + r.rent_received < r.rental_amount).length} returned booking(s) are below the rental amount.</b> They are marked ⚠ below. Open the booking and record the missing payment, or ask the owner to approve the shortfall.</p>}
    {!!byCat.length && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, margin: '4px 0 10px' }}>{byCat.map(c => <span key={c.label} style={{ fontSize: 13 }}><span className="mut">{c.label} ({c.n})</span> <b>{inr(c.net)}</b></span>)}</div>}
    <div className="scroll"><table><thead><tr><th>ID</th><th>Dress</th><th>Customer</th><th>Phone</th><th>Delivery</th><th>Return</th><th>Advance Received</th><th>Rent Received</th><th>Late Fees</th><th>Damages</th><th>Status</th><th>Advance Refunded</th><th>Net Amount</th></tr></thead><tbody>
      {list.map(r => <tr key={r.id}><td><a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(r.id) }}>{r.id}</a></td><td style={{ whiteSpace: 'normal', minWidth: 150 }}>{r.dress_code}<div className="mut" style={{ fontSize: 12 }}>{r.dress_name}</div></td><td>{r.customer_name}</td><td>{r.phone}</td><td>{dmy(r.start_date)}</td><td>{dmy(r.end_date)}</td>
        <td>{inr(r.advance_received)}</td><td>{inr(r.rent_received)}</td><td>{inr(r.late_fee)}</td><td>{inr(r.damage_charge)}</td><td>{r.status}{r.status === 'returned' && r.advance_received + r.rent_received < r.rental_amount && <div className="bad" style={{ fontSize: 11 }} title={`Rental amount ${inr(r.rental_amount)}`}>⚠ below rental amount</div>}</td><td>{inr(r.advance_refunded)}</td><td><b>{inr(r.net_amount)}</b></td></tr>)}
      {!list.length && <tr><td colSpan={13} className="mut">No bookings for these filters.</td></tr>}
      {!!list.length && <tr style={{ fontWeight: 700 }}><td colSpan={6}>TOTAL ({list.length} bookings)</td><td>{inr(S('advance_received'))}</td><td>{inr(S('rent_received'))}</td><td>{inr(S('late_fee'))}</td><td>{inr(S('damage_charge'))}</td><td></td><td>{inr(S('advance_refunded'))}</td><td>{inr(S('net_amount'))}</td></tr>}</tbody></table></div></div>)
}
