'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHead from './PageHead'
import { addD, dbMsg, dmy, inr, todayIST } from '@/lib/util'

// Owner insights: IN-2 scorecard, N-15 leakage, N-12 stock (cost, payback, dead stock), N-13 missed enquiries, N-10 day closes. All numbers are worked out in the database.
type Tab = 'score' | 'leak' | 'stock' | 'lost' | 'close'
export const LOST_REASONS: Record<string, string> = { dates_taken: 'Dates not free', not_in_stock: 'Not in stock', price: 'Price', size_or_style: 'Size or style', other: 'Other' }

const pct = (a: number, b: number) => b > 0 ? Math.round(a * 100 / b) + '%' : '–'
function Card({ t, v, sub, tone }: { t: string; v: React.ReactNode; sub?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const c = tone === 'ok' ? '#2f7d4f' : tone === 'warn' ? '#c58a2b' : tone === 'bad' ? '#b3261e' : undefined
  return <div className="box" style={{ flex: '1 1 150px', minWidth: 140, padding: '10px 14px' }}><div className="mut" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 24, fontWeight: 700, color: c }}>{v}</div>{sub && <div className="mut" style={{ fontSize: 12 }}>{sub}</div>}</div>
}
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => <section style={{ margin: '14px 0' }}><h3 style={{ margin: '0 0 6px' }}>{title}</h3><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div></section>

function Scorecard({ ctx }: { ctx: any }) {
  const today = todayIST(), first = today.slice(0, 7) + '-01'
  const lastEnd = addD(first, -1), lastStart = lastEnd.slice(0, 7) + '-01', threeStart = (() => { const d = new Date(first + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 2); return d.toISOString().slice(0, 10) })()
  const presets: [string, string, string][] = [['This month', first, today], ['Last month', lastStart, lastEnd], ['Last 3 months', threeStart, today]]
  const [pi, setPi] = useState(0), [s, setS] = useState<any>(null), [err, setErr] = useState('')
  useEffect(() => {
    let live = true; setS(null); setErr('')
    ctx.sb.rpc('scorecard', { p_from: presets[pi][1], p_to: presets[pi][2] }).then((r: any) => { if (!live) return; if (r.error) setErr(dbMsg(r.error.message)); else setS(r.data) })
    return () => { live = false }
  }, [pi, ctx.sb, ctx.fullTick])   // eslint-disable-line react-hooks/exhaustive-deps
  const d = s?.deliveries, r = s?.returns, t = s?.tailor, c = s?.cleaner, ds = s?.discounts, m = s?.money, rc = s?.recovered, cs = s?.cash
  return <div>
    <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>{presets.map((p, i) => <button key={p[0]} type="button" className={'btn sm ' + (pi === i ? '' : 'alt')} onClick={() => setPi(i)}>{p[0]}</button>)}</div>
    {err && <p className="mut">{err}</p>}{!s && !err && <p className="mut">Working it out…</p>}
    {s && <>
      <Group title="Deliveries and returns">
        <Card t="Delivered on time" v={pct(d.on_time, d.total)} sub={`${d.on_time} of ${d.total} · ${d.late} late · ${d.missed} missed`} tone={d.total && d.on_time / d.total >= 0.95 ? 'ok' : 'warn'} />
        <Card t="Returned on time" v={pct(r.on_time, r.total)} sub={`${r.on_time} of ${r.total} · ${r.late} late${r.late ? ` (avg ${r.avg_days_late} days)` : ''}${r.overdue_now ? ` · ${r.overdue_now} overdue now` : ''}`} tone={r.overdue_now ? 'bad' : r.total && r.on_time / r.total >= 0.9 ? 'ok' : 'warn'} /></Group>
      <Group title="Tailor and dry cleaner: promised against actual">
        <Card t="Tailor" v={t.jobs ? `${t.avg_actual_days} days` : '–'} sub={t.jobs ? `promised ${t.avg_promised_days} · ${t.late} of ${t.jobs} late` : 'no finished jobs'} tone={t.jobs && t.late ? 'warn' : undefined} />
        <Card t="Dry cleaner" v={c.jobs ? `${c.avg_actual_days} days` : '–'} sub={c.jobs ? `promised ${c.avg_promised_days} · ${c.late} of ${c.jobs} late` : 'no finished jobs'} tone={c.jobs && c.late ? 'warn' : undefined} /></Group>
      <Group title="Money given away or kept">
        <Card t="Discounts given" v={inr(ds.total)} sub={`${ds.bookings_with_discount} of ${ds.bookings} bookings`} />
        <Card t="Rent refunded" v={inr(m.rent_refunds)} sub={`${m.rent_refund_count} refund${m.rent_refund_count === 1 ? '' : 's'}`} />
        <Card t="Deposits kept" v={inr(m.deposits_kept)} sub="used for dues at return" /><Card t="Deposits returned" v={inr(m.deposits_returned)} />
        <Card t="Late fees recovered" v={inr(rc.late_fees)} /><Card t="Damage recovered" v={inr(rc.damage)} /></Group>
      {ds.by_staff?.length > 0 && <section className="box" style={{ padding: '8px 12px' }}><b>Discounts by person</b>
        <div className="scroll"><table><thead><tr><th>Person</th><th>Bookings</th><th>With a discount</th><th>Total given</th></tr></thead><tbody>{ds.by_staff.map((x: any) => <tr key={x.name}><td>{x.name}</td><td>{x.bookings}</td><td>{x.with_discount} ({pct(x.with_discount, x.bookings)})</td><td>{inr(x.total)}</td></tr>)}</tbody></table></div></section>}
      <Group title="Cash counter"><Card t="Days tallied" v={cs.days_tallied} /><Card t="Days with a difference" v={cs.discrepancy_days} tone={cs.discrepancy_days ? 'bad' : 'ok'} /><Card t="Net difference" v={inr(cs.net_difference)} tone={cs.net_difference ? 'bad' : 'ok'} /></Group>
      {cs.days?.length > 0 && <section className="box" style={{ padding: '8px 12px' }}><b>Days with a cash difference</b><div className="scroll"><table><thead><tr><th>Day</th><th>Expected</th><th>Counted</th><th>Difference</th></tr></thead><tbody>{cs.days.map((x: any) => <tr key={x.day}><td>{dmy(x.day)}</td><td>{inr(x.expected)}</td><td>{inr(x.counted)}</td><td style={{ color: '#b3261e' }}>{inr(x.difference)}</td></tr>)}</tbody></table></div></section>}
      <p className="mut" style={{ fontSize: 12.5 }}>Swaps are not shown because dress swaps are not recorded in the system yet.</p>
    </>}
  </div>
}

