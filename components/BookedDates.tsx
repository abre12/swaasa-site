'use client'
import { useEffect, useState } from 'react'
import { supa } from '@/lib/supabase/client'
const fmt = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
// Shows when THIS dress is already taken. Only dates are shown, never customer details.
export default function BookedDates({ dressId }: { dressId: string }) {
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => { supa().rpc('dress_busy', { p_dress: dressId }).then(({ data }) => setRows(data || [])) }, [dressId])
  if (rows === null) return <div className="box"><p className="mut" style={{ margin: 0 }}>Checking booked dates…</p></div>
  const list = [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date))
  return (<div className="box"><h3>Booked dates</h3>
    {list.length ? <>
      {list.map((r, k) => { const end = r.end_date || r.hold_end; return <div key={k} className="row"><span>{fmt(r.start_date)}{end !== r.start_date ? ` – ${fmt(end)}` : ''}</span><span className="bad">Not available</span></div> })}
      <p className="mut" style={{ fontSize: 12, marginBottom: 0 }}>A day is kept after each booking for cleaning and preparation. Please choose dates outside these.</p></>
      : <p className="ok" style={{ marginBottom: 0 }}>No upcoming bookings. This dress is free on all dates.</p>}</div>)
}
