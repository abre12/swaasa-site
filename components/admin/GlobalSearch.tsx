'use client'
import { useEffect, useRef, useState } from 'react'
import { dmy } from '@/lib/util'

// SU-5: one search box for staff. Booking ID, phone number, customer name or dress code. It asks the database, so older bookings are found too.
const STATUS: Record<string, string> = { pending: 'Pending', confirmed: 'Confirmed', out: 'Out', returned: 'Returned', cancelled: 'Cancelled' }
const clean = (t: string) => t.replace(/[%,()*\\]/g, ' ').trim()

export default function GlobalSearch({ ctx }: { ctx: any }) {
  const [q, setQ] = useState(''), [rows, setRows] = useState<any[]>([]), [busy, setBusy] = useState(false), [open, setOpen] = useState(false), [cur, setCur] = useState(0)
  const box = useRef<HTMLDivElement>(null), inp = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = clean(q), digits = q.replace(/\D/g, '')
    if (t.length < 2) { setRows([]); setBusy(false); return }
    let live = true; setBusy(true)
    const timer = setTimeout(async () => {
      const text = ctx.sb.from('booking_view').select('id,customer_name,phone,dress_code,dress_name,start_date,end_date,status').or(`id.ilike.%${t}%,customer_name.ilike.%${t}%,dress_code.ilike.%${t}%`).order('start_date', { ascending: false }).limit(8)
      const byPhone = digits.length >= 4
        ? ctx.sb.from('customers').select('id').like('phone_key', `%${digits}%`).limit(10).then(async (c: any) => {
            const ids = (c.data || []).map((x: any) => x.id); if (!ids.length) return { data: [] }
            return ctx.sb.from('booking_view').select('id,customer_name,phone,dress_code,dress_name,start_date,end_date,status').in('customer_id', ids).order('start_date', { ascending: false }).limit(8)
          })
        : Promise.resolve({ data: [] })
      const [a, b] = await Promise.all([text, byPhone]); if (!live) return
      const seen = new Set<string>(), all: any[] = []
      for (const r of [...(b.data || []), ...(a.data || [])]) if (!seen.has(r.id)) { seen.add(r.id); all.push(r) }
      all.sort((x, y) => String(y.start_date).localeCompare(String(x.start_date)))
      setRows(all.slice(0, 8)); setCur(0); setBusy(false)
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [q, ctx.sb])

  useEffect(() => { const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f) }, [])
  const pick = (r: any) => { setOpen(false); setQ(''); setRows([]); ctx.openBooking(r.id) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { if (q) setQ(''); else inp.current?.blur(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur(c => Math.min(rows.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(c => Math.max(0, c - 1)) }
    else if (e.key === 'Enter' && rows[cur]) { e.preventDefault(); pick(rows[cur]) }
  }
  const showList = open && clean(q).length >= 2
  return <div className="gs" ref={box}>
    <input ref={inp} type="search" value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKey}
      placeholder="Search booking ID, phone, name or dress code" aria-label="Search bookings" role="combobox" aria-expanded={showList} aria-controls="gs-list" aria-autocomplete="list" autoComplete="off" />
    {showList && <div className="gs-list" id="gs-list" role="listbox">
      {busy && !rows.length && <div className="gs-none">Searching…</div>}
      {!busy && !rows.length && <div className="gs-none">No booking found for &ldquo;{q.trim()}&rdquo;.</div>}
      {rows.map((r, i) => <button key={r.id} type="button" role="option" aria-selected={i === cur} className={'gs-row' + (i === cur ? ' on' : '')} onMouseEnter={() => setCur(i)} onClick={() => pick(r)}>
        <span className="gs-main"><b>{r.dress_code}</b> {r.dress_name}</span>
        <span className="gs-sub">{r.customer_name}{r.phone ? ` · ${r.phone}` : ''}</span>
        <span className="gs-sub">{dmy(r.start_date)} → {dmy(r.end_date)} · {r.id}</span>
        <span className={'gs-st gs-' + r.status}>{STATUS[r.status] || r.status}</span></button>)}
    </div>}
  </div>
}
