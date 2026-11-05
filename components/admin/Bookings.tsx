'use client'
import { useEffect, useMemo, useState } from 'react'
import { addD, inr, istDate, mainCatOf, MAIN_CATS, nDays, todayIST } from '@/lib/util'
import { Ic } from './icons'
const tint = (c: string): React.CSSProperties => ({ ['--c' as any]: c })
const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const TABS: [string, string][] = [['all', 'All Bookings'], ['upcoming', 'Upcoming Deliveries'], ['today', 'Due Today'], ['out', 'Out for Rental'], ['returns', 'Returns Due'], ['overdue', 'Overdue'], ['done', 'Completed']]
const EXTRA: Record<string, string> = { deltoday: 'Deliveries today', rettoday: 'Returns due today', pending: 'Awaiting confirmation', owing: 'Balance due', alterations: 'With alteration notes', created_today: 'Booked today', cancelled: 'Cancelled' }
const NOF = { month: '', dFrom: '', dTo: '', rFrom: '', rTo: '', status: '', pay: '', staff: '', cat: '' }
export default function Bookings({ ctx, flt, setFlt }: { ctx: any; flt: string; setFlt: (f: string) => void }) {
  const B: any[] = ctx.B, today = todayIST(), tomorrow = addD(today, 1), in7 = addD(today, 7)
  const [q, setQ] = useState(''), [sort, setSort] = useState('del'), [showF, setShowF] = useState(false), [f, setF] = useState(NOF), [menu, setMenu] = useState<{ b: any; x: number; y: number } | null>(null)
  useEffect(() => { const c = () => setMenu(null); document.addEventListener('click', c); window.addEventListener('scroll', c, true); return () => { document.removeEventListener('click', c); window.removeEventListener('scroll', c, true) } }, [])
  const live = (b: any) => b.status !== 'cancelled', owe = (b: any) => Math.max(0, b.rent + b.charges - b.paid)
  const undelivered = (b: any) => ['pending', 'confirmed'].includes(b.status), lateDel = (b: any) => undelivered(b) && b.start_date < today, lateRet = (b: any) => b.status === 'out' && b.end_date < today
  const delT = (b: any) => b.start_date === today && ['confirmed', 'out', 'returned'].includes(b.status), retT = (b: any) => b.end_date === today && ['out', 'returned'].includes(b.status)
  const P: Record<string, (b: any) => boolean> = {
    all: live, upcoming: b => undelivered(b) && b.start_date >= today && b.start_date <= in7, today: b => delT(b) || retT(b), out: b => b.status === 'out', returns: b => b.status === 'out' && b.end_date >= today && b.end_date <= in7,
    overdue: b => lateRet(b) || lateDel(b), done: b => b.status === 'returned', deltoday: delT, rettoday: retT, pending: b => b.status === 'pending', owing: b => live(b) && owe(b) > 0,
    alterations: b => live(b) && !!(b.alteration_notes || '').trim(), created_today: b => live(b) && istDate(b.created_at) === today, cancelled: b => b.status === 'cancelled' }
  const cur = P[flt] ? flt : 'all'
  const monthNow = today.slice(0, 7), monthN = B.filter(b => live(b) && b.start_date.slice(0, 7) === monthNow).length
  const sumOwe = B.filter(P.owing).reduce((t, b) => t + owe(b), 0)
  const rank = (b: any) => lateDel(b) ? 0 : undelivered(b) ? (b.start_date === today ? 1 : b.start_date === tomorrow ? 2 : 3) : b.status === 'out' ? (lateRet(b) ? 5 : 4) : 6
  const near = (d: string) => d >= today ? [0, d] : [1, d]
  const byNear = (k: 'start_date' | 'end_date') => (a: any, b: any) => { const x = near(a[k]), y = near(b[k]); return (x[0] as number) - (y[0] as number) || (x[0] === 0 ? (x[1] as string).localeCompare(y[1] as string) : (y[1] as string).localeCompare(x[1] as string)) }
  const prio = (a: any, b: any) => { const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb; return ra <= 3 ? a.start_date.localeCompare(b.start_date) : ra <= 5 ? a.end_date.localeCompare(b.end_date) : b.end_date.localeCompare(a.end_date) }
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase(), nd = n.replace(/\D/g, '')
    let l = (f.status === 'cancelled' && cur === 'all' ? B : B.filter(P[cur]))
    l = l.filter(b => (!n || [b.id, b.customer_name, b.dress_code, b.dress_name].some((x: string) => (x || '').toLowerCase().includes(n)) || (nd.length > 2 && b.phone.replace(/\D/g, '').includes(nd)))
      && (!f.month || b.start_date.slice(0, 7) === f.month) && (!f.dFrom || b.start_date >= f.dFrom) && (!f.dTo || b.start_date <= f.dTo) && (!f.rFrom || b.end_date >= f.rFrom) && (!f.rTo || b.end_date <= f.rTo)
      && (!f.status || (f.status === 'overdue' ? lateRet(b) || lateDel(b) : b.status === f.status)) && (!f.pay || (f.pay === 'due' ? owe(b) > 0 : owe(b) === 0)) && (!f.staff || b.taken_by === f.staff) && (!f.cat || mainCatOf(b.category) === f.cat))
    const s = sort === 'del' ? (cur === 'returns' || cur === 'out' || cur === 'rettoday' ? byNear('end_date') : prio) : sort === 'ret' ? byNear('end_date') : sort === 'new' ? (a: any, b: any) => b.created_at.localeCompare(a.created_at) : (a: any, b: any) => owe(b) - owe(a)
    return l.slice().sort(s)
  }, [B, q, f, cur, sort, today])
  const count = (k: string) => B.filter(P[k]).length
  const rel = (d: string) => { const n = nDays(today, d) - 1; return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 ? `In ${n} Days` : `${-n} Day${n === -1 ? '' : 's'} ago` }
  const dateCell = (b: any, k: 'start_date' | 'end_date') => {
    const d = b[k], del = k === 'start_date'; let t = rel(d), c = del ? 'var(--blue)' : 'var(--purple)', ic = del ? 'calendar' : 'ret'
    if (b.status === 'cancelled') { t = 'Cancelled'; c = 'var(--mut)' }
    else if (del && !undelivered(b)) { t = 'Delivered'; c = 'var(--green)' }
    else if (!del && b.status === 'returned') { t = 'Returned'; c = 'var(--mut)' }
    else if (!del && lateRet(b)) { const n = nDays(d, today) - 1; t = `Overdue by ${n} Day${n === 1 ? '' : 's'}`; c = 'var(--red)'; ic = 'warn' }
    else if (del && lateDel(b)) { const n = nDays(d, today) - 1; t = `Overdue by ${n} Day${n === 1 ? '' : 's'}`; c = 'var(--red)'; ic = 'warn' }
    else if (del && d === tomorrow) c = 'var(--blue)'
    else if (!del && d === today) { t = 'Return today' }
    return <div className="bd"><b>{fmt(d)}</b><span className="rl" style={tint(c)}><Ic n={ic} s={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />{t}</span></div>
  }
  const badge = (b: any): [string, string, string] => b.status === 'cancelled' ? ['Cancelled', 'var(--mut)', 'ban'] : b.status === 'returned' ? ['Returned', 'var(--mut)', 'check']
    : lateRet(b) ? ['Overdue', 'var(--red)', 'warn'] : b.status === 'out' ? (b.end_date <= addD(today, 2) ? ['Return Due', 'var(--purple)', 'ret'] : ['Active', 'var(--green)', 'truck'])
    : lateDel(b) ? ['Delivery Overdue', 'var(--red)', 'warn'] : b.status === 'pending' ? ['Awaiting Confirmation', 'var(--amber)', 'clock'] : b.start_date === today ? ['Delivery Today', 'var(--amber)', 'truck'] : ['Upcoming', 'var(--blue)', 'calendar']
  const next = (b: any) => b.status === 'pending' ? <button className="btn sm" onClick={() => ctx.patch(b, { status: 'confirmed' }, 'Confirmed')}>Confirm</button> : b.status === 'confirmed' ? <button className="btn sm" onClick={() => ctx.pickup(b)}>Mark delivered</button> : b.status === 'out' ? <button className="btn sm" onClick={() => ctx.ret(b)}>Return</button> : null
  const dots = (b: any) => <button className="dotb" aria-label="Actions" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.b.id === b.id ? null : { b, x: r.right, y: r.bottom + 4 }) }}><Ic n="dots" s={20} /></button>
  const handled = (b: any) => ([['Booked', b.taken_by ? ctx.staffName(b.taken_by) : b.log?.[0]?.m === 'Requested online' ? 'Online' : null], ['Prepared', ctx.staffName(b.prepared_by)], ['Delivered', ctx.staffName(b.delivered_by)], ['Returned', ctx.staffName(b.returned_by)]] as [string, string | null][]).filter(x => x[1])
  const cls = (b: any) => lateRet(b) || lateDel(b) ? 'od' : undelivered(b) && b.start_date === today ? 'today' : ''
  const idCell = (b: any) => <><a href="#" className="bid" style={{ color: 'var(--wine)', fontWeight: 700 }} onClick={e => { e.preventDefault(); ctx.openBooking(b.id) }}>{b.id}</a>{(b.alteration_notes || '').trim() && <div title={b.alteration_notes} style={{ fontSize: 12, color: 'var(--amber)' }}>✂ Alterations</div>}</>
  const dressCell = (b: any) => <div className="dr" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ctx.thumb(ctx.dmap[b.dress_id], 40, 52)}<div style={{ minWidth: 0 }}><b style={{ fontSize: 13 }}>{b.dress_code}</b><span style={{ display: 'block', fontSize: 12, color: 'var(--mut)', whiteSpace: 'normal', maxWidth: 170 }}>{b.dress_name}</span></div></div>
  const KC = ({ ic, c, v, l, sub, on }: any) => <button className="kc" style={tint(c)} onClick={on}><Ic n={ic} s={28} /><div><b>{v}</b><span>{l}</span><small>{sub}</small></div></button>
  const nF = Object.values(f).filter(Boolean).length
  const set = (k: string, v: string) => setF({ ...f, [k]: v })
  return (<div>
    <div className="pg-head"><div><h1>All Bookings</h1><p>Manage upcoming deliveries, returns, payments and booking activity</p></div>
      <div className="pg-tools" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <label className="bk-search"><Ic n="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by Booking ID, Customer, Phone or Dress..." aria-label="Search bookings" /></label>
        <a className="btn wine" href="/#collection" style={{ textDecoration: 'none' }}>＋ Take Booking</a></div></div>
    <div className="k6">
      <KC ic="calcheck" c="var(--wine)" v={monthN} l="Total Bookings" sub="This month" on={() => setFlt('all')} />
      <KC ic="truck" c="var(--blue)" v={count('deltoday')} l="Today's Deliveries" sub="Scheduled for today" on={() => setFlt('deltoday')} />
      <KC ic="calcheck" c="var(--blue)" v={count('upcoming')} l="Upcoming Deliveries" sub="Next 7 days" on={() => setFlt('upcoming')} />
      <KC ic="ret" c="var(--purple)" v={count('rettoday')} l="Today's Returns" sub="Expected today" on={() => setFlt('rettoday')} />
      <KC ic="warn" c="var(--red)" v={B.filter(lateRet).length} l="Overdue Returns" sub="Requires attention" on={() => setFlt('overdue')} />
      <KC ic="hourglass" c="var(--amber)" v={inr(sumOwe)} l="Pending Payments" sub="Outstanding balance" on={() => setFlt('owing')} /></div>
    <div className="bk-strip"><h4>TODAY'S WORKFLOW</h4>
      <button style={tint('var(--blue)')} onClick={() => setFlt('deltoday')}>{count('deltoday')} Deliveries Today</button>
      <button style={tint('var(--purple)')} onClick={() => setFlt('rettoday')}>{count('rettoday')} Returns Due Today</button>
      <button style={tint('var(--red)')} onClick={() => setFlt('overdue')}>{count('overdue')} Overdue</button></div>
    <div className="bk-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={cur === k && !EXTRA[flt]} className={cur === k && !EXTRA[flt] ? 'on' : ''} onClick={() => setFlt(k)}>{l}<span className={'n' + (k === 'overdue' && count(k) ? ' red' : '')}>{count(k)}</span></button>)}</div>
    <div className="bk-bar">
      {EXTRA[flt] && <span className="bdg" style={tint('var(--wine)')}>Showing: {EXTRA[flt]} <button onClick={() => setFlt('all')} aria-label="Clear" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', padding: 0 }}>✕</button></span>}
      <span style={{ flex: 1 }} /><label className="mpick" style={{ padding: '2px 10px' }}><Ic n="calendar" s={16} /><input type="month" value={f.month} onChange={e => set('month', e.target.value)} aria-label="Delivery month" title="Show bookings delivering in this month" /></label>
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="del">Sort: Delivery Date – Nearest First</option><option value="ret">Sort: Return Date – Nearest First</option><option value="new">Sort: Booking Date – Newest First</option><option value="pend">Sort: Pending Amount – Highest First</option></select>
      <button className="btn alt sm" onClick={() => setShowF(!showF)} style={{ padding: '9px 14px' }}><Ic n="filter" s={15} /> Filters{nF ? ` (${nF})` : ''}</button></div>
    {showF && <div className="bk-filt">
      <label>Delivery from<input type="date" value={f.dFrom} onChange={e => set('dFrom', e.target.value)} /></label><label>Delivery to<input type="date" value={f.dTo} onChange={e => set('dTo', e.target.value)} /></label>
      <label>Return from<input type="date" value={f.rFrom} onChange={e => set('rFrom', e.target.value)} /></label><label>Return to<input type="date" value={f.rTo} onChange={e => set('rTo', e.target.value)} /></label>
      <label>Booking status<select value={f.status} onChange={e => set('status', e.target.value)}><option value="">Any</option>{[['pending', 'Awaiting confirmation'], ['confirmed', 'Upcoming'], ['out', 'Out for rental'], ['returned', 'Returned'], ['overdue', 'Overdue'], ['cancelled', 'Cancelled']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Payment status<select value={f.pay} onChange={e => set('pay', e.target.value)}><option value="">Any</option><option value="due">Balance due</option><option value="paid">Fully paid</option></select></label>
      <label>Taken by<select value={f.staff} onChange={e => set('staff', e.target.value)}><option value="">Anyone</option>{(ctx.STAFF || []).filter((s: any) => ['owner', 'manager'].includes(s.role)).map((s: any) => <option key={s.user_id} value={s.user_id}>{s.name || 'Staff'}</option>)}</select></label>
      <label>Dress category<select value={f.cat} onChange={e => set('cat', e.target.value)}><option value="">All</option>{MAIN_CATS.map(m => <option key={m.key}>{m.label}</option>)}</select></label>
      <div style={{ alignSelf: 'end' }}><button className="btn alt sm" onClick={() => setF(NOF)}>Clear filters</button></div></div>}
    <div className="bk-card-t bk-tbl"><div className="scroll"><table className="bt"><thead><tr><th>Booking ID</th><th>Delivery Date</th><th>Return Date</th><th>Customer</th><th>Dress / Item</th><th>Total Value</th><th>Received</th><th>Pending</th><th>Status</th><th></th></tr></thead><tbody>
      {rows.map(b => { const [sl, sc, si] = badge(b), o = owe(b)
        return <tr key={b.id} className={cls(b)} style={b.status === 'cancelled' ? { opacity: .6 } : undefined}>
          <td>{idCell(b)}</td><td>{dateCell(b, 'start_date')}</td><td>{dateCell(b, 'end_date')}</td>
          <td style={{ whiteSpace: 'nowrap' }}><b style={{ fontWeight: 600 }}>{b.customer_name}</b><div><a href={'tel:' + b.phone} style={{ fontSize: 12, color: 'var(--mut)' }}>{b.phone}</a></div></td>
          <td>{dressCell(b)}</td><td><b>{inr(b.rent + b.charges)}</b></td>
          <td style={{ whiteSpace: 'nowrap' }}><b style={{ color: 'var(--green)' }}>{inr(b.paid)}</b><div style={{ fontSize: 11, color: 'var(--mut)' }}>{b.status === 'returned' ? 'Deposit settled' : `Deposit ${inr(b.deposit_held)} of ${inr(b.deposit)}`}</div></td>
          <td><b style={{ color: o > 0 ? 'var(--red)' : 'var(--mut)' }}>{inr(o)}</b></td>
          <td style={{ whiteSpace: 'nowrap' }}><span className="bdg" style={tint(sc)}><Ic n={si} s={14} />{sl}</span>{b.status === 'out' && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 3 }}>Hand back {inr(ctx.refundDue(b))}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{next(b)} {dots(b)}</td></tr> })}
      {!rows.length && <tr><td colSpan={10} className="mut" style={{ padding: 20 }}>No bookings match.{(q || nF) ? ' Try clearing the search or filters.' : ''}</td></tr>}</tbody></table></div></div>
    <div className="bk-cards">{rows.map(b => { const [sl, sc, si] = badge(b), o = owe(b)
      return <div key={b.id} className={'bk-m ' + cls(b)}><div className="top">{idCell(b)}<span className="bdg" style={tint(sc)}><Ic n={si} s={14} />{sl}</span></div>
        <div className="dd"><div><small style={{ color: 'var(--mut)', fontSize: 11 }}>DELIVERY</small>{dateCell(b, 'start_date')}</div><div><small style={{ color: 'var(--mut)', fontSize: 11 }}>RETURN</small>{dateCell(b, 'end_date')}</div></div>
        {dressCell(b)}<div className="ft" style={{ marginTop: 10 }}><span>{b.customer_name}<br /><a href={'tel:' + b.phone} style={{ fontSize: 12 }}>{b.phone}</a></span><span style={{ textAlign: 'right' }}>Total {inr(b.rent + b.charges)}<br /><b style={{ color: o > 0 ? 'var(--red)' : 'var(--green)' }}>{o > 0 ? `Pending ${inr(o)}` : 'Paid'}</b></span><span>{next(b)} {dots(b)}</span></div></div> })}
      {!rows.length && <p className="mut">No bookings match.</p>}</div>
    {menu && <div className="bkm-pop" onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: Math.min(menu.y, innerHeight - 340), right: Math.max(8, innerWidth - menu.x) }}>{ctx.sel(menu.b)}{handled(menu.b).length > 0 && <small>{handled(menu.b).map(([l, n]) => <div key={l}>{l}: {n}</div>)}</small>}</div>}
  </div>)
}
