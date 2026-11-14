'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supa } from '@/lib/supabase/client'
import { addD, CATS, COLOURS, dbMsg, dmy, inr, istDate, MAIN_CATS, mainCatOf, nDays, PAY_MODES, todayIST } from '@/lib/util'
import { autoColours } from '@/lib/colours'
import { fetchAll } from '@/lib/fetchAll'
import { bookingReadiness } from '@/lib/readiness'
import { byDesc, mergeRows } from '@/lib/merge'
import DressForm from './admin/DressForm'
import { makeSizes, thumbOf, mediumOf } from '@/lib/images'
import Dashboard from './admin/Dashboard'
import PrepBoard from './admin/PrepBoard'
import DryCleaning from './admin/DryCleaning'
import StaffAdmin from './admin/StaffAdmin'
import MfaSetup from './admin/MfaSetup'
import Finance from './admin/Finance'
import Performance from './admin/Performance'
import Confidence from './admin/Confidence'
import { readinessSnapshot } from '@/lib/confidence'
import BookingModal from './admin/BookingModal'
import PaymentRecord from './admin/PaymentRecord'
import Bookings from './admin/Bookings'
import Inventory from './admin/Inventory'
import Alterations from './admin/Alterations'
import Notifications from './admin/Notifications'
import Customers from './admin/Customers'
import Approvals from './admin/Approvals'
import Calendar from './admin/Calendar'
import PageHead from './admin/PageHead'
import CancelBooking from './admin/CancelBooking'
import CancelDecision from './admin/CancelDecision'
import ReturnWizard from './admin/ReturnWizard'
import { Ic } from './admin/icons'
const today = todayIST
const ALL_TIME = '0000-01-01'      // ensureFrom(ALL_TIME) = load every booking ever
const state = (b: any) => b.status === 'out' && b.end_date < today() ? 'overdue' : b.status
const COL: any = { pending: '#c58a2b', confirmed: '#4d6d9a', out: '#7a5aa6', returned: '#4f8a5b', overdue: '#b4493f', block: '#8c8c8c', dc: '#4a8a9c' }
const NAV: [string, string, string, string[]][] = [
  ['dashboard', 'Dashboard', 'home', ['owner', 'manager']], ['bookings', 'Bookings', 'calcheck', ['owner', 'manager']], ['calendar', 'Calendar', 'calendar', ['owner', 'manager']],
  ['dresses', 'Inventory', 'dress', ['owner', 'manager']], ['alterations', 'Alterations', 'scissors', ['owner', 'manager']], ['drycleaning', 'Dry Cleaning', 'sparkle', ['owner', 'manager']],
  ['cash', 'Cash & Transactions', 'wallet', ['owner', 'manager']], ['confidence', 'Delivery Confidence', 'truck', ['owner']], ['customers', 'Customers', 'user', ['owner']], ['approvals','Approvals','bell',['owner']], ['reports', 'Reports & Analytics', 'chart', ['owner']], ['settings', 'Settings', 'gear', ['owner']],
  ['prep', 'Alterations to Complete', 'scissors', ['preparation']]]
