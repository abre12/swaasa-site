'use client'
import { shouldClearDamaged } from '@/lib/readiness'
import { useEffect, useMemo, useState } from 'react'
import { addD, dmy, todayIST } from '@/lib/util'
import AlterationDrawer, { summarise } from './AlterationDrawer'
import PageHead from './PageHead'
import { Ic } from './icons'

type Stage = 'pending_dispatch' | 'at_unit' | 'quality_check' | 'ready'
type Queue = Stage | 'all' | 'completed' | 'damaged'
const STAGES: Stage[] = ['pending_dispatch', 'at_unit', 'quality_check', 'ready']
const LABEL: Record<Stage, string> = { pending_dispatch: 'Pending Dispatch to Tailor', at_unit: 'At Tailoring Unit', quality_check: 'Quality Check at Store', ready: 'Ready' }
const ICON: Record<Stage, string> = { pending_dispatch: 'hourglass', at_unit: 'scissors', quality_check: 'search', ready: 'checkc' }
const isCompleted = (j: any, bookings: any[]) => j.status === 'ready' && bookings.find((b: any) => b.id === j.booking_id)?.status === 'returned'

// Shared with the booking details modal so there is one dispatch workflow.
export async function dispatchAlteration(ctx: any, j: any): Promise<boolean> {
  if (j.measurements_pending && !(await ctx.askYes('Measurements still pending', 'No measurements have been recorded for this alteration yet. The tailor will need them. Send to the tailoring unit anyway?', 'Send anyway'))) return false
  const sent = todayIST(), v = await ctx.ask('Send to Tailoring Unit', [{ name: 'sent', label: 'Date sent', type: 'date', value: sent, required: true }, { name: 'expected', label: 'Expected return date', type: 'date', value: addD(sent, 3), required: true }, { name: 'notes', label: 'Dispatch notes' }], { ok: 'Confirm dispatch', note: 'Normal turnaround is 2–3 days. The expected return date can be adjusted.' })
  if (!v) return false
  if (v.expected < v.sent) { ctx.say('Expected return cannot be before dispatch.'); return false }
  const { error } = await ctx.sb.from('alteration_jobs').update({ status: 'at_unit', sent_on: v.sent, expected_return: v.expected, notes: v.notes.trim() || j.notes, updated_at: new Date().toISOString() }).eq('id', j.id)
  ctx.say(error ? 'Could not update the alteration.' : 'Dress marked At Tailoring Unit.'); ctx.load()
  return !error
}

