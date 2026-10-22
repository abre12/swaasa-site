'use client'
import { useCallback, useEffect, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { addD, CATS, inr, iso, nDays } from '@/lib/util'
const today = () => iso(new Date())
const state = (b: any) => b.status === 'out' && b.end_date < today() ? 'overdue' : b.status
const COL: any = { pending: '#c58a2b', confirmed: '#4d6d9a', out: '#7a5aa6', returned: '#4f8a5b', overdue: '#b4493f', block: '#8c8c8c', clean: '#b8a98a' }
export default function AdminApp({ role, name }: { role: string; name: string }) {
  const sb = supa(); const owner = role === 'owner'
  const [tab, setTab] = useState('bookings'); const [B, setB] = useState<any[]>([]); const [K, setK] = useState<any[]>([]); const [D, setD] = useState<any[]>([]); const [ed, setEd] = useState<any>(null); const [prev, setPrev] = useState<any>(null); const [dlg, setDlg] = useState<any>(null)
  const [flt, setFlt] = useState('all'); const [ref, setRef] = useState(today().slice(0, 7)); const [note, setNote] = useState(''); const [buf, setBuf] = useState(1); const [day, setDay] = useState<string | null>(null)
  const load = useCallback(async () => {
    const [b, k, d, st] = await Promise.all([sb.from('booking_view').select('*').order('start_date', { ascending: false }), sb.from('blocks').select('*'), sb.from('dresses').select('*').order('code'), sb.from('settings').select('buffer_days').single()])
    setBuf(st.data?.buffer_days ?? 1); setB(b.data || []); setK(k.data || []); setD(d.data || [])
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [load])   // calendar stays fresh across devices
  const dmap: Record<string, any> = Object.fromEntries(D.map(d => [d.id, d]))
  const showPrev = (src: string, el: HTMLElement) => { const r = el.getBoundingClientRect(), w = 240; const x = r.right + 10 + w > innerWidth ? Math.max(8, r.left - 10 - w) : r.right + 10; setPrev({ src, x, y: Math.min(Math.max(8, r.top - 60), Math.max(8, innerHeight - 330)) }) }
  // Small photo; hover (or tap on a phone) shows it enlarged.
  const thumb = (d: any, w = 40, h = 52) => { const src = d?.images?.[0]; const st = { width: w, height: h, objectFit: 'cover' as const, border: '1px solid var(--line)', display: 'inline-block', flex: 'none' }
    return src ? <img src={src} alt="" style={{ ...st, cursor: 'zoom-in' }} onMouseEnter={x => showPrev(src, x.currentTarget)} onMouseLeave={() => setPrev(null)} onClick={x => prev?.src === src ? setPrev(null) : showPrev(src, x.currentTarget)} /> : <span style={{ ...st, background: 'var(--blush)' }} /> }
  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 3500) }
  // In-page dialogs. (Browser prompt()/confirm() freeze the whole page while open, which Chrome reports as slow interactions.)
  type Fld = { name: string; label: string; type?: string; value?: string; options?: string[] }
  const ask = (title: string, fields: Fld[], o: { note?: string; ok?: string } = {}) => new Promise<Record<string, string> | null>(res => setDlg({ title, fields, note: o.note, ok: o.ok || 'Save', res }))
  const askYes = (title: string, note?: string, ok = 'Yes') => ask(title, [], { note, ok }).then(v => !!v)
  async function patch(b: any, p: any, msg: string) {
    const { error } = await sb.from('bookings').update({ ...p, log: [...b.log, { t: new Date().toISOString(), m: msg }] }).eq('id', b.id)
    say(error ? (error.message.includes('OWNER_ONLY') ? 'Only the owner can change prices.' : error.message.includes('GAP_CLASH') ? 'Check dates for Cleaning & Preparation Period' : (error.message.includes('no_double') || error.message.includes('DATES_TAKEN')) ? 'Those dates are already booked or blocked for this dress.' : error.message) : msg); load()
  }
  async function pay(b: any, kind: string) {
    const v = await ask(kind === 'rent' ? 'Record payment' : 'Deposit received', [{ name: 'amt', label: 'Amount (₹)', type: 'number', value: String(kind === 'rent' ? Math.max(0, b.rent + b.charges - b.paid) : b.deposit) }, { name: 'mode', label: 'Payment mode', options: ['UPI', 'Cash', 'Bank transfer'] }])
    const a = +(v?.amt || 0); if (!v || !a) return
    const { error } = await sb.from('payments').insert({ booking_id: b.id, amount: a, kind, mode: v.mode }); say(error ? error.message : `${inr(a)} recorded`); load()
  }
  async function ret(b: any) {
    const v = await ask('Process return', [{ name: 'c', label: 'Late fee + damage/cleaning charges (₹)', type: 'number', value: '0' }, { name: 'n', label: 'Condition notes (optional)' }], { ok: 'Mark returned' }); if (!v) return
    const c = +(v.c || 0), n = v.n.trim()
    await patch(b, { status: 'returned', returned_at: new Date().toISOString(), charges: b.charges + (owner ? c : 0) }, `Returned${n ? ': ' + n : ''}${c && !owner ? ` (charges ${inr(c)} to be set by owner)` : ''}`)
    if (n) await sb.from('dresses').update({ condition: n }).eq('id', b.dress_id)
  }
  async function resched(b: any) {
    const v = await ask('Reschedule booking', [{ name: 's', label: 'New start date', type: 'date', value: b.start_date }, { name: 'e', label: 'New return date', type: 'date', value: b.end_date }]); if (!v) return
    const s = v.s, e = v.e; if (!s || !e || e < s) return say('Please choose valid dates.')
    const others = B.filter(o => o.id !== b.id && o.dress_id === b.dress_id && o.status !== 'cancelled')
    if (others.some(o => s <= o.end_date && e >= o.start_date)) return say('This dress is already booked on those dates.')
    let override = false
    if (others.some(o => s <= addD(o.end_date, buf) && addD(e, buf) >= o.start_date)) {
      if (!(await askYes('Check dates for Cleaning & Preparation Period', 'Continue only if you have checked and confirmed availability for these dates.', 'I have checked and confirmed'))) return
      override = true
    }
    await patch(b, { start_date: s, end_date: e, gap_override: override }, `Rescheduled to ${s} → ${e}${override ? ' (cleaning gap override confirmed)' : ''}`)
  }
  async function block() {
    const v = await ask('Block a dress', [{ name: 'code', label: 'Dress', options: D.map(d => d.code) }, { name: 's', label: 'From', type: 'date' }, { name: 'e', label: 'To', type: 'date' }, { name: 'r', label: 'Reason', options: ['Cleaning', 'Repair', 'Photoshoot', 'Personal use'] }], { ok: 'Block' }); if (!v) return
    const d = D.find(x => x.code === v.code); if (!d || !v.s || !v.e || v.e < v.s) return say('Please choose a dress and valid dates.')
    const { error } = await sb.from('blocks').insert({ dress_id: d.id, start_date: v.s, end_date: v.e, reason: v.r }); say(error ? 'Clashes with an existing booking' : 'Blocked'); load()
  }
  async function saveDress(e: any) {
    e.preventDefault(); const form = e.currentTarget, f = new FormData(form), imgs: string[] = []
    for (const file of f.getAll('photos') as File[]) { if (!file.size) continue; const path = `${Date.now()}-${file.name.replace(/\W/g, '_')}`; const up = await sb.storage.from('dress-images').upload(path, file); if (!up.error) imgs.push(sb.storage.from('dress-images').getPublicUrl(path).data.publicUrl) }
    const g = (k: string) => String(f.get(k) || '').trim()
    const body = { code: g('code'), name: g('name'), category: g('category'), colour: g('colour'), sizes: g('sizes').split(',').map(x => x.trim()).filter(Boolean), price: +g('price'), deposit: +g('deposit'), included_days: +g('days') || 3, extra_day_fee: +g('extra'), description: g('description') }
    const images = [...(ed?.images || []), ...imgs]
    const { error } = ed ? await sb.from('dresses').update({ ...body, images, try_on_image: ed.try_on_image || images[0] || null }).eq('id', ed.id)
      : await sb.from('dresses').insert({ ...body, images: imgs, try_on_image: imgs[0] || null })
    say(error ? (error.message.includes('duplicate') ? 'That code is already used by another dress.' : error.message) : ed ? 'Dress updated' : 'Dress added')
    if (!error) { setEd(null); form.reset() }; load()
  }
  async function setImages(d: any, images: string[]) {
    const { error } = await sb.from('dresses').update({ images, try_on_image: images[0] || null }).eq('id', d.id)
    if (error) return say(error.message); setEd({ ...d, images, try_on_image: images[0] || null }); load()
  }
  const sel = (b: any) => <>{b.status === 'pending' && <button className="btn sm" onClick={() => patch(b, { status: 'confirmed' }, 'Confirmed')}>Confirm</button>}
    {b.status === 'confirmed' && <button className="btn sm" onClick={() => patch(b, { status: 'out', picked_up_at: new Date().toISOString() }, 'Picked up')}>Picked up</button>}
    {b.status === 'out' && <button className="btn sm" onClick={() => ret(b)}>Return</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => pay(b, 'rent')}>Payment</button>}
    {['pending', 'confirmed'].includes(b.status) && <><button className="btn alt sm" onClick={() => resched(b)}>Reschedule</button><button className="btn alt sm" onClick={async () => (await askYes('Cancel this booking?', 'The dress becomes available again for those dates.', 'Yes, cancel')) && patch(b, { status: 'cancelled' }, 'Cancelled')}>Cancel</button></>}</>
  const F: any = { all: () => true, pending: (b: any) => b.status === 'pending', upcoming: (b: any) => b.status === 'confirmed' && b.start_date >= today(), out: (b: any) => b.status === 'out', overdue: (b: any) => state(b) === 'overdue', owing: (b: any) => b.status !== 'cancelled' && b.rent + b.charges - b.paid > 0, done: (b: any) => b.status === 'returned', cancelled: (b: any) => b.status === 'cancelled' }
  const live = B.filter(b => b.status !== 'cancelled'); const od = B.filter(F.overdue)
  const stats: [string, any][] = [['Dresses', D.length], ['Rented out', B.filter(F.out).length], ['Overdue', od.length], ['Pending', B.filter(F.pending).length], ['Pickups today', live.filter(b => b.start_date === today() && b.status === 'confirmed').length], ['Returns today', live.filter(b => b.end_date === today() && b.status === 'out').length],
    ...(owner ? [['Collected', inr(B.reduce((a, b) => a + b.paid, 0))], ['Outstanding', inr(live.filter(b => b.status !== 'returned').reduce((a, b) => a + Math.max(0, b.rent + b.charges - b.paid), 0))]] as [string, any][] : [])]
  const first = new Date(ref + '-01T00:00:00Z'); const start = addD(iso(first), -first.getUTCDay()); const cells = Array.from({ length: 42 }, (_, i) => addD(start, i))
  const cleanItems = buf > 0 ? B.filter(b => b.status !== 'cancelled').map(b => ({ s: addD(b.end_date, 1), e: addD(b.end_date, buf), label: b.dress_code + ' clean', c: COL.clean })) : []
  const items = [...cleanItems, ...B.filter(b => b.status !== 'cancelled').map(b => ({ s: b.start_date, e: b.end_date, label: b.dress_code, c: COL[state(b)] })), ...K.map(k => ({ s: k.start_date, e: k.end_date, label: D.find(d => d.id === k.dress_id)?.code + ' ' + (k.reason || ''), c: COL.block }))]
  async function csv() { const q = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"'; const rows = [['ID', 'Dress', 'Customer', 'Phone', 'Start', 'End', 'Rent', 'Paid', 'Status'], ...B.map(b => [b.id, b.dress_code, b.customer_name, b.phone, b.start_date, b.end_date, b.rent, b.paid, b.status])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')])); a.download = 'bookings.csv'; a.click() }
  const tabs = ['bookings', 'calendar', 'dresses', ...(owner ? ['reports'] : [])]
  return (<section className="sec"><div className="row"><span>Signed in: <b>{name}</b> ({role})</span><button className="btn alt sm" onClick={async () => { await sb.auth.signOut(); location.href = '/login' }}>Sign out</button></div>
    <div className="flt" style={{ marginTop: 16 }}>{tabs.map(t => <button key={t} className={'btn sm' + (tab === t ? '' : ' alt')} onClick={() => setTab(t)}>{t}</button>)}<button className="btn alt sm" onClick={block}>Block a dress</button><a className="btn alt sm" href="/#collection" style={{ textDecoration: 'none' }}>New booking</a></div>
    {note && <p><b>{note}</b></p>}
    <div className="flt">{stats.map(([l, v]) => <div key={l} className="box" style={{ margin: 0, minWidth: 120 }}>{l}<h2 className={l === 'Overdue' && v ? 'bad' : ''}>{v}</h2></div>)}</div>
    {od.length > 0 && <div className="box"><b className="bad">Overdue returns</b>{od.map(b => <div key={b.id} className="row"><span>{b.dress_code} · {b.customer_name} · <a href={'tel:' + b.phone}>{b.phone}</a></span><span>due {b.end_date}</span></div>)}</div>}
    {tab === 'bookings' && <><div className="flt" style={{ marginTop: 16 }}><select value={flt} onChange={e => setFlt(e.target.value)}>{Object.keys(F).map(k => <option key={k}>{k}</option>)}</select></div>
      <div className="scroll"><table><thead><tr><th>ID</th><th>Dress</th><th>Customer</th><th>Dates</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>
        {B.filter(F[flt]).map(b => <tr key={b.id}><td>{b.id}</td><td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{thumb(dmap[b.dress_id])}<span>{b.dress_code}<br /><span className="mut" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 170 }}>{b.dress_name}</span></span></div></td><td>{b.customer_name}<br /><a href={'tel:' + b.phone}>{b.phone}</a></td><td>{b.start_date} → {b.end_date}</td><td>{inr(b.rent + b.charges - b.paid)}<br /><span className="mut">deposit held {inr(b.deposit_held)}/{inr(b.deposit)}</span></td>
          <td style={{ color: COL[state(b)] }}>{state(b)}</td><td style={{ whiteSpace: 'normal' }}>{sel(b)}{['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => pay(b, 'deposit')}>Deposit</button>}</td></tr>)}</tbody></table></div></>}
    {tab === 'calendar' && <><div className="flt"><input type="month" value={ref} onChange={e => setRef(e.target.value)} /></div>
      <div className="cal">{'SMTWTFS'.split('').map((d, i) => <b key={i} style={{ textAlign: 'center' }}>{d}</b>)}{cells.map(d => <div key={d} className="cell" onClick={() => setDay(d)} style={{ cursor: 'pointer', ...(d === today() ? { borderColor: 'var(--gold)' } : {}) }}><span className="mut">{+d.slice(8)}</span>{items.filter(i => d >= i.s && d <= i.e).map((i, n) => <span key={n} className="chip" style={{ background: i.c }}>{i.label}</span>)}</div>)}</div>
      <p className="mut" style={{ fontSize: 12 }}>{Object.entries(COL).map(([k, c]: any) => <span key={k} style={{ color: c, marginRight: 12 }}>■ {k}</span>)}</p></>}
    {tab === 'dresses' && <>{owner && <form key={ed?.id || 'new'} className="box" onSubmit={saveDress}><h3>{ed ? `Edit ${ed.code}` : 'Add a dress'}</h3>
        {ed && <p className="mut" style={{ fontSize: 12 }}>Changing the code or any detail updates it everywhere. Existing bookings stay linked to this dress.</p>}
        <div className="flt">{([['code', 'Code *', ed?.code, 'text', true], ['name', 'Name *', ed?.name, 'text', true]] as any[]).map(([n, l, v, t, r]) => <label key={n} style={{ margin: 0 }}>{l}<input name={n} type={t} defaultValue={v ?? ''} required={r} style={{ display: 'block' }} /></label>)}
          <label style={{ margin: 0 }}>Category<select name="category" defaultValue={ed?.category || CATS[0]} style={{ display: 'block' }}>{CATS.map(c => <option key={c}>{c}</option>)}</select></label>
          {([['colour', 'Colour', ed?.colour, 'text'], ['sizes', 'Sizes (S, M, L)', ed?.sizes?.join(', '), 'text'], ['price', 'Rent ₹', ed?.price, 'number'], ['deposit', 'Deposit ₹', ed?.deposit, 'number'], ['days', 'Included days', ed?.included_days, 'number'], ['extra', 'Extra day ₹', ed?.extra_day_fee, 'number'], ['description', 'Description', ed?.description, 'text']] as any[]).map(([n, l, v, t]) => <label key={n} style={{ margin: 0 }}>{l}<input name={n} type={t} defaultValue={v ?? ''} required={n === 'price'} style={{ display: 'block' }} /></label>)}
          <label style={{ margin: 0 }}>{ed ? 'Add more photos' : 'Photos'}<input name="photos" type="file" accept="image/*" multiple style={{ display: 'block' }} /></label></div>
        {ed && !!ed.images?.length && <div className="flt" style={{ justifyContent: 'flex-start' }}>{ed.images.map((u: string, i: number) => <div key={u} style={{ textAlign: 'center' }}><img src={u} alt="" style={{ height: 80 }} /><br />
          {i === 0 ? <span className="mut" style={{ fontSize: 11 }}>Main photo</span> : <button type="button" className="btn alt sm" onClick={() => setImages(ed, [u, ...ed.images.filter((x: string) => x !== u)])}>Make main</button>}{' '}
          <button type="button" className="btn alt sm" onClick={async () => (await askYes('Remove this photo?', undefined, 'Remove')) && setImages(ed, ed.images.filter((x: string) => x !== u))}>Remove</button></div>)}</div>}
        <button className="btn">{ed ? 'Save changes' : 'Save dress'}</button>{ed && <button type="button" className="btn alt" style={{ marginLeft: 8 }} onClick={() => setEd(null)}>Cancel</button>}</form>}
      <div className="scroll"><table><thead><tr><th></th><th>Code</th><th>Name</th><th>Category</th><th>Rent</th><th>Status</th>{owner && <th></th>}</tr></thead><tbody>{D.map(d => <tr key={d.id}><td>{thumb(d)}</td><td>{d.code}</td><td>{d.name}</td><td>{d.category}</td><td>{inr(d.price)}</td><td><select value={d.status} onChange={async e => { await sb.rpc('set_dress_status', { p_id: d.id, p_status: e.target.value }); load() }}>{['available', 'maintenance', 'unavailable', 'retired', 'archived'].map(s => <option key={s}>{s}</option>)}</select></td>{owner && <td><button className="btn alt sm" onClick={() => { setEd(d); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button></td>}</tr>)}</tbody></table></div></>}
    {tab === 'reports' && owner && <div className="box"><h3>Revenue by category</h3>{Object.entries(live.reduce((m: any, b) => (m[b.category] = (m[b.category] || 0) + b.rent + b.charges, m), {})).map(([k, v]: any) => <div key={k} className="row"><span>{k}</span><span>{inr(v)}</span></div>)}
      <div className="row"><span>Cancellation rate</span><span>{B.length ? Math.round(100 * B.filter(F.cancelled).length / B.length) : 0}%</span></div><br /><button className="btn" onClick={csv}>Export bookings (CSV)</button></div>}
    {dlg && <div style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 70, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }}>
      <form className="box" style={{ background: 'var(--bg)', maxWidth: 420, width: '100%' }} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget), v: Record<string, string> = {}; dlg.fields.forEach((x: Fld) => { v[x.name] = String(f.get(x.name) ?? '') }); const r = dlg.res; setDlg(null); r(v) }}>
        <h3>{dlg.title}</h3>{dlg.note && <p className="mut">{dlg.note}</p>}
        {dlg.fields.map((x: Fld, i: number) => <label key={x.name}>{x.label}{x.options ? <select name={x.name} defaultValue={x.value}>{x.options.map(o => <option key={o}>{o}</option>)}</select> : <input name={x.name} type={x.type || 'text'} defaultValue={x.value} autoFocus={i === 0} />}</label>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn">{dlg.ok}</button><button type="button" className="btn alt" onClick={() => { const r = dlg.res; setDlg(null); r(null) }}>Cancel</button></div></form></div>}
    {prev && <img src={prev.src} alt="" style={{ position: 'fixed', left: prev.x, top: prev.y, width: 240, maxHeight: 320, objectFit: 'cover', zIndex: 60, boxShadow: '0 8px 30px #0006', pointerEvents: 'none', background: 'var(--bg)' }} />}
    {day && (() => {
      const on = B.filter(b => b.status !== 'cancelled' && day >= b.start_date && day <= b.end_date)
      const clean = buf > 0 ? B.filter(b => b.status !== 'cancelled' && day >= addD(b.end_date, 1) && day <= addD(b.end_date, buf)) : []
      const blk = K.filter(k => day >= k.start_date && day <= k.end_date)
      return (<div onClick={() => setDay(null)} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }}>
        <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 560, width: '100%' }}>
          <div className="row"><h3>{new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button className="btn alt sm" onClick={() => setDay(null)}>Close</button></div>
          {!on.length && !clean.length && !blk.length && <p className="mut">No bookings on this day.</p>}
          {on.map(b => <div key={b.id} className="box" style={{ display: 'flex', gap: 12 }}>{thumb(dmap[b.dress_id], 72, 96)}<div style={{ flex: 1 }}><div className="row"><b>{b.dress_code} · {b.dress_name}</b><span style={{ color: COL[state(b)] }}>{state(b)}</span></div>
            <div>{b.start_date === day ? 'Pickup today' : b.end_date === day ? 'Return today' : 'On rent'} · {b.customer_name} · <a href={'tel:' + b.phone}>{b.phone}</a></div>
            <div className="mut">{b.start_date} → {b.end_date} · Balance {inr(b.rent + b.charges - b.paid)} · ID {b.id}</div></div></div>)}
          {clean.map(b => <div key={'c' + b.id} className="box" style={{ display: 'flex', gap: 12 }}>{thumb(dmap[b.dress_id], 48, 64)}<div>Cleaning day: <b>{b.dress_code} · {b.dress_name}</b><div className="mut">Returned {b.end_date}. Earliest next booking: {addD(b.end_date, buf + 1)}</div></div></div>)}
          {blk.map(k => <div key={k.id} className="box" style={{ display: 'flex', gap: 12 }}>{thumb(dmap[k.dress_id], 48, 64)}<div>Blocked: <b>{dmap[k.dress_id]?.code} · {dmap[k.dress_id]?.name}</b> · {k.reason || 'no reason given'} ({k.start_date} → {k.end_date})</div></div>)}
        </div></div>)
    })()}</section>)
}