export default function AdminApp({ role, name, initialTab }: { role: string; name: string; initialTab?: string }) {
  const sb = useMemo(() => supa(), []); const owner = role === 'owner', ops = role !== 'preparation'
  const [drawer, setDrawer] = useState(false); const [tab, setTab] = useState(initialTab && initialTab !== 'today' && (role === 'owner' || initialTab !== 'performance') ? initialTab : (ops ? 'dashboard' : 'prep')); const [B, setB] = useState<any[]>([]); const [K, setK] = useState<any[]>([]); const [D, setD] = useState<any[]>([]); const [ed, setEd] = useState<any>(null)
  const [prev, setPrev] = useState<any>(null); const [dlg, setDlg] = useState<any>(null); const [flt, setFlt] = useState('all'); const [DC, setDC] = useState<any[]>([]); const [CR, setCR] = useState<any[]>([]); const [AJ, setAJ] = useState<any[]>([]); const [STAFF, setSTAFF] = useState<any[]>([]); const [APPR, setAPPR] = useState<any[]>([]); const [NOTICES, setNOTICES] = useState<any[]>([]); const [ref, setRef] = useState(today().slice(0, 7))
  const [note, setNote] = useState(''); const [buf, setBuf] = useState(1); const [day, setDay] = useState<string | null>(null); const [tick, setTick] = useState(0); const [openB, setOpenB] = useState<any>(null)
  const [calView,setCalView]=useState<'month'|'week'|'day'>('month'),[calFocus,setCalFocus]=useState(today()),[calFilters,setCalFilters]=useState({bookings:true,deliveries:true,returns:true,alterations:true,cleaning:true})
  const [st, setSt] = useState<any>(null); const [payB, setPayB] = useState<string | null>(null)
  // ── Data loading ────────────────────────────────────────────────────────────────────────────
  // FULL load  : every table, paged so nothing is cut at the API row cap. Runs when the app opens, after every
  //              action (load() is passed to all the action handlers), and every few minutes as a safety net.
  // LIVE refresh: the polled path. Fetches only rows that can still change in practice (open bookings, open work,
  //              recent history) and merges them into what is already on screen, so a poll costs a few KB
  //              however large the history grows. The page only polls while the tab is visible.
  // SA-4 / OP-4: by default only open bookings and the last 90 days are loaded. A page that needs older ones (a past month, a customer's
  // history, a report) asks for them with ctx.ensureFrom(date); the window then widens and stays wide until the page is reloaded.
  const histRef = useRef(addD(todayIST(), -90)); const [histFrom, setHistFrom] = useState(histRef.current)
  const seq = useRef(0), inflight = useRef(0), lastFull = useRef(0), fails = useRef(0)
  const [fullTick, setFullTick] = useState(0)
  const load = useCallback(async (): Promise<boolean> => {
    seq.current++; inflight.current++
    try {
      if (ops) {
        const [b, k, d, s, dc, cr, aj, sf, ap] = await Promise.all([
          fetchAll(() => { const hf = histRef.current; let q = sb.from('booking_view').select('*'); if (hf > ALL_TIME) q = q.or(`status.in.(pending,confirmed,out),end_date.gte.${hf},returned_at.gte.${hf}`); return q.order('start_date', { ascending: false }).order('id') }),
          fetchAll(() => sb.from('blocks').select('*').order('id')),
          fetchAll(() => sb.from('dresses').select('*').order('code').order('id')),
          sb.from('settings').select('*').single(),
          fetchAll(() => sb.from('dry_cleanings').select('*').order('sent_on', { ascending: false }).order('id')),
          fetchAll(() => sb.from('dry_clean_requests').select('*').order('added_at', { ascending: false }).order('id')),
          fetchAll(() => sb.from('alteration_jobs').select('*').order('created_at', { ascending: false }).order('id')),
          sb.from('staff').select('user_id,name,role,active,email,deleted_at').order('name'),
          fetchAll(() => sb.from('approvals').select('*').order('requested_at', { ascending: false }).order('id'))])
        // A failed request keeps what is already on screen (it used to blank the list, which also silently cleared every alert).
        const ok = !(b.error || k.error || d.error || dc.error || cr.error || aj.error || ap.error)
        if (!dc.error) setDC(dc.data || []); if (!cr.error) setCR(cr.data || []); if (!aj.error) setAJ(aj.data || []); if (!sf.error) setSTAFF(sf.data || []); if (!ap.error) setAPPR(ap.data || [])
        if (!k.error) setK(k.data || []); if (!d.error) setD(d.data || []); if (!s.error) { setSt(s.data); setBuf(s.data?.buffer_days ?? 1) }
        if (!b.error) {
          let rows: any[] = b.data || []
          // booking_view already carries event_date / event_type (migrationcpt-v13c). Only an older database needs the extra lookup.
          if (rows.length && !('event_date' in rows[0])) {
            const ev = await fetchAll(() => sb.from('bookings').select('id,event_date,event_type').order('id')); const em = new Map((ev.data || []).map((x: any) => [x.id, x]))
            rows = rows.map((x: any) => ({ ...x, event_date: em.get(x.id)?.event_date ?? null, event_type: em.get(x.id)?.event_type ?? null }))
          }
          setB(rows)
        }
        lastFull.current = Date.now(); setFullTick(t => t + 1); setTick(t => t + 1)
        return ok
      }
      const [d, s] = await Promise.all([fetchAll(() => sb.from('dresses').select('id,code,name,images,thumbs,medium').order('code').order('id')), sb.from('settings').select('buffer_days').single()])
      if (!d.error) setD(d.data || []); if (!s.error) setBuf(s.data?.buffer_days ?? 1)
      lastFull.current = Date.now(); setFullTick(t => t + 1); setTick(t => t + 1)
      return !d.error
    } finally { inflight.current-- }
  }, [sb, ops])
  const refreshLive = useCallback(async (): Promise<boolean> => {
    if (!ops || inflight.current > 0) return true            // a load is already running: it will bring everything up to date
    const s0 = seq.current; inflight.current++
    try {
      const t = today(), since = addD(t, -45), recent = new Date(Date.now() - 7 * 864e5).toISOString()
      const CAP = 1000
      const [b, k, d, dc, cr, aj, ap] = await Promise.all([
        sb.from('booking_view').select('*').or(`status.in.(pending,confirmed,out),end_date.gte.${since},returned_at.gte.${recent}`).order('start_date', { ascending: false }).order('id').limit(CAP),
        sb.from('blocks').select('*').gte('end_date', since).limit(CAP),
        sb.from('dresses').select('id,status,condition').limit(CAP),     // status flips (Out / Damaged / Available) matter live; the heavy photo columns do not
        sb.from('dry_cleanings').select('*').or(`returned_on.is.null,returned_on.gte.${since}`).limit(CAP),
        sb.from('dry_clean_requests').select('*').or(`status.in.(to_be_sent,sent,returned_pending_check),added_at.gte.${recent},returned_on.gte.${since}`).limit(CAP),
        sb.from('alteration_jobs').select('*').or(`status.in.(pending_dispatch,at_unit,quality_check),updated_at.gte.${recent}`).limit(CAP),
        sb.from('approvals').select('*').or(`status.eq.pending,requested_at.gte.${recent}`).limit(CAP)])
      if (b.error || k.error || d.error || dc.error || cr.error || aj.error || ap.error) return false
      // If a live query ever hits the cap it can no longer be trusted to be complete: do a proper full load instead.
      if ([b, k, d, dc, cr, aj, ap].some(x => (x.data || []).length >= CAP)) return load()
      if (seq.current !== s0) return true                    // an action's full load started meanwhile: its data is newer, drop this one
      setB(p => mergeRows(p, b.data || [], (x: any, y: any) => String(y.start_date).localeCompare(String(x.start_date)) || String(x.id).localeCompare(String(y.id))))
      setK(p => mergeRows(p, k.data || []))
      setD(p => { const m = new Map((d.data || []).map((x: any) => [x.id, x])); let ch = false; const n = p.map((x: any) => { const u: any = m.get(x.id); if (u && (u.status !== x.status || u.condition !== x.condition)) { ch = true; return { ...x, status: u.status, condition: u.condition } } return x }); return ch ? n : p })
      setDC(p => mergeRows(p, dc.data || [], byDesc('sent_on'))); setCR(p => mergeRows(p, cr.data || [], byDesc('added_at'))); setAJ(p => mergeRows(p, aj.data || [], byDesc('created_at'))); setAPPR(p => mergeRows(p, ap.data || [], byDesc('requested_at')))
      setTick(x => x + 1)
      return true
    } finally { inflight.current-- }
  }, [sb, ops, load])
  // IN-1 / IN-3: the first staff login of each day records how ready the next 3 days of deliveries are (a back-up for the scheduled job).
  const loggedDay = useRef('')
  useEffect(() => {
    if (!ops || !fullTick || loggedDay.current === todayIST() || !D.length) return
    loggedDay.current = todayIST()
    const rows = readinessSnapshot({ B, D, AJ, CR, DC, dmap: Object.fromEntries(D.map((x: any) => [x.id, x])) }, B, todayIST())
    if (rows.length) sb.rpc('log_readiness', { p_rows: rows }).then(() => {})
  }, [fullTick])   // eslint-disable-line react-hooks/exhaustive-deps
  const ensureFrom = useCallback((d: string) => { if (ops && d && d < histRef.current) { histRef.current = d; setHistFrom(d); void load() } }, [load, ops])
  // A booking opened from somewhere that is older than the loaded window (a payment, an approval, a customer) is fetched on its own.
  useEffect(() => {
    if (!ops || !openB || B.some(x => x.id === openB.id)) return
    let live = true
    sb.from('booking_view').select('*').eq('id', openB.id).maybeSingle().then(({ data }: any) => { if (live && data) setB(p => mergeRows(p, [data], (x: any, y: any) => String(y.start_date).localeCompare(String(x.start_date)) || String(x.id).localeCompare(String(y.id)))) })
    return () => { live = false }
  }, [openB, B, ops, sb])
  useEffect(() => {
    let stopped = false, timer: any
    const LIVE_MS = ops ? 30000 : 60000, FULL_MS = ops ? 180000 : 60000
    const run = async () => {
      clearTimeout(timer); if (stopped) return
      if (!document.hidden) { let ok = false; try { ok = Date.now() - lastFull.current > FULL_MS ? await load() : await refreshLive() } catch { ok = false }; fails.current = ok ? 0 : Math.min(fails.current + 1, 4) }
      if (!stopped) timer = setTimeout(run, LIVE_MS * 2 ** fails.current)     // backs off (30s, 1m, 2m, 4m…) while the connection is failing
    }
    load().then(ok => { fails.current = ok ? 0 : 1; if (!stopped) timer = setTimeout(run, LIVE_MS * 2 ** fails.current) }).catch(() => { if (!stopped) timer = setTimeout(run, LIVE_MS) })
    const onVis = () => { if (!document.hidden) run() }                        // catch up as soon as the tab is opened again
    document.addEventListener('visibilitychange', onVis)
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [load, refreshLive, ops])
  // Sign out after a long idle period, so a shop computer or tablet left open does not stay logged in all night. Change IDLE_MINUTES to taste.
  useEffect(() => {
    const IDLE_MINUTES = 60; let last = Date.now()
    const bump = () => { last = Date.now() }, evs = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    evs.forEach(e => window.addEventListener(e, bump, { passive: true }))
    const t = setInterval(async () => { if (Date.now() - last > IDLE_MINUTES * 60000) { clearInterval(t); await sb.auth.signOut(); window.location.replace('/login') } }, 30000)
    return () => { clearInterval(t); evs.forEach(e => window.removeEventListener(e, bump)) }
  }, [sb])
  // Approvals are pushed instantly by realtime; refresh just those rows rather than reloading everything.
  useEffect(() => {
    if (!ops) return
    let t: any
    const refreshApprovals = async () => { const since = new Date(Date.now() - 7 * 864e5).toISOString(); const r = await sb.from('approvals').select('*').or(`status.eq.pending,requested_at.gte.${since}`).order('requested_at', { ascending: false }).limit(1000); if (!r.error) setAPPR(p => mergeRows(p, r.data || [], byDesc('requested_at'))) }
    const ch = sb.channel('approvals-live').on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => { clearTimeout(t); t = setTimeout(refreshApprovals, 400) }).subscribe()
    return () => { clearTimeout(t); sb.removeChannel(ch) }
  }, [sb, ops])
  // SA-3: the owner is told (information only) when staff deliver a dress that was not ready, or change a calculated late fee. Last 7 days.
  useEffect(() => {
    if (!owner) return
    const pull = async () => { const r = await sb.from('owner_notices').select('*').gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(100); if (!r.error) setNOTICES(r.data || []) }
    pull(); const t = setInterval(pull, 30000); return () => clearInterval(t)
  }, [sb, owner])
  const [showForm, setShowForm] = useState(false); const [dq, setDq] = useState(''); const [dcat, setDcat] = useState('')
  const tried = useRef<Set<string>>(new Set())
  // Dresses with no colours yet get them worked out automatically (colour words first, then the photo). They can be corrected in Edit.
  useEffect(() => {
    if (tab !== 'dresses' || !owner) return
    const todo = D.filter(d => !(d.colour_tags || []).length && !tried.current.has(d.id)); if (!todo.length) return
    todo.forEach(d => tried.current.add(d.id))
    ;(async () => { let n = 0
      for (const d of todo) { const r = await autoColours(`${d.colour || ''} ${d.name} ${d.description || ''}`, thumbOf(d) || mediumOf(d)).catch(() => ({ tags: [] as string[] })); const t = r.tags.length ? r.tags : ['Other']
        const { error } = await sb.from('dresses').update({ colour_tags: t }).eq('id', d.id); if (!error) n++ }
      if (n) { say(`Colours worked out automatically for ${n} dress${n === 1 ? '' : 'es'}. Check them with Edit.`); load() } })()
  }, [tab, owner, D])
  const dmap: Record<string, any> = useMemo(() => Object.fromEntries(D.map(d => [d.id, d])), [D])
  const showPrev = (src: string, el: HTMLElement) => { const r = el.getBoundingClientRect(), w = 240; const x = r.right + 10 + w > innerWidth ? Math.max(8, r.left - 10 - w) : r.right + 10; setPrev({ src, x, y: Math.min(Math.max(8, r.top - 60), Math.max(8, innerHeight - 330)) }) }
  // Small photo; hover (or tap on a phone) shows it enlarged.
  const thumb = (d: any, w = 40, h = 52) => { const src = thumbOf(d), big = mediumOf(d), st = { width: w, height: h, objectFit: 'cover' as const, border: '1px solid var(--line)', display: 'inline-block', flex: 'none' }
    return src ? <img src={src} alt="" loading="lazy" decoding="async" style={{ ...st, cursor: 'zoom-in' }} onMouseEnter={x => showPrev(big, x.currentTarget)} onMouseLeave={() => setPrev(null)} onClick={x => { x.stopPropagation(); prev?.src === big ? setPrev(null) : showPrev(big, x.currentTarget) }} /> : <span style={{ ...st, background: 'var(--blush)' }} /> }
  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 3500) }
  // In-page dialogs. (Browser prompt()/confirm() freeze the whole page while open, which Chrome reports as slow interactions.)
  type Fld = { name: string; label: string; type?: string; value?: any; options?: string[]; suggestions?: string[]; required?: boolean; accept?: string; multiple?: boolean }
  type DialogValues = Record<string, string> & { photos?: File[] }
  const ask = (title: string, fields: Fld[], o: { note?: string; ok?: string } = {}) => new Promise<DialogValues | null>(res => setDlg({ title, fields, note: o.note, ok: o.ok || 'Save', res }))
  const [rw, setRw] = useState<any>(null)
  const returnWizard = (b: any, o: { owing: number; late: number; lateFee: number }) => new Promise<Record<string, any> | null>(res => setRw({ b, ...o, res }))
  const askYes = (title: string, note?: string, ok = 'Yes') => ask(title, [], { note, ok }).then(v => !!v)
  // Booking changes are made by database functions (migration v25): the database checks the rules, stamps the time and the person and
  // adds the history line itself, so nothing here writes to the bookings table directly. Only the three changes below exist.
  const errText = (error: any): string => { const m: string = error?.message || ''
    return m.includes('PAST_START') ? 'The delivery date cannot be in the past.' : m.includes('DRESS_ALREADY_OUT') ? 'This dress is still out with another customer. Process that return first.' : m.includes('OWNER_ONLY') ? 'Only the owner can change prices.'
      : m.includes('GAP_APPROVAL_REQUIRED') ? 'The owner has not approved booking inside the cleaning period for these dates yet.' : m.includes('GAP_CLASH') ? 'Check dates for Cleaning & Preparation Period'
      : m.includes('DEPOSIT_FULL_REQUIRED') ? 'The full refundable deposit must be collected before delivery. Refresh and try again.' : m.includes('MODE_REQUIRED') ? 'Select the payment mode.' : m.includes('BAD_STATUS') ? 'This booking has already moved on. Refresh and check its status.'
      : m.includes('SHORTFALL') ? 'The rental amount has not been received in full. Collect it, or ask the owner to approve the shortfall.' : (m.includes('no_double') || m.includes('DATES_TAKEN')) ? 'Those dates are already booked or blocked for this dress.'
      : /Could not find the function|PGRST202/i.test(m) ? 'The database update for this version (migration-v26) has not been applied yet, so nothing was saved.' : dbMsg(m) }
  const delivering = useRef<Set<string>>(new Set())      // MR-3: bookings whose delivery is being saved right now, so a second tap does nothing
  async function recordRows(b: any, rows: any[]): Promise<string | null> {   // MR-3: every payment goes through one database function
    const { error } = await sb.rpc('record_payment', { p_booking: b.id, p_rows: rows.map(r => ({ amount: r.amount, kind: r.kind, purpose: r.purpose, mode: r.mode, remarks: r.remarks })) }); return error ? errText(error) : null
  }
  async function patch(b: any, p: any, msg: string): Promise<boolean> {
    const keys = Object.keys(p)
    const { error } = p.status === 'confirmed' && keys.length === 1 ? await sb.rpc('confirm_booking', { p_id: b.id })
      : p.status === 'out' ? await sb.rpc('mark_delivered', { p_id: b.id, p_note: msg })
      : 'start_date' in p && 'end_date' in p ? await sb.rpc('reschedule_booking', { p_id: b.id, p_start: p.start_date, p_end: p.end_date, p_override: !!p.gap_override, p_reason: p.reason || '' })
      : { error: { message: 'This change is not supported.' } as any }
    say(error ? errText(error) : (p.start_date ? 'Rescheduled' : msg)); load(); return !error
  }
  // Deposit still to be handed back on return = deposit held, less any rent/charges still unpaid.
  const refundDue = (b: any, extra = 0) => Math.max(0, b.deposit_held - Math.max(0, b.rent + b.charges + extra - b.paid))
  // Money toward rent and customization is stored as separate lines: rent is settled first, then customization, then any other charge.
  const rentRows = (b: any, amount: number, mode: string) => {
    const r = Math.min(amount, Math.max(0, b.rent - b.paid)), cl = Math.max(0, (b.custom_charge || 0) - Math.max(0, b.paid - b.rent)), c = Math.min(amount - r, cl), o = amount - r - c
    return ([[r, 'rent'], [c, 'customization'], [o, 'other_charge']] as [number, string][]).filter(x => x[0] > 0).map(([a, purpose]) => ({ booking_id: b.id, amount: a, kind: 'rent', purpose, mode }))
  }
  async function pay(b: any, kind: string) {
    const v = await ask('Record payment', [{ name: 'amt', label: 'Amount (₹)', type: 'number', value: String(Math.max(0, b.rent + b.charges - b.paid)), required: true }, { name: 'mode', label: 'Payment mode', options: PAY_MODES, required: true }])
    if (!v) return
    const a = Math.round(+(v.amt || 0)); if (!(a > 0)) return say('Enter an amount above zero.')
    const er = await recordRows(b, rentRows(b, a, v.mode)); say(er || `${inr(a)} recorded`); load()
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
      const er = await recordRows(b, rentRows(b, a, v.m)); if (er) { say(er); return false } }
    return shortfallOk(b.id, owing - a)
  }
  async function pickup(b: any) {
    // Readiness guard (same rules as the Dashboard / Calendar / Inventory, from lib/readiness.ts). It runs for every Mark delivered button.
    const rd = bookingReadiness({ B, D, AJ, CR, dmap }, b); let notReadyNote = '', closeAlt: { id: string; how: string } | null = null
    if (rd.applicable && !rd.ready) {
      if (rd.hard) return say(`Cannot deliver yet: ${rd.reasons.filter(r => r.hard).map(r => r.label).join('; ')}. Record that return first.`)
      const labels = rd.reasons.map(r => r.label).join('; ')
      const altR = rd.reasons.find(r => r.code === 'alteration')
      const ALT_OPTS: [string, string][] = [['keep', 'Keep it open (I will update it later)'], ['done', 'Close it: the alteration was completed (it was not updated in time)'], ['skipped', 'Close it: the alteration was skipped'], ['missed', 'Close it: the alteration was missed (not done)']]
      const ov = await ask('This dress is not ready', [{ name: 'why', label: 'Why are you delivering it anyway?', required: true },
        ...(altR ? [{ name: 'alt', label: 'What should happen to the open alteration?', options: ALT_OPTS.map(x => x[1]), value: ALT_OPTS[0][1] }] : [])], { ok: 'Deliver anyway', note: `Not ready: ${labels}. Only continue if you have checked the dress yourself. Your reason is saved in the booking history.` }); if (!ov) return
      notReadyNote = String(ov.why || '').trim(); if (!notReadyNote) return say('Please enter the reason.')
      const pick = ALT_OPTS.find(x => x[1] === ov.alt)?.[0] || 'keep'
      if (altR?.id && pick !== 'keep') closeAlt = { id: altR.id, how: pick }
    }
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
    // Shortfall: if part of the rent is not collected, the owner must approve. Staff give a reason; the owner just confirms.
    const short = owing - adv; let reason = ''
    if (short > 0) {
      const mine = APPR.filter((x: any) => x.booking_id === b.id)
      if (owner) { if (!(await askYes('Accept less than the rental amount?', `This booking is short by ${inr(short)}. As the owner you can accept this.`, 'Accept shortfall'))) return; reason = 'Accepted by owner' }
      else if (mine.some((x: any) => x.status === 'approved' && x.shortfall >= short)) reason = 'Approved by owner'
      else if (mine.some((x: any) => x.status === 'pending')) reason = 'Waiting for the owner'
      else {
        const rej = mine.find((x: any) => x.status === 'rejected')
        const w = await ask('Rent not fully received', [{ name: 'r', label: `Short by ${inr(short)}. Why is it being accepted?`, required: true }], { ok: 'Send to owner for approval', note: rej ? `The owner declined an earlier request${rej.decision_note ? ': ' + rej.decision_note : ''}. Collect the balance if you can.` : 'Collect the balance if you can. Otherwise this goes to the owner, and you can continue once it is approved.' }); if (!w) return
        reason = String(w.r || '').trim(); if (reason.length < 3) return say('Please give the reason.')
      }
    }
    // ONE database call: the deposit, the rent and the delivery are saved together or not at all, and a repeated tap is ignored (MR-3).
    if (delivering.current.has(b.id)) return
    delivering.current.add(b.id)
    let delivered = false
    try {
      const { data: res, error } = await sb.rpc('deliver_booking', { p_id: b.id, p_deposit: d, p_rent: adv, p_mode: v.mode || '', p_note: '', p_idem: crypto.randomUUID(), p_shortfall_reason: reason || null, p_not_ready_note: notReadyNote || null })
      if (error) { say(errText(error)); load(); return }
      if (res === 'pending_approval') { say('Payment recorded. Sent to the owner to approve the shortfall. You can mark it delivered once it is approved.'); load(); return }
      if (res === 'duplicate') { say('That delivery was already being saved.'); load(); return }
      delivered = true; say('Delivered'); load()
    } finally { delivering.current.delete(b.id) }
    // The manager chose to close the alteration that was still open: record WHY it is closed, so the history stays honest.
    if (delivered && closeAlt) {
      const done = closeAlt.how === 'done', what = done ? 'completed (not updated in time)' : closeAlt.how === 'skipped' ? 'skipped' : 'missed (not done)'
      await sb.from('alteration_jobs').update({ status: done ? 'ready' : 'cancelled', notes: `Closed at delivery by ${name}: alteration ${what}. Reason for delivering: ${notReadyNote}`, updated_at: new Date().toISOString() }).eq('id', closeAlt.id)
      load()
    }
  }
  async function ret(b: any) {
    // Rent (and customization) must be fully received before a return is processed; a shortfall needs the owner's approval.
    const needRent = Math.max(0, b.rent + (b.custom_charge || 0) - b.paid)
    if (needRent > 0) { if (!(await collectOrApprove(b, needRent))) { load(); return }; const r = await sb.from('booking_view').select('*').eq('id', b.id).single(); if (r.data) b = r.data }
    // MR-4: the late fee, the refund and what the deposit is kept against are worked out by the database, not here.
    const pre = await sb.rpc('return_preview', { p_booking: b.id, p_late_fee: null, p_damage_charge: 0 })
    if (pre.error) return say(errText(pre.error))
    const late = +pre.data.late_days || 0, lateFee = +pre.data.suggested_late_fee || 0, owing = Math.max(0, b.rent + b.charges - b.paid)
    const v = await returnWizard(b, { owing, late, lateFee }); if (!v) return
    const condition = ({ 'Good':'good','Minor Marks':'minor_marks','Needs Cleaning':'needs_cleaning','Damage / Repair Required':'damage_repair' } as any)[v.condition], cleanRequired = v.clean === 'Add to Dry Cleaning List'
    if ((condition === 'good' || condition === 'damage_repair') && cleanRequired) return say(condition === 'good' ? 'Good condition does not need a cleaning queue entry.' : 'Route damage or repair issues to maintenance; do not add them to dry cleaning.')
    if (condition === 'needs_cleaning' && !cleanRequired) return say('This inspection requires a cleaning queue entry.')
    const lf = +(v.lf || 0), dc = +(v.dc || 0), n = String(v.n || '').trim()
    // Photos go up first. The return itself is ONE database call: it is saved completely, or not at all.
    const photoFiles: File[] = Array.from(v.photos || []), photoUrls: string[] = [], photoPaths: string[] = []; let photoFail = 0
    for (const [i, file] of photoFiles.entries()) { if (!(file instanceof File) || !file.size) continue; const path = `${b.id}/${Date.now()}-${i}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`; const up = await sb.storage.from('return-inspection-photos').upload(path, file, { upsert: false, contentType: file.type }); if (up.error) photoFail++; else { photoPaths.push(path); photoUrls.push(sb.storage.from('return-inspection-photos').getPublicUrl(path).data.publicUrl) } }
    const { data: res, error } = await sb.rpc('return_booking', { p_booking: b.id, p_condition: condition, p_notes: n || null, p_photos: photoUrls, p_clean_required: cleanRequired, p_late_fee: Math.max(0, Math.round(lf)), p_damage_charge: Math.max(0, Math.round(dc)), p_refund_mode: v.rm || 'Cash' })
    if (error) {
      if (photoPaths.length) await sb.storage.from('return-inspection-photos').remove(photoPaths)
      const m = error.message || ''
      say(m.includes('DAMAGE_EVIDENCE') ? 'A damage return needs a note and at least one photo.' : m.includes('BAD_STATUS') ? 'This booking is not out any more. Refresh and check its status.' : m.includes('SHORTFALL') ? 'The rental amount has not been received in full. Collect it, or ask the owner to approve the shortfall.' : m.includes('BAD_AMOUNT') ? 'The deposit amounts do not add up. Please try the return again.' : /Could not find the function|PGRST202|return_booking/i.test(m) && !m.includes('BAD_') ? 'The database update for returns (migration-v26) has not been applied yet, so nothing was saved.' : 'The return could not be saved, so nothing was changed. Please try again.')
      load(); return
    }
    load()
    await ask('Return recorded', [], { ok: 'Done', note: `Hand back ${inr(res?.refund || 0)} to the customer.${res?.kept ? ` ${inr(res.kept)} of the deposit is kept.` : ''}${res?.already_in_cleaning ? ' This dress was already in the cleaning workflow, so no second cleaning record was created.' : ''}${photoFail ? ` ${photoFail} photo(s) could not be uploaded; add them again from the booking.` : ''} The dress becomes available again after the cleaning period.` })
  }
  async function resched(b: any) {
    const v = await ask('Reschedule booking', [{ name: 's', label: 'New delivery date', type: 'date', value: b.start_date }, { name: 'e', label: 'New return date', type: 'date', value: b.end_date }, { name: 'why', label: 'Reason for the change', required: true }]); if (!v) return
    const s = v.s, e = v.e, why = String(v.why || '').trim(); if (!s || !e || e < s) return say('Please choose valid dates.')
    if (!why) return say('Please give the reason for rescheduling.')
    if (s < today() && s !== b.start_date) return say('The delivery date cannot be in the past.')
    const others = B.filter(o => o.id !== b.id && o.dress_id === b.dress_id && o.status !== 'cancelled')
    if (others.some(o => s <= o.end_date && e >= o.start_date)) return say('This dress is already booked on those dates.')
    let override = false
    if (others.some(o => s <= addD(o.end_date, buf) && addD(e, buf) >= o.start_date)) {
      if (owner) {
        if (!(await askYes('Check dates for Cleaning & Preparation Period', 'Continue only if you have checked and confirmed availability for these dates.', 'I have checked and confirmed'))) return
        override = true
      } else {
        // SA-3: staff cannot override the cleaning gap on their own. The owner approves a request for exactly these dates first.
        const same = APPR.filter((x: any) => x.action_type === 'gap_override' && x.request_details?.dress_id === b.dress_id && x.request_details?.start === s && x.request_details?.end === e)
        if (same.some((x: any) => x.status === 'approved')) override = true
        else if (same.some((x: any) => x.status === 'pending')) return say('Waiting for the owner to approve rescheduling inside the cleaning period. Try again once it is approved.')
        else {
          const w = await ask('Check dates for Cleaning & Preparation Period', [{ name: 'r', label: 'Why should this be allowed inside the cleaning period?', required: true }], { ok: 'Send to owner for approval', note: 'These dates are inside the cleaning and preparation days. The owner has to approve this first.' }); if (!w) return
          const { error } = await sb.rpc('request_gap_override', { p_dress: b.dress_id, p_start: s, p_end: e, p_booking: b.id, p_reason: String(w.r || '') })
          if (error) return say(error.message.includes('REASON_REQUIRED') ? 'Please give the reason.' : error.message.includes('PENDING_EXISTS') ? 'This request is already waiting for the owner.' : 'Could not send the request. Please try again.')
          load(); return say('Sent to the owner for approval. You can reschedule once it is approved.')
        }
      }
    }
    await patch(b, { start_date: s, end_date: e, gap_override: override, reason: why }, `Rescheduled from ${b.start_date} → ${b.end_date} to ${s} → ${e}${override ? ' (cleaning gap override confirmed)' : ''}. Reason: ${why}`)
  }
  // A customer keeps the dress longer. The database checks the next booking and any cleaning block, and the extension is priced and logged.
  async function extendRental(b: any) {
    if (b.status !== 'out') return
    const perDay = +dmap[b.dress_id]?.extra_day_fee || 0
    const v = await ask(`Extend rental: ${b.id}`, [{ name: 'e', label: `New return date (now ${dmy(b.end_date)})`, type: 'date', value: addD(b.end_date, 1), required: true }, { name: 'c', label: `Extension charge (₹)${perDay ? `, ${inr(perDay)} per extra day` : ''}`, type: 'number', value: String(perDay), required: true }, { name: 'why', label: 'Reason', required: true }], { ok: 'Extend', note: 'The new return date is checked against the next booking for this dress. The charge is added to what the customer owes.' }); if (!v) return
    if (!v.e || v.e <= b.end_date) return say('The new return date must be after the current one.')
    const charge = Math.max(0, Math.round(+v.c || 0))
    const { error } = await sb.rpc('extend_rental', { p_booking: b.id, p_new_end: v.e, p_charge: charge, p_reason: String(v.why || '').trim() })
    const m = error?.message || ''
    say(!error ? `Rental extended to ${dmy(v.e)}${charge ? `. ${inr(charge)} added to the amount due` : ''}.` : m.includes('DATES_TAKEN') ? 'Cannot extend: the next booking for this dress (or a block) starts too soon.' : m.includes('GAP_CLASH') ? 'Cannot extend: the dress needs its cleaning day before the next booking.' : m.includes('BAD_STATUS') ? 'Only a dress that is out can be extended.' : m.includes('REASON_REQUIRED') ? 'Please give the reason.' : /Could not find the function|PGRST202/i.test(m) ? 'The extension update (migration-v20) has not been applied yet, so nothing was changed.' : 'Could not extend. Nothing was changed.'); load()
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
    const v = await ask(owner?'Give a discount':'Request a discount', [{ name: 'a', label: `Discount amount (₹). The rent is now ${inr(b.rent)}`, type: 'number', required: true }, { name: 'r', label: 'Reason (optional)' }], { ok: owner?'Give discount':'Send to owner', note: 'Discounts are owner-approved and lower the rent owed. The refundable deposit stays the same.' }); if (!v) return
    const a = Math.round(+v.a); if (!(a > 0) || a > b.rent) return say(`Enter an amount from 1 to ${inr(b.rent)}.`)
    if(!owner){const {error}=await sb.rpc('request_action_approval',{p_booking:b.id,p_action:'discount',p_details:{amount:a,reason:v.r.trim()}});say(error?error.message.includes('PENDING_EXISTS')?'A discount request is already waiting for the owner.':'Could not request the discount.':'Discount request sent to the owner.');load();return}
    const { error } = await sb.rpc('apply_discount', { p_id: b.id, p_amount: a, p_reason: v.r }); say(error ? 'Could not give the discount.' : `Discount of ${inr(a)} given`); load()
  }
  async function customCharge(b: any) {
    const v = await ask('Customization charge', [{ name: 'a', label: `Charge (₹), collected in addition to the rental. It is ${inr(b.custom_charge || 0)} now.`, type: 'number', value: String(b.custom_charge || 0), required: true }], { ok: 'Save' }); if (!v) return
    const a = Math.round(+v.a); if (!(a >= 0)) return say('Enter a valid amount.')
    const { error } = await sb.rpc('set_custom_charge', { p_id: b.id, p_amount: a }); say(error ? 'Could not change the charge.' : `Customization charge set to ${inr(a)}`); load()
  }
  // Owner decision made from the notification bell: the request leaves Pending at once, and is put back if the database refuses.
  async function decideApproval(a: any, approve: boolean, note = ''): Promise<boolean> {
    // Approving a cancellation: the owner sets the refund amounts (policy default is no refund); it is one all-or-nothing database call.
    if (approve && a.action_type === 'booking_cancellation') {
      const v = await new Promise<any>(res => setCdec({ a, b: B.find((x: any) => x.id === a.booking_id), res })); if (!v) return false
      const { error } = await sb.rpc('decide_cancellation', { p_approval: a.id, p_rent_refund: v.rent, p_dep_refund: v.deposit, p_mode: v.mode, p_note: v.note || note.trim() })
      if (error) { say(error.message.includes('NOT_FOUND') ? 'This request was already decided.' : error.message.includes('BAD_STATUS') ? 'This booking is no longer pending or confirmed, so it cannot be cancelled.' : error.message.includes('BAD_AMOUNT') ? 'The refund is more than was received. Please check the amounts.' : /Could not find the function|PGRST202/i.test(error.message) ? 'The cancellation update (migration-v18) has not been applied yet, so nothing was changed.' : 'Could not save the decision. Nothing was changed.'); load(); return false }
      say(v.rent + v.deposit > 0 ? `Cancelled. Staff to hand back ${inr(v.rent + v.deposit)}.` : 'Cancelled. No refund (policy).'); load(); return true
    }
    setAPPR(p => p.map(x => x.id === a.id ? { ...x, status: approve ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decided_by_name: name, decision_note: note.trim() || null } : x))
    const { error } = await sb.rpc('decide_approval', { p_id: a.id, p_approve: approve, p_note: note.trim() })
    if (error) {
      setAPPR(p => p.map(x => x.id === a.id ? a : x))
      say(error.message.includes('NOT_FOUND') ? 'This request was already decided.' : error.message.includes('BAD_AMOUNT') ? 'The amount no longer fits this booking. Please review it on the Approvals page.' : 'Could not save the decision. Nothing was changed.')
      load(); return false
    }
    say(approve ? 'Request approved.' : 'Request rejected.'); load(); return true
  }
  // Cancelling is meant for rare cases. One popup asks whether a refund is due, how much, the payment mode and the reason.
  // Staff: the answers are sent to the owner for approval (the booking stays active until then). Owner: applied at once.
  const [cx, setCx] = useState<any>(null), [cdec, setCdec] = useState<any>(null)
  const cancelDialog = (b: any) => new Promise<{ rent: number; deposit: number; mode: string; reason: string; note: string } | null>(res => setCx({ b, res }))
  async function cancelBooking(b: any) {
    if (!['pending', 'confirmed'].includes(b.status)) return
    const v = await cancelDialog(b); if (!v) return
    const fail = (m: string) => m.includes('BAD_STATUS') ? 'This booking can no longer be cancelled (check its status).' : m.includes('BAD_AMOUNT') || m.includes('BAD_REQUEST') ? 'The refund is more than was received on this booking.' : m.includes('PENDING_EXISTS') ? 'A cancellation request is already waiting for the owner.' : m.includes('REASON_REQUIRED') ? 'Please give the reason for the cancellation.' : /Could not find the function|PGRST202/i.test(m) ? 'The cancellation update (migration-v18) has not been applied yet, so nothing was changed.' : 'Could not cancel. Nothing was changed.'
    if (!owner) {
      const { error } = await sb.rpc('request_action_approval', { p_booking: b.id, p_action: 'booking_cancellation', p_details: { reason: v.reason, rent_refund: v.rent, deposit_refund: v.deposit, justification: v.note, mode: v.mode } })
      say(error ? fail(error.message) : 'Cancellation sent to the owner. No refund is paid until the owner decides.'); load(); return
    }
    // Owner: ONE database call. The booking is cancelled and every refund is recorded, or nothing happens.
    const { data, error } = await sb.rpc('cancel_booking', { p_booking: b.id, p_reason: v.reason, p_rent_refund: v.rent, p_dep_refund: v.deposit, p_mode: v.mode, p_note: v.note })
    say(error ? fail(error.message) : (data?.rent_refund || 0) + (data?.deposit_refund || 0) > 0 ? `Booking cancelled. Hand back ${inr((data?.rent_refund || 0) + (data?.deposit_refund || 0))} to the customer.` : 'Booking cancelled. No refund (policy).'); load()
  }
  const sel = (b: any, o: { noCancel?: boolean } = {}) => <>{b.status === 'pending' && <button className="btn sm" onClick={() => patch(b, { status: 'confirmed' }, 'Confirmed')}>Confirm</button>}
    {b.status === 'confirmed' && <button className="btn sm" onClick={() => pickup(b)}>Mark delivered</button>}
    {b.status === 'out' && <button className="btn sm" onClick={() => ret(b)}>Process Return</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => pay(b, 'rent')}>Payment</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => customCharge(b)}>Customization</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => discount(b)}>{owner?'Discount':'Request discount'}</button>}
    <button className="btn alt sm" onClick={() => setPayB(b.id)}>Payment record</button>
    {['pending', 'confirmed'].includes(b.status) && <button className="btn alt sm" onClick={() => resched(b)}>Reschedule</button>}
    {b.status === 'out' && <button className="btn alt sm" onClick={() => extendRental(b)}>Extend rental</button>}
    {!o.noCancel && ['pending', 'confirmed'].includes(b.status) && <button className="btn alt sm" style={{ color: 'var(--red,#b4493f)' }} onClick={() => cancelBooking(b)}>Cancel booking</button>}</>
  // Secondary actions for the booking details footer: the contextual primary action lives in the modal header.
  const selSecondary = (b: any) => <>{['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => pay(b, 'rent')}>Payment</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => customCharge(b)}>Customization</button>}
    {['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" onClick={() => discount(b)}>{owner?'Discount':'Request discount'}</button>}
    {['pending', 'confirmed'].includes(b.status) && <button className="btn alt sm" onClick={() => resched(b)}>Reschedule</button>}
    {b.status === 'out' && <button className="btn alt sm" onClick={() => extendRental(b)}>Extend rental</button>}</>
  const [wfFocus, setWfFocus] = useState<any>(null)
  const focusWorkflow = (kind: 'alteration' | 'cleaning', id: string) => { setWfFocus({ kind, id }); setOpenB(null); go(kind === 'alteration' ? 'alterations' : 'drycleaning') }
  const openBooking = (id: string, row?: any) => setOpenB({ id, row })
  const go = (t: string, o: any = {}) => { setTab(t); if (t === 'bookings') setFlt(o.flt || 'all'); window.scrollTo({ top: 0 }) }
  const staffName = (id?: string | null) => { if (!id) return null; const m = STAFF.find(x => x.user_id === id); return m ? `${m.name || 'Staff'}${m.deleted_at ? ' (removed)' : ''}` : 'Staff' }
  const ctx = { ensureFrom, histFrom, ALL_TIME, decideApproval, showDay: (d: string) => setDay(d), cancelBooking, focus: wfFocus, clearFocus: () => setWfFocus(null), focusWorkflow, selSecondary, sb, role, owner, ops, name, B, D, K, DC, CR, AJ, STAFF, APPR, NOTICES, staffName, dmap, buf, st, tick, fullTick, load, extendRental, say, ask, askYes, patch, pay, pickup, ret, resched, sel, thumb, openBooking, openPayments: setPayB, go, state, refundDue, refundRef: (b: any) => refundDue(b), COL }
  const live = B.filter(b => b.status !== 'cancelled')
  const first = new Date(ref + '-01T00:00:00Z'); const start = addD(first.toISOString().slice(0, 10), -first.getUTCDay()); const cells = Array.from({ length: 42 }, (_, i) => addD(start, i))
  const dcEnd = (c: any) => c.returned_on || (c.expected_back > today() ? c.expected_back : today())
  const items: any[] = [...DC.filter(c=>!c.returned_on).map(c => ({ s: c.sent_on, e: dcEnd(c), label: (dmap[c.dress_id]?.code || '') + ' · Cleaner', c: COL.dc, type:'cleaning', dc: true })),
    ...live.map(b => ({ s: b.start_date, e: b.end_date, label: b.dress_code, c: COL[state(b)], type:'bookings', bid: b.id })),
    ...live.map(b=>({s:b.start_date,e:b.start_date,label:'DEL · '+b.dress_code,c:COL.confirmed,type:'deliveries',bid:b.id})),
    ...live.map(b=>({s:b.end_date,e:b.end_date,label:'RET · '+b.dress_code,c:COL.returned,type:'returns',bid:b.id})),
    ...AJ.filter(a=>a.source!=='damage'&&!['ready','cancelled'].includes(a.status)).map(a=>{const b=B.find(x=>x.id===a.booking_id);const s=a.expected_return||b?.start_date||today();return{s,e:s,label:'ALT · '+(dmap[a.dress_id]?.code||''),c:COL.dc,type:'alterations',alt:true,bid:a.booking_id}}),
    ...K.map(k => ({ s: k.start_date, e: k.end_date, label: (dmap[k.dress_id]?.code||'') + ' · Block', c: COL.block, type:'bookings', kid: k.id }))]
  const weekStart=(d:string)=>{const x=new Date(d+'T00:00:00Z');return addD(d,-((x.getUTCDay()+6)%7))}
  const calendarDays=calView==='month'?cells:calView==='week'?Array.from({length:7},(_,i)=>addD(weekStart(calFocus),i)):[calFocus]
  const setCalendarView=(v:'month'|'week'|'day')=>{setCalView(v);setCalFocus(calFocus);setRef(calFocus.slice(0,7))}
  const moveCalendar=(n:number)=>{const d=new Date((calView==='month'?ref+'-01':calFocus)+'T00:00:00Z');if(calView==='month')d.setUTCMonth(d.getUTCMonth()+n);else d.setUTCDate(d.getUTCDate()+n*(calView==='week'?7:1));const s=d.toISOString().slice(0,10);setCalFocus(s);setRef(s.slice(0,7))}
  const changeCalendarMonth=(s:string)=>{setRef(s);setCalFocus(s+'-01')}
  const dateTitle=calView==='month'?new Date(ref+'-01T00:00:00Z').toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'}):calView==='week'?`${dmy(weekStart(calFocus))} – ${dmy(addD(weekStart(calFocus),6))}`:dmy(calFocus)
  const dayItems=(d:string)=>items.filter(i=>d>=i.s&&d<=i.e&&calFilters[i.type as keyof typeof calFilters])
  const ob = openB && (ops ? B.find(x => x.id === openB.id) : openB.row)
  const mStart = today().slice(0, 7) + '-01', nEnd = (() => { const d = new Date(mStart + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 2); d.setUTCDate(0); return d.toISOString().slice(0, 10) })()
  const custB = owner ? B : B.filter(b => b.status !== 'cancelled' && b.start_date <= nEnd && b.end_date >= mStart)   // manager: this month and next month only
  const custs = Object.values(custB.reduce((m: any, b) => { const k = b.phone.replace(/\D/g, '').slice(-10); const c = (m[k] ??= { n: b.customer_name, p: b.phone, e: b.email, c: 0, s: 0, last: '' }); c.c++; if (b.status !== 'cancelled') c.s += b.rent; if (b.start_date > c.last) c.last = b.start_date; return m }, {})) as any[]
  const [cq, setCq] = useState('')
  const title = NAV.find(n => n[0] === tab)?.[1] || (tab === 'performance' ? 'Dress Performance' : '')

  const goNav = (k: string) => { setDrawer(false); if (k === 'workflow') { setTab('dashboard'); setTimeout(() => document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80) } else go(k) }
  const myNav = NAV.filter(n => n[3].includes(role)), pageTitle = NAV.find(n => n[0] === tab)?.[1] || (tab === 'performance' ? 'Dress Performance' : '')
  const navGroups: [string,string[],string][] = [['Workspace',['dashboard','bookings','calendar','dresses'],''],['Operations',['alterations','drycleaning','cash'],''],['Owner’s Corner',['confidence','customers','approvals','reports','settings'],''],['',['prep'],'']]
  const pendingAppr = (APPR || []).filter((a: any) => a.status === 'pending').length
  const navCount: Record<string, number> = { dashboard: (B || []).filter((b: any) => (['confirmed', 'pending'].includes(b.status) && b.start_date <= todayIST()) || (b.status === 'out' && b.end_date <= todayIST())).length, alterations: (AJ || []).filter((a: any) => !['ready', 'cancelled'].includes(a.status)).length, drycleaning: (CR || []).filter((r: any) => r.status === 'to_be_sent' || r.status === 'returned_pending_check').length, approvals: pendingAppr }
  const navButtons=(keys:string[],close=false)=>myNav.filter(n=>keys.includes(n[0])).map(([k,l,i])=>{const on=tab===k||(k==='reports'&&tab==='performance');return <button key={k} type="button" className={'nv'+(on?' on':'')} aria-current={on?'page':undefined} onClick={()=>{if(close)setDrawer(false);go(k)}}><Ic n={i} s={20}/><span className="nv-l">{l}</span>{navCount[k]!==undefined&&<span className="nv-n">{navCount[k]}</span>}</button>})
  const navTree=(close=false)=>navGroups.map(([label,keys])=>myNav.some(n=>keys.includes(n[0]))&&<section className="adm-nav-group" key={keys.join()} aria-label={label||undefined}>{label&&<div className="adm-nav-label" aria-hidden="true">{label}</div>}{navButtons(keys,close)}</section>)
  const BOT = ['dashboard', 'bookings', 'alterations', 'drycleaning'].map(k => myNav.find(n => n[0] === k)).filter(Boolean) as typeof NAV
  return (<div className="adm">
    <header className="adm-top"><button className="ham" aria-label="Open menu" onClick={() => setDrawer(true)}><Ic n="menu" s={24} /></button><b>{pageTitle || 'Swaasa'}</b><span className="sp" />{ops && <a className="adm-newbk-top" href="/collection#collection" aria-label="New Booking"><Ic n="plus" s={16} />New Booking</a>}<Notifications ctx={ctx}/><img src="/logo-mark.png" alt="" /></header>
    <aside className="adm-side"><div className="adm-side-bell"><Notifications ctx={ctx} placement="side" /></div>
      <div className="adm-brand"><img src="/logo-mark.png" alt="" /><b>Swaasa</b><span>Wedding Rentals</span></div>
      {ops && <a className="adm-newbk" href="/collection#collection"><Ic n="plus" s={20} />New Booking</a>}
      {navTree()}
      <span className="sp" />
      <div className="adm-me"><i>{(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase()}</i><div><b>{name}</b><span>{role === 'manager' ? 'Staff' : role}</span></div>
        <button type="button" className="adm-out" aria-label="Sign out" title="Sign out" onClick={async () => { await sb.auth.signOut(); location.href = '/login' }}><Ic n="out" s={18} /></button></div></aside>
    <main className="adm-main">{(tab === 'settings' || tab === 'prep') && <PageHead icon={tab === 'settings' ? 'gear' : 'scissors'} title={title} sub={tab === 'settings' ? 'Staff logins, cleaning period, refundable deposit rules and alert timing.' : 'Alterations to complete before delivery.'} />}
    {note && <p style={{ background: 'var(--blush)', padding: '8px 12px' }}><b>{note}</b></p>}
    {tab === 'dashboard' && ops && <Dashboard ctx={ctx} />}
    {tab === 'prep' && <PrepBoard ctx={ctx} />}
    {tab === 'drycleaning' && ops && <DryCleaning ctx={ctx} />}
    {tab === 'alterations' && ops && <Alterations ctx={ctx} />}
    {tab === 'approvals' && owner && <Approvals ctx={ctx} />}
    {tab === 'cash' && ops && <Finance ctx={ctx} />}
    {tab === 'performance' && owner && <Performance ctx={ctx} />}
    {tab === 'confidence' && owner && <Confidence ctx={ctx} />}
    {tab === 'bookings' && ops && <Bookings ctx={ctx} flt={flt} setFlt={setFlt} />}
    {tab === 'calendar' && ops && <Calendar ctx={ctx} onBlock={block} onBlockInfo={blockInfo} />}
    {tab === 'dresses' && ops && <Inventory ctx={ctx} D={D} owner={owner} onAdd={() => { setEd(null); setShowForm(true) }} onEdit={d => { setEd(d); setShowForm(true) }}
      form={showForm && owner ? <DressForm key={ed?.id || 'new'} ctx={ctx} ed={ed} onClose={() => { setShowForm(false); setEd(null) }} /> : null}
      extra={owner && D.some(d => (d.images || []).some((_: string, i: number) => !d.thumbs?.[i])) ? <div style={{ margin: '0 0 10px' }}><button className="btn alt sm" onClick={optimisePhotos}>Make photos load faster</button> <span className="mut" style={{ fontSize: 12 }}>One-time. Creates small copies of existing photos.</span></div> : null} />}
    {tab === 'customers' && owner && <Customers ctx={ctx}/>}
    {tab === 'reports' && owner && <Performance ctx={ctx} />}
    {tab === 'settings' && owner && <div style={{ display: 'grid', gap: 16 }}>
      <MfaSetup sb={sb} />
      <StaffAdmin ctx={ctx} />
      {st && <form className="box" style={{ margin: 0 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const { error } = await sb.from('settings').update({ buffer_days: +(f.get('b') as string), advance_pct: +(f.get('a') as string), advance_min: +(f.get('m') as string), alert_horizon_days: +(f.get('ah') as string), clean_lead_days: +(f.get('cl') as string), alert_idle_days: +(f.get('ai') as string), alt_soon_days: +(f.get('as') as string), measure_by_days: +(f.get('mb') as string), send_by_days: +(f.get('sd') as string), tailor_days: +(f.get('td') as string), late_grace_days: +(f.get('lg') as string) || 0 }).eq('id', 1); say(error ? error.message : 'Settings saved'); load() }}>
        <h3>Settings</h3><div className="flt" style={{ justifyContent: 'flex-start' }}><label style={{ margin: 0 }}>Cleaning and preparation days after each return<input name="b" type="number" min="0" max="7" defaultValue={st.buffer_days} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Refundable deposit: % of rent<input name="a" type="number" min="0" max="100" defaultValue={st.advance_pct} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Refundable deposit: minimum ₹ (the higher of the two applies)<input name="m" type="number" min="0" defaultValue={st.advance_min ?? 1000} style={{ display: 'block' }} /></label>
        </div>
        <h4 style={{ margin: '14px 0 4px' }}>Alert timing (days)</h4>
        <div className="flt" style={{ justifyContent: 'flex-start' }}>
          <label style={{ margin: 0 }}>Look ahead for preparation problems<input name="ah" type="number" min="1" max="30" defaultValue={st.alert_horizon_days ?? 7} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Time a dress in To Be Sent needs before delivery<input name="cl" type="number" min="1" max="14" defaultValue={st.clean_lead_days ?? 3} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Warn about an item waiting to be sent after<input name="ai" type="number" min="1" max="30" defaultValue={st.alert_idle_days ?? 3} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>&ldquo;Alteration due soon&rdquo; window<input name="as" type="number" min="1" max="14" defaultValue={st.alt_soon_days ?? 2} style={{ display: 'block' }} /></label></div>
        <h4 style={{ margin: '14px 0 4px' }}>Checkpoints for dresses with alterations (days before delivery)</h4>
        <div className="flt" style={{ justifyContent: 'flex-start' }}>
          <label style={{ margin: 0 }}>Measurements must be taken by<input name="mb" type="number" min="1" max="30" defaultValue={st.measure_by_days ?? 5} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Dress must be with the tailor by<input name="sd" type="number" min="1" max="30" defaultValue={st.send_by_days ?? 4} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Usual tailor turnaround (days)<input name="td" type="number" min="1" max="21" defaultValue={st.tailor_days ?? 3} style={{ display: 'block' }} /></label>
          <label style={{ margin: 0 }}>Free days after the return date before a late fee starts<input name="lg" type="number" min="0" max="14" defaultValue={st.late_grace_days ?? 0} style={{ display: 'block' }} /></label></div>
        <p className="mut" style={{ fontSize: 12 }}>A warning appears on the bell and the Today list when one of these dates passes and the step is still not done. The turnaround is used for the warning when a booking is taken with too little time.</p>
        <p className="mut" style={{ fontSize: 12 }}>A changed cleaning period applies to new bookings. Bookings already made keep the gap they were made with.</p><button className="btn">Save settings</button></form>}</div>}
    </main>
    {ops && <nav className="adm-bot" aria-label="Main">{BOT.map(([k, l, i]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => goNav(k)}><Ic n={i} s={22} /><span>{l}</span>{!!navCount[k] && <i className="bn">{navCount[k]}</i>}</button>)}<button className={drawer ? 'on' : ''} onClick={() => setDrawer(true)}><Ic n="menu" s={22} /><span>More</span></button></nav>}
    {drawer && <div className="adm-sheet" onClick={() => setDrawer(false)}><div className="in" onClick={e => e.stopPropagation()}><div className="hd"><img src="/logo-mark.png" alt="" /><div><b>Swaasa</b><span>Wedding Rentals</span></div><button onClick={() => setDrawer(false)} aria-label="Close menu">✕</button></div>
      {ops && <a className="adm-newbk" href="/collection#collection"><Ic n="plus" s={20} />New Booking</a>}
      {navTree(true)}
      <div className="me"><i>{(name || '?').trim().charAt(0).toUpperCase()}</i><div><b>{name}</b><span>{role === 'manager' ? 'Staff' : role}</span></div></div>
      <button className="out" onClick={async () => { await sb.auth.signOut(); location.href = '/login' }}><Ic n="out" s={20} />Sign out</button></div></div>}
    {ob && <BookingModal key={ob.id} ctx={ctx} b={ob} limited={!ops} onClose={() => setOpenB(null)} />}
    {payB && B.find(x => x.id === payB) && <PaymentRecord key={payB} ctx={ctx} b={B.find(x => x.id === payB)} onClose={() => setPayB(null)} />}
    {cdec && <CancelDecision a={cdec.a} b={cdec.b} onClose={v => { const r = cdec.res; setCdec(null); r(v) }} />}
    {cx && <CancelBooking key={cx.b.id} b={cx.b} owner={owner} onClose={v => { const r = cx.res; setCx(null); r(v) }} />}
    {rw && <ReturnWizard key={rw.b.id} ctx={ctx} b={rw.b} owing={rw.owing} late={rw.late} lateFee={rw.lateFee} onClose={v => { const r = rw.res; setRw(null); r(v) }} />}
    {dlg && <div data-overlay style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 95, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }}>
      <form className="box" style={{ background: 'var(--bg)', maxWidth: 440, width: '100%' }} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget), v: Record<string, any> = {}; dlg.fields.forEach((x: Fld) => { v[x.name] = x.type === 'file' ? f.getAll(x.name).filter((z: any) => z instanceof File && z.size) : String(f.get(x.name) ?? '') }); const r = dlg.res; setDlg(null); r(v) }}>
        <h3>{dlg.title}</h3>{dlg.note && <p className="mut">{dlg.note}</p>}
        {dlg.fields.map((x: Fld, i: number) => <label key={x.name}>{x.label}{x.options ? <select name={x.name} defaultValue={x.required ? '' : x.value} required={x.required}>{x.required && <option value="">Select…</option>}{x.options.map(o => <option key={o}>{o}</option>)}</select> : x.type === 'file' ? <input name={x.name} type="file" accept={x.accept} multiple={x.multiple} /> : <><input name={x.name} type={x.type || 'text'} defaultValue={x.value} required={x.required} autoFocus={i === 0} list={x.suggestions ? `dl-${x.name}` : undefined} autoComplete={x.suggestions ? 'off' : undefined} />{x.suggestions && <datalist id={`dl-${x.name}`}>{x.suggestions.map(o => <option key={o} value={o} />)}</datalist>}</>}</label>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn">{dlg.ok}</button><button type="button" className="btn alt" onClick={() => { const r = dlg.res; setDlg(null); r(null) }}>Cancel</button></div></form></div>}
    {prev && <img src={prev.src} alt="" style={{ position: 'fixed', left: prev.x, top: prev.y, width: 240, maxHeight: 320, objectFit: 'cover', zIndex: 90, boxShadow: '0 8px 30px #0006', pointerEvents: 'none', background: 'var(--bg)' }} />}
    {day && (() => {
      // Group the day by what actually happens on it, so the list matches the counts in the notification (e.g. "1 delivery, 2 returns").
      // Bookings that merely overlap the date (still with a customer, or already returned early) go in a collapsed "also" section.
      const on = live.filter(b => day >= b.start_date && day <= b.end_date), away = DC.filter(c => day >= c.sent_on && day <= dcEnd(c)), blk = K.filter(k => day >= k.start_date && day <= k.end_date)
      const dels = on.filter(b => b.start_date === day), rets = on.filter(b => b.end_date === day && b.start_date !== day), rest = on.filter(b => b.start_date !== day && b.end_date !== day)
      const pill = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
      const card = (b: any, what: string) => <div key={b.id} className="box" onClick={() => openBooking(b.id)} style={{ display: 'flex', gap: 12, cursor: 'pointer' }}>{thumb(dmap[b.dress_id], 72, 96)}<div style={{ flex: 1, minWidth: 0 }}><div className="row"><b>{b.dress_code} · {b.dress_name}</b><span style={{ color: COL[state(b)] }}>{state(b)}</span></div>
        <div>{what} · {b.customer_name} · <a href={'tel:' + b.phone} onClick={e => e.stopPropagation()}>{b.phone}</a></div>
        <div className="mut">{b.start_date} → {b.end_date} · Balance {inr(b.rent + b.charges - b.paid)} · ID {b.id}</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 4 }}>{b.alteration_notes ? <>✂ {b.alteration_notes}</> : <span className="mut">No alteration notes</span>}</div></div></div>
      const head = (t: string) => <h4 style={{ margin: '14px 0 6px' }}>{t}</h4>
      return (<div onClick={() => setDay(null)} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }}>
        <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 580, width: '100%' }}>
          <div className="row"><h3>{new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button className="btn alt sm" onClick={() => setDay(null)}>Close</button></div>
          {(dels.length > 0 || rets.length > 0) && <p className="mut" style={{ margin: '2px 0 0' }}>{[dels.length && pill(dels.length, 'delivery', 'deliveries'), rets.length && pill(rets.length, 'return due', 'returns due')].filter(Boolean).join(' · ')}</p>}
          {!on.length && !away.length && !blk.length && <p className="mut">No bookings on this day.</p>}
          {dels.length > 0 && <>{head(`Deliveries (${dels.length})`)}{dels.map(b => card(b, 'Delivery'))}</>}
          {rets.length > 0 && <>{head(`Returns due (${rets.length})`)}{rets.map(b => card(b, 'Return due'))}</>}
          {rest.length > 0 && <details style={{ marginTop: 14 }}><summary className="mut" style={{ cursor: 'pointer' }}>Also booked on this date, no action needed ({rest.length})</summary>{rest.map(b => card(b, b.status === 'out' ? 'With customer' : state(b) === 'returned' ? 'Already returned' : 'Booked'))}</details>}
          {away.length > 0 && <>{head('At the dry cleaner')}{away.map(c => <div key={c.id} className="box" style={{ display: 'flex', gap: 12, cursor: 'pointer' }} onClick={() => go('drycleaning')}>{thumb(dmap[c.dress_id], 48, 64)}<div>Out for dry cleaning: <b>{dmap[c.dress_id]?.code} · {dmap[c.dress_id]?.name}</b><div className="mut">Sent {c.sent_on}{c.returned_on ? `, back ${c.returned_on}` : `, expected back ${c.expected_back}`}</div></div></div>)}</>}
          {blk.length > 0 && <>{head('Blocked')}{blk.map(k => <div key={k.id} className="box" style={{ display: 'flex', gap: 12 }}>{thumb(dmap[k.dress_id], 48, 64)}<div>Blocked: <b>{dmap[k.dress_id]?.code} · {dmap[k.dress_id]?.name}</b> · {k.reason || 'no reason given'} ({k.start_date} → {k.end_date})</div></div>)}</>}
        </div></div>)
    })()}
  </div>)
}
