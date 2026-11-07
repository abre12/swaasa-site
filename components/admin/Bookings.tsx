'use client'
import { hasApplicableFinancialValue } from '@/lib/payments'
import { useEffect, useMemo, useState } from 'react'
import { addD, inr, istDate, mainCatOf, MAIN_CATS, nDays, todayIST } from '@/lib/util'
import { Ic } from './icons'
import PageHead from './PageHead'
import MonthPick from './MonthPick'
const tint = (c: string): React.CSSProperties => ({ ['--c' as any]: c })
const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const n0 = (n: number) => n ? n.toLocaleString('en-IN') : '–'
const TABS: [string, string][] = [['all', 'All Bookings'], ['upcoming', 'Upcoming Deliveries'], ['out', 'Active'], ['returns', 'Returns Due'], ['done', 'Returned'], ['cancelled', 'Cancelled'], ['overdue', 'Overdue']]
const EXTRA: Record<string, string> = { today: 'Due today (deliveries and returns)', deltoday: 'Deliveries today', rettoday: 'Returns due today', pending: 'Awaiting confirmation', owing: 'Balance due', received: 'Payment received', depheld: 'Deposit held', alterations: 'With alteration notes', created_today: 'Booked today' }
// Tabs that describe what is happening right now. They ignore the month selector so nothing active or overdue is ever hidden.
const LIVE = new Set(['upcoming', 'out', 'returns', 'overdue', 'today', 'deltoday', 'rettoday', 'depheld'])
const NOF = { dFrom: '', dTo: '', rFrom: '', rTo: '', status: '', pay: '', staff: '', cat: '' }
export default function Bookings({ ctx, flt, setFlt }: { ctx: any; flt: string; setFlt: (f: string) => void }) {
  const B: any[] = ctx.B, today = todayIST(), tomorrow = addD(today, 1), in7 = addD(today, 7)
  const [q, setQ] = useState(''), [sort, setSort] = useState('del'), [showF, setShowF] = useState(false), [f, setF] = useState(NOF), [month, setMonth] = useState(today.slice(0, 7)), [menu, setMenu] = useState<{ b: any; x: number; y: number } | null>(null), [adv, setAdv] = useState<Record<string, number>>({})
  useEffect(() => { const c = () => setMenu(null); document.addEventListener('click', c); window.addEventListener('scroll', c, true); return () => { document.removeEventListener('click', c); window.removeEventListener('scroll', c, true) } }, [])
  // Advance = rent taken when the booking was made (purpose "advance"), less any advance refunded. It is separate from the refundable deposit.
  useEffect(() => { ctx.sb.from('payments').select('booking_id,amount,purpose').in('purpose', ['advance', 'advance_refund']).then(({ data }: any) => { const m: Record<string, number> = {}; (data || []).forEach((p: any) => { m[p.booking_id] = (m[p.booking_id] || 0) + (p.purpose === 'advance' ? p.amount : -p.amount) }); setAdv(m) }) }, [ctx.tick, ctx.sb])
  const live = (b: any) => b.status !== 'cancelled', owe = (b: any) => Math.max(0, b.rent + b.charges - b.paid), total = (b: any) => b.rent + b.charges
  const undelivered = (b: any) => ['pending', 'confirmed'].includes(b.status), lateDel = (b: any) => undelivered(b) && b.start_date < today, lateRet = (b: any) => b.status === 'out' && b.end_date < today
  const delT = (b: any) => b.start_date === today && ['confirmed', 'out', 'returned'].includes(b.status), retT = (b: any) => b.end_date === today && ['out', 'returned'].includes(b.status)
  const inMonth = (b: any) => !month || b.start_date.slice(0, 7) === month
  const P: Record<string, (b: any) => boolean> = {
    all: live, upcoming: b => undelivered(b) && b.start_date >= today && b.start_date <= in7, out: b => b.status === 'out', returns: b => b.status === 'out' && b.end_date >= today && b.end_date <= in7,
    done: b => b.status === 'returned', cancelled: b => b.status === 'cancelled', overdue: b => lateRet(b) || lateDel(b),
    today: b => delT(b) || retT(b), deltoday: delT, rettoday: retT, pending: b => b.status === 'pending', owing: b => live(b) && owe(b) > 0, received: b => live(b) && b.paid > 0, depheld: b => live(b) && b.deposit_held > 0,
    alterations: b => live(b) && !!(b.alteration_notes || '').trim(), created_today: b => live(b) && istDate(b.created_at) === today }
  const cur = P[flt] ? flt : 'all'
  const inScope = (k: string) => (b: any) => P[k](b) && (LIVE.has(k) || inMonth(b))
  const monthB = B.filter(b => live(b) && inMonth(b))
  const sum = (l: any[], g: (b: any) => number) => l.reduce((t, b) => t + g(b), 0)
  const cnt = (k: string) => B.filter(inScope(k)).length
  const rank = (b: any) => lateDel(b) ? 0 : undelivered(b) ? (b.start_date === today ? 1 : b.start_date === tomorrow ? 2 : 3) : b.status === 'out' ? (lateRet(b) ? 5 : 4) : 6
  const near = (d: string) => d >= today ? [0, d] : [1, d]
  const byNear = (k: 'start_date' | 'end_date') => (a: any, b: any) => { const x = near(a[k]), y = near(b[k]); return (x[0] as number) - (y[0] as number) || (x[0] === 0 ? (x[1] as string).localeCompare(y[1] as string) : (y[1] as string).localeCompare(x[1] as string)) }
  const prio = (a: any, b: any) => { const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb; return ra <= 3 ? a.start_date.localeCompare(b.start_date) : ra <= 5 ? a.end_date.localeCompare(b.end_date) : b.end_date.localeCompare(a.end_date) }
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase(), nd = n.replace(/\D/g, '')
    let l = B.filter(inScope(cur))
    l = l.filter(b => (!n || [b.id, b.customer_name, b.dress_code, b.dress_name].some((x: string) => (x || '').toLowerCase().includes(n)) || (nd.length > 2 && b.phone.replace(/\D/g, '').includes(nd)))
      && (!f.dFrom || b.start_date >= f.dFrom) && (!f.dTo || b.start_date <= f.dTo) && (!f.rFrom || b.end_date >= f.rFrom) && (!f.rTo || b.end_date <= f.rTo)
      && (!f.status || (f.status === 'overdue' ? lateRet(b) || lateDel(b) : b.status === f.status)) && (!f.pay || (f.pay === 'due' ? owe(b) > 0 : owe(b) === 0)) && (!f.staff || b.taken_by === f.staff) && (!f.cat || mainCatOf(b.category) === f.cat))
    const s = sort === 'del' ? (cur === 'returns' || cur === 'out' || cur === 'rettoday' ? byNear('end_date') : prio) : sort === 'ret' ? byNear('end_date') : sort === 'new' ? (a: any, b: any) => b.created_at.localeCompare(a.created_at) : (a: any, b: any) => owe(b) - owe(a)
    return l.slice().sort(s)
  }, [B, q, f, cur, sort, month, today])
  const T = { adv: sum(rows, b => adv[b.id] || 0), dep: sum(rows, b => Math.max(0, b.deposit_held)), rent: sum(rows, b => b.rent), cus: sum(rows, b => b.custom_charge || 0), dmg: sum(rows, b => b.damage_charge || 0), late: sum(rows, b => b.late_fee || 0), tot: sum(rows, total), rec: sum(rows, b => b.paid), pend: sum(rows, owe) }
  const days = (a: string, b: string) => nDays(a, b) - 1
  const dateBadge = (b: any): [string, string, string] => {
    if (b.status === 'cancelled') return ['Cancelled', 'var(--mut)', 'ban']; if (b.status === 'returned') return ['Returned', 'var(--mut)', 'check']
    if (lateDel(b)) { const n = days(b.start_date, today); return [`OVERDUE – ${n} Day${n === 1 ? '' : 's'}`, 'var(--red)', 'warn'] }
    if (lateRet(b)) { const n = days(b.end_date, today); return [`OVERDUE – ${n} Day${n === 1 ? '' : 's'}`, 'var(--red)', 'warn'] }
    if (undelivered(b)) { const n = days(today, b.start_date); return n === 0 ? ['DELIVERY TODAY', 'var(--amber)', 'truck'] : n === 1 ? ['DELIVERY TOMORROW', 'var(--amber)', 'truck'] : [`In ${n} Days`, 'var(--purple)', 'ret'] }
    const n = days(today, b.end_date); return n === 0 ? ['RETURN TODAY', 'var(--purple)', 'ret'] : [`Return In ${n} Day${n === 1 ? '' : 's'}`, 'var(--purple)', 'ret']
  }
  const badge = (b: any): [string, string, string] => b.status === 'cancelled' ? ['Cancelled', 'var(--mut)', 'ban'] : b.status === 'returned' ? ['Returned', 'var(--mut)', 'check']
    : lateRet(b) ? ['Overdue', 'var(--red)', 'warn'] : b.status === 'out' ? (b.end_date <= addD(today, 2) ? ['Return Due', 'var(--purple)', 'ret'] : ['Active', 'var(--green)', 'truck'])
    : lateDel(b) ? ['Delivery Overdue', 'var(--red)', 'warn'] : b.status === 'pending' ? ['Awaiting Confirmation', 'var(--amber)', 'clock'] : b.start_date === today ? ['Delivery Today', 'var(--amber)', 'truck'] : ['Upcoming', 'var(--blue)', 'calendar']
  const next = (b: any) => b.status === 'pending' ? <button className="btn sm" onClick={() => ctx.patch(b, { status: 'confirmed' }, 'Confirmed')}>Confirm</button> : b.status === 'confirmed' ? <button className="btn sm" onClick={() => ctx.pickup(b)}>Mark delivered</button> : b.status === 'out' ? <button className="btn sm" onClick={() => ctx.ret(b)}>Return</button> : null
  const dots = (b: any) => <button className="dotb" aria-label="Actions" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.b.id === b.id ? null : { b, x: r.right, y: r.bottom + 4 }) }}><Ic n="dots" s={20} /></button>
  const handled = (b: any) => ([['Booked', b.taken_by ? ctx.staffName(b.taken_by) : null], ['Prepared', ctx.staffName(b.prepared_by)], ['Delivered', ctx.staffName(b.delivered_by)], ['Returned', ctx.staffName(b.returned_by)]] as [string, string | null][]).filter(x => x[1])
  const cls = (b: any) => lateRet(b) || lateDel(b) ? 'od' : undelivered(b) && b.start_date === today ? 'today' : ''
  const idCell = (b: any) => <><a href="#" className="bid" style={{ color: 'var(--wine)', fontWeight: 700 }} onClick={e => { e.preventDefault(); ctx.openBooking(b.id) }}>{b.id}</a>{(b.alteration_notes || '').trim() && <div title={b.alteration_notes} style={{ fontSize: 12, color: 'var(--amber)' }}>✂ Alterations</div>}</>
  const dateCell = (b: any) => { const [t, c, ic] = dateBadge(b); return <div className="bd"><span className="rl" style={tint(c)}><Ic n={ic} s={12} />{t}</span><div>Delivery: <b>{fmt(b.start_date)}</b></div><div>Return: <b>{fmt(b.end_date)}</b></div></div> }
  const dressCell = (b: any) => <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ctx.thumb(ctx.dmap[b.dress_id], 44, 58)}<div style={{ minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{b.dress_code}</b><span style={{ display: 'block', fontSize: 12, color: 'var(--mut)', whiteSpace: 'normal', maxWidth: 150 }}>{b.dress_name}</span></div></div>
  const KC = ({ ic, c, v, l, on }: any) => <button className="kc" style={tint(c)} onClick={on}><Ic n={ic} s={30} /><div><b>{v}</b><span>{l}</span></div></button>
  const nF = Object.values(f).filter(Boolean).length
  const set = (k: string, v: string) => setF({ ...f, [k]: v })
  const money = (n: number, c?: string) => <span style={{ color: c }}>{inr(n)}</span>
  return (<div>
    <PageHead icon="calcheck" title="All Bookings" sub="Manage upcoming deliveries, returns, payments and booking activity">
      <div className="pg-tools bk-head-tools" style={{ justifyContent: 'flex-end' }}>
        <label className="bk-search"><Ic n="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by Booking ID, Customer, Phone or Dress..." aria-label="Search bookings" /></label>
        <a className="btn wine" href="/#collection" style={{ textDecoration: 'none' }}>＋ Take Booking</a></div></PageHead>
    <div className="k6 k7 hs">
      <KC ic="calcheck" c="var(--wine)" v={monthB.length} l="Total Bookings" on={() => setFlt('all')} />
      <KC ic="truck" c="var(--blue)" v={cnt('upcoming')} l="Upcoming Deliveries" on={() => setFlt('upcoming')} />
      <KC ic="ret" c="var(--purple)" v={cnt('returns')} l="Returns Due" on={() => setFlt('returns')} />
      {ctx.owner && <KC ic="wallet" c="var(--green)" v={inr(sum(monthB, b => b.paid))} l="Total Received" on={() => setFlt('received')} />}
      {ctx.owner && <KC ic="hourglass" c="var(--amber)" v={inr(sum(monthB, owe))} l="Total Pending" on={() => setFlt('owing')} />}
      {ctx.owner && <KC ic="coins" c="var(--purple)" v={inr(sum(B.filter(live), b => Math.max(0, b.deposit_held)))} l="Deposit Held" on={() => setFlt('depheld')} />}
      <KC ic="warn" c="var(--red)" v={B.filter(lateRet).length} l="Overdue Returns" on={() => setFlt('overdue')} /></div>
    <div className="bk-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={cur === k && !EXTRA[flt]} className={cur === k && !EXTRA[flt] ? 'on' : ''} onClick={() => setFlt(k)}>{l}<span className={'n' + (k === 'overdue' && cnt(k) ? ' red' : '')}>{cnt(k)}</span></button>)}</div>
    <div className="bk-bar">
      {EXTRA[flt] && <span className="bdg" style={tint('var(--wine)')}>Showing: {EXTRA[flt]} <button onClick={() => setFlt('all')} aria-label="Clear" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', padding: 0 }}>✕</button></span>}
      <span style={{ flex: 1 }} /><MonthPick value={month} onChange={setMonth} max="2100-12" title="Controls the booking cards, table and totals. Active, overdue and upcoming tabs always show everything current." clearable />
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="del">Sort: Delivery Date – Nearest First</option><option value="ret">Sort: Return Date – Nearest First</option><option value="new">Sort: Booking Date – Newest First</option><option value="pend">Sort: Pending Amount – Highest First</option></select>
      <button className="btn alt sm" onClick={() => setShowF(!showF)} style={{ padding: '9px 14px' }}><Ic n="filter" s={15} /> Filters{nF ? ` (${nF})` : ''}</button></div>
    {showF && <div className="bk-filt">
      <label>Quick view<select value={flt} onChange={e => setFlt(e.target.value)}>{TABS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}{Object.entries(EXTRA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Delivery from<input type="date" value={f.dFrom} onChange={e => set('dFrom', e.target.value)} /></label><label>Delivery to<input type="date" value={f.dTo} onChange={e => set('dTo', e.target.value)} /></label>
      <label>Return from<input type="date" value={f.rFrom} onChange={e => set('rFrom', e.target.value)} /></label><label>Return to<input type="date" value={f.rTo} onChange={e => set('rTo', e.target.value)} /></label>
      <label>Booking status<select value={f.status} onChange={e => set('status', e.target.value)}><option value="">Any</option>{[['pending', 'Awaiting confirmation'], ['confirmed', 'Upcoming'], ['out', 'Active / out for rental'], ['returned', 'Returned'], ['overdue', 'Overdue']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Payment status<select value={f.pay} onChange={e => set('pay', e.target.value)}><option value="">Any</option><option value="due">Balance due</option><option value="paid">Fully paid</option></select></label>
      <label>Taken by<select value={f.staff} onChange={e => set('staff', e.target.value)}><option value="">Anyone</option>{(ctx.STAFF || []).filter((s: any) => ['owner', 'manager'].includes(s.role)).map((s: any) => <option key={s.user_id} value={s.user_id}>{s.name || 'Staff'}</option>)}</select></label>
      <label>Dress category<select value={f.cat} onChange={e => set('cat', e.target.value)}><option value="">All</option>{MAIN_CATS.map(m => <option key={m.key}>{m.label}</option>)}</select></label>
      <div style={{ alignSelf: 'end' }}><button className="btn alt sm" onClick={() => setF(NOF)}>Clear filters</button></div></div>}
    <div className="bk-card-t bk-tbl"><div className="bk-scroll"><table className="bt wide"><thead>
      <tr><th rowSpan={2}>Booking ID</th><th rowSpan={2} className="g-date">Delivery / Return Dates</th><th rowSpan={2}>Customer (Phone)</th><th rowSpan={2}>Dress / Item</th>
        <th colSpan={2} className="g-blue c">Advance &amp; Deposit (₹)</th><th colSpan={4} className="g-pink c">Charges (₹)</th><th rowSpan={2} className="c">Total Value (₹)</th><th colSpan={2} className="g-green c">Payments (₹)</th><th rowSpan={2}>Status</th><th rowSpan={2}></th></tr>
      <tr className="sub"><th className="g-blue c" title="Rent paid when the booking was made">Advance</th><th className="g-blue c" title="Refundable deposit currently held. Not revenue.">Refundable Deposit</th><th className="g-pink c">Rent</th><th className="g-pink c">Customization</th><th className="g-pink c">Damage</th><th className="g-pink c">Late</th><th className="g-green c">Received</th><th className="g-amber c">Pending</th></tr></thead><tbody>
      {rows.map(b => { const [sl, sc, si] = badge(b), o = owe(b), dh = Math.max(0, b.deposit_held)
        return <tr key={b.id} className={cls(b)} style={b.status === 'cancelled' ? { opacity: .6 } : undefined}>
          <td>{idCell(b)}</td><td>{dateCell(b)}</td>
          <td style={{ whiteSpace: 'nowrap' }}><b style={{ fontWeight: 600 }}>{b.customer_name}</b><div><a href={'tel:' + b.phone} style={{ fontSize: 12, color: 'var(--mut)' }}>({b.phone})</a></div></td><td>{dressCell(b)}</td>
          <td className="c g-blue-b">{n0(adv[b.id] || 0)}</td><td className="c g-blue-b">{b.status === 'returned' || b.status === 'cancelled' ? '–' : n0(dh)}</td>
          <td className="c">{n0(b.rent)}</td><td className="c">{n0(b.custom_charge || 0)}</td><td className="c">{n0(b.damage_charge || 0)}</td><td className="c">{n0(b.late_fee || 0)}</td>
          <td className="c"><b>{n0(total(b))}</b></td><td className="c"><b style={{ color: 'var(--green)' }}>{n0(b.paid)}</b></td><td className="c"><b style={{ color: o > 0 ? 'var(--red)' : 'var(--mut)' }}>{o > 0 ? n0(o) : '0'}</b></td>
          <td style={{ whiteSpace: 'nowrap' }}><span className="bdg" style={tint(sc)}><Ic n={si} s={14} />{sl}</span>{b.status === 'out' && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 3 }}>Hand back {inr(ctx.refundDue(b))}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{next(b)} {dots(b)}</td></tr> })}
      {!rows.length && <tr><td colSpan={14} className="mut" style={{ padding: 22 }}>No bookings match.{(q || nF) ? ' Try clearing the search or filters.' : ''}</td></tr>}</tbody>
      {ctx.owner && !!rows.length && <tfoot><tr><td colSpan={4}>Total ({rows.length} Booking{rows.length === 1 ? '' : 's'})</td>
        <td className="c g-blue">{inr(T.adv)}</td><td className="c g-blue">{inr(T.dep)}</td><td className="c g-pink">{inr(T.rent)}</td><td className="c g-pink">{inr(T.cus)}</td><td className="c g-pink">{inr(T.dmg)}</td><td className="c g-pink">{inr(T.late)}</td>
        <td className="c g-pink2">{inr(T.tot)}</td><td className="c g-green">{money(T.rec, 'var(--green)')}</td><td className="c g-amber">{money(T.pend, 'var(--red)')}</td><td colSpan={2}></td></tr></tfoot>}</table></div></div>
    <div className="bk-cards">{rows.map(b => { const [sl, sc, si] = badge(b), o = owe(b), ex = [['Rent', b.rent], ['Customization', b.custom_charge || 0], ['Damage', b.damage_charge || 0], ['Late', b.late_fee || 0]].filter(x => hasApplicableFinancialValue(x[1]))
      return <div key={b.id} className={'bk-m ' + cls(b)}><div className="top">{idCell(b)}<span className="bdg" style={tint(sc)}><Ic n={si} s={14} />{sl}</span></div>
        <div style={{ margin: '8px 0' }}>{dateCell(b)}</div>{dressCell(b)}
        <div className="ft" style={{ marginTop: 8 }}><span><b>{b.customer_name}</b><br /><a href={'tel:' + b.phone} style={{ fontSize: 12 }}>{b.phone}</a></span><span>{next(b)} {dots(b)}</span></div>
        <div className="mny"><div><small>Total</small><b>{inr(total(b))}</b></div><div><small>Received</small><b style={{ color: 'var(--green)' }}>{inr(b.paid)}</b></div><div><small>Pending</small><b style={{ color: o > 0 ? 'var(--red)' : 'var(--mut)' }}>{inr(o)}</b></div></div>
        {(ex.length > 0 || b.deposit_held > 0) && <div className="mut" style={{ fontSize: 11.5, marginTop: 6 }}>{ex.map(x => `${x[0]} ${inr(x[1] as number)}`).join(' · ')}{b.deposit_held > 0 && b.status !== 'returned' ? `${ex.length ? ' · ' : ''}Deposit held ${inr(b.deposit_held)}` : ''}</div>}</div> })}
      {!rows.length && <p className="mut">No bookings match.</p>}
      {ctx.owner && !!rows.length && <div className="bk-m tot"><b>Total ({rows.length} Booking{rows.length === 1 ? '' : 's'})</b><div className="mny"><div><small>Value</small><b>{inr(T.tot)}</b></div><div><small>Received</small><b style={{ color: 'var(--green)' }}>{inr(T.rec)}</b></div><div><small>Pending</small><b style={{ color: 'var(--red)' }}>{inr(T.pend)}</b></div></div></div>}</div>
    {menu && <div className="bkm-pop" onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: Math.min(menu.y, innerHeight - 340), right: Math.max(8, innerWidth - menu.x) }}>{ctx.sel(menu.b)}{handled(menu.b).length > 0 && <small>{handled(menu.b).map(([l, n]) => <div key={l}>{l}: {n}</div>)}</small>}</div>}
  </div>)
}
