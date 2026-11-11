'use client'
import { useMemo } from 'react'
import { addD, dmy, todayIST } from '@/lib/util'
import { computeAlerts } from '@/lib/alerts'
import { bookingReadiness } from '@/lib/readiness'
import { altStatus } from '@/lib/bookingAction'
import { Ic } from './icons'
import PageHead from './PageHead'

// TODAY: one list for the start of the day. Every row is something someone has to DO, the button on the row does it (or opens it),
// and the list is derived from live records, so a row disappears as soon as the work is recorded. Sections with nothing to do are hidden.
type Row = { key: string; dressId: string; code: string; name: string; who?: string; chip: string; tone: 'bad' | 'warn' | 'ok' | 'info'; hint?: string; label: string; go: () => void; primary?: boolean }
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
    out.push({ id: 'risk', title: 'Needs attention first', icon: 'warn', rows: risks.map(a => ({ key: a.key, dressId: a.dressId, code: a.dress.split(' · ')[0], name: a.dress.split(' · ').slice(1).join(' · '), chip: a.short, tone: 'bad' as const, hint: a.body, label: a.action.label,
      go: () => a.action.kind === 'booking' ? ctx.openBooking(a.action.bookingId) : a.action.kind === 'workflow' ? ctx.focusWorkflow(a.action.module, a.action.id) : ctx.showDay(a.action.date) })) })

    // 2. deliveries today
    out.push({ id: 'deliver', title: 'Deliveries today', icon: 'truck', rows: live.filter(b => ['confirmed', 'pending'].includes(b.status) && b.start_date === today).sort((a, b) => a.dress_code.localeCompare(b.dress_code)).map(b => {
      const rd = bookingReadiness(ctx, b), how = b.delivery_mode === 'courier' ? `We deliver${b.delivery_address ? ': ' + b.delivery_address : ''}` : 'Customer collects from store'
      return rd.ready ? bk(b, { chip: 'Ready', tone: 'ok', hint: how, label: 'Mark delivered', primary: true, go: () => ctx.pickup(b) })
        : bk(b, { chip: 'Not ready', tone: 'warn', hint: `${rd.reasons.map(r => r.label).join(' · ')}\n${how}`, label: "See what's pending", go: open(b) }) }) })

    // 3. deliveries that were due earlier and never recorded
    out.push({ id: 'missed', title: 'Deliveries missed', icon: 'warn', rows: live.filter(b => ['confirmed', 'pending'].includes(b.status) && b.start_date < today).sort((a, b) => a.start_date.localeCompare(b.start_date)).map(b =>
      bk(b, { chip: `Due ${dmy(b.start_date)}`, tone: 'bad', hint: 'Not delivered. Deliver it, reschedule or cancel.', label: 'Open booking', go: open(b) })) })

    // 4. returns due today and overdue
    out.push({ id: 'returns', title: 'Returns due and overdue', icon: 'calcheck', rows: live.filter(b => b.status === 'out' && b.end_date <= today).sort((a, b) => a.end_date.localeCompare(b.end_date)).map(b =>
      bk(b, { chip: b.end_date < today ? `Overdue since ${dmy(b.end_date)}` : 'Due today', tone: b.end_date < today ? 'bad' : 'warn', hint: b.phone ? `Phone ${b.phone}` : undefined, label: 'Process return', primary: true, go: () => ctx.ret(b) })) })

    // 5. alterations and repairs
    const altRows: Row[] = []
    for (const j of AJ.filter(x => ['pending_dispatch', 'at_unit', 'quality_check'].includes(x.status))) {
      const b = live.find(x => x.id === j.booking_id), repair = j.source === 'damage', d = dress(j.dress_id, b)
      if (!repair && (!b || !['confirmed', 'pending'].includes(b.status))) continue
      const base = { key: `alt:${j.id}`, dressId: j.dress_id, code: d.code, name: d.name, who: repair ? 'Repair' : who(b), go: () => ctx.focusWorkflow('alteration', j.id) }
      if (j.status === 'pending_dispatch' && (repair || (b && b.start_date <= in7))) altRows.push({ ...base, chip: repair ? 'Repair: send to tailor' : 'Send to tailor', tone: 'warn', hint: repair ? undefined : `Delivery ${dmy(b.start_date)}${j.measurements_pending ? ' · measurements pending' : ''}`, label: 'Open' })
      else if (j.status === 'at_unit' && j.expected_return && j.expected_return <= today) altRows.push({ ...base, chip: j.expected_return < today ? 'Overdue from tailor' : 'Due back from tailor today', tone: j.expected_return < today ? 'bad' : 'warn', hint: repair ? undefined : `Delivery ${dmy(b.start_date)}`, label: 'Open' })
      else if (j.status === 'quality_check') altRows.push({ ...base, chip: 'Quality check waiting', tone: 'info', hint: altStatus(j).hint, label: 'Check now' })
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

    // 7. tomorrow's deliveries that are not ready yet (so there is time to fix them)
    out.push({ id: 'tmr', title: "Tomorrow's deliveries not ready", icon: 'calendar', rows: live.filter(b => ['confirmed', 'pending'].includes(b.status) && b.start_date === tmr).flatMap(b => {
      const rd = bookingReadiness(ctx, b); return rd.ready ? [] : [bk(b, { chip: 'Not ready', tone: 'warn', hint: rd.reasons.map(r => r.label).join(' · '), label: 'See what\'s pending', go: open(b) })] }) })
    return out.filter(s => s.rows.length)
  }, [B, AJ, CR, DC, ctx.D, ctx.dmap, ctx.tick, today])   // eslint-disable-line react-hooks/exhaustive-deps

  const total = sections.reduce((n, s) => n + s.rows.length, 0)
  const tmrDel = B.filter(b => ['confirmed', 'pending'].includes(b.status) && b.start_date === tmr).length, tmrRet = B.filter(b => b.status === 'out' && b.end_date === tmr).length
  return (<div className={embedded ? 'td-embed' : undefined}>
    {embedded
      ? <div className="td-embed-head"><h2><Ic n="checkc" s={24} />Today</h2><span className="mut">{new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}. Everything that needs doing, in order.</span></div>
      : <PageHead icon="checkc" title="Today" sub={`${new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}. Everything that needs doing, in order.`} />}
    {!total && <div className="td-clear"><Ic n="checkc" s={34} /><b>Nothing needs doing right now</b><p>No deliveries, returns or vendor items are waiting.</p></div>}
    {sections.map(s => <section key={s.id} className="td-sec">
      <h3><Ic n={s.icon} s={18} />{s.title}<span className="td-n">{s.rows.length}</span></h3>
      {s.rows.map(r => <div key={r.key} className={'td-row ' + r.tone} role="button" tabIndex={0} onClick={r.go} onKeyDown={e => { if (e.key === 'Enter') r.go() }}>
        {ctx.thumb(ctx.dmap?.[r.dressId] || { images: [] }, 40, 52)}
        <div className="td-main"><div className="td-top"><b>{r.code}</b><span>{r.name}</span>{r.who && <em>{r.who}</em>}</div>
          <div className="td-chip"><span className={'td-tag ' + r.tone}>{r.chip}</span>{r.hint && <small>{r.hint}</small>}</div></div>
        <button type="button" className={'btn sm' + (r.primary ? ' wine' : ' alt')} onClick={e => { e.stopPropagation(); r.go() }}>{r.label}</button>
      </div>)}
    </section>)}
    <p className="mut td-foot">Tomorrow: {tmrDel} deliver{tmrDel === 1 ? 'y' : 'ies'} · {tmrRet} return{tmrRet === 1 ? '' : 's'} due</p>
  </div>)
}