export default function Alterations({ ctx }: { ctx: any }) {
  const [openId, setOpenId] = useState<string | null>(null), [tab, setTab] = useState<Queue>('all'), [q, setQ] = useState(''), [due, setDue] = useState(''), [category, setCategory] = useState('all'), [status, setStatus] = useState('all'), [page, setPage] = useState(1)
  const jobs: any[] = ctx.AJ || [], bookings: any[] = ctx.B || [], today = todayIST(), pageSize = 5
  const isDmg = (j: any) => j.source === 'damage'
  const eligible = bookings.filter((b: any) => ['pending', 'confirmed', 'out'].includes(b.status) && !jobs.some((j: any) => j.booking_id === b.id && !isDmg(j) && !['ready', 'cancelled'].includes(j.status)))
  const count = (s: Stage) => jobs.filter(j => j.status === s && !isDmg(j) && !isCompleted(j, bookings)).length
  const damaged = jobs.filter(j => isDmg(j) && !['ready', 'cancelled'].includes(j.status))
  const completed = jobs.filter(j => isCompleted(j, bookings))
  const filtered = useMemo(() => jobs.filter(j => {
    const b = bookings.find((x: any) => x.id === j.booking_id), d = ctx.dmap[j.dress_id], done = isCompleted(j, bookings)
    if (j.status === 'cancelled') return false
    if (tab === 'damaged') { if (!isDmg(j) || done) return false }
    else if (tab === 'completed') { if (!done) return false }
    else if (isDmg(j) || done || (tab !== 'all' && j.status !== tab)) return false
    if (q && !`${j.booking_id} ${b?.customer_name || ''} ${b?.phone || ''} ${d?.code || ''} ${d?.name || ''}`.toLowerCase().includes(q.toLowerCase())) return false
    if (due && b?.start_date !== due) return false
    if (category !== 'all' && (d?.category || '').toLowerCase() !== category) return false
    if (status !== 'all' && j.status !== status) return false
    return true
  }).sort((a, b) => {
    const p = (s: string) => STAGES.indexOf(s as Stage)
    return p(a.status) - p(b.status) || (a.expected_return || '9999').localeCompare(b.expected_return || '9999')
  }), [jobs, bookings, tab, q, due, category, status, ctx.dmap])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)), rows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const categories = [...new Set(jobs.map(j => (ctx.dmap[j.dress_id]?.category || '').trim()).filter(Boolean))].sort()

  async function add() {
    const opts = eligible.map((b: any) => `${b.id} · ${b.customer_name} · ${b.dress_code}`)
    if (!opts.length) return ctx.say('No eligible bookings are available.')
    const v = await ctx.ask('Add alteration', [{ name: 'booking', label: 'Booking', options: opts, required: true }, { name: 'requirements', label: 'Alteration requirements', required: true }, { name: 'notes', label: 'Additional notes' }], { ok: 'Add to queue', note: 'All work is temporary and reversible. The dress stays at the store until dispatched.' })
    if (!v) return
    const b = eligible.find((x: any) => `${x.id} · ${x.customer_name} · ${x.dress_code}` === v.booking)
    if (!b) return
    const { error } = await ctx.sb.from('alteration_jobs').insert({ booking_id: b.id, dress_id: b.dress_id, requirements: v.requirements.trim(), notes: v.notes.trim() || null })
    ctx.say(error ? error.message : 'Alteration added to Pending Dispatch.'); ctx.load()
  }
  const dispatch = (j: any) => dispatchAlteration(ctx, j)
  async function receive(j: any) {
    const v = await ctx.ask('Receive at Store', [{ name: 'received', label: 'Date received back at the store', type: 'date', value: today, required: true }, { name: 'note', label: 'Return notes' }], { ok: 'Send to quality check' })
    if (!v) return
    const { error } = await ctx.sb.from('alteration_jobs').update({ status: 'quality_check', received_at: new Date(`${v.received}T12:00:00+05:30`).toISOString(), notes: [j.notes, v.note.trim()].filter(Boolean).join(' · ') || null, updated_at: new Date().toISOString() }).eq('id', j.id)
    ctx.say(error ? 'Could not record receipt.' : 'Dress received at store; quality check is required.'); ctx.load()
  }
  async function approve(j: any, qc: Record<string, boolean>, note: string) {
    const { error } = await ctx.sb.from('alteration_jobs').update({ status: 'ready', checked_at: new Date().toISOString(), qc, qc_notes: note.trim() || null, updated_at: new Date().toISOString() }).eq('id', j.id)
    if (error) return ctx.say('Could not approve. Has migration v12 been run? ' + error.message)
    // Only finishing a REPAIR can clear "Damaged" (and only when no other repair is open). A normal alteration never changes the dress status.
    if (shouldClearDamaged(ctx, ctx.dmap[j.dress_id], j)) await ctx.sb.from('dresses').update({ status: 'available' }).eq('id', j.dress_id)
    ctx.say(isDmg(j) ? 'Repair approved.' : 'Quality check approved. Alteration complete.'); ctx.load(); setOpenId(null)
  }
  // Quality check failed: the same job goes back to At Tailoring Unit (no new status). The reason is kept in the job notes.
  async function sendBack(j: any) {
    const v = await ctx.ask('Send back to Tailoring Unit', [{ name: 'sent', label: 'Date sent back', type: 'date', value: today, required: true }, { name: 'expected', label: 'Expected return date', type: 'date', value: addD(today, 2), required: true }, { name: 'reason', label: 'What needs to be corrected', required: true }], { ok: 'Send back to tailor', note: 'The alteration is not up to the mark. The dress goes back to At Tailoring Unit and returns to Quality Check when received.' })
    if (!v) return
    if (v.expected < v.sent) return ctx.say('Expected return cannot be before the date sent back.')
    const reason = String(v.reason || '').trim(); if (!reason) return ctx.say('Say what needs to be corrected.')
    const { error } = await ctx.sb.from('alteration_jobs').update({ status: 'at_unit', sent_on: v.sent, expected_return: v.expected, received_at: null, checked_at: null, notes: [j.notes, `Sent back ${dmy(v.sent)} after quality check: ${reason}`].filter(Boolean).join(' · '), updated_at: new Date().toISOString() }).eq('id', j.id)
    if (error) return ctx.say('Could not send the dress back: ' + error.message)
    ctx.say('Dress sent back to the tailoring unit.'); ctx.load(); setOpenId(null)
  }
  const chooseTab = (next: Queue) => { setTab(next); setPage(1) }
  // Opened from a booking: show the requested alteration record in its own queue.
  useEffect(() => { const f = ctx.focus; if (f?.kind !== 'alteration') return; const j = jobs.find((x: any) => x.id === f.id); if (j) { chooseTab(j.source === 'damage' ? 'damaged' : j.status === 'ready' ? 'ready' : 'all'); setOpenId(j.id) } ctx.clearFocus?.() }, [ctx.focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const action = (j: any) => j.status === 'pending_dispatch' ? <button className="btn sm" onClick={() => dispatch(j)}>Send to Tailoring</button> : j.status === 'at_unit' ? <button className="btn sm" onClick={() => receive(j)}>Receive at Store</button> : j.status === 'quality_check' ? <button className="btn sm" onClick={() => setOpenId(j.id)}>Review</button> : <span className="alt-ready-mark">✓</span>
  const tabs: { id: Queue; label: string; n: number }[] = [
    { id: 'all', label: 'Alteration Queue', n: jobs.filter(j => j.status !== 'cancelled' && !isDmg(j) && !isCompleted(j, bookings)).length },
    { id: 'damaged', label: 'Damaged Queue', n: damaged.length },
    { id: 'at_unit', label: LABEL.at_unit, n: count('at_unit') }, { id: 'quality_check', label: LABEL.quality_check, n: count('quality_check') },
    { id: 'ready', label: LABEL.ready, n: count('ready') }, { id: 'completed', label: 'Completed', n: completed.length },
  ]

  return <div className="alt-page alt-reference">
    <PageHead icon="scissors" title="Alterations" sub="Manage dress alterations, tailoring dispatch and return status."><button className="btn wine" onClick={add}>＋ Add Alteration</button></PageHead>
    <div className="alt-overview-cards">{STAGES.map((s, i) => <button key={s} className={`alt-overview-card tone-${i}`} onClick={() => chooseTab(s)}><span className="alt-overview-icon"><Ic n={ICON[s]} s={32} /></span><span className="alt-overview-copy"><strong>{count(s)}</strong><b>{LABEL[s]}</b><small>{s === 'pending_dispatch' ? 'Measurements pending, or ready to send to the tailor' : s === 'at_unit' ? 'With tailoring unit' : s === 'quality_check' ? 'Received from tailoring, awaiting verification' : 'Alteration complete, ready for delivery'}</small></span></button>)}</div>
    <nav className="alt-queue-tabs" aria-label="Alteration queues">{tabs.map(t => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => chooseTab(t.id)}>{t.label}<span>{t.n}</span></button>)}</nav>
    <div className="alt-toolbar"><label className="alt-search"><span><Ic n="search" s={18} /></span><input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search by booking, customer, or dress..." /></label><label className="alt-filter"><span><Ic n="calendar" s={18} /></span><select aria-label="Delivery date filter" value={due} onChange={e => { setDue(e.target.value); setPage(1) }}><option value="">All Delivery Dates</option><option value={today}>Due Today</option><option value={addD(today, 1)}>Due Tomorrow</option></select></label><label className="alt-filter"><span><Ic n="dress" s={18} /></span><select aria-label="Dress category filter" value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}><option value="all">All Categories</option>{categories.map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}</select></label><label className="alt-filter"><span><Ic n="filter" s={18} /></span><select aria-label="Status filter" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="all">All Statuses</option>{STAGES.map(s => <option key={s} value={s}>{LABEL[s]}</option>)}</select></label></div>
    <section className="alt-queue-panel"><div className="alt-queue-heading"><h2>{tab === 'all' ? 'Alteration Queue' : tab === 'damaged' ? 'Damaged Queue' : tab === 'completed' ? 'Completed Alterations' : LABEL[tab as Stage]} <span>({filtered.length})</span></h2><small>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} alterations</small></div>
      <div className="scroll alt-table-scroll"><table className="bt alt-table"><thead><tr><th>Booking</th><th>Customer</th><th>Dress</th><th>Alterations Required</th><th>Delivery Date</th><th>Tailoring Details</th><th>Status</th><th>Action</th><th aria-label="More actions" /></tr></thead><tbody>
        {rows.map(j => { const b = bookings.find((x: any) => x.id === j.booking_id), d = ctx.dmap[j.dress_id], done = isCompleted(j, bookings), late = j.status === 'at_unit' && j.expected_return && j.expected_return < today, dmg = isDmg(j), nb = dmg ? bookings.filter((x: any) => x.dress_id === j.dress_id && ['pending', 'confirmed'].includes(x.status) && x.start_date >= today).sort((x: any, y: any) => x.start_date.localeCompare(y.start_date))[0] : b, left = nb ? Math.round((+new Date(nb.start_date) - +new Date(today)) / 864e5) : null; return <tr key={j.id} className={late ? 'late' : ''} onClick={() => setOpenId(j.id)}>
          <td><button className="alt-booking-link" onClick={e => { e.stopPropagation(); if (b) ctx.openBooking(b.id) }}>{j.booking_id}</button></td>
          <td><div className="alt-customer"><b>{b?.customer_name || '—'}</b><small>{dmg ? 'Returned damaged' : b?.phone || ''}</small></div></td>
          <td><div className="alt-dress-cell">{ctx.thumb(d, 48, 62)}<span><b>{d?.name || '—'}</b><small>SKU: {d?.code || '—'}</small></span></div></td>
          <td className="alt-requirements">{dmg && <span className="alt-dmg-tag">Damaged</span>}{j.measurements_pending && <span className="alt-dmg-tag" style={{ color: '#5b4100', background: '#fbe7b5' }}>Measurements pending</span>}{summarise(j)}</td><td>{dmg && !nb ? <span className="mut">No upcoming booking</span> : <b>{nb ? dmy(nb.start_date) : '—'}</b>}{left !== null && <small className={left <= 1 ? 'urgent' : ''}>{left < 0 ? `${Math.abs(left)} days overdue` : left === 0 ? 'Today' : left === 1 ? 'Tomorrow' : `In ${left} days`}</small>}</td>
          <td className="alt-tailoring-cell">{j.sent_on ? <><span>Sent {dmy(j.sent_on)}</span><span>Expected {j.expected_return ? dmy(j.expected_return) : '—'}</span></> : <span className="mut">Not sent yet</span>}</td>
          <td><span className={`alt-status status-${j.status}`}>{late ? 'Overdue' : done ? 'Completed' : (j.status === 'pending_dispatch' && j.measurements_pending ? 'Measurements Pending' : LABEL[j.status as Stage]) || j.status}</span></td><td onClick={e => e.stopPropagation()}>{action(j)}</td><td><button className="alt-more" aria-label="Open alteration details" onClick={e => { e.stopPropagation(); setOpenId(j.id) }}>⋮</button></td>
        </tr> })}
        {!rows.length && <tr><td colSpan={9} className="alt-empty">No alterations match this view.</td></tr>}
      </tbody></table></div>
      <footer className="alt-pagination"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} alterations</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>{Array.from({ length: pageCount }, (_, i) => i + 1).map(p => <button key={p} className={p === page ? 'on' : ''} onClick={() => setPage(p)}>{p}</button>)}<button disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next page">›</button></div></footer>
    </section>
    <p className="alt-foot">All Swaasa alteration work is temporary and reversible. No tailor assignment is required; dresses are sent to the tailoring unit.</p>
    {openId && jobs.find(j => j.id === openId) && <AlterationDrawer key={openId} ctx={ctx} job={jobs.find(j => j.id === openId)} onClose={() => setOpenId(null)} onDispatch={dispatch} onReceive={receive} onApprove={approve} onSendBack={sendBack} />}
  </div>
}
