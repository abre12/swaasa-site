'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dmy, inr, todayIST } from '@/lib/util'
const SORTS: Record<string, [string, (a: any, b: any) => number]> = {
  net_desc: ['Highest net rental revenue', (a, b) => b.net_rent - a.net_rent], net_asc: ['Lowest net rental revenue', (a, b) => a.net_rent - b.net_rent],
  most: ['Most frequently rented', (a, b) => b.completed - a.completed], least: ['Least frequently rented', (a, b) => a.completed - b.completed],
  oldest: ['Oldest dress', (a, b) => base(a).localeCompare(base(b))], newest: ['Newest dress', (a, b) => base(b).localeCompare(base(a))],
  avg: ['Highest average revenue per rental', (a, b) => b.avg_net - a.avg_net], days: ['Highest total rental days', (a, b) => b.rental_days - a.rental_days] }
const base = (r: any) => r.acquired_on || r.added_on
const age = (d: string) => { const a = new Date(d + 'T00:00:00Z'), n = new Date(todayIST() + 'T00:00:00Z'); let m = (n.getUTCFullYear() - a.getUTCFullYear()) * 12 + n.getUTCMonth() - a.getUTCMonth(); if (n.getUTCDate() < a.getUTCDate()) m--
  return m < 1 ? `${Math.max(0, Math.round((+n - +a) / 864e5))} days` : m < 24 ? `${m} month${m === 1 ? '' : 's'}` : `${(m / 12).toFixed(1)} years` }
