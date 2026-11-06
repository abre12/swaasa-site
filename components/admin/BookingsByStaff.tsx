'use client'
import { useMemo, useState } from 'react'
import { istDate } from '@/lib/util'

const COLORS = ['#8f123b', '#b66d85', '#748b70', '#9282a7', '#bf9661', '#5f8790', '#bf7d5c']
const monthStart = (s: string, offset: number) => {
  const d = new Date(`${s}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7)
}
const monthLabel = (s: string) => new Date(`${s}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const shortName = (s: string) => s.trim().split(/\s+/).slice(0, 2)

export default function BookingsByStaff({ bookings, staff, month }: { bookings: any[]; staff: any[]; month: string }) {
  const [mode, setMode] = useState<'month' | 'trend'>('month')
  const activeStaff = useMemo(() => staff.filter(s => s.active && ['owner', 'manager'].includes(s.role)).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')), [staff])
  const colors = useMemo(() => Object.fromEntries(activeStaff.map((s, i) => [s.user_id, COLORS[i % COLORS.length]])), [activeStaff])
  const byMonth = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {}
    for (let i = -5; i <= 0; i++) counts[monthStart(month, i)] = Object.fromEntries(activeStaff.map(s => [s.user_id, 0]))
    const activeIds = new Set(activeStaff.map(s => s.user_id))
    for (const b of bookings) {
      const createdMonth = istDate(b.created_at).slice(0, 7)
      if (counts[createdMonth] && activeIds.has(b.taken_by)) counts[createdMonth][b.taken_by]++
    }
    return Object.entries(counts).map(([key, values]) => ({ key, label: monthLabel(key), values, total: Object.values(values).reduce((a, b) => a + b, 0) }))
  }, [bookings, activeStaff, month])
  const thisMonth = useMemo(() => activeStaff.map(s => ({ staff: s, count: bookings.filter(b => istDate(b.created_at).slice(0, 7) === month && b.taken_by === s.user_id).length })).sort((a, b) => b.count - a.count || (a.staff.name || '').localeCompare(b.staff.name || '')), [activeStaff, bookings, month])
  const total = mode === 'month' ? thisMonth.reduce((n, r) => n + r.count, 0) : (byMonth[byMonth.length - 1]?.total || 0)
  const W = 840, H = 282, L = 48, R = 14, T = 18, B = 48, plotH = H - T - B, plotW = W - L - R
  const maxCount = mode === 'month' ? Math.max(1, ...thisMonth.map(x => x.count)) : Math.max(1, ...byMonth.map(x => x.total))
  const step = Math.max(1, Math.ceil(maxCount / 4)), ymax = step * 4, y = (n: number) => T + plotH - n / ymax * plotH
  const countRows = mode === 'month' ? thisMonth : byMonth

  return <section className="box bstaff" aria-labelledby="bookings-by-staff-title">
    <header className="bstaff-head"><div><h2 id="bookings-by-staff-title">Bookings by Staff</h2><p>{mode === 'month' ? `Fresh bookings counted by booking creation date for ${monthLabel(month)}.` : `Monthly fresh bookings for the six months ending ${monthLabel(month)}.`}</p></div><div className="bstaff-head-right"><span>{total} fresh booking{total === 1 ? '' : 's'} <i>·</i> {activeStaff.length} active staff</span><div className="bstaff-toggle" role="tablist" aria-label="Staff booking chart view"><button role="tab" aria-selected={mode === 'month'} className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>This Month</button><button role="tab" aria-selected={mode === 'trend'} className={mode === 'trend' ? 'on' : ''} onClick={() => setMode('trend')}>Month on Month</button></div></div></header>
    {mode === 'trend' && <div className="bstaff-legend">{activeStaff.map(s => <span key={s.user_id}><i style={{ background: colors[s.user_id] }} />{s.name || 'Staff'}</span>)}</div>}
    <div className="bstaff-chart-scroll"><svg className="bstaff-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={mode === 'month' ? `Fresh bookings by active staff in ${monthLabel(month)}` : `Monthly fresh bookings by active staff for the last six months`}>
      {[0, 1, 2, 3, 4].map(i => { const v = step * i; return <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="bstaff-gridline" /><text x={L - 10} y={y(v) + 4} textAnchor="end" className="bstaff-axis">{v}</text></g> })}
      {mode === 'month' ? (() => {
        const band = thisMonth.length ? plotW / thisMonth.length : plotW, bw = Math.min(92, band * .52)
        return thisMonth.map((r, i) => { const x = L + band * i + (band - bw) / 2, bh = r.count ? plotH * r.count / ymax : 0; return <g key={r.staff.user_id}><rect x={x} y={r.count ? y(r.count) : y(0) - 2} width={bw} height={Math.max(0, bh)} rx="5" fill="#8f123b" className="bstaff-bar"><title>{`${r.staff.name || 'Staff'}: ${r.count} fresh bookings`}</title></rect><text x={x + bw / 2} y={r.count ? y(r.count) - 9 : y(0) - 10} textAnchor="middle" className="bstaff-value">{r.count}</text>{shortName(r.staff.name || 'Staff').map((part, j) => <text key={j} x={x + bw / 2} y={H - 23 + j * 14} textAnchor="middle" className="bstaff-label">{part}</text>)}</g> })
      })() : (() => {
        const band = plotW / byMonth.length, bw = Math.min(72, band * .56)
        return byMonth.map((m, i) => { const x = L + band * i + (band - bw) / 2; let accumulated = 0; return <g key={m.key}>{activeStaff.map(s => { const n = m.values[s.user_id] || 0, yTop = y(accumulated + n), yBottom = y(accumulated); accumulated += n; return n ? <g key={s.user_id}><rect x={x} y={yTop} width={bw} height={Math.max(0, yBottom - yTop)} fill={colors[s.user_id]}><title>{`${m.label} · ${s.name || 'Staff'}: ${n} fresh booking${n === 1 ? '' : 's'}`}</title></rect>{yBottom - yTop > 19 && <text x={x + bw / 2} y={(yTop + yBottom) / 2 + 4} textAnchor="middle" className="bstaff-stack-value">{n}</text>}</g> : null })}<text x={x + bw / 2} y={y(m.total) - 8} textAnchor="middle" className="bstaff-value">{m.total}</text><text x={x + bw / 2} y={H - 19} textAnchor="middle" className="bstaff-label">{m.label}</text></g> })
      })()}
    </svg></div>
    <p className="bstaff-note">Counts use booking creation date and the recorded staff member. All booking statuses are included; delivery and return dates do not affect the period. Bookings assigned to inactive staff, or without a recorded staff member, are not included or reassigned.</p>
  </section>
}
