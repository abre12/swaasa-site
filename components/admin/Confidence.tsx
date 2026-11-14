'use client'
import { useEffect, useMemo, useState } from 'react'
import PageHead from './PageHead'
import { addD, dmy, todayIST } from '@/lib/util'
import { bookingReadiness } from '@/lib/readiness'
import { computeAlerts } from '@/lib/alerts'
import { REASON_LABEL, STAGE_LABEL } from '@/lib/confidence'

// IN-1 Delivery Confidence board (the next 7 days, green / amber / red, with the cause) and IN-3 near-miss log (what went wrong, how often).
const COL = { green: '#2f7d4f', amber: '#c58a2b', red: '#b3261e' } as const
type Level = keyof typeof COL
const dayName = (d: string, today: string) => d === today ? 'Today' : d === addD(today, 1) ? 'Tomorrow' : new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
const istDay = (t?: string) => t ? new Date(new Date(t).getTime() + 330 * 60000).toISOString().slice(0, 10) : ''

export default function Confidence({ ctx }: { ctx: any }) {
  const today = todayIST(), [tab, setTab] = useState<'board' | 'near'>('board')
  const [log, setLog] = useState<any[] | null>(null), [anyway, setAnyway] = useState<any[]>([]), [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    ;(async () => {
      const from = addD(today, -60)
      const [l, n] = await Promise.all([
        ctx.sb.from('readiness_log').select('*').gte('delivery_date', from).order('delivery_date', { ascending: false }).limit(2000),
        ctx.sb.from('owner_notices').select('*').eq('kind', 'deliver_anyway').gte('created_at', from).order('created_at', { ascending: false }).limit(200)])
      if (!live) return
      setErr(!!l.error); setLog(l.error ? [] : l.data || []); setAnyway(n.error ? [] : n.data || [])
    })()
    return () => { live = false }
  }, [ctx.sb, ctx.fullTick, today])

  // ---------- the next 7 days, from the live data ----------
  const rows = useMemo(() => {
    const rctx = { B: ctx.B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC, dmap: ctx.dmap }
    const { all } = computeAlerts({ B: ctx.B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC, st: ctx.st }, today, 0)
    const hot = new Map<string, string>(); for (const a of all) if ((a.level === 'risk' || a.level === 'critical') && a.bookingId && !hot.has(a.bookingId)) hot.set(a.bookingId, a.short)
    const staff = new Map<string, string>((ctx.STAFF || []).map((s: any) => [s.user_id, s.name]))
    const end = addD(today, 6)
    return (ctx.B as any[]).filter(b => ['pending', 'confirmed'].includes(b.status) && b.start_date <= end).map(b => {
      const rd = bookingReadiness(rctx, b), left = Math.round((Date.parse(b.start_date) - Date.parse(today)) / 864e5)
      let level: Level = 'green'
      if (!rd.ready) level = rd.hard || left <= 1 ? 'red' : 'amber'
      if (hot.has(b.id)) level = 'red'
      if (left < 0) level = 'red'
      const cause = left < 0 ? 'Delivery date has passed and it is not delivered' : rd.ready ? (hot.get(b.id) || 'Ready') : rd.reasons.map(r => r.label).join(' · ')
      return { b, left, level, cause, by: staff.get(b.taken_by) || '', who: b.delivery_assignee || '' }
    }).sort((x, y) => x.b.start_date.localeCompare(y.b.start_date) || (x.level === y.level ? 0 : x.level === 'red' ? -1 : y.level === 'red' ? 1 : x.level === 'amber' ? -1 : 1))
  }, [ctx.B, ctx.D, ctx.AJ, ctx.CR, ctx.DC, ctx.dmap, ctx.st, ctx.STAFF, today])
  const n = (l: Level) => rows.filter(r => r.level === l).length

  // ---------- history: % ready at 2 days, near-misses ----------
  const d2 = (log || []).filter(x => x.stage === 'D-2'), d2ready = d2.filter(x => x.ready).length
  const pct = d2.length ? Math.round(d2ready / d2.length * 100) : null
  const near = useMemo(() => {
    const byB = new Map<string, any>()
    for (const x of (log || []).filter(x => !x.ready && (x.stage === 'D-1' || x.stage === 'D-0'))) { const o = byB.get(x.booking_id); if (!o || x.stage === 'D-0') byB.set(x.booking_id, x) }
    const book = new Map<string, any>((ctx.B as any[]).map(b => [b.id, b]))
    const list = Array.from(byB.values()).map(x => {
      const b = book.get(x.booking_id); let outcome = 'Not delivered yet'
      if (b?.status === 'cancelled') outcome = 'Cancelled'
      else if (b?.picked_up_at || ['out', 'returned'].includes(b?.status)) outcome = b?.picked_up_at && istDay(b.picked_up_at) > x.delivery_date ? 'Delivered late' : 'Delivered on time'
      else if (!b) outcome = 'Not in the loaded bookings'
      return { ...x, b, outcome, codes: x.reason_codes?.length ? x.reason_codes : ['other'] }
    })
    for (const a of anyway) list.push({ id: 'a' + a.id, booking_id: a.booking_id, stage: 'anyway', delivery_date: istDay(a.created_at), reasons: a.message, codes: ['delivered_anyway'], outcome: 'Delivered although not ready', b: book.get(a.booking_id), by: a.created_by_name })
    return list.sort((x, y) => String(y.delivery_date).localeCompare(String(x.delivery_date)))
  }, [log, anyway, ctx.B])
  const codeCount = useMemo(() => { const m: Record<string, number> = {}; for (const x of near) for (const c of x.codes) m[c] = (m[c] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]) }, [near])
  const label = (c: string) => c === 'delivered_anyway' ? 'Delivered although not ready' : c === 'other' ? 'Reason not recorded' : REASON_LABEL[c] || c

  const Dot = ({ l }: { l: Level }) => <span style={{ width: 12, height: 12, borderRadius: '50%', background: COL[l], display: 'inline-block', flex: 'none' }} aria-label={l === 'green' ? 'Ready' : l === 'amber' ? 'Needs attention' : 'At risk'} />
  const Card = ({ t, v, c, sub }: { t: string; v: any; c?: string; sub?: string }) => <div className="box" style={{ flex: '1 1 140px', padding: '10px 14px', minWidth: 130 }}><div className="mut" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 700, color: c }}>{v}</div>{sub && <div className="mut" style={{ fontSize: 12 }}>{sub}</div>}</div>

  let lastDay = ''
  return <div>
    <PageHead icon="truck" title="Delivery Confidence" sub="Are the next 7 days of deliveries going to go out on time, and what has gone wrong before." badge={<span className="owner-badge">♛ Owner Only</span>} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
      <Card t="Ready" v={n('green')} c={COL.green} sub="next 7 days" /><Card t="Needs attention" v={n('amber')} c={COL.amber} sub="time to fix it" /><Card t="At risk" v={n('red')} c={COL.red} sub="act today" />
      <Card t="Ready 2 days before" v={pct === null ? '–' : pct + '%'} sub={d2.length ? `${d2ready} of ${d2.length} deliveries, last 60 days` : 'fills in as days pass'} /></div>
    <div style={{ display: 'flex', gap: 8, margin: '6px 0 10px' }}>
      <button className={'btn ' + (tab === 'board' ? '' : 'alt') + ' sm'} onClick={() => setTab('board')}>Next 7 days</button>
      <button className={'btn ' + (tab === 'near' ? '' : 'alt') + ' sm'} onClick={() => setTab('near')}>Near-miss log{near.length ? ` (${near.length})` : ''}</button></div>

    {tab === 'board' && <>
      {!rows.length && <p className="mut">No deliveries in the next 7 days.</p>}
      {rows.map(({ b, left, level, cause, by, who }) => {
        const head = b.start_date !== lastDay; lastDay = b.start_date
        return <div key={b.id}>
          {head && <h4 style={{ margin: '14px 0 6px' }}>{left < 0 ? `Overdue · ${dmy(b.start_date)}` : dayName(b.start_date, today)}</h4>}
          <div className="box" onClick={() => ctx.openBooking(b.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', borderLeft: `5px solid ${COL[level]}`, padding: '8px 12px' }}>
            {ctx.thumb(ctx.dmap[b.dress_id], 44, 58)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Dot l={level} /><b>{b.dress_code} · {b.dress_name}</b><span className="mut">{b.customer_name}</span>
                {b.event_date && <span className="ac-event">{b.event_type || 'Event'} {dmy(b.event_date)}</span>}</div>
              <div style={{ fontSize: 13, color: level === 'green' ? 'var(--mut)' : COL[level], marginTop: 2 }}>{cause}</div>
              <div className="mut" style={{ fontSize: 12 }}>{[by && `Booked by ${by}`, who && `Delivery: ${who}`, b.delivery_slot && `Slot ${b.delivery_slot}`].filter(Boolean).join(' · ') || 'No one assigned yet'}</div></div>
          </div></div>
      })}</>}

    {tab === 'near' && <>
      <p className="mut" style={{ margin: '0 0 8px' }}>A near-miss is a delivery that was not ready the day before or on the day. It is recorded once a day. Last 60 days.</p>
      {err && <p className="mut">The log is not available yet. Run the v27 database update, then it starts filling in.</p>}
      {log && !err && !near.length && <p className="mut">Nothing recorded yet. This fills in as deliveries come up.</p>}
      {codeCount.length > 0 && <div className="box" style={{ padding: '10px 14px', marginBottom: 10 }}><b style={{ fontSize: 13 }}>What goes wrong most often</b>
        {codeCount.map(([c, k]) => <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13 }}><span style={{ flex: '0 0 220px' }}>{label(c)}</span><span style={{ height: 8, borderRadius: 4, background: 'var(--wine)', width: `${Math.max(6, k / codeCount[0][1] * 100)}%`, maxWidth: '55%' }} /><b>{k}</b></div>)}</div>}
      {near.map(x => <div key={x.id} className="box" onClick={() => x.b && ctx.openBooking(x.booking_id)} style={{ padding: '8px 12px', marginBottom: 6, cursor: x.b ? 'pointer' : 'default' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}><b>{x.b ? `${x.b.dress_code} · ${x.b.dress_name}` : x.booking_id}</b><span className="mut">{x.b?.customer_name}</span><span className="mut">· {dmy(x.delivery_date)}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: x.outcome === 'Delivered on time' ? COL.green : x.outcome === 'Not delivered yet' ? COL.red : COL.amber }}>{x.outcome}</span></div>
        <div style={{ fontSize: 13 }}>{x.stage === 'anyway' ? x.reasons : `${STAGE_LABEL[x.stage] || x.stage}: ${x.reasons || x.codes.map(label).join(', ')}`}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{x.codes.map((c: string) => <span key={c} className="ac-event" style={{ margin: 0 }}>{label(c)}</span>)}</div></div>)}
    </>}
  </div>
}
