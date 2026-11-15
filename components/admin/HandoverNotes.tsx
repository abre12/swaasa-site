'use client'
import { useCallback, useEffect, useState } from 'react'
import { dmy, todayIST, addD } from '@/lib/util'

// N-11: handover notes. A short note on a booking ("customer collecting at 5") or on a day ("tailor visiting at noon"), so it is not left to memory.
const label = (d: string, today: string) => d === today ? 'Today' : d === addD(today, 1) ? 'Tomorrow' : d < today ? `${dmy(d)} (earlier)` : dmy(d)

function Row({ n, ctx, showBooking }: { n: any; ctx: any; showBooking?: boolean }) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderTop: '1px solid #f1e8ea', opacity: n.done_at ? 0.6 : 1 }}>
    <input type="checkbox" checked={!!n.done_at} onChange={e => ctx.doneNote(n.id, e.target.checked)} aria-label={n.done_at ? 'Mark as not done' : 'Mark as done'} style={{ marginTop: 3 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ textDecoration: n.done_at ? 'line-through' : 'none' }}>{n.note}</div>
      <small className="mut">{[n.created_by_name, showBooking && n.booking_id, n.done_at && n.done_by_name ? `done by ${n.done_by_name}` : ''].filter(Boolean).join(' · ')}
        {showBooking && n.booking_id && <> <button type="button" className="textlink" onClick={() => ctx.openBooking(n.booking_id)}>open</button></>}</small></div></div>
}

/** Inside the booking screen: the notes for this booking. */
export function BookingNotes({ ctx, b }: { ctx: any; b: any }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const load = useCallback(async () => { const r = await ctx.sb.from('handover_notes').select('*').eq('booking_id', b.id).order('created_at'); setRows(r.error ? [] : r.data || []) }, [ctx.sb, b.id])
  useEffect(() => { load() }, [load, ctx.NOTES])
  if (!ctx.ops) return null
  return <section className="bd-card"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h3 style={{ margin: 0, flex: 1 }}>Handover notes</h3>
    <button type="button" className="btn alt sm" onClick={async () => { if (await ctx.addNote(b.id)) load() }}>+ Add note</button></div>
    {rows && !rows.length && <p className="mut" style={{ margin: '6px 0 0' }}>No notes. Add one for anything the next person should know, such as &ldquo;customer collecting at 5&rdquo;.</p>}
    {rows?.map(n => <Row key={n.id} n={n} ctx={ctx} />)}</section>
}

/** On the Dashboard: everything noted for today and the next days. */
export function DayNotes({ ctx }: { ctx: any }) {
  const today = todayIST(), notes: any[] = (ctx.NOTES || []).filter((n: any) => n.note_date <= addD(today, 3) && (!n.done_at || n.note_date >= today))
  const days = Array.from(new Set(notes.map(n => n.note_date))).sort()
  if (!notes.length) return <section className="slimbar" aria-label="Handover notes"><div><b>Notes for the next days</b><span className="mut">None</span></div>
    <button type="button" className="btn alt sm" onClick={() => ctx.addNote()}>+ Add note</button></section>
  return <section className="box" aria-label="Handover notes" style={{ padding: '10px 14px', marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h3 style={{ margin: 0, flex: 1 }}>Notes for the next days</h3>
      <button type="button" className="btn alt sm" onClick={() => ctx.addNote()}>+ Add note</button></div>
    {!notes.length && <p className="mut" style={{ margin: '6px 0 0' }}>No notes. Add one for the day, or from a booking.</p>}
    {days.map(d => <div key={d}><h4 style={{ margin: '8px 0 2px', fontSize: 13 }}>{label(d, today)}</h4>{notes.filter(n => n.note_date === d).map(n => <Row key={n.id} n={n} ctx={ctx} showBooking />)}</div>)}
  </section>
}
