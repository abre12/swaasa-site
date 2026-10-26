'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { addD, CATS, COLOURS, dmy, inr, istDate, mainCatOf, nDays, PAY_MODES, PREP, todayIST } from '@/lib/util'
import { suggestColours } from '@/lib/colours'
import { makeSizes, thumbOf, mediumOf } from '@/lib/images'
import Dashboard from './admin/Dashboard'
import PrepBoard from './admin/PrepBoard'
import DryCleaning from './admin/DryCleaning'
import RevenueReport from './admin/RevenueReport'
import StaffAdmin from './admin/StaffAdmin'
import CashCounter from './admin/CashCounter'
import Performance from './admin/Performance'
import BookingModal from './admin/BookingModal'
import PaymentRecord from './admin/PaymentRecord'
const today = todayIST
const state = (b: any) => b.status === 'out' && b.end_date < today() ? 'overdue' : b.status
const COL: any = { pending: '#c58a2b', confirmed: '#4d6d9a', out: '#7a5aa6', returned: '#4f8a5b', overdue: '#b4493f', block: '#8c8c8c', dc: '#4a8a9c' }
const NAV: [string, string, string, string[]][] = [
  ['dashboard', 'Overview Dashboard', '◧', ['owner', 'manager']], ['calendar', 'Bookings Calendar', '▦', ['owner', 'manager']], ['bookings', 'All Bookings', '☰', ['owner', 'manager']],
  ['cash', 'Daily Cash Counter', '₹', ['owner', 'manager']], ['dresses', 'Dress Inventory', '♛', ['owner', 'manager']], ['drycleaning', 'Dry Cleaning', '✦', ['owner', 'manager']],
  ['performance', 'Dress Performance & Rental History', '★', ['owner']], ['customers', 'Customer Management', '☺', ['owner', 'manager']], ['reports', 'Reports and Settings', '⚙', ['owner']],
  ['prep', 'Alterations to Complete', '✂', ['preparation']]]