function Leakage({ ctx }: { ctx: any }) {
  const [rows, setRows] = useState<any[] | null>(null), [err, setErr] = useState('')
  useEffect(() => { let live = true; ctx.sb.rpc('leakage_by_month', { p_months: 6 }).then((r: any) => { if (!live) return; if (r.error) setErr(dbMsg(r.error.message)); else setRows(r.data || []) }); return () => { live = false } }, [ctx.sb, ctx.fullTick])
  const cols: [string, string, string][] = [['discounts', 'Discounts', 'money'], ['rent_refunds', 'Rent refunded', 'money'], ['deposits_kept', 'Deposits kept', 'money'], ['late_fees', 'Late fees', 'money'], ['damage_recovered', 'Damage recovered', 'money'], ['late_returns', 'Late returns', 'count'], ['cash_difference', 'Cash difference', 'money']]
  const max = (k: string) => Math.max(1, ...(rows || []).map(r => Math.abs(r[k] || 0)))
  return <div><p className="mut" style={{ margin: '8px 0' }}>The same measures month by month, so a slow leak shows as a trend. Discounts and refunds going up, or cash differences that keep appearing, are the things to ask about.</p>
    {err && <p className="mut">{err}</p>}{!rows && !err && <p className="mut">Working it out…</p>}
    {rows && <div className="scroll"><table><thead><tr><th>Month</th>{cols.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>
      {rows.map(r => <tr key={r.month}><td><b>{r.month}</b></td>{cols.map(([k, , kind]) => { const v = r[k] || 0, bad = (k === 'cash_difference' && v !== 0) || (['discounts', 'rent_refunds'].includes(k) && v === max(k) && v > 0)
        return <td key={k} style={{ color: bad ? '#b3261e' : undefined, fontWeight: bad ? 700 : undefined }}>{kind === 'money' ? inr(v) : v}</td> })}</tr>)}</tbody></table></div>}</div>
}

function Stock({ ctx }: { ctx: any }) {
  const [rows, setRows] = useState<any[] | null>(null), [err, setErr] = useState(''), [only, setOnly] = useState<'all' | 'dead' | 'nocost'>('all'), [sort, setSort] = useState<'code' | 'payback' | 'util'>('code')
  const load = useCallback(async () => { const r = await ctx.sb.rpc('stock_performance'); if (r.error) setErr(dbMsg(r.error.message)); else setRows(r.data || []) }, [ctx.sb])
  useEffect(() => { load() }, [load])
  const setCost = async (x: any) => {
    const v = await ctx.ask(`Purchase cost: ${x.code} · ${x.name}`, [{ name: 'cost', label: 'What the dress cost (₹)', type: 'number', value: x.purchase_cost ?? '', required: true }, { name: 'on', label: 'Bought on (optional)', type: 'date', value: '' }], { ok: 'Save' })
    if (!v) return
    const { error } = await ctx.sb.rpc('set_dress_cost', { p_dress: x.dress_id, p_cost: Math.round(+v.cost), p_date: v.on || null })
    ctx.say(error ? dbMsg(error.message) : 'Saved'); if (!error) load()
  }
  const shown = useMemo(() => (rows || []).filter(x => only === 'dead' ? x.dead_stock : only === 'nocost' ? x.purchase_cost == null : true).sort((a, b) => sort === 'payback' ? (b.payback_pct ?? -1) - (a.payback_pct ?? -1) : sort === 'util' ? b.utilisation_pct - a.utilisation_pct : a.code.localeCompare(b.code)), [rows, only, sort])
  const invested = (rows || []).reduce((t, x) => t + (x.purchase_cost || 0), 0), earnedOnCosted = (rows || []).filter(x => x.purchase_cost != null).reduce((t, x) => t + x.earned, 0)
  return <div>
    {err && <p className="mut">{err}</p>}{!rows && !err && <p className="mut">Working it out…</p>}
    {rows && <>
      <Group title="Stock"><Card t="Invested (dresses with a cost)" v={inr(invested)} sub={`${rows.filter(x => x.purchase_cost != null).length} of ${rows.length} dresses`} />
        <Card t="Earned back so far" v={inr(earnedOnCosted)} sub={invested ? `${Math.round(earnedOnCosted * 100 / invested)}% of what was invested` : 'enter costs to see this'} tone={invested && earnedOnCosted >= invested ? 'ok' : undefined} />
        <Card t="Dead stock" v={rows.filter(x => x.dead_stock).length} sub="no rental in 90 days" tone={rows.some(x => x.dead_stock) ? 'warn' : 'ok'} />
        <Card t="Average use, last year" v={pct(rows.reduce((t, x) => t + x.utilisation_pct, 0), rows.length * 100)} sub="days out ÷ days listed" /></Group>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        {(['all', 'dead', 'nocost'] as const).map(k => <button key={k} type="button" className={'btn sm ' + (only === k ? '' : 'alt')} onClick={() => setOnly(k)}>{k === 'all' ? 'All dresses' : k === 'dead' ? 'Dead stock' : 'No cost entered'}</button>)}
        <span style={{ flex: 1 }} /><label className="mut" style={{ margin: 0, fontSize: 13 }}>Sort <select value={sort} onChange={e => setSort(e.target.value as any)}><option value="code">Code</option><option value="payback">Payback</option><option value="util">Use</option></select></label></div>
      <div className="scroll"><table><thead><tr><th>Dress</th><th>Cost</th><th>Earned</th><th>Payback</th><th>Use (365 days)</th><th>Rentals</th><th>Last rented</th><th></th></tr></thead><tbody>
        {shown.map(x => <tr key={x.dress_id}><td><b>{x.code}</b> {x.name}{x.dead_stock && <span className="ac-event" style={{ marginLeft: 6, background: '#fbf0d9', color: '#8a6414' }}>Dead stock</span>}</td>
          <td>{x.purchase_cost != null ? inr(x.purchase_cost) : <span className="mut">–</span>}</td><td>{inr(x.earned)}</td>
          <td style={{ color: x.payback_pct != null && x.payback_pct >= 100 ? '#2f7d4f' : undefined }}>{x.payback_pct != null ? x.payback_pct + '%' : '–'}</td>
          <td>{x.utilisation_pct}% <small className="mut">({x.rented_days}/{x.available_days} days)</small></td><td>{x.rentals}</td><td>{x.last_rented ? dmy(x.last_rented) : <span className="mut">never</span>}</td>
          <td><button type="button" className="btn alt sm" onClick={() => setCost(x)}>{x.purchase_cost != null ? 'Edit cost' : 'Add cost'}</button></td></tr>)}
        {!shown.length && <tr><td colSpan={8} className="mut">Nothing to show.</td></tr>}</tbody></table></div>
      <p className="mut" style={{ fontSize: 12.5 }}>Earned = rent after discounts and rental refunds, less what dry cleaning cost. Payback = earned ÷ cost. Use counts only days a dress was actually out. The cost is private to the owner.</p></>}
  </div>
}

function Lost({ ctx }: { ctx: any }) {
  const [rows, setRows] = useState<any[] | null>(null), [err, setErr] = useState('')
  const load = useCallback(async () => { const r = await ctx.sb.from('lost_demand').select('*').gte('logged_at', new Date(Date.now() - 90 * 864e5).toISOString()).order('logged_at', { ascending: false }).limit(500); if (r.error) setErr(dbMsg(r.error.message)); else setRows(r.data || []) }, [ctx.sb])
  useEffect(() => { load() }, [load, ctx.fullTick])
  const byReason = useMemo(() => { const m: Record<string, number> = {}; for (const r of rows || []) m[r.reason] = (m[r.reason] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]) }, [rows])
  const wanted = useMemo(() => { const m: Record<string, { label: string; n: number }> = {}; for (const r of rows || []) { const d = r.dress_id ? ctx.dmap?.[r.dress_id] : null; const k = d ? d.id : 'c:' + (r.category || 'Not stated'); (m[k] ||= { label: d ? `${d.code} · ${d.name}` : `Any ${r.category || 'dress (kind not stated)'}`, n: 0 }).n++ } return Object.values(m).sort((a, b) => b.n - a.n).slice(0, 10) }, [rows, ctx.dmap])
  return <div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}><p className="mut" style={{ margin: 0, flex: 1 }}>Customers who wanted a dress and went away without booking, last 90 days. Staff add them with &ldquo;Log a missed enquiry&rdquo;.</p>
      <button type="button" className="btn sm" onClick={async () => { if (await ctx.logLostDemand()) load() }}>+ Log a missed enquiry</button></div>
    {err && <p className="mut">{err}</p>}{!rows && !err && <p className="mut">Loading…</p>}
    {rows && !rows.length && <p className="mut">Nothing logged yet.</p>}
    {rows && rows.length > 0 && <>
      <Group title={`${rows.length} missed enquiries`}>{byReason.map(([k, n]) => <Card key={k} t={LOST_REASONS[k] || k} v={n} sub={pct(n, rows.length)} />)}</Group>
      <section className="box" style={{ padding: '8px 12px', marginBottom: 10 }}><b>Most asked for and missed (what to buy)</b>
        {wanted.map(w => <div key={w.label} style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 13 }}><span style={{ flex: 1 }}>{w.label}</span><b>{w.n}</b></div>)}</section>
      <div className="scroll"><table><thead><tr><th>When</th><th>Dress / kind</th><th>Wanted</th><th>Reason</th><th>Customer</th><th>Note</th><th>By</th></tr></thead><tbody>
        {rows.slice(0, 40).map(r => { const d = r.dress_id ? ctx.dmap?.[r.dress_id] : null; return <tr key={r.id}><td>{dmy(String(r.logged_at).slice(0, 10))}</td><td>{d ? `${d.code} · ${d.name}` : r.category || '–'}</td>
          <td>{r.wanted_from ? `${dmy(r.wanted_from)}${r.wanted_to ? ' → ' + dmy(r.wanted_to) : ''}` : '–'}</td><td>{LOST_REASONS[r.reason]}</td><td>{[r.customer_name, r.phone].filter(Boolean).join(' · ') || '–'}</td><td>{r.note || ''}</td><td>{r.logged_by_name}</td></tr> })}</tbody></table></div></>}
  </div>
}

