'use client'
import { useEffect, useMemo, useState } from 'react'
import { addD, dmy, inr, nDays, todayIST } from '@/lib/util'
import { Ic } from './icons'

const ERR = (m: string) => m.includes('CLEAN_CONFLICT') ? 'This dress is booked or with a customer during those dates.' : m.includes('ALREADY_CLEANING') ? 'This dress is already out for dry cleaning.' : m.includes('dry_clean_requests_one_active_per_dress') ? 'This dress already has an active cleaning record.' : m
const retDate = (b: any) => b.returned_at ? new Date(b.returned_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : b.end_date
const ACTIVE = ['to_be_sent', 'sent', 'returned_pending_check']
const STAGE: Record<string, string> = { to_be_sent: 'To Be Sent', sent: 'Sent to Cleaner', returned_pending_check: 'Returned from Cleaner' }
const COND: Record<string, [string, string, string]> = { minor_marks: ['Minor Marks', 'search', 'var(--amber)'], needs_cleaning: ['Needs Cleaning', 'sparkle', 'var(--wine)'] }

// Adds a dress to the To Be Sent list. The dress stays at the shop; only Send to Cleaner marks it away.
export async function sendForDryCleaning(ctx: any, pre?: any) {
  const stateOf = (d: any) => {
    const act = ctx.CR.find((r: any) => r.dress_id === d.id && ACTIVE.includes(r.status))
    if (act) return `already ${STAGE[act.status]}`
    if (ctx.DC.some((r: any) => r.dress_id === d.id && !r.returned_on)) return 'already out for dry cleaning'
    if (ctx.B.some((b: any) => b.dress_id === d.id && b.status === 'out')) return 'out on rental'
    if (d.status === 'maintenance') return 'in maintenance'
    return ''
  }
  const list = ctx.D.filter((d: any) => !['archived', 'retired'].includes(d.status))
  const label = (d: any) => { const s = stateOf(d); return `${d.code} · ${d.name}${s ? ` — ${s}` : ' — at shop'}` }
  const v = await ctx.ask('Add dress to cleaning list', [
    { name: 'd', label: 'Dress (current status shown)', options: list.map(label), value: pre ? label(pre) : undefined, required: true },
    { name: 'condition', label: 'Condition', options: ['Minor Marks', 'Needs Cleaning'], required: true },
    { name: 'notes', label: 'Cleaning reason / condition note *', required: true }], { ok: 'Add to To Be Sent', note: 'The dress remains at the shop until staff confirm Send to Cleaner. Dresses already in a cleaning workflow, out on rental or in maintenance cannot be added.' })
  if (!v) return
  const d = list.find((x: any) => label(x) === v.d); if (!d) return ctx.say('Choose a dress.')
  const blocked = stateOf(d); if (blocked) return ctx.say(`${d.code} cannot be added: it is ${blocked}.`)
  if (!String(v.notes || '').trim()) return ctx.say('Add a cleaning reason or condition note.')
  const { error } = await ctx.sb.from('dry_clean_requests').insert({ dress_id: d.id, status: 'to_be_sent', condition: v.condition === 'Minor Marks' ? 'minor_marks' : 'needs_cleaning', condition_notes: v.notes.trim(), notes: v.notes.trim() })
  ctx.say(error ? ERR(error.message) : `${d.code} added to To Be Sent.`); ctx.load()
}

export default function DryCleaning({ ctx }: { ctx: any }) {
  const today = todayIST(), [tab, setTab] = useState<'to_send' | 'sent' | 'returned' | 'history'>('to_send'), [q, setQ] = useState(''), [cf, setCf] = useState('')
  const [sel, setSel] = useState<string[]>([]), [menu, setMenu] = useState<{ r: any; x: number; y: number } | null>(null), [view, setView] = useState<any>(null)
  const CR: any[] = ctx.CR || []
  useEffect(() => { const c = () => setMenu(null); document.addEventListener('click', c); window.addEventListener('scroll', c, true); return () => { document.removeEventListener('click', c); window.removeEventListener('scroll', c, true) } }, [])
  const queue = CR.filter(r => r.status === 'to_be_sent'), sent = CR.filter(r => r.status === 'sent'), returned = CR.filter(r => r.status === 'returned_pending_check'), history = CR.filter(r => r.status === 'complete')
  const matches = (r: any) => { const d = ctx.dmap[r.dress_id]; return (!q || `${d?.code} ${d?.name} ${r.vendor || ''} ${r.condition_notes || ''}`.toLowerCase().includes(q.toLowerCase())) && (!cf || r.condition === cf) }
  const nextBooking = (did: string) => ctx.B.filter((b: any) => b.dress_id === did && ['pending', 'confirmed'].includes(b.status) && b.start_date >= today).sort((a: any, b: any) => a.start_date.localeCompare(b.start_date))[0]
  const daysTo = (b: any) => b ? nDays(today, b.start_date) - 1 : null
  const staff = (id: string) => ctx.staffName(id) || '—'

  // Booking risk for a dress that is with the cleaner
  const risk = (r: any) => {
    const b = nextBooking(r.dress_id), d = daysTo(b); if (!b || d === null) return null
    const lateBack = r.expected_back && r.expected_back >= addD(b.start_date, -1)
    if (d <= 3) return { lvl: 'Critical', c: 'var(--red)', b, d, text: `This dress is still with the cleaner and is due for delivery to a customer ${d <= 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}.${lateBack ? ' Its expected return is too late for that delivery.' : ''}` }
    if (lateBack) return { lvl: 'Warning', c: 'var(--amber)', b, d, text: `Expected return (${dmy(r.expected_back)}) is close to or after the next delivery on ${dmy(b.start_date)}.` }
    if (d <= 14) return { lvl: 'Attention', c: 'var(--mut)', b, d, text: `Next booking in ${d} days. Monitor the cleaning timeline.` }
    return null
  }
  const priority = (d: number | null) => d !== null && d <= 3 ? ['High', 'var(--red)'] : d !== null && d <= 7 ? ['Medium', 'var(--amber)'] : ['Normal', 'var(--mut)']

  async function dispatch(rs: any[]) {
    const first = ctx.dmap[rs[0].dress_id], multi = rs.length > 1
    const v = await ctx.ask(multi ? `Send ${rs.length} dresses to cleaner` : 'Send to Cleaner', [{ name: 'vendor', label: 'Cleaner / vendor name', required: true }, { name: 'sent', label: 'Date sent', type: 'date', value: today, required: true }, { name: 'expected', label: 'Expected return date', type: 'date', value: addD(today, 3), required: true }, { name: 'cost', label: multi ? 'Estimated cost per dress (₹)' : 'Estimated cleaning cost (₹)', type: 'number', value: String(first?.dry_clean_charge || 0) }, { name: 'notes', label: 'Dispatch notes' }],
      { ok: 'Confirm dispatch', note: `Once confirmed, ${multi ? 'these dresses' : 'this dress'} will be marked as Out for Dry Cleaning and will be unavailable for booking until ${multi ? 'they return' : 'it returns'} and pass${multi ? '' : 'es'} final confirmation.` }); if (!v) return
    if (v.expected < v.sent) return ctx.say('Expected return cannot be before the date sent.')
    const actor = (await ctx.sb.auth.getUser()).data.user?.id; const done: string[] = []; const failed: string[] = []
    for (const r of rs) {
      const d = ctx.dmap[r.dress_id]
      const { data: dc, error } = await ctx.sb.from('dry_cleanings').insert({ dress_id: r.dress_id, sent_on: v.sent, expected_back: v.expected, charge: +(v.cost || 0), notes: v.notes.trim() || r.condition_notes || null }).select('id').single()
      if (error) { failed.push(`${d?.code}: ${ERR(error.message)}`); continue }
      const up = await ctx.sb.from('dry_clean_requests').update({ status: 'sent', vendor: v.vendor.trim(), sent_on: v.sent, sent_by: actor || null, expected_back: v.expected, estimated_charge: +(v.cost || 0), notes: v.notes.trim() || null, dry_cleaning_id: dc.id }).eq('id', r.id)
      if (up.error) { failed.push(`${d?.code}: queue update needs attention`); continue }
      done.push(d?.code || 'Dress')
      const k = risk({ ...r, expected_back: v.expected })
      if (k && (k.lvl === 'Critical' || k.lvl === 'Warning')) await ctx.sb.from('admin_notifications').insert({ target_role: 'all', kind: 'cleaning_risk', title: `Delivery risk: ${d?.code} is with the cleaner`, body: k.text, booking_id: k.b.id })
    }
    setSel([]); ctx.say(failed.length ? `Sent ${done.length}. ${failed.join(' · ')}` : `${done.join(', ')} sent to ${v.vendor}.`); ctx.load()
  }
  async function markReturned(r: any) {
    const v = await ctx.ask('Returned from Cleaner', [{ name: 'date', label: 'Actual return date', type: 'date', value: today, required: true }, { name: 'cost', label: 'Final cleaning cost (₹)', type: 'number', value: String(r.estimated_charge || 0), required: true }, { name: 'condition', label: 'Condition after cleaning', options: ['Ready', 'Maintenance required', 'Alteration required'], required: true }, { name: 'notes', label: 'Final inspection notes' }], { ok: 'Record return for inspection', note: 'This records that the dress is back at the shop. Confirm availability only after the final inspection.' }); if (!v) return
    if (v.date < r.sent_on) return ctx.say('Return date cannot be before the date sent.')
    const { error } = await ctx.sb.from('dry_cleanings').update({ charge: +v.cost, notes: [r.notes, v.notes].filter(Boolean).join(' · ') || null }).eq('id', r.dry_cleaning_id)
    if (error) return ctx.say(ERR(error.message))
    const actor = (await ctx.sb.auth.getUser()).data.user?.id
    const up = await ctx.sb.from('dry_clean_requests').update({ status: 'returned_pending_check', returned_on: v.date, returned_by: actor || null, final_charge: +v.cost, returned_condition: v.condition, return_notes: v.notes.trim() || null }).eq('id', r.id)
    if (up.error) return ctx.say('Dress is back, but the final inspection could not be saved.')
    const paid = await ctx.sb.from('cash_expenses').select('id').eq('dry_cleaning_id', r.dry_cleaning_id).is('voided_at', null).maybeSingle()
    if (!paid.data && +v.cost > 0) { const pay = await ctx.ask('Record cleaner payment?', [{ name: 'mode', label: 'Payment mode', options: ['Cash', 'GPay / UPI', 'Card', 'Bank transfer', 'Not paid yet'], value: 'Cash' }], { ok: 'Continue', note: `Final charge ${inr(+v.cost)}. If already paid, select the payment mode used.` }); if (pay && pay.mode !== 'Not paid yet') await ctx.sb.rpc('record_wash_payment', { p_wash: r.dry_cleaning_id, p_mode: pay.mode }) }
    ctx.say('Dress returned and is waiting for final inspection.'); ctx.load()
  }
  async function finish(r: any, route: 'ready' | 'maintenance' | 'alteration' | 'review') {
    const d = ctx.dmap[r.dress_id], actor = (await ctx.sb.auth.getUser()).data.user?.id || null, now = new Date().toISOString()
    const close = async (note?: string) => { await ctx.sb.from('dry_cleanings').update({ returned_on: r.returned_on }).eq('id', r.dry_cleaning_id); await ctx.sb.from('dry_clean_requests').update({ status: 'complete', completed_at: now, completed_by: actor, ...(note ? { return_notes: note } : {}) }).eq('id', r.id) }
    if (route === 'ready') {
      const v = await ctx.ask('Confirm & Make Available', [{ name: 'note', label: 'Final inspection note (optional)', value: r.return_notes || '' }], { ok: 'Make available', note: `Confirm ${d?.code || 'this dress'} passed its final inspection.` }); if (!v) return
      await close(v.note.trim() || undefined)
      await ctx.sb.from('dresses').update({ status: 'available', condition: v.note.trim() || 'Ready after dry cleaning' }).eq('id', r.dress_id)
      ctx.say(`${d?.code || 'Dress'} confirmed available.`)
    } else if (route === 'maintenance' || route === 'review') {
      const rev = route === 'review'
      const v = await ctx.ask(rev ? 'Route to Issue Review' : 'Route to Maintenance', [{ name: 'note', label: rev ? 'Issue to review' : 'Maintenance issue', value: r.return_notes || '', required: true }], { ok: rev ? 'Route to review' : 'Route to maintenance', note: 'The dress stays unavailable until this is resolved.' }); if (!v) return
      await ctx.sb.from('dresses').update({ status: rev ? 'unavailable' : 'maintenance', condition: v.note.trim() }).eq('id', r.dress_id)
      await ctx.sb.from('admin_notifications').insert({ target_role: 'owner', kind: 'maintenance', title: rev ? 'Dress needs review' : 'Maintenance review needed', body: `${d?.code || 'Dress'} returned from cleaner: ${v.note.trim()}` })
      await close(v.note.trim()); ctx.say(`${d?.code || 'Dress'} routed to ${rev ? 'issue review' : 'maintenance'}.`)
    } else {
      const book = nextBooking(r.dress_id); if (!book) return ctx.say('An alteration needs an upcoming booking for this dress. Add it from the booking details or the Alterations page.')
      const v = await ctx.ask('Route to Alterations', [{ name: 'requirements', label: 'Alteration requirements', value: r.return_notes || '', required: true }], { ok: 'Create alteration job' }); if (!v) return
      const { error } = await ctx.sb.from('alteration_jobs').insert({ booking_id: book.id, dress_id: r.dress_id, requirements: v.requirements.trim(), status: 'pending_dispatch' }); if (error) return ctx.say(error.message)
      await ctx.sb.from('dresses').update({ status: 'maintenance', condition: 'Awaiting alteration' }).eq('id', r.dress_id)
      await close(); ctx.say('Alteration job created.'); ctx.go('alterations')
    }
    ctx.load()
  }
  async function editNotes(r: any) { const v = await ctx.ask('Edit cleaning notes', [{ name: 'n', label: 'Condition notes', value: r.condition_notes || '', required: true }], { ok: 'Save notes' }); if (!v) return; const { error } = await ctx.sb.from('dry_clean_requests').update({ condition_notes: v.n.trim() }).eq('id', r.id); ctx.say(error ? error.message : 'Notes updated.'); ctx.load() }
  async function remove(r: any) { if (!(await ctx.askYes('Remove from cleaning list?', `${ctx.dmap[r.dress_id]?.code} is still at the shop. This cancels the cleaning record; the history of the return is kept.`, 'Remove'))) return; const { error } = await ctx.sb.from('dry_clean_requests').update({ status: 'cancelled' }).eq('id', r.id); ctx.say(error ? error.message : 'Removed from the cleaning list.'); setSel(s => s.filter(x => x !== r.id)); ctx.load() }
  async function photos(r: any) {
    if (!r.inspection_id) return ctx.say('No return inspection is linked to this record (it was added manually or before inspections existed).')
    const { data, error } = await ctx.sb.from('return_inspections').select('photos,notes,inspected_at,inspected_by').eq('id', r.inspection_id).maybeSingle()
    if (error || !data) return ctx.say('Could not load the return inspection.')
    if (!(data.photos || []).length) return ctx.say('No photos were attached to this return inspection.')
    setView({ type: 'photos', r, data })
  }

  // ---- summary ----
  const month = today.slice(0, 7)
  const expenses = CR.filter(r => r.returned_on && r.returned_on.slice(0, 7) === month).reduce((s, r) => s + (r.final_charge ?? r.estimated_charge ?? 0), 0)
  const turns = CR.filter(r => r.sent_on && r.returned_on).map(r => nDays(r.sent_on, r.returned_on) - 1)
  const avg = turns.length ? (turns.reduce((a, b) => a + b, 0) / turns.length).toFixed(1) : null
  const summary: [string, any, string, string, string][] = [['To Be Sent', queue.length, 'clock', 'var(--amber)', 'At shop – waiting to send'], ['With Cleaner', sent.length, 'sparkle', 'var(--purple)', 'Currently out'], ['Returned', returned.length, 'check', 'var(--green)', 'Awaiting confirmation'], ['Cleaning Expenses', inr(expenses), 'coins', 'var(--wine)', 'This month'], ['Avg. Turnaround', avg ? `${avg} Days` : '—', 'clock', 'var(--blue)', avg ? `Sent → returned (${turns.length})` : 'No completed cycles yet']]
  const critical = sent.filter(r => risk(r)?.lvl === 'Critical')
  const cell = (r: any) => { const d = ctx.dmap[r.dress_id]; return <div className="dr">{ctx.thumb(d, 40, 52)}<div><b>{d?.code || '—'}</b><span>{d?.name || 'Dress'}</span>{r.booking_id && <button type="button" className="textlink dry-booking-link" onClick={() => ctx.openBooking(r.booking_id)}>Booking {r.booking_id}</button>}</div></div> }
  const pill = (t: string, c: string, ic?: string) => <span className="bdg" style={{ '--c': c } as any}>{ic && <Ic n={ic} s={12} />}{t}</span>
  const tabs: [typeof tab, string, number][] = [['to_send', 'To Be Sent', queue.length], ['sent', 'Sent to Cleaner', sent.length], ['returned', 'Returned', returned.length], ['history', 'History', history.length]]
  const vq = queue.filter(matches), allSel = vq.length > 0 && vq.every(r => sel.includes(r.id))
  const th = (cols: string[]) => <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>

  return <div className="dry-page">
    <div className="pg-head"><div><h1>Dry Cleaning &amp; Dress Care</h1><p>Manage dresses that require dry cleaning, track dresses sent to cleaners, monitor return status, costs and turnaround time.</p></div><button className="btn" onClick={() => sendForDryCleaning(ctx)}>＋ Add to Cleaning List</button></div>
    <div className="k6 dry-cards" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>{summary.map(([l, v, ic, c, sub]) => <div className="kc" key={l} style={{ '--c': c } as any}><Ic n={ic} s={28} /><div><b>{v}</b><span>{l}</span><small>{sub}</small></div></div>)}</div>
    <div className="bk-tabs">{tabs.map(([k, l, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span className="n">{n}</span></button>)}</div>
    <div className="bk-bar dry-tools"><div className="bk-search"><Ic n="search" s={18} /><input placeholder="Search dress code, name, cleaner or note" value={q} onChange={e => setQ(e.target.value)} /></div>
      <select className="dry-flt" value={cf} onChange={e => setCf(e.target.value)} aria-label="Filter by condition"><option value="">All conditions</option><option value="needs_cleaning">Needs Cleaning</option><option value="minor_marks">Minor Marks</option></select>
      {tab === 'to_send' && sel.length > 0 && <button className="btn" onClick={() => dispatch(queue.filter(r => sel.includes(r.id)))}>Send {sel.length} selected to cleaner</button>}</div>

    {tab === 'to_send' && <div className="bk-card-t scroll"><table className="bt dry-t">{th(['', 'Dress / Code', 'Returned on', 'Condition (at return)', 'Notes', 'Next booking', 'Days left', 'Priority', 'Action'])}<tbody>
      {vq.map(r => { const b = nextBooking(r.dress_id), d = daysTo(b), [pl, pc] = priority(d), cd = COND[r.condition] || COND.needs_cleaning
        return <tr key={r.id}><td data-l="Select"><input type="checkbox" aria-label="Select dress" checked={sel.includes(r.id)} onChange={e => setSel(s => e.target.checked ? [...s, r.id] : s.filter(x => x !== r.id))} /></td><td>{cell(r)}</td>
          <td data-l="Returned on">{r.booking_id ? dmy(retDate(ctx.B.find((x: any) => x.id === r.booking_id) || {})) : dmy(r.added_at?.slice(0, 10))}</td>
          <td data-l="Condition">{pill(cd[0], cd[2], cd[1])}</td><td data-l="Notes" style={{ whiteSpace: 'normal', minWidth: 160 }}>{r.condition_notes || '—'}</td>
          <td data-l="Next booking">{b ? dmy(b.start_date) : '—'}</td><td data-l="Days left">{d !== null ? <span className={d <= 3 ? 'bad' : ''}>{d <= 0 ? 'Today' : `${d} day${d === 1 ? '' : 's'}`}</span> : '—'}</td>
          <td data-l="Priority">{pill(pl, pc as string)}</td>
          <td data-l="Action"><div className="dry-actions"><button className="btn sm" onClick={() => dispatch([r])}>Send to Cleaner</button><button className="dry-more" aria-label="More actions" onClick={e => { e.stopPropagation(); const k = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ r, x: k.right, y: k.bottom }) }}>⋯</button></div></td></tr> })}
      {!vq.length && <tr><td colSpan={9} className="mut">No dresses waiting to be sent.</td></tr>}</tbody></table></div>}

    {tab === 'sent' && <>
      {critical.length > 0 && <div className="dry-alert" role="alert"><Ic n="warn" s={20} /><div><b>Critical delivery risk</b><span>{critical.length} dress{critical.length === 1 ? ' is' : 'es are'} still with the cleaner and due for delivery within 3 days: {critical.map(r => ctx.dmap[r.dress_id]?.code).join(', ')}.</span></div></div>}
      <div className="bk-card-t scroll"><table className="bt dry-t">{th(['Dress / Code', 'Cleaner', 'Date sent', 'Expected return', 'Return in', 'Next booking', 'Est. cost', 'Status', 'Action'])}<tbody>
        {sent.filter(matches).map(r => { const k = risk(r), overdue = r.expected_back < today, left = nDays(today, r.expected_back) - 1
          return <tr key={r.id} className={k?.lvl === 'Critical' || overdue ? 'od' : ''}><td>{cell(r)}</td><td data-l="Cleaner">{r.vendor || '—'}</td><td data-l="Date sent">{dmy(r.sent_on)}</td><td data-l="Expected return">{dmy(r.expected_back)}</td>
            <td data-l="Return in">{overdue ? <b className="bad">Overdue {Math.abs(left)}d</b> : left === 0 ? 'Today' : `${left} day${left === 1 ? '' : 's'}`}</td>
            <td data-l="Next booking" style={{ whiteSpace: 'normal', minWidth: 190 }}>{k ? <><b>{dmy(k.b.start_date)}</b> · {k.d <= 0 ? 'today' : `${k.d}d`}<div className="dry-risk" style={{ '--c': k.c } as any}><b>{k.lvl}</b> {k.text}</div></> : '—'}</td>
            <td data-l="Est. cost">{inr(r.estimated_charge)}</td><td data-l="Status">{pill('Out for Dry Cleaning', 'var(--purple)')}</td><td data-l="Action"><button className="btn sm" onClick={() => markReturned(r)}>Mark as Returned</button></td></tr> })}
        {!sent.filter(matches).length && <tr><td colSpan={9} className="mut">No dresses are with a cleaner.</td></tr>}</tbody></table></div></>}

    {tab === 'returned' && <div className="bk-card-t scroll"><table className="bt dry-t">{th(['Dress / Code', 'Cleaner', 'Returned on', 'Final cost', 'Condition after cleaning', 'Notes', 'Final inspection'])}<tbody>
      {returned.filter(matches).map(r => <tr key={r.id}><td>{cell(r)}</td><td data-l="Cleaner">{r.vendor || '—'}</td><td data-l="Returned on">{dmy(r.returned_on)}</td><td data-l="Final cost">{inr(r.final_charge || 0)}</td><td data-l="Condition">{r.returned_condition || 'Inspection needed'}</td><td data-l="Notes" style={{ whiteSpace: 'normal' }}>{r.return_notes || '—'}</td>
        <td data-l="Action"><div className="dry-actions"><button className="btn sm" onClick={() => finish(r, 'ready')}>Confirm &amp; Make Available</button><button className="btn alt sm" onClick={() => finish(r, 'maintenance')}>Maintenance</button><button className="btn alt sm" onClick={() => finish(r, 'alteration')}>Alteration</button><button className="btn alt sm" onClick={() => finish(r, 'review')}>Issue Review</button></div></td></tr>)}
      {!returned.filter(matches).length && <tr><td colSpan={7} className="mut">No returned dresses are waiting for final inspection.</td></tr>}</tbody></table></div>}

    {tab === 'history' && <div className="bk-card-t scroll"><table className="bt dry-t">{th(['Dress / Code', 'Added', 'Condition at return', 'Return notes', 'Sent', 'Cleaner', 'Expected', 'Returned', 'Turnaround', 'Est. cost', 'Final cost', 'After cleaning', 'Staff', 'Photos'])}<tbody>
      {history.filter(matches).map(r => <tr key={r.id}><td>{cell(r)}</td><td data-l="Added">{dmy(r.added_at?.slice(0, 10))}</td><td data-l="Condition">{(COND[r.condition] || COND.needs_cleaning)[0]}</td><td data-l="Return notes" style={{ whiteSpace: 'normal', minWidth: 150 }}>{r.condition_notes || '—'}</td>
        <td data-l="Sent">{r.sent_on ? dmy(r.sent_on) : '—'}</td><td data-l="Cleaner">{r.vendor || '—'}</td><td data-l="Expected">{r.expected_back ? dmy(r.expected_back) : '—'}</td><td data-l="Returned">{r.returned_on ? dmy(r.returned_on) : '—'}</td>
        <td data-l="Turnaround">{r.sent_on && r.returned_on ? `${nDays(r.sent_on, r.returned_on) - 1} days` : '—'}</td><td data-l="Est. cost">{inr(r.estimated_charge || 0)}</td><td data-l="Final cost">{inr(r.final_charge ?? r.estimated_charge ?? 0)}</td>
        <td data-l="After cleaning" style={{ whiteSpace: 'normal' }}>{r.returned_condition || '—'}{r.return_notes ? <div className="mut" style={{ fontSize: 12 }}>{r.return_notes}</div> : null}</td>
        <td data-l="Staff" style={{ whiteSpace: 'normal', fontSize: 12 }}>Added {staff(r.added_by)}<br />Sent {staff(r.sent_by)}<br />Returned {staff(r.returned_by)}<br />Confirmed {staff(r.completed_by)}</td>
        <td data-l="Photos">{r.inspection_id ? <button className="textlink" onClick={() => photos(r)}>View</button> : '—'}</td></tr>)}
      {!history.filter(matches).length && <tr><td colSpan={14} className="mut">No completed cleaning records yet.</td></tr>}</tbody></table></div>}

    {menu && <div className="dry-menu" style={{ top: menu.y + 4, left: Math.max(8, menu.x - 210) }} onClick={e => e.stopPropagation()}>
      <button onClick={() => { setView({ type: 'record', r: menu.r }); setMenu(null) }}>View cleaning record</button><button onClick={() => { editNotes(menu.r); setMenu(null) }}>Edit notes</button><button onClick={() => { photos(menu.r); setMenu(null) }}>View return photos</button><button className="danger" onClick={() => { remove(menu.r); setMenu(null) }}>Remove from cleaning list</button></div>}

    {view && <div className="dry-modal" onClick={() => setView(null)}><div className="box" onClick={e => e.stopPropagation()}>
      <div className="dry-mh"><b>{view.type === 'photos' ? 'Return photos' : 'Cleaning record'} · {ctx.dmap[view.r.dress_id]?.code}</b><button onClick={() => setView(null)} aria-label="Close">✕</button></div>
      {view.type === 'photos' ? <><div className="dry-ph">{view.data.photos.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Return condition" /></a>)}</div>{view.data.notes && <p className="mut">{view.data.notes}</p>}<small className="mut">Inspected {dmy(view.data.inspected_at.slice(0, 10))} by {staff(view.data.inspected_by)}</small></>
        : <dl className="dry-rec">{([['Stage', STAGE[view.r.status] || view.r.status], ['Condition at return', (COND[view.r.condition] || COND.needs_cleaning)[0]], ['Notes', view.r.condition_notes || '—'], ['Added', `${dmy(view.r.added_at.slice(0, 10))} by ${staff(view.r.added_by)}`], ['Booking', view.r.booking_id || 'Added manually'], ['Cleaner', view.r.vendor || '—'], ['Sent', view.r.sent_on ? dmy(view.r.sent_on) : '—'], ['Expected return', view.r.expected_back ? dmy(view.r.expected_back) : '—'], ['Estimated cost', inr(view.r.estimated_charge || 0)]] as [string, string][]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    </div></div>}
  </div>
}
