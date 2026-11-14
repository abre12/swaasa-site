'use client'
import { useEffect, useMemo, useState } from 'react'
import { dmy, inr, mainCatOf, MAIN_CATS, todayIST } from '@/lib/util'
import { Ic } from './icons'
import { sendForDryCleaning } from './DryCleaning'
import PageHead from './PageHead'
import { ALT_OPEN, dressStage } from '@/lib/readiness'
const tint = (c: string): React.CSSProperties => ({ ['--c' as any]: c })
// The database keeps the value 'maintenance'; staff see it as Damaged.
const STATUS_LABEL: Record<string, string> = { available: 'Available', maintenance: 'Damaged', unavailable: 'Unavailable', retired: 'Retired', archived: 'Archived' }
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size']
// Where a dress is right now. Worked out by lib/readiness.ts (the same rules the Dashboard, Calendar and Mark delivered use) from
// live bookings, alteration jobs and the cleaning queue; staff-set statuses (Damaged, Unavailable, Retired, Archived) always show.
const ST: Record<string, [string, string, string]> = {
  available: ['In store · ready', 'var(--green)', 'checkc'], rented: ['With customer', 'var(--blue)', 'calendar'], needs_work: ['Needs work', 'var(--amber)', 'scissors'],
  at_tailor: ['At tailor', 'var(--amber)', 'scissors'], at_cleaner: ['At cleaner', 'var(--purple)', 'sparkle'],
  maintenance: ['Damaged', '#b8742a', 'wrench'], unavailable: ['Unavailable', 'var(--mut)', 'ban'], retired: ['Retired', 'var(--mut)', 'ban'], archived: ['Archived', 'var(--mut)', 'ban'] }
