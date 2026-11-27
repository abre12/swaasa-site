'use client'
import { useCallback, useEffect, useState } from 'react'
import { dmy } from '@/lib/util'
import PageHead from './PageHead'

// Website enquiries ("Plan a visit" and "Call me back"). Every enquiry is saved here the moment it arrives (migration v33), so
// nothing depends on a Telegram message being seen. The team moves each one along: New -> Contacted -> Visit booked -> Became a booking.
// Only the status and the team's own note can be changed (through lead_update); the customer's details are read-only.
const STATUS: [string, string][] = [
  ['new', 'New'], ['contacted', 'Contacted'], ['visit_booked', 'Visit booked'], ['converted', 'Became a booking'], ['not_interested', 'Not interested'], ['spam', 'Spam'],
]
const OPEN = ['new', 'contacted', 'visit_booked']
const label = (s: string) => STATUS.find(x => x[0] === s)?.[1] || s
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })

export default function Leads({ ctx }: { ctx: any }) {
  const [rows, setRows] = useState<any[] | null>(null), [tab, setTab] = useState<'open' | 'closed'>('open'), [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await ctx.sb.from('leads').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) setErr('Could not load the enquiries. Please reload the page.'); else { setErr(''); setRows(data || []) }
  }, [ctx.sb])
  useEffect(() => { void load() }, [load])

  async function save(l: any, status: string, note: string) {
    const { error } = await ctx.sb.rpc('lead_update', { p_id: l.id, p_status: status, p_note: note })
    if (error) { ctx.say('Could not save. Please try again.'); return }
    setRows(r => (r || []).map(x => x.id === l.id ? { ...x, status, staff_note: note || null } : x))
  }
  async function addNote(l: any) {
    const v = await ctx.ask('Note on this enquiry', [{ name: 'note', label: 'Your note (only the team sees it)', value: l.staff_note || '' }], { ok: 'Save note' })
    if (v) await save(l, l.status, String(v.note || '').trim())
  }

  const open = (rows || []).filter(l => OPEN.includes(l.status)), closed = (rows || []).filter(l => !OPEN.includes(l.status)), list = tab === 'open' ? open : closed
  return <div className="approval-page">
    <PageHead icon="phone" title="Enquiries" sub="People who asked for a visit or a call-back on the website. Call them, then update the status." />
    <div className="bk-tabs">
      <button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>To follow up<span className={'n' + (open.some(l => l.status === 'new') ? ' red' : '')}>{open.length}</span></button>
      <button className={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>Closed<span className="n">{closed.length}</span></button>
    </div>
    {err && <p role="alert"><b>{err}</b></p>}
    {rows === null && !err && <p className="mut">Loading…</p>}
    {rows !== null && !list.length && <p className="mut">{tab === 'open' ? 'No enquiries waiting. New ones from the website appear here and on Telegram.' : 'Nothing closed yet.'}</p>}
    <div className="bk-card-t scroll" style={{ display: list.length ? undefined : 'none' }}>
      <table className="bt"><thead><tr><th>Received</th><th>Customer</th><th>Wants</th><th>Dates</th><th>Status</th><th>Note</th></tr></thead>
        <tbody>{list.map(l => <tr key={l.id} className={l.status === 'new' ? 'today' : ''}>
          <td>{when(l.created_at)}<br /><small className="mut">{l.kind === 'callback' ? 'Call-back' : 'Studio visit'}</small></td>
          <td><b>{l.name}</b><br /><a href={`tel:${l.phone}`}>{l.phone}</a> · <a href={waLink(l.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a></td>
          <td>{l.looking_for || 'Not said'}{l.call_time && l.call_time !== 'Any time' ? <><br /><small className="mut">Call: {l.call_time.toLowerCase()}</small></> : null}{l.note ? <><br /><small>“{l.note}”</small></> : null}</td>
          <td>{l.event_date ? <>Event {dmy(l.event_date)}</> : <span className="mut">No event date</span>}{l.visit_date ? <><br />Visit {dmy(l.visit_date)}</> : null}</td>
          <td><select aria-label={`Status of the enquiry from ${l.name}`} value={l.status} onChange={e => save(l, e.target.value, l.staff_note || '')}>{STATUS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {l.status_changed_by && <><br /><small className="mut">{label(l.status)} by {l.status_changed_by}</small></>}</td>
          <td>{l.staff_note ? <small>{l.staff_note}</small> : null}<br /><button type="button" className="btn alt" onClick={() => addNote(l)}>{l.staff_note ? 'Edit note' : 'Add note'}</button></td>
        </tr>)}</tbody></table>
    </div>
    <p className="mut" style={{ fontSize: 12 }}>Spam and “not interested” enquiries are removed automatically after six months. Others are kept until you decide otherwise.</p>
  </div>
}