export default function Performance({ ctx }: { ctx: any }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [sort, setSort] = useState('net_desc'), [q, setQ] = useState('')
  const [rows, setRows] = useState<any[]>([]), [err, setErr] = useState(''), [hist, setHist] = useState<any>(null)
  const load = useCallback(async () => {
    const { data, error } = await ctx.sb.rpc('dress_performance', { p_from: from || null, p_to: to || null })
    if (error) setErr(error.message.includes('FORBIDDEN') ? 'Only the owner can view this page.' : 'Could not load dress performance.'); else { setErr(''); setRows(data || []) }
  }, [from, to, ctx.sb])
  useEffect(() => { load() }, [load, ctx.tick])
  const list = useMemo(() => rows.filter(r => !q || (r.code + r.name).toLowerCase().includes(q.toLowerCase())).sort(SORTS[sort][1]), [rows, q, sort])
  const S = (k: string) => list.reduce((s, r) => s + (r[k] || 0), 0)
  return (<div>
    <p className="mut" style={{ fontSize: 13, marginTop: 0 }}><b>How revenue is counted.</b> Net rental revenue = rent after discounts on completed (returned) rentals, minus rental refunds. Cancelled bookings, security deposits, advances and unpaid balances are not revenue. Late fees and damage or repair charges are shown separately. Dry-cleaning charges are the amounts entered each time the dress was sent for cleaning; Net after dry cleaning = net rental revenue minus those charges. “Cash collected” is money actually received, which can differ from revenue recognised.</p>
    <div className="flt" style={{ justifyContent: 'flex-start' }}><label style={{ margin: 0, fontSize: 12 }}>Rentals from<input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ display: 'block' }} /></label><label style={{ margin: 0, fontSize: 12 }}>to<input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ display: 'block' }} /></label>
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">{Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      <input placeholder="Search code or name" value={q} onChange={e => setQ(e.target.value)} />{(from || to) && <button className="btn alt sm" onClick={() => { setFrom(''); setTo('') }}>All time</button>}</div>
    {err && <p className="bad">{err}</p>}
    <div className="adm-cards">{([['Dresses in inventory', String(list.length)], ['Completed rentals', String(S('completed'))], ['Net rental revenue', inr(S('net_rent'))], ['Gross rental charges', inr(S('gross'))], ['Discounts given', inr(S('discounts'))], ['Late fees (separate)', inr(S('late_fees'))], ['Damage / other charges (separate)', inr(S('damage_charges') + S('other_charges'))], ['Dry-cleaning charges', inr(S('wash_cost'))], ['Net after dry cleaning', inr(S('net_rent') - S('wash_cost'))], ['Cash collected', inr(S('collected'))]] as [string, string][]).map(([l, v]) => <div key={l} className="stat-card"><span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 22, fontFamily: 'Cormorant Garamond, serif' }}>{v}</b></div>)}</div>
    <div className="scroll" style={{ marginTop: 12 }}><table><thead><tr><th></th><th>Item code</th><th>Dress</th><th>Category</th><th>Colour</th><th>Added</th><th>Age</th><th>Rentals</th><th>Rental days</th><th>Gross</th><th>Discounts</th><th>Net revenue</th><th>Avg / rental</th><th>Late fees</th><th>Damage / other</th><th>Washes</th><th>Dry-clean cost</th><th>Net after dry cleaning</th><th>Cash collected</th></tr></thead><tbody>
      {list.map(r => <tr key={r.dress_id} onClick={() => setHist({ r, from: '', to: '', status: '' })} style={{ cursor: 'pointer' }}>
        <td>{ctx.thumb(ctx.dmap[r.dress_id] || { images: r.image ? [r.image] : [] })}</td><td><b>{r.code}</b></td><td style={{ whiteSpace: 'normal', minWidth: 140 }}>{r.name}{r.status !== 'available' && <div className="mut" style={{ fontSize: 12 }}>{r.status}</div>}</td><td style={{ whiteSpace: 'normal' }}>{r.category}</td><td style={{ whiteSpace: 'normal' }}>{(r.colour_tags || []).join(', ') || '–'}</td>
        <td>{dmy(base(r))}{!r.acquired_on && <div className="mut" style={{ fontSize: 11 }}>added to system</div>}</td><td>{age(base(r))}</td><td>{r.completed}</td><td>{r.rental_days}</td><td>{inr(r.gross)}</td><td>{inr(r.discounts)}</td><td><b>{inr(r.net_rent)}</b></td><td>{inr(r.avg_net)}</td><td>{inr(r.late_fees)}</td><td>{inr(r.damage_charges + r.other_charges)}</td><td>{r.washes}</td><td>{inr(r.wash_cost)}</td><td><b>{inr(r.net_rent - r.wash_cost)}</b></td><td>{inr(r.collected)}</td></tr>)}
      {!list.length && <tr><td colSpan={19} className="mut">No dresses to show.</td></tr>}</tbody></table></div>
    {hist && <History ctx={ctx} h={hist} close={() => setHist(null)} />}
  </div>)
}
function History({ ctx, h, close }: { ctx: any; h: any; close: () => void }) {
  const [f, setF] = useState({ from: '', to: '', status: '' }); const [rows, setRows] = useState<any[]>([]); const [washes, setWashes] = useState<any[]>([]); const [err, setErr] = useState('')
  useEffect(() => { ctx.sb.rpc('dress_history', { p_dress: h.r.dress_id, p_from: f.from || null, p_to: f.to || null, p_status: f.status || null }).then(({ data, error }: any) => { if (error) setErr('Could not load the rental history.'); else { setErr(''); setRows(data || []) } }); ctx.sb.rpc('dress_washes', { p_dress: h.r.dress_id, p_from: f.from || null, p_to: f.to || null }).then(({ data }: any) => setWashes(data || [])) }, [f, h.r.dress_id, ctx.sb])
  return (<div onClick={close} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 65, overflow: 'auto', padding: 16 }}>
    <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 1100, margin: '0 auto' }}>
      <div className="row"><h3>{h.r.code} · {h.r.name}: rental history</h3><button className="btn alt sm" onClick={close}>Close</button></div>
      <p className="mut" style={{ fontSize: 13 }}>First rental on record: {dmy(h.r.first_booking)}. Added {dmy(base(h.r))}{h.r.acquired_on ? '' : ' (date added to the system; acquisition date not recorded)'}.</p>
      <div className="flt" style={{ justifyContent: 'flex-start' }}><input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} aria-label="From" /><input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} aria-label="To" />
        <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="">All statuses</option>{['pending', 'confirmed', 'out', 'returned', 'cancelled'].map(s => <option key={s}>{s}</option>)}</select></div>
      {err && <p className="bad">{err}</p>}
      <div className="scroll"><table><thead><tr><th>Booking</th><th>Customer</th><th>Booked on</th><th>Delivery</th><th>Return due</th><th>Returned</th><th>Status</th><th>Price</th><th>Discount</th><th>Net charge</th><th>Late / damage</th><th>Received</th><th>Balance</th><th>Return condition / damage notes</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.id}><td>{r.id}</td><td>{r.customer_name}</td><td>{dmy(new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))}</td><td>{dmy(r.start_date)}</td><td>{dmy(r.end_date)}</td><td>{r.returned_at ? dmy(new Date(r.returned_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) : '–'}</td><td>{r.status}</td>
          <td>{inr(r.original_price)}</td><td>{inr(r.discount)}</td><td>{inr(r.net_rent)}</td><td>{inr(r.late_fee)} / {inr(r.damage_charge)}</td><td>{inr(r.paid)}</td><td>{r.status === 'cancelled' ? '–' : inr(r.outstanding)}</td><td style={{ whiteSpace: 'normal', minWidth: 200 }}>{r.return_notes || '–'}</td></tr>)}
        {!rows.length && <tr><td colSpan={14} className="mut">No bookings for these filters.</td></tr>}</tbody></table></div>
      <h3 style={{ marginTop: 18 }}>Dry cleaning ({washes.length} wash{washes.length === 1 ? '' : 'es'}, {inr(washes.reduce((s: number, w: any) => s + w.charge, 0))})</h3>
      <div className="scroll"><table><thead><tr><th>Sent</th><th>Expected back</th><th>Back</th><th>Charge</th><th>Notes</th></tr></thead><tbody>{washes.map((w: any) => <tr key={w.id}><td>{dmy(w.sent_on)}</td><td>{dmy(w.expected_back)}</td><td>{w.returned_on ? dmy(w.returned_on) : 'away'}</td><td>{inr(w.charge)}</td><td style={{ whiteSpace: 'normal' }}>{w.notes || '–'}</td></tr>)}{!washes.length && <tr><td colSpan={5} className="mut">Never sent for dry cleaning.</td></tr>}</tbody></table></div></div></div>)
}
