'use client'
import { fetchAll } from '@/lib/fetchAll'
import { useEffect, useMemo, useRef, useState } from 'react'
import PageHead from './PageHead'
import { Ic } from './icons'
import { dbMsg, dmy, inr, phoneKey, phoneValid, PHONE_HELP } from '@/lib/util'

const bookingCount = (r: any) => r.bookings.filter((b: any) => b.status !== 'cancelled').length
const dueOf = (b: any) => b.status === 'cancelled' ? 0 : Math.max(0, b.rent + b.charges - b.paid)
const initials = (name: string) => (name || '?').trim().split(/\s+/).map((x: string) => x[0]).slice(0, 2).join('').toUpperCase()

export default function Customers({ ctx }: { ctx: any }) {
  const [profiles, setProfiles] = useState<any[]>([]), [query, setQuery] = useState(''), [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(''), [notes, setNotes] = useState(''), [detailTab, setDetailTab] = useState<'overview' | 'history' | 'notes'>('overview'), [page, setPage] = useState(1)
  const initializedSelection = useRef(false)
  // Customers are people, not phone numbers (N-3): the customers table keeps two people on one family number apart. Needs every booking for the history.
  const [people, setPeople] = useState<any[]>([])
  useEffect(() => { ctx.ensureFrom(ctx.ALL_TIME) }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(() => ctx.sb.from('customers').select('*').order('name').order('id')).then(({ data }: any) => { if (data) setPeople(data) }) }, [ctx.sb, ctx.fullTick])
  useEffect(() => { fetchAll(() => ctx.sb.from('customer_profiles').select('*').order('name').order('phone')).then(({ data }: any) => { if (data) setProfiles(data) }) }, [ctx.sb, ctx.fullTick])   // paged (no 1,000-row cut) and refreshed with each full load, not every poll

  const rows = useMemo(() => {
    const map: Record<string, any> = {}
    const mk = (key: string, name: string, phone: string, email: string, pk: string) => (map[key] ||= { key, name, phone, email: email || '', pk, bookings: [], spent: 0, collected: 0, owing: 0, last: '', notes: '', profilePhone: '', fromBooking: false })
    for (const p of people) mk(p.id, p.name, p.phone_key, p.email, p.phone_key)
    for (const b of ctx.B) {
      const pk = phoneKey(b.phone); if (!b.customer_id && !pk) continue
      const row = mk(b.customer_id || 'p:' + pk, b.customer_name, b.phone, b.email, pk)
      if (!row.fromBooking) { row.phone = b.phone; row.fromBooking = true }      // the most recent booking's phone, as it was typed
      row.bookings.push(b); row.email ||= b.email || ''; row.name ||= b.customer_name
      if (b.status !== 'cancelled') row.spent += Math.max(0, (b.rent || 0) + (b.charges || 0))
      row.collected += Math.max(0, b.paid || 0); row.owing += dueOf(b)
      if (b.start_date > row.last) row.last = b.start_date
    }
    for (const profile of profiles) {       // owner notes are still kept per phone number
      const pk = phoneKey(profile.phone); if (!pk) continue
      let hit = false
      for (const row of Object.values(map)) if (row.pk === pk) { hit = true; row.notes = profile.notes || ''; row.profilePhone = profile.phone; row.email ||= profile.email || '' }
      if (!hit) mk('p:' + pk, profile.name, profile.phone, profile.email, pk).notes = profile.notes || ''
    }
    const share: Record<string, number> = {}; for (const r of Object.values(map)) share[r.pk] = (share[r.pk] || 0) + 1
    for (const r of Object.values(map)) r.sharedWith = share[r.pk] > 1 ? Object.values(map).filter((o: any) => o.pk === r.pk && o.key !== r.key) : []
    return Object.values(map).sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name))
  }, [ctx.B, profiles, people])

  const filtered = rows.filter(c => {
    const text = `${c.name} ${c.phone} ${c.email}`.toLowerCase()
    if (query && !text.includes(query.toLowerCase())) return false
    if (filter === 'repeat' && bookingCount(c) < 2) return false
    if (filter === 'outstanding' && c.owing <= 0) return false
    if (filter === 'one_time' && bookingCount(c) !== 1) return false
    return true
  })
  const repeat = rows.filter(c => bookingCount(c) >= 2).length, owing = rows.filter(c => c.owing > 0).length
  const totalOwing = rows.reduce((s, c) => s + c.owing, 0), pageSize = 8, pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const selectedRow = rows.find(c => c.key === selected)
  const selectedBookings = selectedRow?.bookings.slice().sort((a: any, b: any) => b.start_date.localeCompare(a.start_date)) || []
  const recent = selectedBookings.find((b: any) => b.status !== 'cancelled') || selectedBookings[0]
  useEffect(() => {
    if (!initializedSelection.current && filtered.length) { initializedSelection.current = true; setSelected(filtered[0].key); setNotes(filtered[0].notes || ''); return }
    if (selected && !filtered.some(c => c.key === selected)) { const first = filtered[0]; setSelected(first?.key || ''); setNotes(first?.notes || ''); setDetailTab('overview') }
  }, [filtered, selected])
  useEffect(() => { setPage(1) }, [query, filter])

  function choose(c: any) { setSelected(c.key); setNotes(c.notes || ''); setDetailTab('overview') }
  async function add() {
    const v = await ctx.ask('Add Customer', [{ name: 'name', label: 'Customer name', required: true }, { name: 'phone', label: 'Phone number', required: true }, { name: 'email', label: 'Email address' }, { name: 'notes', label: 'Internal notes' }], { ok: 'Add Customer' })
    if (!v) return
    if (!phoneValid(v.phone)) return ctx.say(PHONE_HELP)
    const key = phoneKey(v.phone)
    const same = rows.find(c => c.pk === key && c.name.trim().toLowerCase() === v.name.trim().toLowerCase())
    if (same) { ctx.say(`Already saved: ${same.name} · ${same.phone}`); choose(same); return }
    const other = rows.filter(c => c.pk === key)
    if (other.length && !(await ctx.askYes('This number is already saved', `${other.map(c => c.name).join(', ')} already use${other.length === 1 ? 's' : ''} this number. Add ${v.name.trim()} as a different person on the same number?`, 'Add as a new person'))) return
    const { error } = await ctx.sb.rpc('add_customer', { p_name: v.name.trim(), p_phone: v.phone.trim(), p_email: v.email.trim() || null })
    if (error) return ctx.say(dbMsg(error.message))
    if (v.notes.trim()) await ctx.sb.from('customer_profiles').upsert({ name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim() || null, notes: v.notes.trim(), updated_at: new Date().toISOString() }, { onConflict: 'phone' })
    ctx.say('Customer added.'); ctx.load()
  }
  // The same person saved twice (a typo in the name): merge the second record into the first. Their bookings move across.
  async function merge(from: any, into: any) {
    if (!(await ctx.askYes('Merge these two records?', `${from.name} and ${into.name} will become one customer, ${into.name}. All ${from.name}'s bookings move to ${into.name}. This cannot be undone.`, 'Merge'))) return
    const { error } = await ctx.sb.rpc('merge_customers', { p_from: from.key, p_into: into.key })
    ctx.say(error ? dbMsg(error.message) : 'Merged.'); if (!error) { setSelected(into.key); ctx.load() }
  }
  async function saveNotes() {
    if (!selectedRow) return
    const { error } = await ctx.sb.from('customer_profiles').upsert({ name: selectedRow.name, phone: selectedRow.profilePhone || selectedRow.phone, email: selectedRow.email || null, notes: notes.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'phone' })
    ctx.say(error ? 'Could not save customer notes.' : 'Customer notes saved.'); if (!error) ctx.load()
  }

  return <div className="cust-page">
    {ctx.histFrom !== ctx.ALL_TIME && <p className="mut" style={{ margin: '4px 0' }}>Loading the full booking history…</p>}
    <PageHead icon="user" title="Customers" sub="Customer database, booking history and value insights." badge={<span className="owner-badge">♛ Owner Only</span>} />
    <div className="k6 cust-cards">{[['Total Customers', rows.length, 'user', 'var(--wine)'], ['Repeat Customers', repeat, 'ret', 'var(--purple)'], ['Customers with Outstanding', owing, 'warn', 'var(--amber)'], ['Total Outstanding', inr(totalOwing), 'coins', 'var(--red)']].map(([label, value, icon, color]: any) => <article key={label} className="kc cust-kpi" style={{ '--c': color } as any}><span className="cust-icon"><Ic n={icon} s={32} /></span><div><b>{value}</b><span>{label}</span></div></article>)}</div>
    <div className="cust-toolbar"><label className="cust-search"><span aria-hidden="true"><Ic n="search" s={18} /></span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, phone or email..." aria-label="Search customers" /></label><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter customers"><option value="all">All Customers</option><option value="repeat">Repeat Customers</option><option value="outstanding">Customers with Outstanding</option><option value="one_time">One-Time Customers</option></select><button className="btn cust-add" onClick={add}>＋ Add Customer</button></div>
    <div className={'cust-layout' + (selectedRow ? ' selected' : '')}>
      <section className="cust-list-panel"><div className="scroll"><table className="cust-table"><thead><tr><th>Customer</th><th>Phone</th><th>Total Bookings</th><th>Total Spent</th><th>Outstanding</th><th>Last Booking</th><th></th></tr></thead><tbody>{visible.map(c => <tr key={c.key} className={selected === c.key ? 'cust-selected' : ''} onClick={() => choose(c)}><td><span className="cust-avatar">{initials(c.name)}</span><b>{c.name}</b></td><td><a href={'tel:' + c.phone} onClick={e => e.stopPropagation()}>{c.phone}</a></td><td>{bookingCount(c)}</td><td>{inr(c.spent)}</td><td className={c.owing ? 'cust-due' : ''}>{c.owing ? inr(c.owing) : '—'}</td><td>{c.last ? dmy(c.last) : '—'}</td><td><button className="cust-more" aria-label={`View ${c.name}`} onClick={e => { e.stopPropagation(); choose(c) }}>···</button></td></tr>)}{!visible.length && <tr><td colSpan={7} className="mut cust-empty">No customers match these filters.</td></tr>}</tbody></table></div><footer className="cust-pagination"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} customers</span>{pageCount > 1 && <div><button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>{Array.from({ length: pageCount }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(pageCount, page + 2)).map(p => <button key={p} className={p === page ? 'on' : ''} onClick={() => setPage(p)}>{p}</button>)}<button disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next page">›</button></div>}</footer></section>
      {selectedRow && <aside className="cust-detail" aria-label={`${selectedRow.name} customer details`}>
        <header className="cust-detail-head"><span className="cust-avatar large">{initials(selectedRow.name)}</span><div className="cust-contact"><b>{selectedRow.name}</b><span>{selectedRow.phone}{selectedRow.email ? ` · ${selectedRow.email}` : ''}</span></div><button className="cust-close" onClick={() => setSelected('')} aria-label="Close customer details">×</button></header>
        {selectedRow.sharedWith?.length > 0 && <div className="box" style={{ margin: '8px 12px', padding: '8px 12px', fontSize: 13 }}>
          <b>Same number as {selectedRow.sharedWith.map((o: any) => o.name).join(', ')}.</b> If this is a family sharing one phone, nothing to do (their notes are shared). If it is the same person saved twice:{' '}
          {selectedRow.sharedWith.map((o: any) => o.key.startsWith('p:') ? null : <button key={o.key} type="button" className="textlink" style={{ marginRight: 10 }} onClick={() => merge(selectedRow, o)}>Merge into {o.name}</button>)}</div>}
        <nav className="cust-detail-tabs" role="tablist" aria-label="Customer details"><button className={detailTab === 'overview' ? 'on' : ''} role="tab" aria-selected={detailTab === 'overview'} onClick={() => setDetailTab('overview')}>Overview</button><button className={detailTab === 'history' ? 'on' : ''} role="tab" aria-selected={detailTab === 'history'} onClick={() => setDetailTab('history')}>Booking History ({bookingCount(selectedRow)})</button><button className={detailTab === 'notes' ? 'on' : ''} role="tab" aria-selected={detailTab === 'notes'} onClick={() => setDetailTab('notes')}>Notes</button></nav>
        <div className="cust-detail-content">
          {detailTab === 'overview' && <>
            <section className="cust-detail-section"><h3>Customer Summary</h3><div className="cust-summary-grid"><div><span><Ic n="calcheck" s={22} /></span><b>{bookingCount(selectedRow)}</b><small>Total Bookings</small></div><div><span><Ic n="coins" s={22} /></span><b>{inr(selectedRow.spent)}</b><small>Total Spent</small></div><div><span><Ic n="wallet" s={22} /></span><b>{inr(selectedRow.collected)}</b><small>Amount Collected</small></div><div className={selectedRow.owing ? 'warn' : ''}><span><Ic n="warn" s={22} /></span><b>{inr(selectedRow.owing)}</b><small>Outstanding</small></div></div></section>
            <section className="cust-detail-section"><h3>Customer Details</h3><dl className="cust-details"><dt>Name</dt><dd>{selectedRow.name}</dd><dt>Phone</dt><dd><a href={'tel:' + selectedRow.phone}>{selectedRow.phone}</a></dd><dt>Email</dt><dd>{selectedRow.email || '—'}</dd></dl></section>
            <section className="cust-detail-section cust-recent"><div className="cust-recent-head"><h3>Recent Booking</h3>{selectedBookings.length > 1 && <button onClick={() => setDetailTab('history')}>View All Bookings →</button>}</div>{recent ? <button className="cust-recent-card" onClick={() => ctx.openBooking(recent.id)}>{ctx.thumb(ctx.dmap[recent.dress_id], 48, 62)}<span><b>{recent.id}</b><small>{recent.dress_name}</small><small>{dmy(recent.start_date)} · {dmy(recent.end_date)}</small></span><strong>{inr(recent.rent + (recent.charges || 0))}</strong></button> : <p className="mut">No bookings recorded.</p>}</section>
          </>}
          {detailTab === 'history' && <section className="cust-detail-section"><h3>Booking History</h3>{selectedBookings.length ? <div className="cust-history">{selectedBookings.map((b: any) => <button key={b.id} onClick={() => ctx.openBooking(b.id)}>{ctx.thumb(ctx.dmap[b.dress_id], 38, 48)}<span><b>{b.id} · {b.dress_code}</b><small>{b.dress_name}</small><small>{dmy(b.start_date)} · {b.status}</small></span><strong>{inr(b.rent + (b.charges || 0))}<small>Balance {inr(dueOf(b))}</small></strong></button>)}</div> : <p className="mut">No bookings recorded.</p>}</section>}
          {detailTab === 'notes' && <section className="cust-detail-section"><h3>Internal Customer Notes</h3><textarea className="cust-notes-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes for the owner..." /><button className="btn cust-save" onClick={saveNotes}>Save Notes</button></section>}
        </div>
      </aside>}
    </div>
  </div>
}
