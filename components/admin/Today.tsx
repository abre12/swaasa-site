'use client'
import { Fragment, useMemo } from 'react'
import { addD, dmy, todayIST } from '@/lib/util'
import { computeAlerts } from '@/lib/alerts'
import { bookingReadiness } from '@/lib/readiness'
import { altStatus } from '@/lib/bookingAction'
import { prepSteps, STEP_COL } from '@/lib/countdown'
import { Ic } from './icons'
import PageHead from './PageHead'

// TODAY: one list for the start of the day. Every row is something someone has to DO, the button on the row does it (or opens it),
// and the list is derived from live records, so a row disappears as soon as the work is recorded. Sections with nothing to do are hidden.
type Row = { key: string; dressId: string; code: string; name: string; who?: string; chip: string; tone: 'bad' | 'warn' | 'ok' | 'info'; hint?: string; label: string; go: () => void; primary?: boolean; day?: string; steps?: { label: string; state: string }[] }
type Sec = { id: string; title: string; icon: string; rows: Row[] }

export default function Today({ ctx, embedded = false }: { ctx: any; embedded?: boolean }) {
  const today = todayIST(), tmr = addD(today, 1), in7 = addD(today, 7)
  const B: any[] = ctx.B || [], AJ: any[] = ctx.AJ || [], CR: any[] = ctx.CR || [], DC: any[] = ctx.DC || []
  const sections: Sec[] = useMemo(() => {
    const dm = ctx.dmap || {}, who = (b: any) => b?.customer_name || '', live = B.filter(b => b.status !== 'cancelled')
    const dress = (id: string, b?: any) => ({ code: b?.dress_code || dm[id]?.code || '', name: b?.dress_name || dm[id]?.name || '' })
    const bk = (b: any, o: Partial<Row> & { chip: string; tone: Row['tone']; label: string; go: () => void }): Row => ({ key: o.key || b.id, dressId: b.dress_id, ...dress(b.dress_id, b), who: who(b), ...o })
    const open = (b: any) => () => ctx.openBooking(b.id)
    const out: Sec[] = []

    // 1. delivery risks and critical items (the same rules as the bell)
    const { alerts } = computeAlerts({ B, D: ctx.D, AJ, CR, DC, st: ctx.st }, today, 0)
    const risks = alerts.filter(a => a.level === 'risk' || a.level === 'critical')
    out.push({ id: 'risk', title: 'Needs attention first', icon: 'warn', rows: risks.map(a => ({ key: a.key, dressId: a.dressId, code: a.dress.split(' · ')[0], name: a.dress.split(' · ').slice(1).join(' · '), chip: a.short, tone: 'bad' as const, hint: a.event ? `${a.event} · ${a.body}` : a.body, label: 'Open',
      go: () => a.action.kind === 'booking' ? ctx.openBooking(a.action.bookingId) : a.action.kind === 'workflow' ? ctx.focusWorkflow(a.action.module, a.action.id) : ctx.showDay(a.action.date) })) })

    // 2. deliveries today
    out.push({ id: 'deliver', title: 'Deliveries today', icon: 'truck', rows: live.filter(b => ['confirmed', 'pending'].includes(b.status) && b.start_date === today).sort((a, b) => (a.delivery_slot || '~').localeCompare(b.delivery_slot || '~') || a.dress_code.localeCompare(b.dress_code)).map(b => {
      const rd = bookingReadiness(ctx, b), how = (b.delivery_mode === 'courier' ? `We deliver${b.delivery_address ? ': ' + b.delivery_address : ''}` : 'Customer collects from store') + (b.delivery_slot ? ` · ${b.delivery_slot}` : ' · no time slot set') + (b.delivery_assignee ? ` · ${b.delivery_assignee}` : '')
      const due = Math.max(0, (b.rent || 0) + (b.charges || 0) - (b.paid || 0)), bal = due > 0 ? ` · balance ₹${due.toLocaleString('en-IN')}` : ''
      return rd.ready ? bk(b, { chip: 'Ready to deliver', tone: 'ok', hint: how + bal, label: 'Mark delivered', primary: true, go: () => ctx.pickup(b) })
        : bk(b, { chip: 'Not ready', tone: 'warn', hint: `${rd.reasons.map(r => r.label).join(' · ')}\n${how}${bal}`, label: 'Open', go: open(b) }) }) })

    // 3. deliveries that were due earlier and never recorded
    out.push({ id: 'missed', title: 'Deliveries missed', icon: 'warn', rows: live.filter(b => ['confirmed', 'pending'].includes(b.status) && b.start_date < today).sort((a, b) => a.start_date.localeCompare(b.start_date)).map(b =>
      bk(b, { chip: `Due ${dmy(b.start_date)}`, tone: 'bad', hint: 'Not delivered. Deliver it, reschedule or cancel.', label: 'Open', go: open(b) })) })

    // 4. returns due today and overdue
    out.push({ id: 'returns', title: 'Returns due and overdue', icon: 'calcheck', rows: live.filter(b => b.status === 'out' && b.end_date <= today).sort((a, b) => a.end_date.localeCompare(b.end_date)).map(b =>
      bk(b, { chip: b.end_date < today ? `Overdue since ${dmy(b.end_date)}` : 'Due today', tone: b.end_date < today ? 'bad' : 'warn', hint: b.phone ? `Phone ${b.phone}` : undefined, label: 'Open', primary: true, go: () => ctx.ret(b) })) })

    // 5. alterations and repairs
    const altRows: Row[] = []
    for (const j of AJ.filter(x => ['pending_dispatch', 'at_unit', 'quality_check'].includes(x.status))) {
      const b = live.find(x => x.id === j.booking_id), repair = j.source === 'damage', d = dress(j.dress_id, b)
      if (!repair && (!b || !['confirmed', 'pending'].includes(b.status))) continue
      const base = { key: `alt:${j.id}`, dressId: j.dress_id, code: d.code, name: d.name, who: repair ? 'Repair' : who(b), go: () => ctx.focusWorkflow('alteration', j.id) }
      if (j.status === 'pending_dispatch' && (repair || (b && b.start_date <= in7))) altRows.push({ ...base, chip: repair ? 'Repair: send to tailor' : 'Send to tailor', tone: 'warn', hint: repair ? undefined : `Delivery ${dmy(b.start_date)}${j.measurements_pending ? ' · measurements pending' : ''}`, label: 'Open' })
      else if (j.status === 'at_unit' && j.expected_return && j.expected_return <= today) altRows.push({ ...base, chip: j.expected_return < today ? 'Overdue from tailor' : 'Due back from tailor today', tone: j.expected_return < today ? 'bad' : 'warn', hint: repair ? undefined : `Delivery ${dmy(b.start_date)}`, label: 'Open' })
      else if (j.status === 'quality_check') altRows.push({ ...base, chip: 'Quality check waiting', tone: 'info', hint: altStatus(j).hint, label: 'Open' })
    }
    out.push({ id: 'alt', title: 'Alterations and repairs', icon: 'scissors', rows: altRows })

    // 6. dry cleaning
    const clRows: Row[] = []
    for (const r of CR.filter(x => ['to_be_sent', 'sent', 'returned_pending_check'].includes(x.status))) {
      const d = dress(r.dress_id), base = { key: `cl:${r.id}`, dressId: r.dress_id, code: d.code, name: d.name, go: () => ctx.focusWorkflow('cleaning', r.id) }
      const dc = DC.find(x => x.dress_id === r.dress_id && !x.returned_on)
      if (r.status === 'to_be_sent') clRows.push({ ...base, chip: 'Send to cleaner', tone: 'warn', label: 'Open' })
      else if (r.status === 'returned_pending_check') clRows.push({ ...base, chip: 'Check cleaned dress', tone: 'info', label: 'Open' })
      else if (dc?.expected_back && dc.expected_back <= today) clRows.push({ ...base, chip: dc.expected_back < today ? 'Overdue from cleaner' : 'Due back from cleaner today', tone: dc.expected_back < today ? 'bad' : 'warn', label: 'Open' })
    }
    out.push({ id: 'clean', title: 'Dry cleaning', icon: 'sparkle', rows: clRows })

    // 7. Coming up: the next 3 days in one list (replaces the separate "Next 3 days" block and the "Coming up tomorrow" line).
    // Deliveries show how far the preparation has got; returns due tomorrow are listed too. A dress already shown above is not repeated.
    const rctx = { B: ctx.B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC, dmap: ctx.dmap }, horizon = addD(today, 3)
    const soon: Row[] = live.filter(b => ['confirmed', 'pending'].includes(b.status) && b.start_date >= tmr && b.start_date <= horizon).flatMap(b => {
      const rd = bookingReadiness(ctx, b), slot = b.delivery_slot ? ` · ${b.delivery_slot}` : '', ev = b.event_date ? `${b.event_type || 'Event'} ${dmy(b.event_date)} · ` : ''
      return [bk(b, { key: 'soon:' + b.id, day: b.start_date, steps: prepSteps(rctx, b), chip: rd.ready ? 'Ready' : 'Not ready', tone: rd.ready ? 'ok' : b.start_date === tmr ? 'bad' : 'warn',
        hint: ev + (rd.ready ? 'Ready to deliver' : rd.reasons.map(r => r.label).join(' · ')) + slot, label: 'Open', go: open(b) })] })
    const soonRet: Row[] = live.filter(b => b.status === 'out' && b.end_date === tmr).map(b => bk(b, { key: 'soonret:' + b.id, day: tmr, chip: 'Return due', tone: 'info', hint: b.phone ? `Phone ${b.phone}` : undefined, label: 'Open', go: open(b) }))
    out.push({ id: 'soon', title: 'Coming up: next 3 days', icon: 'calendar', rows: [...soon, ...soonRet].sort((x, y) => (x.day || '').localeCompare(y.day || '')) })
    // A dress should appear once in Today. Keep the highest-priority issue; the row itself is the single place to open the work.
    const seen = new Set<string>()
    return out.map(s => ({ ...s, rows: s.rows.filter(r => { const k = r.dressId || r.key; if (seen.has(k)) return false; seen.add(k); return true }) })).filter(s => s.rows.length)
  }, [B, AJ, CR, DC, ctx.D, ctx.dmap, ctx.tick, today])   // eslint-disable-line react-hooks/exhaustive-deps

  const dayLbl = (d: string) => { const n = Math.round((Date.parse(d) - Date.parse(today)) / 864e5); return `${n === 1 ? 'Tomorrow' : dmy(d)} · D-${n}` }
  const total = sections.reduce((n, s) => n + s.rows.length, 0)
  return (<div className={embedded ? 'td-embed' : undefined}>
    {embedded
      ? <div className="td-embed-head"><h2><Ic n="checkc" s={24} />Today</h2><span className="mut">{new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}. Everything that needs doing, in order.</span></div>
      : <PageHead icon="checkc" title="Today" sub={`${new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}. Everything that needs doing, in order.`} />}
    {!total && <div className="td-clear"><Ic n="checkc" s={30} /><b>All caught up for today</b><p>No deliveries, returns or vendor actions are waiting.</p></div>}
    {sections.map(s => <section key={s.id} className="td-sec">
      <h3><Ic n={s.icon} s={18} />{s.title}<span className="td-n">{s.rows.length}</span></h3>
      {s.rows.map((r, i) => <Fragment key={r.key}>{r.day && r.day !== s.rows[i - 1]?.day && <div className="td-day">{dayLbl(r.day)}</div>}
        <div className={'td-row ' + r.tone} role="button" tabIndex={0} onClick={r.go} onKeyDown={e => { if (e.key === 'Enter') r.go() }}>
          {ctx.thumb(ctx.dmap?.[r.dressId] || { images: [] }, 40, 52)}
          <div className="td-main"><div className="td-top"><b>{r.code}</b><span>{r.name}</span>{r.who && <em>{r.who}</em>}</div>
            <div className="td-chip"><span className={'td-tag ' + r.tone}>{r.chip}</span>{r.hint && <small>{r.hint}</small>}</div>
            {r.steps && <div className="td-steps" aria-label="Preparation progress">{r.steps.map(x => <span key={x.label} title={`${x.label}: ${x.state === 'na' ? 'not needed' : x.state === 'doing' ? 'in progress' : x.state === 'done' ? 'done' : 'not started'}`}><i style={{ background: (STEP_COL as any)[x.state] }} /><small>{x.label}</small></span>)}</div>}</div>
          <button type="button" className={'btn sm' + (r.primary ? ' wine' : ' alt')} onClick={e => { e.stopPropagation(); r.go() }}>{r.label}</button>
        </div></Fragment>)}
    </section>)}
  </div>)
}