const CARDS: [string, string][] = [['', 'Total'], ['available', 'In store · ready'], ['rented', 'With customer'], ['needs_work', 'Needs work'], ['away', 'At tailor / cleaner'], ['maintenance', 'Damaged']]
const CARD_ICON: Record<string, string> = { '': 'dress', available: 'checkc', rented: 'calendar', needs_work: 'scissors', away: 'sparkle', maintenance: 'wrench' }
const STAGE_KEY: Record<string, string> = { ready: 'available', needs_work: 'needs_work', at_tailor: 'at_tailor', at_cleaner: 'at_cleaner', with_customer: 'rented', damaged: 'maintenance' }
export default function Inventory({ ctx, D, owner, onAdd, onEdit, form, extra }: { ctx: any; D: any[]; owner: boolean; onAdd: () => void; onEdit: (d: any) => void; form?: React.ReactNode; extra?: React.ReactNode }) {
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [size, setSize] = useState(''), [stf, setStf] = useState(''), [menu, setMenu] = useState<{ d: any; x: number; y: number } | null>(null), [hist, setHist] = useState<any>(null), [showF, setShowF] = useState(false)
  useEffect(() => { const c = () => setMenu(null); document.addEventListener('click', c); window.addEventListener('scroll', c, true); return () => { document.removeEventListener('click', c); window.removeEventListener('scroll', c, true) } }, [])
  const B: any[] = ctx.B, DC: any[] = ctx.DC || []
  const stateOf = (d: any): string => ['unavailable', 'retired', 'archived'].includes(d.status) ? d.status : (STAGE_KEY[dressStage(ctx, d).key] || 'available')
  const detailOf = (d: any) => dressStage(ctx, d).detail
  const rows = useMemo(() => D.map(d => ({ d, s: stateOf(d) })), [D, B, DC, ctx.AJ, ctx.CR])
  const isIn = (s: string, k: string) => k === 'away' ? s === 'at_tailor' || s === 'at_cleaner' : s === k
  const count = (k: string) => k ? rows.filter(r => isIn(r.s, k)).length : rows.length
  const sizeOpts = [...new Set([...SIZES, ...D.flatMap(d => d.sizes || [])])]
  const n = q.trim().toLowerCase()
  const shown = rows.filter(({ d, s }) => (!n || [d.code, d.name, d.colour, ...(d.colour_tags || [])].some((x: string) => (x || '').toLowerCase().includes(n))) && (!cat || mainCatOf(d.category) === cat) && (!size || (d.sizes || []).includes(size)) && (!stf || isIn(s, stf)))
  const nF = [cat, size, stf].filter(Boolean).length
  async function setStatus(d: any, cur: string) {
    const v = await ctx.ask(`Update status: ${d.code}`, [{ name: 's', label: 'Status', options: Object.values(STATUS_LABEL), value: STATUS_LABEL[d.status] || d.status, required: true }], { ok: 'Save status', note: cur !== d.status || ['rented', 'needs_work', 'at_tailor', 'at_cleaner'].includes(cur) ? `Right now this dress shows as ${ST[cur][0]} from live bookings, alteration jobs and the cleaning queue. This changes only the stock status (available, damaged, unavailable, retired or archived).` : 'Damaged, unavailable, retired and archived dresses cannot be booked.' }); if (!v || (Object.keys(STATUS_LABEL).find(k => STATUS_LABEL[k] === v.s) || v.s) === d.status) return
    const key = Object.keys(STATUS_LABEL).find(k => STATUS_LABEL[k] === v.s) || v.s
    const { error } = await ctx.sb.rpc('set_dress_status', { p_id: d.id, p_status: key }); ctx.say(error ? 'Could not change the status.' : `${d.code} is now ${v.s}`); ctx.load()
  }
  const toggleDamaged = async (d: any) => {
    if (d.status === 'maintenance') {
      const rep = (ctx.AJ || []).find((j: any) => j.dress_id === d.id && j.source === 'damage' && ALT_OPEN.includes(j.status))
      if (rep && !(await ctx.askYes('A repair is still open', `${d.code} still has repair work open in Alterations → Damaged Queue. Approving the repair there returns the dress to Available automatically.`, 'Return to Available anyway'))) return
      const { error } = await ctx.sb.rpc('set_dress_status', { p_id: d.id, p_status: 'available' }); ctx.say(error ? 'Could not change the status.' : `${d.code} is available again`); ctx.load(); return
    }
    const v = await ctx.ask(`Mark ${d.code} as Damaged?`, [{ name: 'n', label: 'What is damaged? (optional)' }], { ok: 'Mark as Damaged', note: 'A damaged dress cannot be booked. You can return it to Available at any time from the same menu.' })
    if (!v) return
    const { error } = await ctx.sb.rpc('set_dress_status', { p_id: d.id, p_status: 'maintenance' })
    if (error) { ctx.say('Could not change the status.'); return }
    if (String(v.n || '').trim()) await ctx.sb.from('dresses').update({ condition: String(v.n).trim() }).eq('id', d.id)
    ctx.say(`${d.code} marked as Damaged`); ctx.load()
  }
  const setLoc = async (d: any) => {
    const v = await ctx.ask(`Store location: ${d.code}`, [{ name: 'l', label: 'Where is it kept? (shelf, rail or room)', value: d.location || '' }], { ok: 'Save location', note: 'Shown in Inventory so anyone can find the dress. Leave empty to clear it.' }); if (!v) return
    const { error } = await ctx.sb.rpc('set_dress_location', { p_id: d.id, p_location: String(v.l || '').trim() }); ctx.say(error ? 'Could not save the location. Run migration-v17.' : 'Location saved'); ctx.load()
  }
  const [evs, setEvs] = useState<any[]>([])
  useEffect(() => { if (!hist) { setEvs([]); return } ctx.sb.from('events').select('at,by_name,action,detail').eq('dress_id', hist.id).order('at', { ascending: false }).limit(100).then(({ data }: any) => setEvs(data || [])) }, [hist, ctx.sb])
  useEffect(() => { if (hist) ctx.ensureFrom(ctx.ALL_TIME) }, [hist])   // eslint-disable-line react-hooks/exhaustive-deps
  const history = hist ? B.filter(b => b.dress_id === hist.id).sort((a, b) => b.start_date.localeCompare(a.start_date)) : []
  const Item = ({ ic, t, on, href }: { ic: string; t: string; on?: () => void; href?: string }) => { const c = <><Ic n={ic} s={16} />{t}</>; return href ? <a className="mi" href={href}>{c}</a> : <button className="mi" onClick={() => { setMenu(null); on?.() }}>{c}</button> }
  return (<div>
    <PageHead icon="dress" title="Dress Inventory" sub="Browse every dress, check where it is right now and update its status.">{owner && <button className="btn wine" onClick={onAdd}>＋ Add Dress</button>}</PageHead>
    {form}
    <div className="k6">{CARDS.map(([k, l]) => { const c = k ? ST[k][1] : 'var(--wine)'; return <button key={k} className="kc" style={{ ...tint(c), outline: stf === k && k ? `2px solid ${c}` : undefined }} aria-pressed={stf === k && !!k} onClick={() => setStf(k && stf !== k ? k : '')}><Ic n={CARD_ICON[k]} s={32} /><div><b>{count(k)}</b><span>{l}</span></div></button> })}</div>
    <div className="bk-bar">
      <label className="bk-search"><Ic n="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by code, name or colour..." aria-label="Search dresses" /></label>
      <span className={'inv-sel' + (showF ? ' open' : '')}><select value={cat} onChange={e => setCat(e.target.value)} aria-label="Category"><option value="">All Categories</option>{MAIN_CATS.map(m => <option key={m.key}>{m.label}</option>)}</select>
        <select value={size} onChange={e => setSize(e.target.value)} aria-label="Size"><option value="">All Sizes</option>{sizeOpts.map(s => <option key={s}>{s}</option>)}</select>
        <select value={stf} onChange={e => setStf(e.target.value)} aria-label="Status"><option value="">All Status</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></span>
      <button className="btn alt sm inv-fbtn" onClick={() => setShowF(!showF)}><Ic n="filter" s={15} /> Filters{nF ? ` (${nF})` : ''}</button></div>
    {extra}
    <div className="bk-card-t inv-tbl"><div className="scroll"><table className="bt inv"><thead><tr><th>Dress</th><th>Code</th><th>Dress Name</th><th>Category</th><th style={{ textAlign: 'right' }}>Rent</th><th style={{ textAlign: 'right' }}>Wash Charge</th><th>Status</th><th></th></tr></thead><tbody>
      {shown.map(({ d, s }) => <tr key={d.id}><td>{ctx.thumb(d, 52, 68)}</td><td><b style={{ letterSpacing: '.02em' }}>{d.code}</b></td><td style={{ whiteSpace: 'normal', fontSize: 14.5 }}>{d.name}</td><td style={{ whiteSpace: 'nowrap' }}>{d.category}</td>
        <td style={{ textAlign: 'right' }}>{inr(d.price)}</td><td style={{ textAlign: 'right' }}>{inr(d.dry_clean_charge || 0)}</td>
        <td><span className="bdg bdg-lg" style={tint(ST[s][1])}><Ic n={ST[s][2]} s={16} />{ST[s][0]}</span>{detailOf(d) && <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>{detailOf(d)}</div>}</td>
        <td><button className="dotb" aria-label={`Actions for ${d.code}`} onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.d.id === d.id ? null : { d, x: r.right, y: r.bottom + 4 }) }}><Ic n="dots" s={20} /></button></td></tr>)}
      {!shown.length && <tr><td colSpan={8} className="mut" style={{ padding: 22 }}>{D.length ? 'No dresses match. Try clearing the search or filters.' : 'No dresses yet.'}</td></tr>}</tbody></table></div></div>
    <div className="inv-cards">{shown.map(({ d, s }) => <div key={d.id} className="inv-c">{ctx.thumb(d, 60, 78)}<div className="inv-b"><div className="inv-t"><b>{d.code}</b><button className="dotb" aria-label={`Actions for ${d.code}`} onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.d.id === d.id ? null : { d, x: r.right, y: r.bottom + 4 }) }}><Ic n="dots" s={20} /></button></div>
      <div className="inv-n">{d.name}</div><div className="mut" style={{ fontSize: 12 }}>{d.category} · Rent {inr(d.price)} · Wash {inr(d.dry_clean_charge || 0)}</div><span className="bdg" style={{ ...tint(ST[s][1]), marginTop: 6 }}><Ic n={ST[s][2]} s={14} />{ST[s][0]}</span>{detailOf(d) && <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>{detailOf(d)}</div>}</div></div>)}
      {!shown.length && <p className="mut">No dresses match.</p>}</div>
    <p className="mut" style={{ fontSize: 12 }}>Showing {shown.length} of {D.length} dresses. With customer, Needs work, At tailor and At cleaner come from live bookings, alteration jobs and the cleaning queue; Damaged, Unavailable, Retired and Archived are set by staff.</p>
    {menu && <div className="bkm-pop" onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: Math.min(menu.y, innerHeight - 260), right: Math.max(8, innerWidth - menu.x), padding: 6, gap: 2 }}>
      <Item ic="search" t="View Dress" href={`/dress/${menu.d.id}`} />
      {owner && <Item ic="pencil" t="Edit Dress" on={() => onEdit(menu.d)} />}
      <Item ic="pin" t="Set Store Location" on={() => setLoc(menu.d)} />
      <Item ic="flag" t="Update Status" on={() => setStatus(menu.d, stateOf(menu.d))} />
      <Item ic="calendar" t="View Rental History" on={() => setHist(menu.d)} />
      <Item ic="wrench" t={menu.d.status === 'maintenance' ? 'Return to Available' : 'Mark as Damaged'} on={() => toggleDamaged(menu.d)} />
      <Item ic="sparkle" t="Send Dress for Dry Cleaning" on={() => sendForDryCleaning(ctx, menu.d)} /></div>}
    {hist && <div className="inv-modal" onClick={() => setHist(null)}><div className="inv-dlg" onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>{ctx.thumb(hist, 44, 58)}<div style={{ flex: 1 }}><h3 style={{ margin: 0 }}>Rental history</h3><span className="mut">{hist.code} · {hist.name}</span></div><button className="btn alt sm" onClick={() => setHist(null)}>Close</button></div>
      <div className="scroll" style={{ maxHeight: '60vh' }}><table className="bt"><thead><tr><th>Booking</th><th>Customer</th><th>Delivery</th><th>Return</th><th>Status</th><th style={{ textAlign: 'right' }}>Rent</th></tr></thead><tbody>
        {history.map(b => <tr key={b.id}><td><a href="#" onClick={e => { e.preventDefault(); setHist(null); ctx.openBooking(b.id) }} style={{ fontWeight: 600 }}>{b.id}</a></td><td>{b.customer_name}</td><td>{dmy(b.start_date)}</td><td>{dmy(b.end_date)}</td><td style={{ textTransform: 'capitalize' }}>{b.status}</td><td style={{ textAlign: 'right' }}>{inr(b.rent)}</td></tr>)}
        {!history.length && <tr><td colSpan={6} className="mut" style={{ padding: 18 }}>No bookings for this dress yet.</td></tr>}</tbody></table></div>
      {evs.length > 0 && <><h4 style={{ margin: '16px 0 6px' }}>Changes to this dress</h4><div className="mut" style={{ fontSize: 13, display: 'grid', gap: 4 }}>{evs.map((e, i) => <div key={i}>{new Date(e.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · <b style={{ color: 'var(--ink)' }}>{e.action}</b>{e.detail ? `: ${e.detail}` : ''}{e.by_name ? ` · ${e.by_name}` : ''}</div>)}</div></>}
      <p className="mut" style={{ fontSize: 12, margin: '10px 0 0' }}>{owner ? 'For discounts, late fees, damage and wash costs per booking, see Dress Performance.' : 'Bookings that are available to you.'}</p></div></div>}
  </div>)
}
