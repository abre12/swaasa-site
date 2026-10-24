'use client'
import { useState } from 'react'
import { addD, dmy, inr, istDate, todayIST } from '@/lib/util'
import PrepBoard from './PrepBoard'
import { PendingDeliveries, PendingReturns } from './Deliveries'
const mon = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
const monLong = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
function Chart({ B }: { B: any[] }) {
  const [by, setBy] = useState<'created' | 'delivery'>('created'); const [hov, setHov] = useState<number | null>(null)
  const cur = todayIST().slice(0, 7)
  const months = Array.from({ length: 13 }, (_, i) => { const d = new Date(cur + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - (12 - i)); return d.toISOString().slice(0, 7) })
  // Counting rule: every booking that is not cancelled, counted in the month it was made (or the month of its delivery date).
  const counts = months.map(m => B.filter(b => b.status !== 'cancelled' && (by === 'created' ? istDate(b.created_at) : b.start_date).slice(0, 7) === m).length)
  const top = Math.max(5, Math.ceil(Math.max(...counts) / 5) * 5), prev = counts[11], now = counts[12], diff = now - prev
  const W = 720, H = 220, L = 34, bw = (W - L - 10) / 13, y = (v: number) => H - 36 - (v / top) * (H - 56)
  const shown = hov ?? 12
  return (<div>
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}><b style={{ letterSpacing: '.08em', fontSize: 13 }}>BOOKINGS PER MONTH</b>
      <select value={by} onChange={e => setBy(e.target.value as any)} style={{ width: 'auto' }}><option value="created">By booking date</option><option value="delivery">By delivery date</option></select></div>
    <p style={{ margin: '4px 0 4px', fontSize: 14 }}><b>{monLong(months[shown])}: {counts[shown]}</b>{shown === 12 && <span className="mut"> (month in progress)</span>} · <span className={diff >= 0 ? 'ok' : 'bad'}>{mon(months[12])} so far {diff >= 0 ? '+' : ''}{diff} vs {mon(months[11])}{prev ? ` (${diff >= 0 ? '+' : ''}${Math.round(100 * diff / prev)}%)` : ''}</span></p>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 230 }} role="img" aria-label="Bookings per month">
      {[0, 0.5, 1].map(t => <g key={t}><line x1={L} x2={W - 6} y1={y(top * t)} y2={y(top * t)} stroke="var(--line)" /><text x={L - 6} y={y(top * t) + 4} fontSize="11" textAnchor="end" fill="var(--mut)">{Math.round(top * t)}</text></g>)}
      {counts.map((c, i) => { const x = L + i * bw + 5, w = bw - 10, isCur = i === 12
        return <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} onClick={() => setHov(i)} style={{ cursor: 'pointer' }}>
          <rect x={x} y={y(c)} width={w} height={Math.max(0, H - 36 - y(c))} fill="var(--gold)" opacity={isCur ? 0.45 : 1} stroke={isCur ? 'var(--gold)' : 'none'} strokeDasharray={isCur ? '4 3' : undefined}><title>{`${monLong(months[i])}: ${c}${isCur ? ' (so far)' : ''}`}</title></rect>
          <text x={x + w / 2} y={y(c) - 4} fontSize="11" textAnchor="middle" fill="var(--ink)">{c || ''}</text>
          <text x={x + w / 2} y={H - 20} fontSize="11" textAnchor="middle" fill="var(--mut)">{mon(months[i])}</text>
          {(i === 0 || months[i].endsWith('-01')) && <text x={x + w / 2} y={H - 7} fontSize="10" textAnchor="middle" fill="var(--mut)">{months[i].slice(0, 4)}</text>}</g> })}
    </svg>
    <p className="mut" style={{ fontSize: 12, margin: '2px 0 0' }}>Cancelled bookings are not counted. The dashed bar is the current month, still in progress.</p>
  </div>)
}
type Pop = null | 'made' | 'del' | 'ret' | 'over' | 'pdel' | 'pret'
export default function Dashboard({ ctx }: { ctx: any }) {
  const B: any[] = ctx.B, today = todayIST(), in7 = addD(today, 7), buf = ctx.buf
  const [pop, setPop] = useState<Pop>(null)
  const made = B.filter(b => b.status !== 'cancelled' && istDate(b.created_at) === today)
  const delToday = B.filter(b => b.start_date === today && ['confirmed', 'out', 'returned'].includes(b.status))
  const retToday = B.filter(b => b.end_date === today && ['out', 'returned'].includes(b.status))
  const odDel = B.filter(b => b.status === 'confirmed' && b.start_date < today), odRet = B.filter(b => b.status === 'out' && b.end_date < today)
  const pdel = B.filter(b => b.status === 'confirmed' && b.start_date <= in7), pret = B.filter(b => b.status === 'out')
  const cards: [Pop, string, number, string, boolean][] = [
    ['made', "Today's Bookings", made.length, 'made today', false], ['del', "Today's Delivery", delToday.length, 'to hand over today', false], ['ret', "Today's Return", retToday.length, 'due back today', false],
    ['over', 'Overdue', odDel.length + odRet.length, `${odDel.length} deliveries · ${odRet.length} returns`, odDel.length + odRet.length > 0],
    ['pdel', 'Pending Delivery', pdel.length, 'next 7 days', false], ['pret', 'Pending Returns', pret.length, 'out with customers', odRet.length > 0]]
  // Follow-up: a dress that is out with a customer but is already booked for someone else soon.
  const follow = pdel.map(n => { const c = B.find(x => x.dress_id === n.dress_id && x.status === 'out' && x.id !== n.id); if (!c) return null
    const over = c.end_date < today, tight = !over && c.end_date >= addD(n.start_date, -(buf + 1)); return { n, c, over, tight } }).filter(Boolean).sort((a: any, b: any) => (+b.over - +a.over) || (+b.tight - +a.tight) || a.n.start_date.localeCompare(b.n.start_date)) as any[]
  const title: Record<string, string> = { made: "Today's bookings", del: "Today's deliveries", ret: "Today's returns", over: 'Overdue deliveries and returns', pdel: 'Pending deliveries: next 7 days', pret: 'Pending returns: dresses out with customers' }
  const dl = (f: string) => <PendingDeliveries ctx={ctx} filter={f} />, rt = (f: string) => <PendingReturns ctx={ctx} filter={f} />
  return (<div style={{ display: 'grid', gap: 18 }}>
    <div className="adm-cards">{cards.map(([k, l, n, sub, red]) => <button key={k} onClick={() => setPop(k)} className="stat-card" style={red ? { borderColor: 'var(--bad)' } : undefined}>
      <span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 34, fontFamily: 'Cormorant Garamond, serif', color: red ? 'var(--bad)' : undefined }}>{n}</b><span className="mut" style={{ fontSize: 12 }}>{sub}</span></button>)}</div>
    <div className="adm-two">
      <div className="box" style={{ margin: 0 }}><h3 style={{ letterSpacing: '.08em', fontSize: 18 }}>FOLLOW UP: DRESS NOT BACK YET</h3>
        <p className="mut" style={{ fontSize: 13, margin: '2px 0 8px' }}>Dresses out with a customer that are already booked for the next 7 days. Call to get them back on time.</p>
        {follow.map(({ n, c, over, tight }: any) => <div key={n.id} style={{ display: 'flex', gap: 10, padding: '8px 10px', marginBottom: 6, border: `1px solid ${over ? 'var(--bad)' : tight ? '#c58a2b' : 'var(--line)'}`, background: over ? '#b4493f14' : tight ? '#c58a2b14' : 'transparent' }}>
          {ctx.thumb(ctx.dmap[n.dress_id], 40, 52)}<div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
            <b>{n.dress_code} · {n.dress_name}</b><div>Next delivery <b>{dmy(n.start_date)}</b> to {n.customer_name}</div>
            <div>Now with <b>{c.customer_name}</b> · <a href={'tel:' + c.phone}>{c.phone}</a> · due back <b>{dmy(c.end_date)}</b></div>
            <div style={{ color: over ? 'var(--bad)' : tight ? '#c58a2b' : 'var(--mut)', fontWeight: 600 }}>{over ? `OVERDUE: call now` : tight ? 'Return is cutting it close to the next delivery' : 'On track'}</div></div>
          <button className="btn sm" style={{ alignSelf: 'center' }} onClick={() => ctx.ret(c)}>Mark returned</button></div>)}
        {!follow.length && <p className="ok" style={{ margin: 0 }}>Nothing to chase. Every dress due out this week is in the shop.</p>}</div>
      <div className="box" style={{ margin: 0 }}><h3 style={{ letterSpacing: '.08em', fontSize: 18 }}>ALTERATIONS TO COMPLETE</h3><PrepBoard ctx={ctx} compact /></div>
    </div>
    <div className="box" style={{ margin: 0 }}><Chart B={B} /></div>
    {pop && <div onClick={() => setPop(null)} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 60, overflow: 'auto', padding: 16 }}>
      <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 980, margin: '0 auto' }}>
        <div className="row"><h3 style={{ margin: 0 }}>{title[pop]}</h3><button className="btn alt sm" onClick={() => setPop(null)}>Close</button></div>
        <div style={{ marginTop: 10, display: 'grid', gap: 14 }}>
          {pop === 'made' && <div className="scroll"><table><thead><tr><th>Ref</th><th>Dress</th><th>Customer</th><th>Delivery</th><th>Status</th><th>Balance</th></tr></thead><tbody>
            {made.map(b => <tr key={b.id} onClick={() => ctx.openBooking(b.id)} style={{ cursor: 'pointer' }}><td>{b.id}</td><td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ctx.thumb(ctx.dmap[b.dress_id])}{b.dress_code}</div></td><td>{b.customer_name}<br />{b.phone}</td><td>{dmy(b.start_date)}</td><td>{b.status}</td><td>{inr(b.rent + b.charges - b.paid)}</td></tr>)}
            {!made.length && <tr><td colSpan={6} className="mut">No bookings made today.</td></tr>}</tbody></table></div>}
          {pop === 'del' && dl('today-del')}{pop === 'ret' && rt('today-ret')}
          {pop === 'over' && <>{<div><b>Overdue deliveries ({odDel.length})</b>{dl('overdue')}</div>}{<div><b>Overdue returns ({odRet.length})</b>{rt('overdue')}</div>}</>}
          {pop === 'pdel' && dl('next7')}{pop === 'pret' && rt('all')}
        </div></div></div>}
  </div>)
}
