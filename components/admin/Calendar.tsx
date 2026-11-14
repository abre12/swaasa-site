'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addD, dmy, todayIST } from '@/lib/util'
import { bookingReadiness } from '@/lib/readiness'
import { Ic } from './icons'

type Kind = 'delivery' | 'alteration' | 'return' | 'cleaning' | 'other'
type Tone = 'ok' | 'warn' | 'bad' | 'neutral'
type Filter = 'all' | Kind | 'attention'
type Ev = { id: string; kind: Kind; date: string; dress?: string; title: string; ref: string; sub?: string; status: string; tone: Tone; risk: boolean; done?: boolean; bid?: string; kid?: string; job?: string; due?: string; delivery?: string }

const ORDER: Kind[] = ['delivery', 'alteration', 'return', 'cleaning', 'other']
const META: Record<Kind, { label: string; icon: string; plural: string }> = {
  delivery: { label: 'Delivery', plural: 'Deliveries', icon: 'truck' },
  alteration: { label: 'Alteration', plural: 'Alterations', icon: 'scissors' },
  return: { label: 'Return', plural: 'Returns', icon: 'ret' },
  cleaning: { label: 'Dry Cleaning', plural: 'Dry Cleaning', icon: 'sparkle' },
  other: { label: 'Other', plural: 'Other / Blocked', icon: 'calendar' },
}
const FILTERS: [Filter, string][] = [['all', 'All activities'], ['delivery', 'Deliveries'], ['alteration', 'Alterations'], ['return', 'Returns'], ['cleaning', 'Dry cleaning'], ['attention', 'Overdue / attention required']]
const longDay = (d: string) => { const x = new Date(d + 'T00:00:00Z'), o = { timeZone: 'UTC' } as const; return `${x.toLocaleDateString('en-GB', { weekday: 'short', ...o })}, ${x.getUTCDate()} ${x.toLocaleDateString('en-GB', { month: 'short', ...o })} ${x.getUTCFullYear()}` }
const short = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function Calendar({ ctx, onBlock, onBlockInfo }: { ctx: any; onBlock: () => void; onBlockInfo: (id: string) => void }) {
  const today = todayIST()
  const { B, K, DC, CR, AJ, dmap, thumb, openBooking, go, state } = ctx
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const [sel, setSel] = useState(today)
  const [ref, setRef] = useState(today.slice(0, 7))
  // Only 90 days of bookings are loaded; paging back to an older month loads it.
  useEffect(() => { ctx.ensureFrom(view === 'month' ? `${ref}-01` : sel) }, [ref, sel, view])   // eslint-disable-line react-hooks/exhaustive-deps
  const [filter, setFilter] = useState<Filter>('all')
  const [fOpen, setFOpen] = useState(false)
  const [open, setOpen] = useState<Record<Kind, boolean>>({ delivery: true, alteration: true, return: false, cleaning: false, other: false })
  const [riskView, setRiskView] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  // ---------- Build every calendar event once ----------
  const { events, affected } = useMemo(() => {
    const ev: Ev[] = [], affected: Ev[] = []
    const live = (B || []).filter((b: any) => b.status !== 'cancelled')
    const active = (b: any) => b.status === 'pending' || b.status === 'confirmed'
    const jobs: any[] = (AJ || []).filter((a: any) => a.status !== 'cancelled')
    const openJob = (bid: string) => jobs.find(a => a.booking_id === bid && a.status !== 'ready')
    for (const b of live) {
      const j = openJob(b.id), atRisk = !!j && active(b) && today >= b.start_date
      let status = 'Not started', tone: Tone = 'neutral'
      if (b.status === 'out' || b.status === 'returned') { status = 'Delivered'; tone = 'ok' }
      else if (atRisk) { status = 'Delivery at Risk'; tone = 'bad' }
      else if (b.start_date < today) { status = 'Not delivered'; tone = 'bad' }
      else { const r = bookingReadiness(ctx, b); status = r.ready ? 'Ready' : r.summary; tone = r.ready ? 'ok' : 'warn' }
      const late = active(b) && b.start_date < today
      ev.push({ id: 'd' + b.id, kind: 'delivery', date: late ? today : b.start_date, dress: b.dress_id, title: b.customer_name, ref: `${b.id} · ${b.dress_code}`, sub: late ? 'Was due ' + short(b.start_date) : undefined, status, tone, risk: tone === 'bad', done: b.status === 'out' || b.status === 'returned', bid: b.id })
      const od = state(b) === 'overdue'
      const retDate = od ? today : b.end_date
      ev.push({ id: 'r' + b.id, kind: 'return', date: retDate, dress: b.dress_id, title: b.customer_name, ref: `${b.id} · ${b.dress_code}`, sub: od ? 'Was due ' + short(b.end_date) : undefined, status: b.status === 'returned' ? 'Returned' : od ? 'Overdue' : b.status === 'out' ? 'With customer' : 'Upcoming', tone: b.status === 'returned' ? 'ok' : od ? 'bad' : 'neutral', risk: od, done: b.status === 'returned', bid: b.id })
    }
    // Alteration due date = delivery date minus 1 day
    for (const a of jobs) {
      const b = live.find((x: any) => x.id === a.booking_id); if (!b) continue
      const due = addD(b.start_date, -1), done = a.status === 'ready'
      if (!done && !active(b)) continue
      let status = 'Pending', tone: Tone = 'warn', risk = false, date = due
      if (done) { status = 'Completed'; tone = 'ok' }
      else if (today >= b.start_date) { status = 'Delivery at Risk'; tone = 'bad'; risk = true; date = today }
      else if (today > due) { status = 'Overdue'; tone = 'bad'; risk = true; date = today }
      else if (today === due) { status = 'Due Today'; tone = 'warn' }
      const e: Ev = { id: 'a' + a.id, kind: 'alteration', date, dress: a.dress_id, title: b.customer_name, ref: `${b.id} · ${b.dress_code}`, sub: a.requirements, status, tone, risk, done, bid: b.id, job: a.id, due, delivery: b.start_date }
      ev.push(e)
      if (!done && b.start_date <= addD(today, 3)) affected.push(e)
    }
    for (const c of DC || []) if (!c.returned_on) {
      const od = c.expected_back < today
      ev.push({ id: 'c' + c.id, kind: 'cleaning', date: od ? today : c.expected_back, dress: c.dress_id, title: dmap[c.dress_id]?.name || 'Dress', ref: dmap[c.dress_id]?.code || '', sub: 'Sent ' + short(c.sent_on) + (c.vendor ? ' · ' + c.vendor : ''), status: od ? 'Overdue' : 'At cleaner', tone: od ? 'bad' : 'neutral', risk: od })
    }
    for (const r of CR || []) if (r.status === 'to_be_sent') {
      ev.push({ id: 'q' + r.id, kind: 'cleaning', date: today, dress: r.dress_id, title: dmap[r.dress_id]?.name || 'Dress', ref: dmap[r.dress_id]?.code || '', sub: r.condition_notes || undefined, status: 'To be sent', tone: 'warn', risk: false })
    }
    for (const k of K || []) {
      ev.push({ id: 'k' + k.id, kind: 'other', date: k.start_date, dress: k.dress_id, title: 'Blocked', ref: dmap[k.dress_id]?.code || '', sub: 'Until ' + short(k.end_date) + (k.reason ? ' · ' + k.reason : ''), status: 'Blocked', tone: 'neutral', risk: false, kid: k.id })
    }
    affected.sort((a, b) => (a.delivery || '').localeCompare(b.delivery || ''))
    return { events: ev, affected }
  }, [B, K, DC, CR, AJ, dmap, today, state])

  const pass = (e: Ev) => filter === 'all' || (filter === 'attention' ? e.risk : e.kind === filter)
  const byDate = useMemo(() => { const m = new Map<string, Ev[]>(); for (const e of events) { if (!pass(e)) continue; const l = m.get(e.date); l ? l.push(e) : m.set(e.date, [e]) } return m }, [events, filter]) // eslint-disable-line react-hooks/exhaustive-deps
  const on = (d: string) => byDate.get(d) || []

  // ---------- Visible range & summary ----------
  const first = ref + '-01', fd = new Date(first + 'T00:00:00Z').getUTCDay()
  const dim = new Date(Date.UTC(+ref.slice(0, 4), +ref.slice(5, 7), 0)).getUTCDate()
  const monthCells = Array.from({ length: Math.ceil((fd + dim) / 7) * 7 }, (_, i) => addD(addD(first, -fd), i))
  const wkStart = addD(sel, -new Date(sel + 'T00:00:00Z').getUTCDay())
  const cells = view === 'month' ? monthCells : view === 'week' ? Array.from({ length: 7 }, (_, i) => addD(wkStart, i)) : [sel]
  const rs = view === 'month' ? first : cells[0], re = view === 'month' ? addD(first, dim - 1) : cells[cells.length - 1]
  const inRange = (e: Ev) => e.date >= rs && e.date <= re
  const sum = useMemo(() => {
    const r = events.filter(inRange)
    return {
      delivery: r.filter(e => e.kind === 'delivery' && !e.done).length,
      alteration: r.filter(e => e.kind === 'alteration' && !e.done).length,
      dueToday: events.filter(e => e.kind === 'alteration' && !e.done && e.status === 'Due Today').length,
      return: r.filter(e => e.kind === 'return' && !e.done).length,
      cleaning: r.filter(e => e.kind === 'cleaning').length,
      urgent: events.filter(e => e.risk).length,
    }
  }, [events, rs, re]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (n: number) => {
    if (view === 'month') { const d = new Date(first + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); const m = d.toISOString().slice(0, 7); setRef(m); setSel(m === today.slice(0, 7) ? today : m + '-01') }
    else { const s = addD(sel, n * (view === 'week' ? 7 : 1)); setSel(s); setRef(s.slice(0, 7)) }
  }
  const pick = (d: string, kind?: Kind) => { setRiskView(false); setSel(d); if (d.slice(0, 7) !== ref && view === 'month') setRef(d.slice(0, 7)); if (kind) setOpen(o => ({ ...o, [kind]: true })); if (typeof window !== 'undefined' && window.innerWidth < 1100) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }
  useEffect(() => { setRiskView(false) }, [filter])

  const dayEv = on(sel)
  const grouped = ORDER.map(k => [k, dayEv.filter(e => e.kind === k)] as [Kind, Ev[]]).filter(([, l]) => l.length)
  const dayRisk = dayEv.filter(e => e.risk).length
  const tomorrow = addD(today, 1)
  const bannerText = affected.length
    ? `${affected.length} Alteration${affected.length > 1 ? 's' : ''} Pending for ${affected.every(e => e.delivery === tomorrow) ? "Tomorrow's Delivery" : affected.every(e => e.delivery === today) ? "Today's Delivery" : 'Deliveries within 3 Days'}`
    : ''

  const act = (e: Ev) => e.kid ? onBlockInfo(e.kid) : e.bid ? openBooking(e.bid) : go('drycleaning')
  const card = (e: Ev) => <button key={e.id} className={'cx-card' + (e.risk ? ' risk' : '') + (e.done ? ' done' : '')} onClick={() => act(e)}>
    {e.dress ? thumb(dmap[e.dress], 44, 58) : <span className="cx-th"><Ic n="calendar" s={18} /></span>}
    <span className="cx-ci"><b>{e.title}</b><small>{e.ref}</small>{e.sub && <small className="cx-sub">{e.sub}</small>}{e.kind === 'alteration' && e.due && <small>Due {short(e.due)} · Delivery {short(e.delivery || '')}</small>}</span>
    <span className={'cx-st ' + e.tone}>{e.risk && <Ic n="warn" s={12} />}{e.status}</span>
  </button>
  const group = (kind: Kind, list: Ev[]) => {
    const m = META[kind], bad = list.filter(e => e.risk).length
    return <section key={kind} className={'cx-grp k-' + kind}>
      <button className="cx-gh" onClick={() => setOpen(o => ({ ...o, [kind]: !o[kind] }))} aria-expanded={open[kind]}><Ic n={m.icon} s={18} /><b>{m.plural} ({list.length})</b>{bad > 0 && <span className="cx-flag">{bad} urgent</span>}<span className={'cx-chev' + (open[kind] ? ' up' : '')}><Ic n="down" s={16} /></span></button>
      {open[kind] && <div className="cx-gl">{list.map(card)}</div>}
    </section>
  }

  return <div className="cx">
    <div className="cx-head">
      <div><h1>Calendar</h1><p>Manage deliveries, alterations and daily operations</p></div>
      <div className="cx-tools">
        <div className="cx-nav"><button onClick={() => move(-1)} aria-label="Previous">‹</button>
          {view === 'month' ? <label className="cx-month"><Ic n="calendar" s={16} /><span>{new Date(first + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span><input type="month" aria-label="Choose month" value={ref} onChange={e => { if (e.target.value) { setRef(e.target.value); setSel(e.target.value === today.slice(0, 7) ? today : e.target.value + '-01') } }} /></label>
            : <span className="cx-month"><span>{view === 'week' ? `${short(cells[0])} – ${short(cells[6])}` : longDay(sel)}</span></span>}
          <button onClick={() => move(1)} aria-label="Next">›</button></div>
        <button className="cx-btn" onClick={() => { setSel(today); setRef(today.slice(0, 7)) }}>Today</button>
        <div className="cx-seg" role="tablist">{(['month', 'week', 'day'] as const).map(v => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
        <div className="cx-fwrap"><button className={'cx-btn' + (filter !== 'all' ? ' act' : '')} onClick={() => setFOpen(!fOpen)} aria-expanded={fOpen}><Ic n="filter" s={15} />Filters{filter !== 'all' && ' (1)'}</button>
          {fOpen && <div className="cx-fmenu">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setFOpen(false) }}>{l}</button>)}</div>}</div>
        <button className="cx-primary" onClick={onBlock}><Ic n="plus" s={15} />Block a Dress</button>
      </div>
    </div>

    <div className="cx-sum">
      {([['delivery', sum.delivery, 'Deliveries', ''], ['alteration', sum.alteration, 'Alterations', sum.dueToday ? `${sum.dueToday} Due Today` : ''], ['return', sum.return, 'Returns', ''], ['cleaning', sum.cleaning, 'Dry Cleaning', '']] as [Kind, number, string, string][]).map(([k, n, l, s]) =>
        <button key={k} className={'cx-sc k-' + k + (filter === k ? ' sel' : '')} onClick={() => setFilter(filter === k ? 'all' : k)}><Ic n={META[k].icon} s={26} /><span className="n">{n}</span><span className="l">{l}</span>{s && <em>{s}</em>}</button>)}
      <button className={'cx-sc k-bad' + (filter === 'attention' ? ' sel' : '')} onClick={() => setFilter(filter === 'attention' ? 'all' : 'attention')}><Ic n="warn" s={26} /><span className="n">{sum.urgent}</span><span className="l">Overdue / At Risk</span></button>
    </div>

    <div className={'cx-body' + (view === 'day' ? ' day' : '')}>
      {view !== 'day' && <div className="cx-main">
        <div className={'cx-grid ' + view}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w, i) => <div key={w} className={'cx-wd' + (i === 0 || i === 6 ? ' we' : '')}>{w}</div>)}
          {cells.map(d => {
            const l = on(d), by = ORDER.map(k => [k, l.filter(e => e.kind === k)] as [Kind, Ev[]]).filter(([, x]) => x.length)
            const shown = by.slice(0, 4), more = by.slice(4).reduce((n, [, x]) => n + x.length, 0)
            const out = view === 'month' && d.slice(0, 7) !== ref
            const wk = new Date(d + 'T00:00:00Z').getUTCDay()
            return <div key={d} className={'cx-cell' + (d === sel ? ' sel' : '') + (d === today ? ' today' : '') + (out ? ' out' : '') + (wk === 0 || wk === 6 ? ' we' : '')} onClick={() => pick(d)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') pick(d) }} aria-label={`${longDay(d)}, ${l.length} activities`}>
              <span className="cx-dn"><i>{+d.slice(8)}</i>{d === sel && l.length > 0 && <u>{l.length}</u>}</span>
              <span className="cx-pills">{shown.map(([k, x]) => { const bad = x.some(e => e.risk); return <button key={k} className={'cx-pill k-' + k + (bad ? ' bad' : '')} onClick={e => { e.stopPropagation(); pick(d, k) }} title={`${x.length} ${META[k].plural}`}><Ic n={META[k].icon} s={13} />{x.length}{bad && k === 'alteration' && <b>!</b>}</button> })}
                {more > 0 && <span className="cx-more">+{more} more</span>}</span>
            </div>
          })}
        </div>
        <div className="cx-legend">{([['delivery', 'Delivery'], ['alteration', 'Alteration'], ['return', 'Return'], ['cleaning', 'Dry Cleaning']] as [Kind, string][]).map(([k, l]) => <span key={k}><i className={'k-' + k} />{l}</span>)}<span><i className="k-bad" />Overdue / At Risk</span></div>
        <div className="cx-rule"><Ic n="warn" s={16} /><span><b>Alteration Rule:</b> Complete alterations at least <b>1 day before</b> the delivery date.</span></div>
      </div>}

      <aside className="cx-panel" ref={panelRef} aria-label="Day schedule">
        <div className="cx-ph"><div><h2>{longDay(sel)}</h2><p>{dayEv.length} {dayEv.length === 1 ? 'Activity' : 'Activities'}{dayRisk > 0 && <span className="cx-flag">{dayRisk} need attention</span>}</p></div></div>
        {bannerText && <button className="cx-alert" onClick={() => { setRiskView(true); setOpen(o => ({ ...o, alteration: true })); panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }}><Ic n="warn" s={20} /><b>{bannerText}</b><span>›</span></button>}
        {riskView ? <section className="cx-grp k-alteration"><div className="cx-gh static"><Ic n="scissors" s={18} /><b>Alterations affecting deliveries in the next 3 days ({affected.length})</b><button className="cx-link" onClick={() => setRiskView(false)}>Back to day</button></div><div className="cx-gl">{affected.map(card)}</div></section>
          : grouped.length ? grouped.map(([k, l]) => group(k, l))
            : <div className="cx-empty"><Ic n="calendar" s={28} /><b>Nothing scheduled</b><span>{filter === 'all' ? 'No deliveries, alterations, returns or cleaning on this date.' : 'No activities match the current filter.'}</span>{filter !== 'all' && <button className="cx-link" onClick={() => setFilter('all')}>Show all activities</button>}</div>}
      </aside>
    </div>
  </div>
}
