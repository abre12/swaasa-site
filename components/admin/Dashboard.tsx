'use client'
import { useState } from 'react'
import { addD, dmy, inr, istDate, todayIST } from '@/lib/util'
import { computeAlerts } from '@/lib/alerts'
import { Ic } from './icons'
import PageHead from './PageHead'
import { PendingDeliveries, PendingReturns } from './Deliveries'
import Today from './Today'
const mon = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
const monLong = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export function Chart({ B }: { B: any[] }) {
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
type Pop = null | 'made' | 'del' | 'ret' | 'over' | 'pdel' | 'pret' | 'appr'
const tint = (c: string): React.CSSProperties => ({ ['--c' as any]: c })
const dShort = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })
// Colour and icon for each alteration stage (the label itself comes from altStatus() in lib/bookingAction.ts).
const JT: Record<string, [string, string]> = { warn: ['var(--red)', 'xc'], todo: ['var(--amber)', 'prog'], busy: ['var(--amber)', 'prog'], check: ['var(--blue)', 'search'], done: ['var(--green)', 'checkc'], off: ['var(--mut)', 'ban'] }
export default function Dashboard({ ctx }: { ctx: any }) {
  const B: any[] = ctx.B, today = todayIST(), in7 = addD(today, 7), tomorrow = addD(today, 1)
  const [pop, setPop] = useState<Pop>(null); const [mon, setMon] = useState(today.slice(0, 7))
  const made = B.filter(b => b.status !== 'cancelled' && istDate(b.created_at) === today)
  const delToday = B.filter(b => b.start_date === today && ['confirmed', 'out', 'returned'].includes(b.status))
  const retToday = B.filter(b => b.end_date === today && ['out', 'returned'].includes(b.status))
  const odDel = B.filter(b => b.status === 'confirmed' && b.start_date < today), odRet = B.filter(b => b.status === 'out' && b.end_date < today)
  const pdel = B.filter(b => b.status === 'confirmed' && b.start_date <= in7), pret = B.filter(b => b.status === 'out')
  const pending = (ctx.APPR || []).filter((a: any) => a.status === 'pending')
  // Monthly figures: bookings whose delivery date falls in the chosen month (cancelled ones excluded).
  const mb = B.filter(b => b.status !== 'cancelled' && b.start_date.slice(0, 7) === mon)
  const sum = (f: (b: any) => number) => mb.reduce((t, b) => t + f(b), 0)
  const rent = sum(b => b.rent), cust = sum(b => b.custom_charge || 0), dmg = sum(b => b.damage_charge || 0), late = sum(b => b.late_fee || 0)
  const other = Math.max(0, sum(b => b.charges) - cust - dmg - late), total = sum(b => b.rent + b.charges)
  const monName = new Date(mon + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const decide = async (a: any, yes: boolean) => {
    const v = await ctx.ask(yes ? 'Approve the shortfall?' : 'Decline the shortfall?', [{ name: 'n', label: 'Note for the team (optional)' }], { ok: yes ? 'Approve' : 'Decline', note: `${yes ? 'The booking can then be delivered or returned' : 'The team must collect the balance'} with ${inr(a.shortfall)} unpaid.` }); if (!v) return
    const { error } = await ctx.sb.rpc('decide_approval', { p_id: a.id, p_approve: yes, p_note: v.n }); ctx.say(error ? 'Could not save your decision.' : yes ? 'Approved' : 'Declined'); ctx.load()
  }
  const title: Record<string, string> = { made: "Today's bookings", del: "Today's deliveries", ret: "Today's returns", over: 'Overdue deliveries and returns', pdel: 'Pending deliveries: next 7 days', pret: 'Pending returns: dresses out with customers', appr: ctx.owner ? 'Shortfalls waiting for your approval' : 'Shortfall requests' }
  const dl = (f: string) => <PendingDeliveries ctx={ctx} filter={f} />, rt = (f: string) => <PendingReturns ctx={ctx} filter={f} />
  const KC = ({ ic, c, v, l, sub, on }: { ic: string; c: string; v: string | number; l: string; sub?: string; on: () => void }) => <button className="kc" style={tint(c)} onClick={on}><Ic n={ic} s={40} /><div><b>{v}</b><span>{l}</span>{sub && <small>{sub}</small>}</div></button>
  const dressCell = (code: string, name: string, did: string, img?: string) => <div className="dr">{ctx.thumb(ctx.dmap[did] || { images: img ? [img] : [] }, 46, 60)}<div><b>{code}</b><span>{name}</span></div></div>
  return (<div>
    <PageHead icon="home" title="Dashboard" sub="The most important work for today, all in one place" />
    <Today ctx={ctx} embedded />
    {ctx.owner && (() => {
      const { alerts: al } = computeAlerts({ B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC, st: ctx.st }, today, 0)
      const riskCount = al.filter(a => a.level === 'risk' || a.level === 'critical').length
      const waiting = (ctx.APPR || []).filter((a: any) => a.status === 'pending').length
      return (riskCount || waiting) ? <div className="alsobar" style={{ margin: '10px 0' }}><b style={{ marginRight: 8 }}>Owner attention</b>
        {riskCount > 0 && <button className="hot" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>{riskCount} item{riskCount === 1 ? '' : 's'} at risk</button>}
        {waiting > 0 && <button className="hot" onClick={() => ctx.go('approvals')}>{waiting} approval{waiting === 1 ? '' : 's'} waiting</button>}
      </div> : null
    })()}
    <div className="k6" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
      <KC ic="truck" c="var(--blue)" v={`${delToday.filter(b => b.status === 'out' || b.status === 'returned').length}/${delToday.length}`} l="Deliveries completed today" on={() => setPop('del')} />
      <KC ic="ret" c="var(--purple)" v={retToday.length} l="Returns due today" on={() => setPop('ret')} />
      <KC ic="warn" c="var(--red)" v={odRet.length + odDel.length} l="Overdue items" on={() => setPop('over')} />
    </div>
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
          {pop === 'appr' && <div className="scroll"><table><thead><tr><th>Booking</th><th>Customer</th><th>Rental amount</th><th>Received</th><th>Short by</th><th>Reason</th><th>Asked by</th><th>Status</th><th></th></tr></thead><tbody>
            {(ctx.APPR || []).filter((a: any) => a.status === 'pending' || a.decided_at > new Date(Date.now() - 7 * 864e5).toISOString()).map((a: any) => { const b = B.find(x => x.id === a.booking_id); return <tr key={a.id}>
              <td><a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(a.booking_id) }}>{a.booking_id}</a><div className="mut" style={{ fontSize: 12 }}>{b?.dress_code}</div></td><td>{b?.customer_name}</td><td>{b ? inr(b.rent + (b.custom_charge || 0)) : '–'}</td><td>{b ? inr(b.paid) : '–'}</td><td><b className="bad">{inr(a.shortfall)}</b></td>
              <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{a.reason || '–'}</td><td>{ctx.staffName(a.requested_by) || 'staff'}<div className="mut" style={{ fontSize: 12 }}>{dmy(istDate(a.requested_at))}</div></td>
              <td style={{ color: a.status === 'approved' ? 'var(--ok)' : a.status === 'rejected' ? 'var(--bad)' : '#c58a2b' }}>{a.status}</td>
              <td style={{ whiteSpace: 'normal' }}>{ctx.owner && a.status === 'pending' && <><button className="btn sm" onClick={() => decide(a, true)}>Approve</button> <button className="btn alt sm" onClick={() => decide(a, false)}>Decline</button></>}</td></tr> })}
            {!(ctx.APPR || []).length && <tr><td colSpan={9} className="mut">No requests.</td></tr>}</tbody></table></div>}
        </div></div></div>}
  </div>)
}
