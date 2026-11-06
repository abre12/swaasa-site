'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dmy, inr, todayIST } from '@/lib/util'

const fmt = (d: Date) => d.toISOString().slice(0, 10)
const move = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return fmt(d) }
const monthName = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
const base = (r: any) => r.acquired_on || r.added_on
const age = (s: string) => { if (!s) return 'Unknown'; const n = new Date(`${todayIST()}T00:00:00Z`), d = new Date(`${s}T00:00:00Z`); const days = Math.max(0, Math.floor((+n - +d) / 864e5)); return days < 30 ? `${days} days` : `${Math.floor(days / 30)} months` }
const csvCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
const ranges: Record<string, (today: string) => [string, string]> = {
  month: t => [`${t.slice(0, 7)}-01`, t], quarter: t => { const d = new Date(`${t}T00:00:00Z`), m = Math.floor(d.getUTCMonth() / 3) * 3; return [fmt(new Date(Date.UTC(d.getUTCFullYear(), m, 1))), t] },
  year: t => [`${t.slice(0, 4)}-01-01`, t], all: () => ['', '']
}
const SORTS: Record<string, [string, (a: any, b: any) => number]> = {
  net: ['Highest net revenue', (a, b) => b.net_rent - a.net_rent], rentals: ['Most rentals', (a, b) => b.completed - a.completed],
  utilization: ['Highest utilization', (a, b) => b.util - a.util], clean: ['Highest cleaning cost', (a, b) => b.wash_cost - a.wash_cost],
  newest: ['Newest added', (a, b) => String(base(b)).localeCompare(String(base(a)))], oldest: ['Oldest added', (a, b) => String(base(a)).localeCompare(String(base(b)))]
}