function Closes({ ctx }: { ctx: any }) {
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => { let live = true; ctx.sb.from('day_closes').select('*').gte('day', addD(todayIST(), -14)).order('day', { ascending: false }).then((r: any) => { if (live) setRows(r.error ? [] : r.data || []) }); return () => { live = false } }, [ctx.sb, ctx.fullTick])
  const today = todayIST(), days = Array.from({ length: 14 }, (_, i) => addD(today, -i)).filter(d => d <= today)
  const by = new Map<string, any>((rows || []).map(r => [r.day, r]))
  return <div><p className="mut" style={{ margin: '8px 0' }}>Each evening staff close the day from the Dashboard. A red row is a day nobody closed.</p>
    {!rows && <p className="mut">Loading…</p>}
    {rows && <div className="scroll"><table><thead><tr><th>Day</th><th>Closed by</th><th>Cash</th><th>Tomorrow&rsquo;s deliveries</th><th>Overdue returns</th><th>Note</th></tr></thead><tbody>
      {days.map(d => { const r = by.get(d)
        if (!r) return <tr key={d} style={{ color: d === today ? undefined : '#b3261e' }}><td>{dmy(d)}</td><td colSpan={5}>{d === today ? 'Not closed yet' : 'Not closed'}</td></tr>
        return <tr key={d}><td>{dmy(d)}</td><td>{r.closed_by_name}<br /><small className="mut">{new Date(r.closed_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</small></td>
          <td style={{ color: r.cash_tallied && !r.cash_difference ? '#2f7d4f' : '#b3261e' }}>{r.cash_tallied ? (r.cash_difference ? `Difference ${inr(r.cash_difference)}` : 'Tallied') : 'Not tallied'}</td>
          <td>{r.tomorrow_deliveries} {r.tomorrow_not_ready ? <b style={{ color: '#b3261e' }}>({r.tomorrow_not_ready} not ready)</b> : ''}{r.tomorrow_checked ? ' ✓ checked' : ''}</td>
          <td>{r.overdue_returns ? `${r.overdue_called} of ${r.overdue_returns} called` : 'none'}</td><td>{r.note || ''}</td></tr> })}</tbody></table></div>}</div>
}

export default function Insights({ ctx }: { ctx: any }) {
  const [tab, setTab] = useState<Tab>('score')
  const T = ({ k, l }: { k: Tab; l: string }) => <button type="button" role="tab" aria-selected={tab === k} className={'btn sm ' + (tab === k ? '' : 'alt')} onClick={() => setTab(k)}>{l}</button>
  return <div>
    <PageHead icon="chart" title="Insights" sub="How the business is really running: on-time rates, money that leaks, stock that pays back, demand missed." badge={<span className="owner-badge">♛ Owner Only</span>} />
    <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}><T k="score" l="Scorecard" /><T k="leak" l="Leakage" /><T k="stock" l="Stock" /><T k="lost" l="Missed enquiries" /><T k="close" l="Day closes" /></div>
    {tab === 'score' && <Scorecard ctx={ctx} />}{tab === 'leak' && <Leakage ctx={ctx} />}{tab === 'stock' && <Stock ctx={ctx} />}{tab === 'lost' && <Lost ctx={ctx} />}{tab === 'close' && <Closes ctx={ctx} />}
  </div>
}