const CSS = `.adm{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:calc(100vh - 62px)}
.adm-side{background:#0b0b0b;color:#e9e0cf;padding:14px 8px;position:sticky;top:0;align-self:start;height:100vh;overflow:auto}
.adm-side .who{padding:6px 12px 14px;font-size:12px;color:#b9ae98;border-bottom:1px solid #2a2418;margin-bottom:8px}
.adm-side button{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:none;border:0;border-left:3px solid transparent;color:inherit;padding:10px 12px;cursor:pointer;font:inherit;font-size:13px;letter-spacing:.03em}
.adm-side button.on{background:#2a2216;border-left-color:#d2b074;color:#f1dcb0}.adm-side button:hover{background:#1b1710}
.adm-main{padding:20px;min-width:0}.adm-main h2.pg{font-size:30px;margin:0 0 14px}
.adm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.stat-card{display:flex;flex-direction:column;gap:2px;text-align:left;background:var(--bg);border:1px solid var(--line);padding:14px;font:inherit;color:inherit;cursor:pointer}
.adm-two{display:grid;grid-template-columns:1fr;gap:16px}@media(min-width:1300px){.adm-two{grid-template-columns:1fr 1fr}}
.tagchip{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line);background:none;padding:4px 10px;cursor:pointer;font:inherit;font-size:13px;color:inherit}.tagchip.on{border-color:var(--ink);background:var(--blush);font-weight:600}
@media(max-width:860px){.adm{grid-template-columns:1fr}.adm-side{position:static;height:auto;display:flex;overflow-x:auto;padding:4px}.adm-side .who{display:none}.adm-side button{white-space:nowrap;width:auto;border-left:0;border-bottom:3px solid transparent}.adm-side button.on{border-bottom-color:#d2b074}.adm-main{padding:12px}}`
export default function AdminApp({ role, name }: { role: string; name: string }) {
  const sb = useMemo(() => supa(), []); const owner = role === 'owner', ops = role !== 'preparation'
  const [tab, setTab] = useState(ops ? 'dashboard' : 'prep'); const [B, setB] = useState<any[]>([]); const [K, setK] = useState<any[]>([]); const [D, setD] = useState<any[]>([]); const [ed, setEd] = useState<any>(null)
  const [prev, setPrev] = useState<any>(null); const [dlg, setDlg] = useState<any>(null); const [flt, setFlt] = useState('all'); const [DC, setDC] = useState<any[]>([]); const [STAFF, setSTAFF] = useState<any[]>([]); const [APPR, setAPPR] = useState<any[]>([]); const [ref, setRef] = useState(today().slice(0, 7))
  const [note, setNote] = useState(''); const [buf, setBuf] = useState(1); const [day, setDay] = useState<string | null>(null); const [tick, setTick] = useState(0); const [openB, setOpenB] = useState<any>(null)
  const [tags, setTags] = useState<string[]>([]); const [st, setSt] = useState<any>(null); const [payB, setPayB] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (ops) {
      const [b, k, d, s, dc, sf, ap] = await Promise.all([sb.from('booking_view').select('*').order('start_date', { ascending: false }), sb.from('blocks').select('*'), sb.from('dresses').select('*').order('code'), sb.from('settings').select('*').single(), sb.from('dry_cleanings').select('*').order('sent_on', { ascending: false }), sb.from('staff').select('user_id,name,role,active,email,deleted_at').order('name'), sb.from('approvals').select('*').order('requested_at', { ascending: false })])
      setDC(dc.data || []); setSTAFF(sf.data || []); setAPPR(ap.data || []); setB(b.data || []); setK(k.data || []); setD(d.data || []); setSt(s.data); setBuf(s.data?.buffer_days ?? 1)
    } else { const [d, s] = await Promise.all([sb.from('dresses').select('id,code,name,images,thumbs,medium').order('code'), sb.from('settings').select('buffer_days').single()]); setD(d.data || []); setBuf(s.data?.buffer_days ?? 1) }
    setTick(t => t + 1)
  }, [sb, ops])
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load() }, 20000); return () => clearInterval(t) }, [load])   // stays fresh across devices
  useEffect(() => { setTags(ed?.colour_tags || []) }, [ed])
  const dmap: Record<string, any> = useMemo(() => Object.fromEntries(D.map(d => [d.id, d])), [D])
  const showPrev = (src: string, el: HTMLElement) => { const r = el.getBoundingClientRect(), w = 240; const x = r.right + 10 + w > innerWidth ? Math.max(8, r.left - 10 - w) : r.right + 10; setPrev({ src, x, y: Math.min(Math.max(8, r.top - 60), Math.max(8, innerHeight - 330)) }) }
  // Small photo; hover (or tap on a phone) shows it enlarged.
  const thumb = (d: any, w = 40, h = 52) => { const src = thumbOf(d), big = mediumOf(d), st = { width: w, height: h, objectFit: 'cover' as const, border: '1px solid var(--line)', display: 'inline-block', flex: 'none' }
    return src ? <img src={src} alt="" loading="lazy" decoding="async" style={{ ...st, cursor: 'zoom-in' }} onMouseEnter={x => showPrev(big, x.currentTarget)} onMouseLeave={() => setPrev(null)} onClick={x => { x.stopPropagation(); prev?.src === big ? setPrev(null) : showPrev(big, x.currentTarget) }} /> : <span style={{ ...st, background: 'var(--blush)' }} /> }
  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 3500) }
  // In-page dialogs. (Browser prompt()/confirm() freeze the whole page while open, which Chrome reports as slow interactions.)
  type Fld = { name: string; label: string; type?: string; value?: string; options?: string[]; required?: boolean }
  const ask = (title: string, fields: Fld[], o: { note?: string; ok?: string } = {}) => new Promise<Record<string, string> | null>(res => setDlg({ title, fields, note: o.note, ok: o.ok || 'Save', res }))
  const askYes = (title: string, note?: string, ok = 'Yes') => ask(title, [], { note, ok }).then(v => !!v)
  async function patch(b: any, p: any, msg: string): Promise<boolean> {
    const { error } = await sb.from('bookings').update({ ...p, log: [...(b.log || []), { t: new Date().toISOString(), m: msg, by: name }] }).eq('id', b.id)
    say(error ? (error.message.includes('OWNER_ONLY') ? 'Only the owner can change prices.' : error.message.includes('GAP_CLASH') ? 'Check dates for Cleaning & Preparation Period' : error.message.includes('SHORTFALL') ? 'The rental amount has not been received in full. Collect it, or ask the owner to approve the shortfall.' : (error.message.includes('no_double') || error.message.includes('DATES_TAKEN')) ? 'Those dates are already booked or blocked for this dress.' : error.message) : msg); load(); return !error
  }
  // Deposit still to be handed back on return = deposit held, less any rent/charges still unpaid.
  const refundDue = (b: any, extra = 0) => Math.max(0, b.deposit_held - Math.max(0, b.rent + b.charges + extra - b.paid))
  async function pay(b: any, kind: string) {
    const v = await ask('Record payment', [{ name: 'amt', label: 'Amount (₹)', type: 'number', value: String(Math.max(0, b.rent + b.charges - b.paid)), required: true }, { name: 'mode', label: 'Payment mode', options: PAY_MODES, required: true }])
    const a = +(v?.amt || 0); if (!v || !a) return
    const { error } = await sb.from('payments').insert({ booking_id: b.id, amount: a, kind, mode: v.mode }); say(error ? error.message : `${inr(a)} recorded`); load()
  }
  // The rental amount (plus any customization charge) must be received before a dress goes out or comes back.
  // If staff cannot collect all of it, the owner has to approve the shortfall. Returns true when it is fine to carry on.
  async function shortfallOk(bid: string, short: number): Promise<boolean> {
    if (short <= 0) return true
    const mine = APPR.filter((a: any) => a.booking_id === bid)
    if (!owner) {
      if (mine.some((a: any) => a.status === 'approved' && a.shortfall >= short)) return true
      if (mine.some((a: any) => a.status === 'pending')) { say('Waiting for the owner to approve the shortfall. Try again once it is approved.'); return false }
      const rej = mine.find((a: any) => a.status === 'rejected')
      const v = await ask('Rent not fully received', [{ name: 'r', label: `Short by ${inr(short)}. Why is it being accepted?`, required: true }], { ok: 'Send to owner for approval', note: rej ? `The owner declined an earlier request${rej.decision_note ? ': ' + rej.decision_note : ''}. Collect the balance if you can.` : 'Collect the balance if you can. Otherwise this goes to the owner, and you can continue once it is approved.' }); if (!v) return false
      const { data, error } = await sb.rpc('request_shortfall', { p_booking: bid, p_reason: v.r })
      if (error) { say('Could not send the request. Please try again.'); return false }
      load(); if (data === 'approved') return true
      say('Sent to the owner for approval. You can continue once it is approved.'); return false
    }
    if (!(await askYes('Accept less than the rental amount?', `This booking is short by ${inr(short)}. As the owner you can accept this.`, 'Accept shortfall'))) return false
    const { error } = await sb.rpc('request_shortfall', { p_booking: bid, p_reason: 'Accepted by owner' })
    if (error) { say('Could not record that. Please try again.'); return false }
    return true
  }
  async function collectOrApprove(b: any, owing: number): Promise<boolean> {
    const v = await ask('Rent not fully received', [{ name: 'a', label: `Rent to collect now (₹). Unpaid: ${inr(owing)}`, type: 'number', value: String(owing) }, { name: 'm', label: 'Payment mode', options: PAY_MODES }],
      { ok: 'Continue', note: 'The rental amount must be received before this step. If you cannot collect all of it, the owner has to approve the shortfall.' }); if (!v) return false
    const a = Math.round(+(v.a || 0)); if (a < 0 || a > owing) { say(`Enter an amount from 0 to ${inr(owing)}.`); return false }
    if (a > 0) { if (!v.m) { say('Select the payment mode.'); return false }
      const { error } = await sb.from('payments').insert({ booking_id: b.id, amount: a, kind: 'rent', mode: v.m }); if (error) { say(error.message); return false } }
    return shortfallOk(b.id, owing - a)
  }
  async function pickup(b: any) {
    const depPending = Math.max(0, b.deposit - b.deposit_held), owing = Math.max(0, b.rent + b.charges - b.paid)
    const fields: Fld[] = []
    if (depPending > 0) fields.push({ name: 'dep', label: `Refundable deposit still to collect (₹). Deposit ${inr(b.deposit)}, already paid ${inr(b.deposit_held)}`, type: 'number', value: String(depPending), required: true })
    fields.push({ name: 'adv', label: `Rent to collect now (₹). Rent and customization balance due ${inr(owing)}`, type: 'number', value: String(owing) }, { name: 'mode', label: 'Payment mode for the amount collected now', options: PAY_MODES, required: depPending > 0 || owing > 0 })
    const v = await ask('Mark as delivered', fields, { ok: 'Confirm delivery', note: `Refundable deposit ${inr(b.deposit)}: already paid ${inr(b.deposit_held)}${depPending ? `, still to collect ${inr(depPending)}` : ' (nothing more to collect)'}. Rent and customization ${inr(b.rent + b.charges)}: paid ${inr(b.paid)}, balance ${inr(owing)}. The rent is paid at delivery. If any of it is not collected, the owner has to approve.` }); if (!v) return
    const d = depPending > 0 ? +(v.dep || 0) : 0, adv = Math.round(+(v.adv || 0))
    if (depPending > 0 && d !== depPending) return say(`Collect the full refundable deposit of ${inr(depPending)} before delivery.`)
    if (adv < 0) return say('Enter a valid amount.')
    if (adv > owing) return say(`The balance is only ${inr(owing)}. Enter that amount or less.`)
    if ((d > 0 || adv > 0) && !v.mode) return say('Select the payment mode.')
    const rows: any[] = []
    if (d > 0) rows.push({ booking_id: b.id, amount: d, kind: 'deposit', mode: v.mode })
    if (adv > 0) rows.push({ booking_id: b.id, amount: adv, kind: 'rent', mode: v.mode })
    if (rows.length) { const { error } = await sb.from('payments').insert(rows); if (error) return say(error.message) }
    if (!(await shortfallOk(b.id, owing - adv))) { load(); return }
    await patch(b, { status: 'out', picked_up_at: new Date().toISOString() }, `Delivered${d > 0 ? `. Deposit ${inr(d)} collected (${v.mode})` : ''}${adv > 0 ? `. Rent ${inr(adv)} collected (${v.mode})` : ''}${owing - adv > 0 ? `. Shortfall of ${inr(owing - adv)} approved` : ''}`)
  }
  async function ret(b: any) {
    // Rent (and customization) must be fully received before a return is processed; a shortfall needs the owner's approval.
    const needRent = Math.max(0, b.rent + (b.custom_charge || 0) - b.paid)
    if (needRent > 0) { if (!(await collectOrApprove(b, needRent))) { load(); return }; const r = await sb.from('booking_view').select('*').eq('id', b.id).single(); if (r.data) b = r.data }
    const late = b.end_date < today() ? Math.max(0, nDays(b.end_date, today()) - 1) : 0, lateFee = late * (+dmap[b.dress_id]?.extra_day_fee || 0), owing = Math.max(0, b.rent + b.charges - b.paid)
    const v = await ask('Process return', [{ name: 'lf', label: 'Late-return fee (₹)', type: 'number', value: '0' }, { name: 'dc', label: 'Damage / repair / cleaning charge (₹)', type: 'number', value: '0' },
      { name: 'n', label: 'Return condition / damage notes (optional)' }, { name: 'rm', label: 'Deposit hand-back mode', options: PAY_MODES, value: 'Cash' }],
      { ok: 'Mark returned', note: `Deposit held ${inr(b.deposit_held)}${owing ? `. Unpaid rent ${inr(owing)}` : ''}. Before any extra charges, hand back ${inr(refundDue(b))}.${late ? ` Overdue by ${late} day(s): suggested late fee ${inr(lateFee)}.` : ''}` }); if (!v) return
    const lf = +(v.lf || 0), dc = +(v.dc || 0), n = v.n.trim(), aLf = owner ? lf : 0, aDc = owner ? dc : 0, refund = refundDue(b, aLf + aDc)
    const kept = Math.max(0, Math.min(b.deposit_held - refund, Math.max(0, b.rent + b.charges + aLf + aDc - b.paid)))   // deposit kept against unpaid dues
    const ok = await patch(b, { status: 'returned', returned_at: new Date().toISOString(), charges: b.charges + aLf + aDc, late_fee: b.late_fee + aLf, damage_charge: b.damage_charge + aDc, return_notes: n || b.return_notes || null },
      `Returned${n ? ': ' + n : ''}${(lf || dc) && !owner ? ` (charges ${inr(lf + dc)} to be set by owner)` : ''}. Deposit handed back: ${inr(refund)}${kept ? `. Deposit kept against dues: ${inr(kept)}` : ''}`)
    if (!ok) return
    if (refund > 0) await sb.from('payments').insert({ booking_id: b.id, amount: refund, kind: 'deposit_refund', mode: v.rm })
    if (kept > 0) await sb.from('payments').insert({ booking_id: b.id, amount: kept, kind: 'charge', mode: 'Deposit adjusted' })
    if (n) await sb.from('dresses').update({ condition: n }).eq('id', b.dress_id)
    await ask('Return recorded', [], { ok: 'Done', note: `Hand back ${inr(refund)} to the customer.${kept ? ` ${inr(kept)} of the deposit is kept against unpaid rent or charges.` : ''}${(lf || dc) && !owner ? ` The ${inr(lf + dc)} of charges must be added by the owner, and the amount above does not include it.` : ''} The dress becomes available again after the cleaning period.` })
  }
  async function resched(b: any) {
    const v = await ask('Reschedule booking', [{ name: 's', label: 'New delivery date', type: 'date', value: b.start_date }, { name: 'e', label: 'New return date', type: 'date', value: b.end_date }]); if (!v) return
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
  async function blockInfo(id: string) {
    const k = K.find(x => x.id === id); if (!k) return
    if (await askYes('Dress blocked', `${dmap[k.dress_id]?.code} · ${k.reason || 'no reason given'} · ${dmy(k.start_date)} to ${dmy(k.end_date)}`, 'Remove block')) { await sb.from('blocks').delete().eq('id', id); say('Block removed'); load() }
  }
  async function saveDress(e: any) {
    e.preventDefault(); const form = e.currentTarget, f = new FormData(form), imgs: string[] = []
    const meds: string[] = [], ths: string[] = [], files = (f.getAll('photos') as File[]).filter(x => x.size)
    if (files.length) say(`Preparing ${files.length} photo${files.length === 1 ? '' : 's'}…`)
    for (const [i, file] of files.entries()) {
      try {
        const z = await makeSizes(file), base = `${Date.now()}-${i}`, up = (pth: string, bl: Blob) => sb.storage.from('dress-images').upload(pth, bl, { cacheControl: '31536000', contentType: 'image/jpeg' })
        const [o, m, t] = await Promise.all([up(`${base}.jpg`, z.original), up(`m-${base}.jpg`, z.medium), up(`t-${base}.jpg`, z.thumb)])
        if (o.error) { say('A photo could not be uploaded.'); continue }
        const url = (pth: string) => sb.storage.from('dress-images').getPublicUrl(pth).data.publicUrl
        imgs.push(url(`${base}.jpg`)); meds.push(m.error ? '' : url(`m-${base}.jpg`)); ths.push(t.error ? '' : url(`t-${base}.jpg`))
      } catch { say('A photo could not be read.') }
    }
    const g = (k: string) => String(f.get(k) || '').trim()
    const body = { code: g('code'), name: g('name'), category: g('category'), colour: g('colour') || tags.join(', '), colour_tags: tags, acquired_on: g('acquired') || null, dry_clean_charge: +g('dcc') || 0, sizes: g('sizes').split(',').map(x => x.trim()).filter(Boolean), price: +g('price'), included_days: +g('days') || 3, extra_day_fee: +g('extra'), description: g('description') }
    const pad = (arr: string[] | undefined, n: number) => Array.from({ length: n }, (_, i) => (arr || [])[i] || '')   // keeps thumbs and medium lined up with images
    const images = [...(ed?.images || []), ...imgs], thumbs = [...pad(ed?.thumbs, ed?.images?.length || 0), ...ths], medium = [...pad(ed?.medium, ed?.images?.length || 0), ...meds]
    const { error } = ed ? await sb.from('dresses').update({ ...body, images, thumbs, medium, try_on_image: ed.try_on_image || images[0] || null }).eq('id', ed.id)
      : await sb.from('dresses').insert({ ...body, images: imgs, thumbs: ths, medium: meds, try_on_image: imgs[0] || null })
    say(error ? (error.message.includes('duplicate') ? 'That code is already used by another dress.' : error.message) : ed ? 'Dress updated' : 'Dress added')
    if (!error) { setEd(null); setTags([]); form.reset() }; load()
  }
  async function suggest() {
    const file = (document.querySelector('input[name=photos]') as HTMLInputElement | null)?.files?.[0], src = file || ed?.images?.[0]
    if (!src) return say('Choose a photo first, then press Suggest.')
    try { const s = await suggestColours(src); setTags(s); say(s.length ? `Suggested: ${s.join(', ')}. Please check and correct before saving.` : 'Could not tell the colours. Please choose them yourself.') } catch { say('Could not read that photo. Please choose the colours yourself.') }
  }
  async function setImages(d: any, images: string[]) {
    const idx = images.map(u => d.images.indexOf(u)), pick = (arr?: string[]) => idx.map(i => (arr || [])[i] || '')   // thumbs and medium follow the same order
    const patchD = { images, thumbs: pick(d.thumbs), medium: pick(d.medium), try_on_image: images[0] || null }
    const { error } = await sb.from('dresses').update(patchD).eq('id', d.id)
    if (error) return say(error.message); setEd({ ...d, ...patchD }); load()
  }
  // One-time (owner): make small copies of photos that were uploaded before smaller sizes existed. Originals are not touched.
  async function optimisePhotos() {
    const todo = D.filter(d => (d.images || []).some((_: string, i: number) => !d.thumbs?.[i] || !d.medium?.[i]))
    if (!(await askYes('Make photos load faster?', `This creates small copies of the photos for ${todo.length} dress${todo.length === 1 ? '' : 'es'}. Your original photos are not changed. Keep this page open until it finishes.`, 'Start'))) return
    let done = 0
    for (const d of todo) {
      const thumbs: string[] = [], medium: string[] = []
      for (let i = 0; i < d.images.length; i++) {
        let t = d.thumbs?.[i] || '', m = d.medium?.[i] || ''
        if (!t || !m) { try { const z = await makeSizes(await (await fetch(d.images[i])).blob()), base = `opt-${d.id}-${i}-${Date.now()}`
          const up = (pth: string, bl: Blob) => sb.storage.from('dress-images').upload(pth, bl, { cacheControl: '31536000', contentType: 'image/jpeg' }), url = (pth: string) => sb.storage.from('dress-images').getPublicUrl(pth).data.publicUrl
          const [mm, tt] = await Promise.all([up(`m-${base}.jpg`, z.medium), up(`t-${base}.jpg`, z.thumb)]); if (!mm.error) m = url(`m-${base}.jpg`); if (!tt.error) t = url(`t-${base}.jpg`) } catch {} }
        thumbs.push(t); medium.push(m)
      }
      await sb.from('dresses').update({ thumbs, medium }).eq('id', d.id); done++; say(`Photos prepared for ${done} of ${todo.length} dresses…`)
    }
    say(`Done. ${done} dress${done === 1 ? '' : 'es'} updated.`); load()
  }
  async function discount(b: any) {
    const v = await ask('Give a discount', [{ name: 'a', label: `Discount amount (₹). The rent is now ${inr(b.rent)}`, type: 'number', required: true }, { name: 'r', label: 'Reason (optional)' }], { ok: 'Give discount', note: 'This lowers the rent that is owed. The refundable deposit stays the same.' }); if (!v) return
    const a = Math.round(+v.a); if (!(a > 0) || a > b.rent) return say(`Enter an amount from 1 to ${inr(b.rent)}.`)
    const { error } = await sb.rpc('apply_discount', { p_id: b.id, p_amount: a, p_reason: v.r }); say(error ? 'Could not give the discount.' : `Discount of ${inr(a)} given`); load()
  }
  async function customCharge(b: any) {
    const v = await ask('Customization charge', [{ name: 'a', label: `Charge (₹), collected in addition to the rental. It is ${inr(b.custom_charge || 0)} now.`, type: 'number', value: String(b.custom_charge || 0), required: true }], { ok: 'Save' }); if (!v) return
    const a = Math.round(+v.a); if (!(a >= 0)) return say('Enter a valid amount.')
    const { error } = await sb.rpc('set_custom_charge', { p_id: b.id, p_amount: a }); say(error ? 'Could not change the charge.' : `Customization charge set to ${inr(a)}`); load()
  }
  async function cancelBooking(b: any) {
    if (!(await askYes('Cancel this booking?', 'The dress becomes available again for those dates.', 'Yes, cancel'))) return
    if (!(await patch(b, { status: 'cancelled' }, 'Cancelled'))) return
    if (b.paid > 0 || b.deposit_held > 0) {
      const v = await ask('Refund to the customer', [{ name: 'a', label: `Rent paid to refund (₹). Received so far ${inr(b.paid)}. Enter 0 to keep it.`, type: 'number', value: '0' }, { name: 'm', label: 'Refund mode', options: PAY_MODES, value: 'Cash' }],
        { ok: 'Record refund', note: b.deposit_held > 0 ? `The refundable deposit of ${inr(b.deposit_held)} is returned in full.` : undefined }); if (!v) return say('Cancelled. No refund was recorded.')
      const a = Math.min(+(v.a || 0), b.paid), rows: any[] = []
      if (a > 0) rows.push({ booking_id: b.id, amount: a, kind: 'rent_refund', mode: v.m }); if (b.deposit_held > 0) rows.push({ booking_id: b.id, amount: b.deposit_held, kind: 'deposit_refund', mode: v.m })
      if (rows.length) { const { error } = await sb.from('payments').insert(rows); say(error ? error.message : `Refund recorded: ${inr(rows.reduce((t, r) => t + r.amount, 0))}`); load() }
    }
  }
  const sel = (b: any) => <>{b.status === 'pending' && <button className="btn sm" onClick={() => patch(b, { status: 'confirmed' }, 'Confirmed')}>Confirm</button>}
    {b.status === 'confirmed' && <button className="btn sm" onClick={() => pickup(b)}>Mark delivered</button>}
    {b.status === 'out' && <button className="btn sm" onClick={() => ret(b)}>Return</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => pay(b, 'rent')}>Payment</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => customCharge(b)}>Customization</button>}
    {owner && ['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => discount(b)}>Discount</button>}
    <button className="btn alt sm" onClick={() => setPayB(b.id)}>Payment record</button>
    {['pending', 'confirmed'].includes(b.status) && <><button className="btn alt sm" onClick={() => resched(b)}>Reschedule</button><button className="btn alt sm" onClick={() => cancelBooking(b)}>Cancel</button></>}</>
  const openBooking = (id: string, row?: any) => setOpenB({ id, row })
  const go = (t: string, o: any = {}) => { setTab(t); if (o.flt) setFlt(o.flt); window.scrollTo({ top: 0 }) }
  const staffName = (id?: string | null) => { if (!id) return null; const m = STAFF.find(x => x.user_id === id); return m ? `${m.name || 'Staff'}${m.deleted_at ? ' (removed)' : ''}` : 'Staff' }
  const ctx = { sb, role, owner, ops, name, B, D, K, DC, STAFF, APPR, staffName, dmap, buf, tick, load, say, ask, askYes, patch, pay, pickup, ret, resched, sel, thumb, openBooking, openPayments: setPayB, go }
  const F: any = { all: () => true, created_today: (b: any) => b.status !== 'cancelled' && istDate(b.created_at) === today(), pending: (b: any) => b.status === 'pending', upcoming: (b: any) => b.status === 'confirmed' && b.start_date >= today(), out: (b: any) => b.status === 'out', overdue: (b: any) => state(b) === 'overdue', owing: (b: any) => b.status !== 'cancelled' && b.rent + b.charges - b.paid > 0, alterations: (b: any) => b.status !== 'cancelled' && !!b.alteration_notes, done: (b: any) => b.status === 'returned', cancelled: (b: any) => b.status === 'cancelled' }
  const FL: any = { all: 'All bookings', created_today: 'Made today', pending: 'Awaiting confirmation', upcoming: 'Upcoming deliveries', out: 'Currently rented', overdue: 'Overdue returns', owing: 'Balance due', alterations: 'With alteration notes', done: 'Completed', cancelled: 'Cancelled' }
  const live = B.filter(b => b.status !== 'cancelled')
  const first = new Date(ref + '-01T00:00:00Z'); const start = addD(first.toISOString().slice(0, 10), -first.getUTCDay()); const cells = Array.from({ length: 42 }, (_, i) => addD(start, i))
  const dcEnd = (c: any) => c.returned_on || (c.expected_back > today() ? c.expected_back : today())
  const items: any[] = [...DC.map(c => ({ s: c.sent_on, e: dcEnd(c), label: (dmap[c.dress_id]?.code || '') + ' dry-clean', c: COL.dc, dc: true })),
    ...live.map(b => ({ s: b.start_date, e: b.end_date, label: (b.alteration_notes ? '✂ ' : '') + b.dress_code, c: COL[state(b)], bid: b.id })), ...K.map(k => ({ s: k.start_date, e: k.end_date, label: dmap[k.dress_id]?.code + ' ' + (k.reason || ''), c: COL.block, kid: k.id }))]
  async function csv() { const q = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"'; const rows = [['ID', 'Dress', 'Customer', 'Phone', 'Delivery', 'Return', 'Rent', 'Received', 'Status'], ...B.map(b => [b.id, b.dress_code, b.customer_name, b.phone, b.start_date, b.end_date, b.rent, b.paid, b.status])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')])); a.download = 'bookings.csv'; a.click() }
  const ob = openB && (ops ? B.find(x => x.id === openB.id) : openB.row)
  const mStart = today().slice(0, 7) + '-01', nEnd = (() => { const d = new Date(mStart + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 2); d.setUTCDate(0); return d.toISOString().slice(0, 10) })()
  const custB = owner ? B : B.filter(b => b.status !== 'cancelled' && b.start_date <= nEnd && b.end_date >= mStart)   // manager: this month and next month only
  const custs = Object.values(custB.reduce((m: any, b) => { const k = b.phone.replace(/\D/g, '').slice(-10); const c = (m[k] ??= { n: b.customer_name, p: b.phone, e: b.email, c: 0, s: 0, last: '' }); c.c++; if (b.status !== 'cancelled') c.s += b.rent; if (b.start_date > c.last) c.last = b.start_date; return m }, {})) as any[]
  const [cq, setCq] = useState('')
  const title = NAV.find(n => n[0] === tab)?.[1] || ''
  return (<div className="adm"><style>{CSS}</style>
    <aside className="adm-side"><div className="who">Signed in as <b style={{ color: '#f1dcb0' }}>{name}</b> ({role})</div>
      {NAV.filter(n => n[3].includes(role)).map(([k, l, i]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}><span aria-hidden>{i}</span>{l}</button>)}
      {ops && <button onClick={block}><span aria-hidden>⛔</span>Block a dress</button>}
      {ops && <a href="/#collection" style={{ display: 'flex', gap: 10, padding: '10px 12px', fontSize: 13, textDecoration: 'none' }}><span aria-hidden>＋</span>New booking</a>}
      <button onClick={async () => { await sb.auth.signOut(); location.href = '/login' }}><span aria-hidden>⏻</span>Sign out</button></aside>
    <main className="adm-main"><h2 className="pg">{title}</h2>
    {note && <p style={{ background: 'var(--blush)', padding: '8px 12px' }}><b>{note}</b></p>}
    {tab === 'dashboard' && ops && <Dashboard ctx={ctx} />}
    {tab === 'prep' && <PrepBoard ctx={ctx} />}
    {tab === 'drycleaning' && ops && <DryCleaning ctx={ctx} />}
    {tab === 'cash' && ops && <CashCounter ctx={ctx} />}
    {tab === 'performance' && owner && <Performance ctx={ctx} />}
    {tab === 'bookings' && ops && <><div className="flt" style={{ justifyContent: 'flex-start' }}><select value={flt} onChange={e => setFlt(e.target.value)}>{Object.keys(F).map(k => <option key={k} value={k}>{FL[k]}</option>)}</select></div>
      <div className="scroll"><table><thead><tr><th>ID</th><th>Dress</th><th>Customer</th><th>Dates</th><th>Balance</th><th>Status</th><th>Handled by</th><th></th></tr></thead><tbody>
        {B.filter(F[flt]).map(b => <tr key={b.id}><td><a href="#" onClick={e => { e.preventDefault(); openBooking(b.id) }}>{b.id}</a>{b.alteration_notes && <div title={b.alteration_notes} style={{ fontSize: 12 }}>✂ Alterations</div>}</td><td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{thumb(dmap[b.dress_id])}<span>{b.dress_code}<br /><span className="mut" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 170 }}>{b.dress_name}</span></span></div></td><td>{b.customer_name}<br /><a href={'tel:' + b.phone}>{b.phone}</a></td><td>{b.start_date} → {b.end_date}</td><td style={{ whiteSpace: 'normal', minWidth: 210 }}>{(() => { const due = b.rent + b.charges - b.paid; return <>
            <div className="mut">Rent {inr(b.rent)}{b.charges ? ` + charges ${inr(b.charges)}` : ''} · Received {inr(b.paid)}</div>
            <b>{due >= 0 ? `Balance due ${inr(due)}` : `Overpaid ${inr(-due)}`}</b>
            <div className="mut">{b.status === 'returned' ? 'Deposit settled at return' : `Deposit collected ${inr(b.deposit_held)} of ${inr(b.deposit)}`}</div>
            {b.status === 'out' && <div className="ok"><b>Hand back on return: {inr(refundDue(b))}</b></div>}</> })()}</td>
          <td style={{ color: COL[state(b)] }}>{state(b)}</td><td style={{ whiteSpace: 'normal', fontSize: 12, minWidth: 130 }}>{([['Booked', b.taken_by ? staffName(b.taken_by) : b.log?.[0]?.m === 'Requested online' ? 'Online' : null], ['Prepared', staffName(b.prepared_by)], ['Delivered', staffName(b.delivered_by)], ['Returned', staffName(b.returned_by)]] as [string, string | null][]).filter(x => x[1]).map(([l, n]) => <div key={l}><span className="mut">{l}:</span> {n}</div>)}</td><td style={{ whiteSpace: 'normal' }}>{sel(b)}</td></tr>)}</tbody></table></div></>}
    {tab === 'calendar' && ops && <><div className="flt" style={{ justifyContent: 'flex-start' }}><input type="month" value={ref} onChange={e => setRef(e.target.value)} /></div>
      <div className="cal">{'SMTWTFS'.split('').map((d, i) => <b key={i} style={{ textAlign: 'center' }}>{d}</b>)}{cells.map(d => <div key={d} className="cell" onClick={() => setDay(d)} style={{ cursor: 'pointer', ...(d === today() ? { borderColor: 'var(--gold)' } : {}) }}><span className="mut">{+d.slice(8)}</span>{items.filter(i => d >= i.s && d <= i.e).map((i, n) => <span key={n} className="chip" style={{ background: i.c }} onClick={e => { e.stopPropagation(); i.bid ? openBooking(i.bid) : i.dc ? go('drycleaning') : blockInfo(i.kid) }}>{i.label}</span>)}</div>)}</div>
      <p className="mut" style={{ fontSize: 12 }}>Click a booking for full details. Click a date for everything on that day. {Object.entries(COL).map(([k, c]: any) => <span key={k} style={{ color: c, marginRight: 12 }}>■ {k}</span>)}</p></>}
    {tab === 'dresses' && ops && <>{owner && <form key={ed?.id || 'new'} className="box" onSubmit={saveDress}><h3>{ed ? `Edit ${ed.code}` : 'Add a dress'}</h3>
        {ed && <p className="mut" style={{ fontSize: 12 }}>Changing the code or any detail updates it everywhere. Existing bookings stay linked to this dress.</p>}
        <div className="flt" style={{ justifyContent: 'flex-start' }}>{([['code', 'Code *', ed?.code, 'text', true], ['name', 'Name *', ed?.name, 'text', true]] as any[]).map(([n, l, v, t, r]) => <label key={n} style={{ margin: 0 }}>{l}<input name={n} type={t} defaultValue={v ?? ''} required={r} style={{ display: 'block' }} /></label>)}
          <label style={{ margin: 0 }}>Category<select name="category" defaultValue={ed?.category || CATS[0]} style={{ display: 'block' }}>{CATS.map(c => <option key={c} value={c}>{c} → {mainCatOf(c)}</option>)}</select></label>
          {([['colour', 'Colour (words, optional)', ed?.colour, 'text'], ['sizes', 'Sizes (S, M, L)', ed?.sizes?.join(', '), 'text'], ['price', 'Rent ₹', ed?.price, 'number'], ['days', 'Included days', ed?.included_days, 'number'], ['extra', 'Extra day ₹', ed?.extra_day_fee, 'number'], ['dcc', 'Dry-cleaning charge per wash (₹)', ed?.dry_clean_charge, 'number'], ['acquired', 'Acquired on (optional)', ed?.acquired_on, 'date'], ['description', 'Description', ed?.description, 'text']] as any[]).map(([n, l, v, t]) => <label key={n} style={{ margin: 0 }}>{l}<input name={n} type={t} defaultValue={v ?? ''} required={n === 'price'} style={{ display: 'block' }} /></label>)}
          <label style={{ margin: 0 }}>{ed ? 'Add more photos' : 'Photos'}<input name="photos" type="file" accept="image/*" multiple style={{ display: 'block' }} /></label></div>
        <div style={{ margin: '10px 0' }}><b style={{ fontSize: 13 }}>Colour tags (used by the customer colour filter)</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>{COLOURS.map(c => <button type="button" key={c.label} className={'tagchip' + (tags.includes(c.label) ? ' on' : '')} onClick={() => setTags(tags.includes(c.label) ? tags.filter(x => x !== c.label) : [...tags, c.label])}><i style={{ width: 14, height: 14, background: c.css, border: '1px solid #8886', display: 'inline-block' }} />{c.label}</button>)}</div>
          <button type="button" className="btn alt sm" onClick={suggest}>Suggest colours from photo</button> <span className="mut" style={{ fontSize: 12 }}>A suggestion only. Please check it before saving.</span></div>
        {ed && !!ed.images?.length && <div className="flt" style={{ justifyContent: 'flex-start' }}>{ed.images.map((u: string, i: number) => <div key={u} style={{ textAlign: 'center' }}><img src={u} alt="" style={{ height: 80 }} /><br />
          {i === 0 ? <span className="mut" style={{ fontSize: 11 }}>Main photo</span> : <button type="button" className="btn alt sm" onClick={() => setImages(ed, [u, ...ed.images.filter((x: string) => x !== u)])}>Make main</button>}{' '}
          <button type="button" className="btn alt sm" onClick={async () => (await askYes('Remove this photo?', undefined, 'Remove')) && setImages(ed, ed.images.filter((x: string) => x !== u))}>Remove</button></div>)}</div>}
        <button className="btn">{ed ? 'Save changes' : 'Save dress'}</button>{ed && <button type="button" className="btn alt" style={{ marginLeft: 8 }} onClick={() => setEd(null)}>Cancel</button>}</form>}
      {owner && D.some(d => (d.images || []).some((_: string, i: number) => !d.thumbs?.[i])) && <div style={{ margin: '0 0 10px' }}><button className="btn alt sm" onClick={optimisePhotos}>Make photos load faster</button> <span className="mut" style={{ fontSize: 12 }}>One-time. Creates small copies of existing photos.</span></div>}
      <div className="scroll"><table><thead><tr><th></th><th>Code</th><th>Name</th><th>Category</th><th>Colours</th><th>Rent</th><th>Wash ₹</th><th>Status</th>{owner && <th></th>}</tr></thead><tbody>{D.map(d => <tr key={d.id}><td>{thumb(d)}</td><td>{d.code}</td><td>{d.name}</td><td style={{ whiteSpace: 'normal' }}>{d.category}<div className="mut" style={{ fontSize: 11 }}>{mainCatOf(d.category)}</div></td><td style={{ whiteSpace: 'normal' }}>{(d.colour_tags || []).join(', ') || <span className="mut">none</span>}</td><td>{inr(d.price)}</td><td>{inr(d.dry_clean_charge || 0)}</td><td><select value={d.status} onChange={async e => { await sb.rpc('set_dress_status', { p_id: d.id, p_status: e.target.value }); load() }}>{['available', 'maintenance', 'unavailable', 'retired', 'archived'].map(s => <option key={s}>{s}</option>)}</select></td>{owner && <td><button className="btn alt sm" onClick={() => { setEd(d); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button></td>}</tr>)}</tbody></table></div></>}
    {tab === 'customers' && ops && <><div className="flt" style={{ justifyContent: 'flex-start' }}><input placeholder="Search name or phone" value={cq} onChange={e => setCq(e.target.value)} /></div>
      {!owner && <p className="mut" style={{ fontSize: 13 }}>Showing customers with bookings from {dmy(mStart)} to {dmy(nEnd)} (this month and next month).</p>}
      <div className="scroll"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Bookings</th><th>Rental value</th><th>Last delivery</th></tr></thead><tbody>{custs.filter(c => !cq || (c.n + c.p).toLowerCase().includes(cq.toLowerCase())).sort((a, b) => b.last.localeCompare(a.last)).map(c => <tr key={c.p}><td>{c.n}</td><td><a href={'tel:' + c.p}>{c.p}</a></td><td>{c.e}</td><td>{c.c}</td><td>{inr(c.s)}</td><td>{dmy(c.last)}</td></tr>)}</tbody></table></div></>}
    {tab === 'reports' && owner && <div style={{ display: 'grid', gap: 16 }}>
      <RevenueReport ctx={ctx} />
      <div><button className="btn alt" onClick={csv}>Export all bookings (CSV)</button> <span className="mut" style={{ fontSize: 13 }}>Cancellation rate {B.length ? Math.round(100 * B.filter(F.cancelled).length / B.length) : 0}%</span></div>
      <StaffAdmin ctx={ctx} />
      {st && <form className="box" style={{ margin: 0 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const { error } = await sb.from('settings').update({ buffer_days: +(f.get('b') as string), advance_pct: +(f.get('a') as string), advance_min: +(f.get('m') as string), tryon_daily_limit: +(f.get('t') as string) }).eq('id', 1); say(error ? error.message : 'Settings saved'); load() }}>
        <h3>Settings</h3><div className="flt" style={{ justifyContent: 'flex-start' }}><label style={{ margin: 0 }}>Cleaning and preparation days after each return<input name="b" type="number" min="0" max="7" defaultValue={st.buffer_days} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Refundable deposit: % of rent<input name="a" type="number" min="0" max="100" defaultValue={st.advance_pct} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Refundable deposit: minimum ₹ (the higher of the two applies)<input name="m" type="number" min="0" defaultValue={st.advance_min ?? 1000} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Virtual try-on per visitor per day<input name="t" type="number" min="0" defaultValue={st.tryon_daily_limit} style={{ display: 'block' }} /></label></div>
        <p className="mut" style={{ fontSize: 12 }}>A changed cleaning period applies to new bookings. Bookings already made keep the gap they were made with.</p><button className="btn">Save settings</button></form>}</div>}
    </main>
    {ob && <BookingModal key={ob.id} ctx={ctx} b={ob} limited={!ops} onClose={() => setOpenB(null)} />}
    {payB && B.find(x => x.id === payB) && <PaymentRecord key={payB} ctx={ctx} b={B.find(x => x.id === payB)} onClose={() => setPayB(null)} />}
    {dlg && <div style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 80, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }}>
      <form className="box" style={{ background: 'var(--bg)', maxWidth: 440, width: '100%' }} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget), v: Record<string, string> = {}; dlg.fields.forEach((x: Fld) => { v[x.name] = String(f.get(x.name) ?? '') }); const r = dlg.res; setDlg(null); r(v) }}>
        <h3>{dlg.title}</h3>{dlg.note && <p className="mut">{dlg.note}</p>}
        {dlg.fields.map((x: Fld, i: number) => <label key={x.name}>{x.label}{x.options ? <select name={x.name} defaultValue={x.required ? '' : x.value} required={x.required}>{x.required && <option value="">Select…</option>}{x.options.map(o => <option key={o}>{o}</option>)}</select> : <input name={x.name} type={x.type || 'text'} defaultValue={x.value} required={x.required} autoFocus={i === 0} />}</label>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn">{dlg.ok}</button><button type="button" className="btn alt" onClick={() => { const r = dlg.res; setDlg(null); r(null) }}>Cancel</button></div></form></div>}
    {prev && <img src={prev.src} alt="" style={{ position: 'fixed', left: prev.x, top: prev.y, width: 240, maxHeight: 320, objectFit: 'cover', zIndex: 90, boxShadow: '0 8px 30px #0006', pointerEvents: 'none', background: 'var(--bg)' }} />}
    {day && (() => {
      const on = live.filter(b => day >= b.start_date && day <= b.end_date), away = DC.filter(c => day >= c.sent_on && day <= dcEnd(c)), blk = K.filter(k => day >= k.start_date && day <= k.end_date)
      return (<div onClick={() => setDay(null)} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }}>
        <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 580, width: '100%' }}>
          <div className="row"><h3>{new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button className="btn alt sm" onClick={() => setDay(null)}>Close</button></div>
          {!on.length && !away.length && !blk.length && <p className="mut">No bookings on this day.</p>}
          {on.map(b => <div key={b.id} className="box" onClick={() => openBooking(b.id)} style={{ display: 'flex', gap: 12, cursor: 'pointer' }}>{thumb(dmap[b.dress_id], 72, 96)}<div style={{ flex: 1, minWidth: 0 }}><div className="row"><b>{b.dress_code} · {b.dress_name}</b><span style={{ color: COL[state(b)] }}>{state(b)}</span></div>
            <div>{b.start_date === day ? 'Delivery today' : b.end_date === day ? 'Return today' : 'On rent'} · {b.customer_name} · <a href={'tel:' + b.phone} onClick={e => e.stopPropagation()}>{b.phone}</a></div>
            <div className="mut">{b.start_date} → {b.end_date} · Balance {inr(b.rent + b.charges - b.paid)} · ID {b.id}</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 4 }}>{b.alteration_notes ? <>✂ {b.alteration_notes}</> : <span className="mut">No alteration notes</span>}</div></div></div>)}
          {away.map(c => <div key={c.id} className="box" style={{ display: 'flex', gap: 12, cursor: 'pointer' }} onClick={() => go('drycleaning')}>{thumb(dmap[c.dress_id], 48, 64)}<div>Out for dry cleaning: <b>{dmap[c.dress_id]?.code} · {dmap[c.dress_id]?.name}</b><div className="mut">Sent {c.sent_on}{c.returned_on ? `, back ${c.returned_on}` : `, expected back ${c.expected_back}`}</div></div></div>)}
          {blk.map(k => <div key={k.id} className="box" style={{ display: 'flex', gap: 12 }}>{thumb(dmap[k.dress_id], 48, 64)}<div>Blocked: <b>{dmap[k.dress_id]?.code} · {dmap[k.dress_id]?.name}</b> · {k.reason || 'no reason given'} ({k.start_date} → {k.end_date})</div></div>)}
        </div></div>)
    })()}
  </div>)
}