export default function Performance({ ctx }: { ctx: any }) {
  const today = todayIST()
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`), [to, setTo] = useState(today), [preset, setPreset] = useState('month')
  const [sort, setSort] = useState('net'), [q, setQ] = useState(''), [category, setCategory] = useState(''), [status, setStatus] = useState(''), [ranking, setRanking] = useState('net'), [chartMode, setChartMode] = useState('monthly')
  const [rows, setRows] = useState<any[]>([]), [err, setErr] = useState(''), [selected, setSelected] = useState<any>(null)
  const load = useCallback(async () => {
    const { data, error } = await ctx.sb.rpc('dress_performance', { p_from: from || null, p_to: to || null })
    if (error) setErr(error.message.includes('FORBIDDEN') ? 'Only the owner can view this page.' : 'Could not load dress performance.')
    else { setErr(''); setRows(data || []) }
  }, [from, to, ctx.sb])
  useEffect(() => { load() }, [load, ctx.tick])

  const datedRows = useMemo(() => rows.map(r => {
    const start = from || base(r) || today, selectedEnd = to || today, end = selectedEnd > today ? today : selectedEnd
    const eligibleStart = start < (base(r) || start) ? (base(r) || start) : start
    const eligibleDays = eligibleStart > end ? 0 : Math.floor((+new Date(`${end}T00:00:00Z`) - +new Date(`${eligibleStart}T00:00:00Z`)) / 864e5) + 1
    const util = eligibleDays ? Math.min(100, Math.round(100 * (r.rental_days || 0) / eligibleDays)) : 0
    const relative = r.completed === 0 ? 'No Activity' : (r.net_rent >= (rows.reduce((s, x) => s + x.net_rent, 0) / Math.max(1, rows.length)) * 1.2 && r.completed >= 2 ? 'High Performer' : r.net_rent >= (rows.reduce((s, x) => s + x.net_rent, 0) / Math.max(1, rows.length)) * .65 ? 'Good Performer' : util < 8 && eligibleDays > 90 ? 'Needs Attention' : 'Good Performer')
    return { ...r, util, eligibleDays, performance: relative }
  }), [rows, from, to, today])
  const list = useMemo(() => datedRows.filter(r => (!q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase())) && (!category || r.category === category) && (!status || r.status === status)).sort(SORTS[sort][1]), [datedRows, q, category, status, sort])
  const sum = (key: string) => list.reduce((s, r) => s + (Number(r[key]) || 0), 0)
  const cats = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows])
  const top = useMemo(() => [...list].sort((a, b) => ranking === 'rentals' ? b.completed - a.completed : ranking === 'utilization' ? b.util - a.util : b.net_rent - a.net_rent).filter(r => r.completed > 0).slice(0, 5), [list, ranking])
  const chart = useMemo(() => {
    let start = from || `${today.slice(0, 4)}-01-01`, finish = (to || today) > today ? today : to || today
    if (chartMode === 'daily' && move(start, 30) < finish) start = move(finish, -29)
    if (chartMode === 'weekly' && move(start, 84) < finish) start = move(finish, -83)
    if (chartMode === 'monthly' && `${start.slice(0, 7)}-01` < `${finish.slice(0, 4)}-01-01`) { const d = new Date(`${finish}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 11); start = `${fmt(d).slice(0, 7)}-01` }
    const ids = new Set(list.map(r => r.dress_id)), buckets = new Map<string, { label: string; revenue: number }>()
    if (chartMode === 'daily') { for (let d = start; d <= finish; d = move(d, 1)) buckets.set(d, { label: new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }), revenue: 0 }) }
    else if (chartMode === 'weekly') { for (let d = start; d <= finish; d = move(d, 7)) buckets.set(d, { label: `${new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })} wk`, revenue: 0 }) }
    else { let d = `${start.slice(0, 7)}-01`, last = `${finish.slice(0, 7)}-01`; while (d <= last && buckets.size < 12) { buckets.set(d, { label: monthName(d), revenue: 0 }); const next = new Date(`${d}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); d = `${fmt(next).slice(0, 7)}-01` } }
    for (const b of (ctx.B || [])) {
      if (!ids.has(b.dress_id) || b.status !== 'returned' || b.start_date < start || b.start_date > finish) continue
      let key = b.start_date
      if (chartMode === 'weekly') key = move(start, Math.floor((+new Date(`${b.start_date}T00:00:00Z`) - +new Date(`${start}T00:00:00Z`)) / 864e5 / 7) * 7)
      if (chartMode === 'monthly') key = `${b.start_date.slice(0, 7)}-01`
      const bucket = buckets.get(key); if (bucket) bucket.revenue += Math.max(0, (b.rent || 0) - (b.rent_refunded || 0))
    }
    return [...buckets.values()]
  }, [from, to, today, list, ctx.B, chartMode])
  const maxChart = Math.max(1, ...chart.map(x => x.revenue))
  const inventory = useMemo(() => ['available', 'maintenance', 'unavailable', 'retired'].map(s => ({ status: s, count: rows.filter(r => r.status === s).length })), [rows])

  function setRange(v: string) { setPreset(v); if (v === 'custom') return; const [a, b] = ranges[v](today); setFrom(a); setTo(b) }
  function exportCsv() {
    const headers = ['Dress code', 'Dress name', 'Category', 'Status', 'Rentals', 'Rental days', 'Gross revenue', 'Discounts', 'Net rental revenue', 'Average per rental', 'Late fees', 'Damage charges', 'Other charges', 'Dry cleaning cost', 'Net after dry cleaning', 'Utilization estimate %', 'Performance']
    const content = [headers, ...list.map(r => [r.code, r.name, r.category, r.status, r.completed, r.rental_days, r.gross, r.discounts, r.net_rent, r.avg_net, r.late_fees, r.damage_charges, r.other_charges, r.wash_cost, r.net_rent - r.wash_cost, r.util, r.performance])].map(row => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = `swaasa-dress-performance-${from || 'all'}-${to || 'today'}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <div className="dp-page">
    <header className="dp-head"><div><h1>Dress Performance</h1><p>Track rental performance, revenue and inventory utilization.</p></div><div className="dp-actions"><select value={preset} onChange={e => setRange(e.target.value)} aria-label="Date range preset"><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option><option value="all">All time</option><option value="custom">Custom range</option></select><label className="dp-date">From<input type="date" value={from} onChange={e => { setPreset('custom'); setFrom(e.target.value) }} /></label><label className="dp-date">To<input type="date" value={to} onChange={e => { setPreset('custom'); setTo(e.target.value) }} /></label><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter category"><option value="">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}</select><select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter inventory status"><option value="">All status</option>{inventory.map(x => <option value={x.status} key={x.status}>{x.status}</option>)}</select><button className="btn alt sm" onClick={exportCsv}>↓ Export CSV</button></div></header>
    {err && <p className="bad">{err}</p>}
    <div className="dp-cards">{[["Net rental revenue", inr(sum('net_rent')), 'Completed rentals after discounts and refunds'], ['Net after dry cleaning', inr(sum('net_rent') - sum('wash_cost')), 'Net rental revenue less recorded cleaning charges'], ['Completed rentals', String(sum('completed')), 'Returned bookings in selected period'], ['Average utilization', `${list.length ? Math.round(list.reduce((s, r) => s + r.util, 0) / list.length) : 0}%`, 'Estimate from recorded inventory days'], ['Dresses in inventory', String(rows.length), 'Excludes archived dresses'], ['Rental days', String(sum('rental_days')), 'Days from completed rentals']].map(([label, value, note]) => <article className="dp-card" key={label}><span>{label}</span><b>{value}</b><small>{note}</small></article>)}</div>
    <div className="dp-grid">
      <section className="box dp-panel"><div className="dp-panel-head"><h3>Top performing dresses</h3><select value={ranking} onChange={e => setRanking(e.target.value)} aria-label="Rank dresses by"><option value="net">By net revenue</option><option value="rentals">By rental count</option><option value="utilization">By utilization</option></select></div>{top.map((r, i) => <button className="dp-top" key={r.dress_id} onClick={() => setSelected(r)}><b className="dp-rank">{i + 1}</b>{ctx.thumb(ctx.dmap[r.dress_id] || { images: r.image ? [r.image] : [] }, 40, 54)}<span><b>{r.code} · {r.name}</b><small>{r.completed} rentals · {r.rental_days} days</small></span><strong>{ranking === 'rentals' ? `${r.completed} rentals` : ranking === 'utilization' ? `${r.util}%` : inr(r.net_rent)}</strong></button>)}{!top.length && <div className="dp-empty">No completed rentals in this selection.</div>}</section>
      <section className="box dp-panel"><div className="dp-panel-head"><h3>Rental revenue trend</h3><div className="dp-chart-modes">{['daily','weekly','monthly'].map(m => <button key={m} className={chartMode === m ? 'on' : ''} onClick={() => setChartMode(m)}>{m}</button>)}</div></div><div className="dp-chart" role="img" aria-label={`${chartMode} rental revenue trend`}>{chart.map((p, i) => <div className="dp-bar-wrap" key={i} title={`${p.label}: ${inr(p.revenue)}`}><span>{p.revenue ? inr(p.revenue) : ''}</span><i style={{ height: `${Math.max(3, p.revenue / maxChart * 100)}%` }} /><small>{p.label}</small></div>)}{!chart.length && <div className="dp-empty">No revenue in this period.</div>}</div></section>
      <section className="box dp-panel"><div className="dp-panel-head"><h3>Inventory health</h3><span className="mut">Current status</span></div>{inventory.map((x, i) => <div className="dp-health" key={x.status}><i className={`dot c${i}`} /><span>{x.status}</span><b>{x.count}</b><small>{rows.length ? Math.round(x.count * 100 / rows.length) : 0}%</small></div>)}<p className="dp-note">Historical availability and maintenance dates are not stored, so utilization is an estimate using recorded inventory age and completed rental days.</p></section>
    </div>
    <section className="box dp-table-panel"><div className="dp-table-head"><div><h3>Dress performance</h3><span>{list.length} dresses</span></div><input placeholder="Search by dress code or name" value={q} onChange={e => setQ(e.target.value)} /><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort results">{Object.entries(SORTS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="scroll"><table className="dp-table"><thead><tr><th>Dress</th><th>Category</th><th>Status</th><th>Rentals</th><th>Rental days</th><th>Gross revenue</th><th>Discounts</th><th>Net revenue</th><th>Cleaning cost</th><th>Net after cleaning</th><th>Utilization*</th><th>Performance</th></tr></thead><tbody>{list.map(r => <tr key={r.dress_id} onClick={() => setSelected(r)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSelected(r) }}><td><div className="dp-dress">{ctx.thumb(ctx.dmap[r.dress_id] || { images: r.image ? [r.image] : [] }, 38, 50)}<span><b>{r.code}</b><small>{r.name}</small></span></div></td><td>{r.category}</td><td>{r.status}</td><td>{r.completed}</td><td>{r.rental_days}</td><td>{inr(r.gross)}</td><td>{inr(r.discounts)}</td><td><b>{inr(r.net_rent)}</b></td><td>{inr(r.wash_cost)}</td><td><b>{inr(r.net_rent - r.wash_cost)}</b></td><td>{r.util}%</td><td><span className={`dp-badge ${r.performance.toLowerCase().replaceAll(' ', '-')}`}>{r.performance}</span></td></tr>)}{!list.length && <tr><td colSpan={12}><div className="dp-empty">No dresses match these filters. Adjust or clear the filters above.</div></td></tr>}</tbody></table></div><p className="dp-foot">*Estimated utilization = completed rental days ÷ recorded days in inventory. Revenue includes completed rentals only; cash received, deposits and unpaid balances are excluded.</p></section>
    {selected && <History ctx={ctx} h={{ r: selected }} close={() => setSelected(null)} />}
  </div>
}

function History({ ctx, h, close }: { ctx: any; h: any; close: () => void }) {
  const [f, setF] = useState({ from: '', to: '', status: '' }); const [rows, setRows] = useState<any[]>([]); const [washes, setWashes] = useState<any[]>([]); const [err, setErr] = useState('')
  useEffect(() => { ctx.sb.rpc('dress_history', { p_dress: h.r.dress_id, p_from: f.from || null, p_to: f.to || null, p_status: f.status || null }).then(({ data, error }: any) => { if (error) setErr('Could not load the rental history.'); else { setErr(''); setRows(data || []) } }); ctx.sb.rpc('dress_washes', { p_dress: h.r.dress_id, p_from: f.from || null, p_to: f.to || null }).then(({ data }: any) => setWashes(data || [])) }, [f, h.r.dress_id, ctx.sb])
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [close])
  return <div className="dp-back" onClick={close}><aside className="dp-drawer" role="dialog" aria-modal="true" aria-label={`${h.r.code} dress details`} onClick={e => e.stopPropagation()}><header className="dp-drawer-head"><div><h2>{h.r.code} · {h.r.name}</h2><span>{h.r.category} · {h.r.status}</span></div><button className="btn alt sm" onClick={close} aria-label="Close dress details">Close</button></header><div className="dp-drawer-body"><div className="dp-drawer-intro">{ctx.thumb(ctx.dmap[h.r.dress_id] || { images: h.r.image ? [h.r.image] : [] }, 84, 112)}<div><b>{inr(h.r.net_rent)} net rental revenue</b><p>{h.r.completed} completed rentals · {h.r.rental_days} rental days</p><p>Added {dmy(base(h.r))}{h.r.acquired_on ? '' : ' (system date; acquisition date not recorded)'}</p></div></div><h3>Rental history</h3><div className="dp-drawer-filters"><input type="date" aria-label="Bookings from" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /><input type="date" aria-label="Bookings to" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /><select aria-label="Booking status" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="">All statuses</option>{['pending', 'confirmed', 'out', 'returned', 'cancelled'].map(s => <option key={s}>{s}</option>)}</select></div>{err && <p className="bad">{err}</p>}<div className="scroll"><table><thead><tr><th>Booking</th><th>Customer</th><th>Delivery</th><th>Return</th><th>Status</th><th>Net charge</th><th>Received</th><th>Balance</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.id}</td><td>{r.customer_name}</td><td>{dmy(r.start_date)}</td><td>{dmy(r.end_date)}</td><td>{r.status}</td><td>{inr(r.net_rent)}</td><td>{inr(r.paid)}</td><td>{r.status === 'cancelled' ? '–' : inr(r.outstanding)}</td></tr>)}{!rows.length && <tr><td colSpan={8} className="mut">No bookings for these filters.</td></tr>}</tbody></table></div><h3>Dry cleaning</h3><div className="scroll"><table><thead><tr><th>Sent</th><th>Expected back</th><th>Returned</th><th>Charge</th><th>Notes</th></tr></thead><tbody>{washes.map(w => <tr key={w.id}><td>{dmy(w.sent_on)}</td><td>{dmy(w.expected_back)}</td><td>{w.returned_on ? dmy(w.returned_on) : 'Away'}</td><td>{inr(w.charge)}</td><td>{w.notes || '–'}</td></tr>)}{!washes.length && <tr><td colSpan={5} className="mut">No cleaning records.</td></tr>}</tbody></table></div></div></aside></div>
}
