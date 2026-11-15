'use client'
import { useMemo, useState } from 'react'
import { istDate } from '@/lib/util'

const DEL = '#5f7f68'   // deliveries
const COLORS = ['#8f123b', '#b66d85', '#748b70', '#9282a7', '#bf9661', '#5f8790', '#bf7d5c']
const monthStart = (s: string, offset: number) => {
  const d = new Date(`${s}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7)
}
const monthLabel = (s: string) => new Date(`${s}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const shortName = (s: string) => s.trim().split(/\s+/).slice(0, 2)

export default function BookingsByStaff({ bookings, staff, month, rows, delRows }: { bookings: any[]; staff: any[]; month: string; rows?: { month: string; taken_by: string; n: number }[] | null; delRows?: { month: string; delivered_by: string; n: number }[] | null }) {
  const [mode, setMode] = useState<'month' | 'trend'>('month')
  const activeStaff = useMemo(() => staff.filter(s => s.active && ['owner', 'manager'].includes(s.role)).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')), [staff])
  const colors = useMemo(() => Object.fromEntries(activeStaff.map((s, i) => [s.user_id, COLORS[i % COLORS.length]])), [activeStaff])
  const byMonth = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {}
    for (let i = -5; i <= 0; i++) counts[monthStart(month, i)] = Object.fromEntries(activeStaff.map(s => [s.user_id, 0]))
    const activeIds = new Set(activeStaff.map(s => s.user_id))
    // Counted by the database when available (the device only holds the last 90 days of bookings); otherwise from the loaded bookings.
    if (rows) { for (const r of rows) if (counts[r.month] && activeIds.has(r.taken_by)) counts[r.month][r.taken_by] += r.n }
    else for (const b of bookings) {
      const createdMonth = istDate(b.created_at).slice(0, 7)
      if (counts[createdMonth] && activeIds.has(b.taken_by)) counts[createdMonth][b.taken_by]++
    }
    return Object.entries(counts).map(([key, values]) => ({ key, label: monthLabel(key), values, total: Object.values(values).reduce((a, b) => a + b, 0) }))
  }, [bookings, activeStaff, month, rows])
  // Actual deliveries: dresses really handed over, in the month of the hand-over, by the staff member who recorded it.
  const delByMonth = useMemo(() => {
    const c: Record<string, Record<string, number>> = {}, ids = new Set(activeStaff.map(s => s.user_id))
    for (let i = -5; i <= 0; i++) c[monthStart(month, i)] = Object.fromEntries(activeStaff.map(s => [s.user_id, 0]))
    if (delRows) { for (const r of delRows) if (c[r.month] && ids.has(r.delivered_by)) c[r.month][r.delivered_by] += r.n }
    else for (const b of bookings) { if (!b.picked_up_at || !b.delivered_by) continue; const m = istDate(b.picked_up_at).slice(0, 7); if (c[m] && ids.has(b.delivered_by)) c[m][b.delivered_by]++ }
    return c
  }, [bookings, activeStaff, month, delRows])
  const thisMonth = useMemo(() => activeStaff.map(s => ({ staff: s, del: delByMonth[month]?.[s.user_id] || 0, count: rows ? rows.filter(r => r.month === month && r.taken_by === s.user_id).reduce((t, r) => t + r.n, 0) : bookings.filter(b => istDate(b.created_at).slice(0, 7) === month && b.taken_by === s.user_id).length })).sort((a, b) => b.count - a.count || (a.staff.name || '').localeCompare(b.staff.name || '')), [activeStaff, bookings, month, rows, delByMonth])
  const W = 640, H = 196, L = 40, R = 10, T = 16, B = 44, plotH = H - T - B, plotW = W - L - R
  const delTotal = (k: string) => Object.values(delByMonth[k] || {}).reduce((a, b) => a + b, 0)
  const maxCount = mode === 'month' ? Math.max(1, ...thisMonth.map(x => Math.max(x.count, x.del))) : Math.max(1, ...byMonth.map(x => Math.max(x.total, delTotal(x.key))))
  const step = Math.max(1, Math.ceil(maxCount / 4)), ymax = step * 4, y = (n: number) => T + plotH - n / ymax * plotH
  return <section className="box bstaff" aria-labelledby="bookings-by-staff-title">
    <header className="bstaff-head"><div><h2 id="bookings-by-staff-title">{mode === 'month' ? 'Bookings and Deliveries This Month' : 'Bookings and Deliveries by Month'}</h2><p>{mode === 'month' ? `Fresh bookings (by booking date) and actual deliveries (by hand-over date), ${monthLabel(month)}.` : `Fresh bookings (stacked by staff) and actual deliveries, six months ending ${monthLabel(month)}.`}</p></div><div className="bstaff-head-right"><div className="bstaff-toggle" role="tablist" aria-label="Staff booking chart view"><button role="tab" aria-selected={mode === 'month'} className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>This Month</button><button role="tab" aria-selected={mode === 'trend'} className={mode === 'trend' ? 'on' : ''} onClick={() => setMode('trend')}>Month on Month</button></div></div></header>
    <div className="bstaff-legend">{mode === 'trend' ? activeStaff.map(s => <span key={s.user_id}><i style={{ background: colors[s.user_id] }} />{s.name || 'Staff'} (bookings)</span>) : <span><i style={{ background: '#8f123b' }} />Fresh bookings</span>}<span><i style={{ background: DEL }} />Deliveries</span></div>
    <div className={mode === 'month' ? 'bstaff-current' : 'bstaff-trend'}><div className="bstaff-current-chart">{mode === 'month' && <div className="bstaff-chart-title">Bookings and deliveries by staff</div>}
    <div className="bstaff-chart-scroll"><svg className="bstaff-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={mode === 'month' ? `Fresh bookings by active staff in ${monthLabel(month)}` : `Monthly fresh bookings by active staff for the last six months`}>
      <text transform={`translate(14 ${T + plotH / 2}) rotate(-90)`} textAnchor="middle" className="bstaff-axis-title">Count</text>
      <defs><linearGradient id="staff-booking-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a51443" /><stop offset="100%" stopColor="#790b31" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(i => { const v = step * i; return <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="bstaff-gridline" /><text x={L - 10} y={y(v) + 4} textAnchor="end" className="bstaff-axis">{v}</text></g> })}
      {mode === 'month' ? (() => {
        const band = thisMonth.length ? plotW / thisMonth.length : plotW, bw = Math.min(46, band * .24), gap = 8
        return thisMonth.map(r => { const i = thisMonth.indexOf(r), cx = L + band * i + band / 2, nm = r.staff.name || 'Staff'
          const bar = (x: number, n: number, fill: string, what: string) => <g><rect x={x} y={n ? y(n) : y(0) - 2} width={bw} height={n ? plotH * n / ymax : 0} rx="5" fill={fill} className="bstaff-bar"><title>{`${nm}: ${n} ${what}`}</title></rect><text x={x + bw / 2} y={n ? y(n) - 7 : y(0) - 8} textAnchor="middle" className="bstaff-value">{n}</text></g>
          return <g key={r.staff.user_id}>{bar(cx - bw - gap / 2, r.count, 'url(#staff-booking-fill)', 'fresh bookings')}{bar(cx + gap / 2, r.del, DEL, 'deliveries')}{shortName(nm).map((part, j) => <text key={j} x={cx} y={H - 22 + j * 13} textAnchor="middle" className="bstaff-label">{part}</text>)}</g> })
      })() : (() => {
        const band = plotW / byMonth.length, bw = Math.min(28, band * .3), gap = 5
        return byMonth.map((m, i) => { const cx = L + band * i + band / 2, x = cx - bw - gap / 2, x2 = cx + gap / 2, dt = delTotal(m.key); let accumulated = 0
          return <g key={m.key}>{activeStaff.map(s => { const n = m.values[s.user_id] || 0, yTop = y(accumulated + n), yBottom = y(accumulated); accumulated += n; return n ? <g key={s.user_id}><rect x={x} y={yTop} width={bw} height={Math.max(0, yBottom - yTop)} fill={colors[s.user_id]}><title>{`${m.label} · ${s.name || 'Staff'}: ${n} fresh booking${n === 1 ? '' : 's'}`}</title></rect>{yBottom - yTop > 17 && <text x={x + bw / 2} y={(yTop + yBottom) / 2 + 4} textAnchor="middle" className="bstaff-stack-value">{n}</text>}</g> : null })}
            <text x={x + bw / 2} y={y(m.total) - 6} textAnchor="middle" className="bstaff-value">{m.total}</text>
            <rect x={x2} y={dt ? y(dt) : y(0) - 2} width={bw} height={dt ? plotH * dt / ymax : 0} fill={DEL}><title>{`${m.label}: ${dt} deliveries` + activeStaff.map(s => ` · ${s.name || 'Staff'} ${delByMonth[m.key]?.[s.user_id] || 0}`).join('')}</title></rect>
            <text x={x2 + bw / 2} y={dt ? y(dt) - 6 : y(0) - 8} textAnchor="middle" className="bstaff-value">{dt}</text>
            <text x={cx} y={H - 16} textAnchor="middle" className="bstaff-label">{m.label}</text></g> })
      })()}
    </svg></div>
    </div>
    {mode === 'month' && <aside className="bstaff-summary"><h3>Staff summary</h3>{thisMonth.map((r, i) => <div className="bstaff-summary-row" key={r.staff.user_id}><span className="bstaff-rank">{String(i + 1).padStart(2, '0')}</span><span className="bstaff-avatar">{(r.staff.name || 'S').trim().charAt(0).toUpperCase()}</span><span className="bstaff-summary-name"><b>{r.staff.name || 'Staff'}</b><small>Bookings · Deliveries</small></span><strong>{r.count}<em> · {r.del}</em></strong></div>)}</aside>}
    </div>
    <p className="bstaff-note">Bookings: booking creation date and the recorded staff member, all statuses. Deliveries: dresses actually handed over, in the month of hand-over, by the staff member who recorded it. Bookings assigned to inactive staff, or without a recorded staff member, are not included or reassigned.</p>
  </section>
}
