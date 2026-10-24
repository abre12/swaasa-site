'use client'
import { useState } from 'react'
import { istDate, todayIST } from '@/lib/util'
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
  const W = 720, H = 250, L = 38, bw = (W - L - 10) / 13, y = (v: number) => H - 40 - (v / top) * (H - 70)
  const shown = hov ?? 12
  return (<div className="box" style={{ margin: 0 }}>
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}><h3 style={{ letterSpacing: '.08em' }}>MONTH-ON-MONTH BOOKINGS</h3>
      <select value={by} onChange={e => setBy(e.target.value as any)}><option value="created">By booking date</option><option value="delivery">By delivery date</option></select></div>
    <p style={{ margin: '4px 0 8px' }}><b>{monLong(months[shown])}: {counts[shown]} booking{counts[shown] === 1 ? '' : 's'}</b>{shown === 12 && <span className="mut"> (month in progress)</span>}</p>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 300 }} role="img" aria-label="Bookings per month">
      {[0, 0.5, 1].map(t => <g key={t}><line x1={L} x2={W - 6} y1={y(top * t)} y2={y(top * t)} stroke="var(--line)" /><text x={L - 6} y={y(top * t) + 4} fontSize="11" textAnchor="end" fill="var(--mut)">{Math.round(top * t)}</text></g>)}
      {counts.map((c, i) => { const x = L + i * bw + 5, w = bw - 10, isCur = i === 12
        return <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} onClick={() => setHov(i)} style={{ cursor: 'pointer' }}>
          <rect x={x} y={y(c)} width={w} height={Math.max(0, H - 40 - y(c))} fill="var(--gold)" opacity={isCur ? 0.45 : 1} stroke={isCur ? 'var(--gold)' : 'none'} strokeDasharray={isCur ? '4 3' : undefined}><title>{`${monLong(months[i])}: ${c}${isCur ? ' (so far)' : ''}`}</title></rect>
          <text x={x + w / 2} y={y(c) - 4} fontSize="11" textAnchor="middle" fill="var(--ink)">{c || ''}</text>
          <text x={x + w / 2} y={H - 24} fontSize="11" textAnchor="middle" fill="var(--mut)">{mon(months[i])}</text>
          {(i === 0 || months[i].endsWith('-01')) && <text x={x + w / 2} y={H - 10} fontSize="10" textAnchor="middle" fill="var(--mut)">{months[i].slice(0, 4)}</text>}</g> })}
    </svg>
    <p style={{ margin: '8px 0 0' }}><b>{mon(months[12])} so far: {now}</b> vs {monLong(months[11])}: {prev} → <b className={diff >= 0 ? 'ok' : 'bad'}>{diff >= 0 ? '+' : ''}{diff}{prev ? ` (${diff >= 0 ? '+' : ''}${Math.round(100 * diff / prev)}%)` : ' (no bookings last month)'}</b></p>
    <p className="mut" style={{ fontSize: 12, margin: '4px 0 0' }}>Counting rule: cancelled bookings are excluded. The dashed bar is the current month, which is still in progress, so compare it with care. The 12 bars before it are completed months.</p>
  </div>)
}
export default function Dashboard({ ctx }: { ctx: any }) {
  const B: any[] = ctx.B, today = todayIST()
  const madeToday = B.filter(b => b.status !== 'cancelled' && istDate(b.created_at) === today).length
  const delToday = B.filter(b => b.start_date === today && ['confirmed', 'out', 'returned'].includes(b.status)).length
  const retToday = B.filter(b => b.end_date === today && ['out', 'returned'].includes(b.status)).length
  const odDel = B.filter(b => b.status === 'confirmed' && b.start_date < today).length, odRet = B.filter(b => b.status === 'out' && b.end_date < today).length
  const cards: [string, number, string, () => void, boolean?][] = [
    ["Today's Bookings", madeToday, 'made today', () => ctx.go('bookings', { flt: 'created_today' })],
    ["Today's Delivery", delToday, 'to hand over today', () => ctx.go('deliveries', { del: 'today-del' })],
    ["Today's Return", retToday, 'due back today', () => ctx.go('deliveries', { del: 'today-ret' })],
    ['Overdue Items', odDel + odRet, `${odDel} deliveries · ${odRet} returns`, () => ctx.go('deliveries', { del: 'overdue' }), odDel + odRet > 0]]
  return (<div style={{ display: 'grid', gap: 16 }}>
    <div className="adm-cards">{cards.map(([l, n, sub, fn, red]) => <button key={l} onClick={fn} className="stat-card" style={red ? { borderColor: 'var(--bad)' } : undefined}>
      <span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 34, fontFamily: 'Cormorant Garamond, serif', color: red ? 'var(--bad)' : undefined }}>{n}</b><span className="mut" style={{ fontSize: 12 }}>{sub}</span></button>)}</div>
    <PrepBoard ctx={ctx} compact />
    <div className="adm-two"><PendingDeliveries ctx={ctx} /><PendingReturns ctx={ctx} /></div>
    <Chart B={B} />
  </div>)
}
