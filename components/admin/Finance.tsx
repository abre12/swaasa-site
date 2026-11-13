'use client'
import { fetchAll } from '@/lib/fetchAll'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { addD, dbMsg, inr, istTime, todayIST } from '@/lib/util'
import { downloadBlob, makeWorkbook, Cell } from '@/lib/xlsx'
import { Ic } from './icons'
import PageHead from './PageHead'
import MonthPick from './MonthPick'

// ---- How money is counted (also in the README) ------------------------------------------------------------------------------------------
//  * Transactions = every payment received and every refund paid, from the payments table, by the date it was recorded (India time).
//  * The cash drawer uses ONLY entries whose payment mode is Cash. Expected cash = opening + cash received - cash refunds - cash expenses.
//  * Expenses are never customer income. A cash expense lowers the drawer automatically; UPI, card and bank expenses do not.
//  * A charge settled out of the security deposit is shown by its real category (damage, late return...) with the mode "From Security Deposit".
//    No money changes hands, so it is not "collected" and never touches the drawer.
const tint = (c: string): React.CSSProperties => ({ ['--c' as any]: c })
const MODES = ['Cash', 'GPay / UPI', 'Card', 'Bank transfer']
// expense category -> [icon, colour]
export const EXP: Record<string, [string, string]> = {
  'Store Rent': ['home', '#c58a2b'], 'Utilities': ['bolt', '#7a5fc0'], 'Salaries': ['users', '#8a6fd0'], 'Staff Bonus & Incentives': ['gift', '#d0586e'], 'Staff Refreshments (Petty Cash)': ['cup', '#c9792b'],
  'Dry Cleaning': ['sparkle', '#d08a2b'], 'Store Maintenance': ['wrench', '#8a5fb0'], 'Delivery / Transport': ['box', '#c9792b'], 'Business Overheads': ['gear', '#7a6aa6'], 'Other Expenses': ['dots2', '#8a8a8a'] }
const EXP_NAMES = Object.keys(EXP)
const PAYCOL: Record<string, string> = { 'Advance Received': '#2f6fd0', 'Rental Charges': '#2f6fd0', 'Customisation Charges': '#7a4fb0', 'Damage Charges': '#c9792b', 'Late Return Charges': '#b8860b', 'Cleaning Charges': '#c9792b', 'Other Charges': '#7a7a7a',
  'Security Deposit Received': '#7a4fb0', 'Security Deposit Refund': '#c0392b', 'Advance Refund': '#c0392b', 'Other Refund': '#c0392b' }
const modeKey = (m?: string | null) => /deposit adj|from security deposit/i.test(m || '') ? 'dep' : /cash/i.test(m || '') ? 'cash' : /upi|gpay|google|online/i.test(m || '') ? 'upi' : /card/i.test(m || '') ? 'card' : /bank|neft|imps|transfer/i.test(m || '') ? 'bank' : 'other'
const MODE_UI: Record<string, [string, string]> = { cash: ['Cash', 'cash'], upi: ['UPI / Online', 'qr'], card: ['Card', 'card'], bank: ['Bank Transfer', 'bank'], dep: ['From Security Deposit', 'coins'], other: ['Other', 'wallet'] }
const ModeCell = ({ m }: { m?: string | null }) => { const [l, i] = MODE_UI[modeKey(m)]; return <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}><Ic n={i} s={18} style={{ color: 'var(--blue)' }} />{l}</span> }
const Pill = ({ cat }: { cat: string }) => { const c = PAYCOL[cat] || EXP[cat]?.[1] || '#7a7a7a', ic = EXP[cat]?.[0]; return <span className="bdg" style={tint(c)}>{ic && <Ic n={ic} s={14} />}{cat}</span> }
// The category pill already says what the charge is, so a remark that only repeats it (e.g. "Late-return fee" under Late Return Charges) is hidden.
// A remark with extra detail ("Damage / repair / cleaning charge: torn hem") keeps just the detail.
const GENERIC_REMARK = /^(unpaid rent|unpaid customi[sz]ation charge|earlier late fee \/ charges|late-return fee|damage \/ repair \/ cleaning charge)\s*:?\s*/i
const remNote = (t: string | null | undefined) => { const x = (t || '').trim(); const m = x.match(GENERIC_REMARK); return m ? x.slice(m[0].length).trim() : x }
export function payCat(r: any): string {
  const pu = r.purpose || ({ rent: 'rent', deposit: 'deposit', deposit_refund: 'deposit_refund', rent_refund: 'rent_refund', charge: 'deposit_applied' } as any)[r.kind] || 'rent'
  const m: Record<string, string> = { advance: 'Advance Received', rent: 'Rental Charges', customization: 'Customisation Charges', damage: 'Damage Charges', late_fee: 'Late Return Charges', cleaning: 'Cleaning Charges', other_charge: 'Other Charges',
    deposit: 'Security Deposit Received', deposit_refund: 'Security Deposit Refund', advance_refund: 'Advance Refund', rent_refund: 'Other Refund' }
  if (pu !== 'deposit_applied') return m[pu] || 'Rental Charges'
  const t = r.remarks || ''; return /damage/i.test(t) ? 'Damage Charges' : /late/i.test(t) ? 'Late Return Charges' : /customi/i.test(t) ? 'Customisation Charges' : /rent/i.test(t) ? 'Rental Charges' : 'Other Charges'
}
const when = (ts: string) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).replace(/ (am|pm)/, (_, x) => ' ' + x.toUpperCase())
const monthEnd = (m: string) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7) }
const addDate = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dateRange = (quick: string, month: string, from: string, to: string, today: string): [string, string] => {
  if (quick === 'custom') return [from || today, to || from || today]
  if (quick === 'today') return [today, today]
  if (quick === 'yesterday') { const y = addDate(today, -1); return [y, y] }
  if (quick === 'week') { const d = new Date(today + 'T00:00:00Z'), offset = (d.getUTCDay() + 6) % 7, s = addDate(today, -offset); return [s, addDate(s, 6)] }
  if (quick === 'last') { const prev = new Date(month + '-01T00:00:00Z'); prev.setUTCMonth(prev.getUTCMonth() - 1); const m = prev.toISOString().slice(0, 7); const e = new Date(m + '-01T00:00:00Z'); e.setUTCMonth(e.getUTCMonth() + 1); e.setUTCDate(0); return [m + '-01', e.toISOString().slice(0, 10)] }
  return [month + '-01', addDate(monthEnd(month) + '-01', -1)]
}
const money = (n: number, sign = false) => (sign && n > 0 ? '+' : n < 0 ? '−' : '') + inr(Math.abs(n))

// Add expense: also used by the Dashboard's quick button.
export async function addExpense(ctx: any, pre: any = {}): Promise<boolean> {
  const v = await ctx.ask('Add expense', [
    { name: 'c', label: 'Expense category', options: EXP_NAMES, value: pre.c || EXP_NAMES[0], required: true }, { name: 'a', label: 'Amount (₹)', type: 'number', value: pre.a || '', required: true },
    { name: 'm', label: 'Payment mode', options: MODES, value: pre.m || 'Cash', required: true }, { name: 'p', label: 'Payee / vendor (optional)', value: pre.p || '' },
    { name: 'b', label: 'Booking ID (optional)', value: pre.b || '' }, { name: 'r', label: 'Remarks (required for Other Expenses)', value: pre.r || '' }],
    { ok: 'Save expense', note: 'Recorded with today’s date. A cash expense lowers the expected cash in the drawer straight away; UPI, card and bank expenses do not. It cannot be edited later; the owner can void a wrong entry.' }); if (!v) return false
  const a = Math.round(+v.a), r = v.r.trim(), bid = v.b.trim().toUpperCase()
  const bad = !(a > 0) ? 'Enter an amount.' : v.c === 'Other Expenses' && r.length < 3 ? 'Please describe what this expense was for.' : bid && !ctx.B.find((b: any) => b.id === bid) ? `Booking ${bid} was not found.` : ''
  if (bad) { ctx.say(bad); return addExpense(ctx, v) }
  const { error } = await ctx.sb.from('cash_expenses').insert({ amount: a, category: v.c, mode: v.m, payee: v.p.trim() || null, booking_id: bid || null, remarks: r || v.c })
  ctx.say(error ? error.message : `${inr(a)} expense recorded${v.m === 'Cash' ? ' (taken from the drawer)' : ''}`); ctx.load(); return !error
}

type TabKey = 'tx' | 'cash' | 'exp'
export default function Finance({ ctx }: { ctx: any }) {
  const owner = ctx.owner, today = todayIST()
  const [tab, setTab] = useState<TabKey>('tx'), [month, setMonth] = useState(today.slice(0, 7)), [date, setDate] = useState(today)
  const [txView, setTxView] = useState<'transaction' | 'booking'>('transaction'), [txQuick, setTxQuick] = useState('month'), [txFrom, setTxFrom] = useState(''), [txTo, setTxTo] = useState(''), [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [txStart, txEnd] = dateRange(txQuick, month, txFrom, txTo, today)
  const [pays, setPays] = useState<any[]>([]), [todayPays, setTodayPays] = useState<any[]>([]), [exps, setExps] = useState<any[]>([]), [book, setBook] = useState<any>(null)
  const [err, setErr] = useState(''), [loading, setLoading] = useState(true), [showF, setShowF] = useState(false), [fl, setFl] = useState({ mode: '', cat: '', dir: '', q: '' }), [cnt, setCnt] = useState(''), [cnote, setCnote] = useState('')
  const set = (k: string, v: string) => setFl({ ...fl, [k]: v }), nF = Object.values(fl).filter(Boolean).length
  useEffect(() => { setFl({ mode: '', cat: '', dir: '', q: '' }); setShowF(false) }, [tab])

  useEffect(() => { let off = false; (async () => {
    setLoading(true); setErr('')
    const sel = 'id,booking_id,amount,kind,purpose,mode,created_at,created_by,remarks,bookings(id,customer_name)'
    const rng = (a: string, b: string) => [new Date(`${a}T00:00:00+05:30`).toISOString(), new Date(`${b}T00:00:00+05:30`).toISOString()]
    if (tab === 'tx') {
      const [f, t] = rng(txStart, addD(txEnd, 1)), [tf, tt] = rng(today, addD(today, 1))
      const [p, tp] = await Promise.all([fetchAll(() => ctx.sb.from('payments').select(sel).gte('created_at', f).lt('created_at', t).order('created_at', { ascending: false }).order('id')), ctx.sb.from('payments').select(sel).gte('created_at', tf).lt('created_at', tt)])
      if (off) return; if (p.error || tp.error) setErr('Could not load the transactions. Please refresh.'); setPays(p.data || []); setTodayPays(tp.data || [])
    } else if (tab === 'exp') {
      const x = await fetchAll(() => ctx.sb.from('cash_expenses').select('*').gte('spent_on', month + '-01').lt('spent_on', monthEnd(month) + '-01').order('created_at', { ascending: false }).order('id'))
      if (off) return; if (x.error) setErr('Could not load the expenses. Please refresh.'); setExps(x.data || [])
    } else {
      const [f, t] = rng(date, addD(date, 1))
      const [p, x, cb] = await Promise.all([ctx.sb.from('payments').select(sel).gte('created_at', f).lt('created_at', t).order('created_at'), ctx.sb.from('cash_expenses').select('*').eq('spent_on', date).order('created_at'), ctx.sb.rpc('cash_book', { p_day: date })])
      if (off) return
      if (cb.error) setErr(cb.error.message.includes('FORBIDDEN') ? 'Only the owner can open dates before this month.' : 'Could not load the cash book. Please refresh.'); else if (p.error || x.error) setErr('Could not load this date. Please refresh.')
      setPays(p.data || []); setExps(x.data || []); setBook(cb.data?.[0] || null)
    }
    setLoading(false) })(); return () => { off = true } }, [tab, month, date, txStart, txEnd, ctx.fullTick, ctx.sb])   // date-range reports refresh with each full load, not every 30s poll
  useEffect(() => { setCnt(book?.counted != null ? String(book.counted) : ''); setCnote(book?.note || '') }, [book])

  const B: any[] = ctx.B, owe = (b: any) => Math.max(0, b.rent + b.charges - b.paid)
  const candidates = () => B.filter(b => b.status !== 'cancelled').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80)
  const optB = (l: any[]) => l.map(b => `${b.id} · ${b.dress_code} · ${b.customer_name} · due ${inr(owe(b))}`)
  async function recordPayment() {
    const OPT: Record<string, [string, string]> = { 'Rental charges (balance)': ['rent', 'rent'], 'Customisation charges': ['rent', 'customization'], 'Damage charges': ['rent', 'damage'], 'Late return charges': ['rent', 'late_fee'], 'Cleaning charges': ['rent', 'cleaning'], 'Other charges': ['rent', 'other_charge'], 'Security deposit received': ['deposit', 'deposit'] }
    const v = await ctx.ask('Record payment', [{ name: 'b', label: 'Booking', options: optB(candidates()), required: true }, { name: 't', label: 'What is it for?', options: Object.keys(OPT), required: true }, { name: 'a', label: 'Amount (₹)', type: 'number', required: true }, { name: 'm', label: 'Payment mode', options: MODES, required: true }, { name: 'r', label: 'Remarks (optional)' }],
      { ok: 'Save payment', note: 'Recorded with today’s date and time. Earlier entries are never changed. For the advance taken when booking, use the booking screen.' }); if (!v) return
    const b = B.find(x => x.id === v.b.split(' · ')[0]), a = Math.round(+v.a), [kind, purpose] = OPT[v.t]; if (!b || !(a > 0)) return ctx.say('Enter a valid amount.')
    const { error } = await ctx.sb.rpc('record_payment', { p_booking: b.id, p_rows: [{ amount: a, kind, purpose, mode: v.m, remarks: v.r.trim() || null }] }); ctx.say(error ? dbMsg(error.message) : `${inr(a)} received`); ctx.load()
  }
  async function recordRefund() {
    const OPT: Record<string, [string, string]> = { 'Security deposit refund': ['deposit_refund', 'deposit_refund'], 'Advance refund': ['rent_refund', 'advance_refund'], 'Other refund': ['rent_refund', 'rent_refund'] }
    const v = await ctx.ask('Record refund', [{ name: 'b', label: 'Booking', options: optB(B.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80)), required: true }, { name: 't', label: 'Refund type', options: Object.keys(OPT), required: true }, { name: 'a', label: 'Amount (₹)', type: 'number', required: true }, { name: 'm', label: 'Paid back by', options: MODES, required: true }, { name: 'r', label: 'Remarks (required for Other refund)' }],
      { ok: 'Save refund', note: 'A refund paid in cash lowers the expected cash in the drawer straight away.' }); if (!v) return
    const b = B.find(x => x.id === v.b.split(' · ')[0]), a = Math.round(+v.a), [kind, purpose] = OPT[v.t]; if (!b || !(a > 0)) return ctx.say('Enter a valid amount.')
    if (kind === 'deposit_refund' && a > b.deposit_held) return ctx.say(`Only ${inr(Math.max(0, b.deposit_held))} of deposit is held for this booking.`)
    if (kind === 'rent_refund' && a > b.paid) return ctx.say(`Only ${inr(Math.max(0, b.paid))} has been received for this booking.`)
    if (v.t === 'Other refund' && v.r.trim().length < 3) return ctx.say('Please say why the refund is being made.')
    if(!owner){const {error}=await ctx.sb.rpc('request_action_approval',{p_booking:b.id,p_action:'refund',p_details:{amount:a,kind,purpose,mode:v.m,remarks:v.r.trim()||null,reason:v.r.trim()||v.t}});ctx.say(error?error.message.includes('PENDING_EXISTS')?'A refund request is already waiting for the owner.':'Could not request the refund.':'Refund request sent to the owner.');ctx.load();return}
    const { error } = await ctx.sb.rpc('record_payment', { p_booking: b.id, p_rows: [{ amount: a, kind, purpose, mode: v.m, remarks: v.r.trim() || null }] }); ctx.say(error ? dbMsg(error.message) : `${inr(a)} refunded`); ctx.load()
  }
  async function setupOpening() {
    if (!owner) return ctx.say('Ask the owner to set the opening cash first.')
    const v = await ctx.ask(book?.opening_known ? 'Update opening cash' : 'Set opening cash', [{ name: 'a', label: 'Cash in the drawer at the START of that day (₹)', type: 'number', required: true }, { name: 'd', label: 'Date', type: 'date', value: date, required: true }], { ok: 'Save opening cash', note: 'Do this once, for the first day you use the cash counter. After this, every day opens with the previous day’s counted cash.' }); if (!v) return
    const { error } = await ctx.sb.rpc('set_cash_opening', { p_amount: Math.round(+v.a), p_date: v.d })
    ctx.say(error ? (error.message.includes('ALREADY_TALLIED') ? 'A day on or after that date has already been counted, so the opening cannot be moved.' : 'Could not save the opening cash.') : 'Opening cash saved'); ctx.load()
  }
  async function saveCount() {
    const counted = Math.round(+cnt), diff = counted - book.expected
    const { error } = await ctx.sb.rpc('tally_cash', { p_day: date, p_counted: counted, p_note: cnote.trim() }), m = error?.message || ''
    ctx.say(!error ? (diff === 0 ? 'Reconciled: the cash matches.' : `Saved: ${inr(Math.abs(diff))} ${diff < 0 ? 'short' : 'in excess'}.`) : m.includes('ALREADY_TALLIED') ? 'This day was already counted. Only the owner can change it.' : m.includes('OPENING_REQUIRED') ? 'Set the opening cash first.' : m.includes('REMARK') ? 'Please add a remark for the difference.' : 'Could not save the count.'); ctx.load()
  }
  async function voidExp(x: any) {
    const v = await ctx.ask('Void this expense?', [{ name: 'r', label: 'Reason (kept in the audit trail)', required: true }], { ok: 'Void expense', note: `${inr(x.amount)} · ${x.category}. A voided expense stops counting and the drawer total goes back up. Nothing is deleted.` }); if (!v) return
    const { error } = await ctx.sb.rpc('void_expense', { p_id: x.id, p_reason: v.r }); ctx.say(error ? 'Could not void it.' : 'Expense voided'); ctx.load()
  }
  const bkLink = (id?: string | null) => id ? <a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(id) }} style={{ fontWeight: 600 }}>{id}</a> : <span className="mut">—</span>
  const by = (id?: string | null) => ctx.staffName(id) || '—'
  const Card = ({ ic, c, v, l, sub, dark }: { ic: string; c: string; v: string; l: string; sub?: string; dark?: boolean }) => <div className={'kc st' + (dark ? ' dark' : '')} style={tint(c)}><Ic n={ic} s={dark ? 32 : 28} /><div><b>{v}</b><span>{l}</span>{sub && <small>{sub}</small>}</div></div>
  const FBtn = () => <button className="btn alt sm" onClick={() => setShowF(!showF)} style={{ padding: '9px 14px' }}><Ic n="filter" s={15} /> Filters{nF ? ` (${nF})` : ''}</button>
  const Sel = ({ k, label, opts }: { k: string; label: string; opts: [string, string][] }) => <label>{label}<select value={(fl as any)[k]} onChange={e => set(k, e.target.value)}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
  const MonthP = () => <MonthPick compact value={month} max={today.slice(0, 7)} onChange={v => v && setMonth(v)} />
  const modeOpts: [string, string][] = [['', 'All payment modes'], ['cash', 'Cash'], ['upi', 'UPI / Online'], ['card', 'Card'], ['bank', 'Bank Transfer']]

  // ---------------- Tab 1: Transactions ----------------
  const txRows = useMemo(() => pays.map(r => { const refund = r.kind.endsWith('refund'), cat = payCat(r); return { id: r.id, at: r.created_at, booking: r.booking_id, who: r.bookings?.customer_name || '', cat, amount: refund ? -r.amount : r.amount, mode: r.mode, by: r.created_by, rem: remNote(r.remarks), kind: r.kind } })
    .filter(t => (!fl.mode || modeKey(t.mode) === fl.mode) && (!fl.cat || t.cat === fl.cat) && (!fl.dir || (fl.dir === 'in' ? t.amount > 0 : t.amount < 0)) && (!fl.q || (t.who + t.booking + t.rem).toLowerCase().includes(fl.q.toLowerCase()))), [pays, fl])
  const groupedTx = useMemo(() => {
    const groups: Record<string, any> = {}
    for (const t of txRows) { const g = (groups[t.booking] ||= { booking: t.booking, who: t.who, latest: t.at, items: [], cats: {}, modes: new Set<string>(), remarks: new Set<string>(), staff: new Set<string>() }); g.items.push(t); if (t.at > g.latest) g.latest = t.at; g.cats[t.cat] = (g.cats[t.cat] || 0) + t.amount; if (t.mode) g.modes.add(modeKey(t.mode)); if (t.rem) g.remarks.add(t.rem); if (t.by) g.staff.add(by(t.by)) }
    return Object.values(groups).sort((a: any, b: any) => b.latest.localeCompare(a.latest)).map((g: any) => ({ ...g, items: g.items.sort((a: any, b: any) => a.at.localeCompare(b.at)), modes: [...g.modes], remarks: [...g.remarks], staff: [...g.staff] }))
  }, [txRows])
  const received = pays.filter(r => ['rent', 'deposit'].includes(r.kind)), collected = received.reduce((s, r) => s + r.amount, 0)
  const cashToday = todayPays.filter(r => ['rent', 'deposit'].includes(r.kind) && modeKey(r.mode) === 'cash').reduce((s, r) => s + r.amount, 0)
  const pending = B.filter(b => b.status !== 'cancelled').reduce((s, b) => s + owe(b), 0), depHeld = B.reduce((s, b) => s + Math.max(0, b.deposit_held), 0), refPending = B.filter(b => b.status === 'out').reduce((s, b) => s + ctx.refundRef(b), 0)
  const catsSeen = [...new Set(pays.map(payCat))].sort()
  async function exportTx() {
    if (txView === 'booking') {
      const cats = ['Advance Received','Rental Charges','Customisation Charges','Security Deposit Received','Security Deposit Refund','Late Return Charges','Damage Charges','Other Charges']
      const head = ['Booking ID','Customer','Latest Transaction',...cats,'Payment Mode','Remarks','Entered By'].map(t => ({ t, s: 'head' as const }))
      const rows: Cell[][] = groupedTx.map((g: any) => [g.booking,g.who,when(g.latest),...cats.map(c => g.cats[c] ? { n:g.cats[c], s:g.cats[c]<0?'moneyRed':'money' } as Cell : '—'),g.modes.length === 1 ? MODE_UI[g.modes[0]][0] : g.modes.length ? 'Multiple Modes' : '—',g.remarks.length === 1 ? g.remarks[0] : g.remarks.length ? 'Multiple' : '—',g.staff.length === 1 ? g.staff[0] : g.staff.length ? 'Multiple' : '—'])
      downloadBlob(await makeWorkbook([{ name:'Grouped by Booking', widths:[16,24,20,18,18,20,22,22,18,16,18,28,18], rows:[[ {t:`Swaasa Wedding Rentals: grouped transactions ${txStart} to ${txEnd}`,s:'title'}],[],head,...rows] }]),`swaasa-booking-transactions-${txStart}-${txEnd}.xlsx`)
    } else {
      const head = ['Date and time', 'Booking ID', 'Customer', 'Category', 'Payment mode', 'Amount', 'Remarks', 'Entered by'].map(t => ({ t, s: 'head' as const }))
      const rows: Cell[][] = txRows.map(t => [when(t.at), t.booking, t.who, t.cat, MODE_UI[modeKey(t.mode)][0], { n: t.amount, s: t.amount < 0 ? 'moneyRed' : 'money' }, t.rem, by(t.by)])
      downloadBlob(await makeWorkbook([{ name: 'Transactions', widths: [20, 14, 24, 26, 22, 14, 36, 16], rows: [[{ t: `Swaasa Wedding Rentals: transactions ${txStart} to ${txEnd}`, s: 'title' }], [], head, ...rows] }]), `swaasa-transactions-${txStart}-${txEnd}.xlsx`)
    }
  }

  // ---------------- Tab 2: Cash Counter ----------------
  const known = !!book?.opening_known, tallied = !!book?.status
  const mv = useMemo(() => [
    ...pays.filter(r => r.kind !== 'charge' && modeKey(r.mode) === 'cash').map(r => ({ key: 'p' + r.id, at: r.created_at, booking: r.booking_id, who: r.bookings?.customer_name || '', cat: payCat(r), amt: r.kind.endsWith('refund') ? -r.amount : r.amount, rem: remNote(r.remarks), by: r.created_by, voided: false })),
    ...exps.filter(x => modeKey(x.mode) === 'cash').map(x => ({ key: 'e' + x.id, at: x.created_at, booking: x.booking_id, who: x.payee || x.category, cat: x.category, amt: -x.amount, rem: x.remarks === x.category ? '' : x.remarks || '', by: x.created_by, voided: !!x.voided_at }))]
    .filter(t => (!fl.cat || t.cat === fl.cat) && (!fl.dir || (fl.dir === 'in' ? t.amt > 0 : t.amt < 0))).sort((a, b) => a.at.localeCompare(b.at)), [pays, exps, fl])
  const cin = mv.filter(t => !t.voided && t.amt > 0).reduce((s, t) => s + t.amt, 0), cout = mv.filter(t => !t.voided && t.amt < 0).reduce((s, t) => s - t.amt, 0)
  const diff = cnt !== '' && known ? Math.round(+cnt) - book.expected : null
  const status = tallied ? (book.difference === 0 ? 'ok' : book.difference < 0 ? 'short' : 'excess') : null
  const ST: Record<string, [string, string, string]> = { ok: ['Cash Counter Reconciled', 'var(--green)', 'checkc'], short: ['Cash Short', 'var(--red)', 'warn'], excess: ['Cash in Excess', 'var(--amber)', 'warn'] }
  async function exportCash() {
    if (!book) return; const M = (n: number, s: any = 'money'): Cell => ({ n, s }), f = (l: string, v: Cell, bold = false): Cell[] => [bold ? { t: l, s: 'bold' } : l, v]
    const head = ['Time', 'Booking ID', 'Customer / Payee', 'Category', 'Cash in', 'Cash out', 'Remarks', 'Entered by'].map(t => ({ t, s: 'head' as const }))
    const rows: Cell[][] = mv.map(t => [istTime(t.at), t.booking || '—', t.who, t.cat + (t.voided ? ' (VOIDED)' : ''), t.amt > 0 && !t.voided ? M(t.amt) : '', t.amt < 0 && !t.voided ? M(-t.amt, 'moneyRed') : '', t.rem, by(t.by)])
    const recon: Cell[][] = [[{ t: 'Swaasa Wedding Rentals: cash reconciliation', s: 'title' }], [{ t: 'Date', s: 'bold' }, { d: date }], [],
      f('Opening cash', known ? M(book.opening) : 'NOT SET'), f('Cash received', M(book.cash_in)), f('Cash refunds paid', M(-book.cash_refunds, 'moneyRed')), f('Cash expenses paid', M(-book.expenses, 'moneyRed')), f('Expected cash in hand', known ? M(book.expected, 'moneyBold') : 'NOT AVAILABLE', true),
      f('Counted cash', tallied ? M(book.counted) : 'Not counted'), f('Difference', tallied ? M(book.difference, book.difference ? 'moneyRed' : 'money') : ''), f('Status', tallied ? (book.difference === 0 ? 'Reconciled' : book.difference < 0 ? 'Short' : 'Excess') : 'Not counted'),
      f('Remark', book.note || ''), f('Counted by', tallied ? `${by(book.tallied_by)} on ${istTime(book.tallied_at)}` : ''), f('Opening taken from', book.anchor || '')]
    downloadBlob(await makeWorkbook([{ name: 'Cash movements', widths: [12, 14, 26, 28, 14, 14, 34, 16], rows: [[{ t: 'Swaasa Wedding Rentals: cash movements', s: 'title' }], [{ t: 'Date', s: 'bold' }, { d: date }], [], head, ...rows] }, { name: 'Cash reconciliation', widths: [34, 40], rows: recon }]), `swaasa-cash-counter-${date}.xlsx`)
  }

  // ---------------- Tab 3: Expenses ----------------
  const live = exps.filter(x => !x.voided_at), sumCat = (c: string) => live.filter(x => x.category === c).reduce((s, x) => s + x.amount, 0), totalExp = live.reduce((s, x) => s + x.amount, 0)
  const exRows = exps.filter(x => (!fl.cat || x.category === fl.cat) && (!fl.mode || modeKey(x.mode) === fl.mode) && (!fl.q || ((x.payee || '') + x.remarks + (x.booking_id || '')).toLowerCase().includes(fl.q.toLowerCase())))
  const split = EXP_NAMES.map(c => ({ c, v: sumCat(c) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)
  async function exportExp() {
    const head = ['Date and time', 'Category', 'Payee / vendor', 'Booking ID', 'Payment mode', 'Amount', 'Remarks', 'Status', 'Entered by'].map(t => ({ t, s: 'head' as const }))
    const rows: Cell[][] = exRows.map(x => [when(x.created_at), x.category, x.payee || '', x.booking_id || '', MODE_UI[modeKey(x.mode)][0], { n: x.voided_at ? 0 : -x.amount, s: 'moneyRed' }, x.remarks, x.voided_at ? `Voided: ${x.void_reason || ''}` : '', by(x.created_by)])
    downloadBlob(await makeWorkbook([{ name: 'Expenses', widths: [20, 30, 22, 14, 20, 14, 34, 26, 16], rows: [[{ t: 'Swaasa Wedding Rentals: expenses ' + month, s: 'title' }], [], head, ...rows, [{ t: 'Total (voided excluded)', s: 'bold' }, null, null, null, null, { n: -exRows.filter(x => !x.voided_at).reduce((s, x) => s + x.amount, 0), s: 'moneyBold' }]] }]), `swaasa-expenses-${month}.xlsx`)
  }
  const donut = () => { const R = 62, C = 2 * Math.PI * R; let off = 0; return <svg viewBox="0 0 160 160" style={{ width: 170, flex: 'none' }} role="img" aria-label="Expense distribution"><g transform="rotate(-90 80 80)">{split.map(x => { const len = (x.v / totalExp) * C, el = <circle key={x.c} cx="80" cy="80" r={R} fill="none" stroke={EXP[x.c][1]} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />; off += len; return el })}</g>
    <text x="80" y="76" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">{inr(totalExp)}</text><text x="80" y="94" textAnchor="middle" fontSize="11" fill="var(--mut)">Total Expenses</text></svg> }

  const TABS: [TabKey, string, string][] = [['tx', 'Transactions', 'receipt'], ['cash', 'Cash Counter', 'cash'], ['exp', 'Expenses', 'coins']]
  const empty = (n: number, t: string, cols: number) => !loading && !n && <tr><td colSpan={cols} className="mut" style={{ padding: 20 }}>{t}</td></tr>
  return (<div>
    <PageHead icon="wallet" title="Payments &amp; Cash Counter" sub="Money received, refunds, expenses and the daily cash drawer.">
      <div className="pg-tools"><button className="btn wine" onClick={recordPayment}>＋ <span className="lw">Record </span>Payment</button><button className="btn alt" onClick={recordRefund}>＋ <span className="lw">Record </span>Refund</button><button className="btn alt" onClick={() => addExpense(ctx)}>＋ <span className="lw">Add </span>Expense</button></div></PageHead>
    <div className="ft-tabs" role="tablist">{TABS.map(([k, l, i]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ic n={i} s={18} />{l}</button>)}</div>
    {err && <p className="bad"><b>{err}</b></p>}

    {tab === 'tx' && <>
      <div className="k6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        <Card ic="wallet" c="var(--green)" v={inr(collected)} l="Total Collected In Range" sub={`${txStart} – ${txEnd}`} />
        <Card ic="hourglass" c="var(--amber)" v={inr(pending)} l="Pending Payments" sub="all open bookings" />
        <Card ic="coins" c="var(--purple)" v={inr(depHeld)} l="Deposits Held (Refundable)" />
        <Card ic="ret" c="var(--red)" v={inr(refPending)} l="Refunds Pending" sub="deposits due back on return" />
        <Card ic="cash" c="var(--blue)" v={inr(cashToday)} l="Cash Collected Today" /></div>
      <div className="bk-card-t" style={{ padding: 14 }}>
        <div className="bk-bar" style={{ margin: '0 0 12px' }}><h2 style={{ fontSize: 26, marginRight: 'auto' }}>Transactions</h2>
          <div className="tx-view" role="group" aria-label="Transaction view"><button className={txView === 'transaction' ? 'on' : ''} onClick={() => setTxView('transaction')}>Transaction-wise</button><button className={txView === 'booking' ? 'on' : ''} onClick={() => setTxView('booking')}>Group by Booking ID</button></div>
          <select aria-label="Date range" value={txQuick} onChange={e => { setTxQuick(e.target.value); if(e.target.value==='month') setMonth(today.slice(0,7)) }} style={{ width: 'auto' }}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This Week</option><option value="month">This Month</option><option value="last">Last Month</option><option value="custom">Custom Range</option></select>
          {txQuick === 'month' && <MonthP />}{txQuick === 'custom' && <span className="tx-range"><label>From <input type="date" value={txFrom} onChange={e => setTxFrom(e.target.value)} /></label><label>To <input type="date" value={txTo} onChange={e => setTxTo(e.target.value)} /></label></span>}
          <button className="btn alt sm" onClick={exportTx} style={{ padding: '9px 14px' }}>Export</button><FBtn /></div>
        {showF && <div className="bk-filt"><Sel k="mode" label="Payment mode" opts={modeOpts} /><Sel k="cat" label="Category" opts={[['', 'All categories'], ...catsSeen.map(c => [c, c] as [string, string])]} /><Sel k="dir" label="Money" opts={[['', 'Received and refunded'], ['in', 'Received only'], ['out', 'Refunds only']]} />
          <label>Search<input value={fl.q} onChange={e => set('q', e.target.value)} placeholder="Customer or booking" /></label><div style={{ alignSelf: 'end' }}><button className="btn alt sm" onClick={() => setFl({ mode: '', cat: '', dir: '', q: '' })}>Clear</button></div></div>}
        <div className="scroll"><table className="bt stack tx"><thead>{txView === 'transaction' ? <tr><th>Date &amp; Time</th><th>Booking ID</th><th>Customer</th><th>Category (Transaction Type)</th><th>Payment Mode</th><th style={{ textAlign: 'right' }}>Amount</th><th>Entered By</th></tr> : <tr><th></th><th>Booking ID</th><th>Customer</th><th>Date / Latest Transaction</th>{['Advance Received','Rental Charges','Customisation Charges','Security Deposit Received','Security Deposit Refund','Late Return Charges','Damage Charges','Other Charges'].map(c=><th key={c}>{c}</th>)}<th>Payment Mode</th><th>Remarks</th><th>Entered By</th></tr>}</thead><tbody>
          {loading && !pays.length && <tr><td colSpan={txView === 'transaction' ? 7 : 15} className="mut" style={{ padding: 20 }}>Loading…</td></tr>}
          {txView === 'transaction' ? <>{txRows.map(t => <tr key={t.id}><td style={{ whiteSpace: 'nowrap' }}>{when(t.at)}</td><td>{bkLink(t.booking)}</td><td>{t.who}</td><td style={{ whiteSpace: 'normal' }}><Pill cat={t.cat} />{t.rem && <div className="mut" style={{ fontSize: 11.5, marginTop: 3, maxWidth: 260 }}>{t.rem}</div>}</td><td><ModeCell m={t.mode} /></td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b style={{ color: t.amount < 0 ? 'var(--red)' : 'var(--green)', opacity: t.kind === 'charge' ? .75 : 1 }}>{money(t.amount, true)}</b></td><td>{by(t.by)}</td></tr>)}</> : <>{groupedTx.map((g: any) => <Fragment key={g.booking}><tr><td><button className="tx-expand" aria-label={expanded[g.booking] ? 'Collapse transactions' : 'Expand transactions'} onClick={() => setExpanded({ ...expanded, [g.booking]: !expanded[g.booking] })}>{expanded[g.booking] ? '−' : '+'}</button></td><td>{bkLink(g.booking)}</td><td>{g.who}</td><td>{when(g.latest)}</td>{['Advance Received','Rental Charges','Customisation Charges','Security Deposit Received','Security Deposit Refund','Late Return Charges','Damage Charges','Other Charges'].map(c=>{const n=g.cats[c]||0;return <td key={c} style={{textAlign:'right',color:n<0?'var(--red)':undefined}}>{n?money(n):'—'}</td>})}<td>{g.modes.length===1?<ModeCell m={g.items.find((x:any)=>modeKey(x.mode)===g.modes[0])?.mode}/>:g.modes.length?'Multiple Modes':'—'}</td><td>{g.remarks.length===1?g.remarks[0]:g.remarks.length?'Multiple':'—'}</td><td>{g.staff.length===1?g.staff[0]:g.staff.length?'Multiple':'—'}</td></tr>
              {expanded[g.booking] && <tr><td colSpan={15} className="tx-detail"><b>Transactions for {g.booking}</b><div className="scroll"><table><thead><tr><th>Date &amp; Time</th><th>Category / Transaction Type</th><th>Payment Mode</th><th>Amount</th><th>Remarks</th><th>Entered By</th></tr></thead><tbody>{g.items.map((t:any)=><tr key={t.id}><td>{when(t.at)}</td><td><Pill cat={t.cat}/></td><td><ModeCell m={t.mode}/></td><td style={{color:t.amount<0?'var(--red)':'var(--green)'}}>{money(t.amount,true)}</td><td>{t.rem||'—'}</td><td>{by(t.by)}</td></tr>)}</tbody></table></div></td></tr>}</Fragment>)}</>}
          {empty(txView === 'transaction' ? txRows.length : groupedTx.length, 'No transactions match.', txView === 'transaction' ? 7 : 15)}</tbody></table></div></div></>}

    {tab === 'cash' && <>
      <div className="bk-card-t" style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div className="bk-bar" style={{ margin: 0 }}><Ic n="wallet" s={34} style={{ color: 'var(--wine)' }} /><h2 style={{ fontSize: 28 }}>Daily Cash Counter</h2><span style={{ borderLeft: '1px solid var(--line)', height: 28 }} />
          <label className="mpick"><b style={{ fontWeight: 600 }}>{new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</b><Ic n="calendar" s={16} /><input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Date" style={{ width: 24, opacity: 0, position: 'absolute' }} /></label>
          <button className="btn alt sm" onClick={() => setDate(today)} style={{ padding: '9px 14px' }}>Today</button><span style={{ flex: 1 }} />
          {owner ? <button className="btn alt" onClick={setupOpening}><Ic n="pencil" s={14} /> {known ? 'Update Opening Cash' : 'Set Opening Cash'}</button> : !known && !loading && <span className="mut">Ask the owner to set the opening cash.</span>}</div></div>
      {!loading && !known && !err && <div className="cc-banner"><b>Opening cash not set</b><span className="mut">Set the opening cash to start the cash counter. Until then the expected cash cannot be worked out.</span></div>}
      <div className="cash7">
        <Card ic="wallet" c="var(--blue)" v={known ? inr(book.opening) : '—'} l="Opening Cash" />
        <Card ic="cash" c="var(--green)" v={inr(book?.cash_in || 0)} l="Cash Received" />
        <Card ic="ret" c="var(--red)" v={inr(book?.cash_refunds || 0)} l="Cash Refunds" />
        <Card ic="receipt" c="var(--amber)" v={inr(book?.expenses || 0)} l="Cash Expenses" />
        <Card ic="coins" c="var(--wine)" v={known ? inr(book.expected) : 'Not set'} l="Expected Cash (Cash in Hand)" dark />
        <Card ic="check" c="var(--purple)" v={tallied ? inr(book.counted) : '—'} l="Counted Cash" />
        <Card ic={status === 'ok' ? 'checkc' : 'warn'} c={status === 'ok' ? 'var(--green)' : status === 'short' ? 'var(--red)' : status === 'excess' ? 'var(--amber)' : 'var(--mut)'} v={tallied ? money(book.difference, true) : '—'} l="Difference" /></div>
      <div className="bk-card-t cash-panel">
        <div><h3 className="ph">Cash Calculation <span className="mut" style={{ fontSize: 13, fontWeight: 400 }}>(Physical Cash Only)</span></h3>
          <div className="crow"><span>Opening Cash</span><b>{known ? inr(book.opening) : '—'}</b></div><div className="crow"><span>+ Cash Received (Collections)</span><b style={{ color: 'var(--green)' }}>{inr(book?.cash_in || 0)}</b></div>
          <div className="crow"><span>− Cash Refunds Paid</span><b style={{ color: 'var(--red)' }}>{inr(book?.cash_refunds || 0)}</b></div><div className="crow"><span>− Cash Expenses Paid</span><b style={{ color: 'var(--red)' }}>{inr(book?.expenses || 0)}</b></div>
          <div className="crow tot"><span>Expected Cash in Hand</span><b>{known ? inr(book.expected) : 'Not set'}</b></div>{book?.anchor && <p className="mut" style={{ fontSize: 11.5, margin: '8px 0 0' }}>Opening taken from the {book.anchor}.</p>}</div>
        <div><h3 className="ph">Cash Reconciliation</h3>
          <label className="bk-f">Counted Cash *<input type="number" min="0" inputMode="numeric" value={cnt} onChange={e => setCnt(e.target.value)} placeholder="₹ Enter the cash counted" disabled={!known || (tallied && !owner)} /></label>
          <div className="crow" style={{ marginTop: 8 }}><span>Difference</span><b style={{ color: diff == null ? 'var(--mut)' : diff === 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--amber)' }}>{diff == null ? '—' : diff === 0 ? '₹0 ✓' : `${money(diff, true)} (${diff < 0 ? 'Short' : 'Excess'})`}</b></div>
          {diff != null && diff !== 0 && <label className="bk-f" style={{ marginTop: 6 }}>Remark: why is there a difference? *<input value={cnote} onChange={e => setCnote(e.target.value)} disabled={tallied && !owner} /></label>}
          {(!tallied || owner) && <button className="btn wine" style={{ marginTop: 10 }} disabled={!known || cnt === '' || (diff !== 0 && cnote.trim().length < 3)} onClick={saveCount}>{tallied ? 'Update count' : 'Reconcile cash'}</button>}</div>
        <div className="recstat">{status ? <><div className="rs" style={tint(ST[status][1])}><Ic n={ST[status][2]} s={26} /><b>{ST[status][0]}</b></div>
          <p><Ic n="calendar" s={15} /> {status === 'ok' ? 'Reconciled' : 'Counted'} at: <b>{when(book.tallied_at)}</b></p><p><Ic n="user" s={15} /> By: <b>{by(book.tallied_by)}</b></p>{book.note && <p className="mut">“{book.note}”</p>}</>
          : <div className="rs" style={tint('var(--mut)')}><Ic n="clock" s={26} /><b>Not counted yet</b></div>}</div></div>
      <div className="bk-card-t" style={{ padding: 14, marginTop: 14 }}>
        <div className="bk-bar" style={{ margin: '0 0 12px' }}><h2 style={{ fontSize: 26, marginRight: 'auto' }}>Cash Movements</h2><button className="btn alt sm" onClick={exportCash} style={{ padding: '9px 14px' }}>Export</button><FBtn /></div>
        {showF && <div className="bk-filt"><Sel k="cat" label="Category" opts={[['', 'All categories'], ...[...new Set(mv.map(t => t.cat))].map(c => [c, c] as [string, string])]} /><Sel k="dir" label="Direction" opts={[['', 'Cash in and out'], ['in', 'Cash in'], ['out', 'Cash out']]} /><div style={{ alignSelf: 'end' }}><button className="btn alt sm" onClick={() => setFl({ mode: '', cat: '', dir: '', q: '' })}>Clear</button></div></div>}
        <div className="scroll"><table className="bt stack cm"><thead><tr><th>Time</th><th>Booking ID</th><th>Customer / Payee</th><th>Category</th><th style={{ textAlign: 'right' }}>Cash In</th><th style={{ textAlign: 'right' }}>Cash Out</th><th>Remarks</th><th>Entered By</th></tr></thead><tbody>
          {mv.map(t => <tr key={t.key} style={t.voided ? { opacity: .5, textDecoration: 'line-through' } : undefined}><td style={{ whiteSpace: 'nowrap' }}>{istTime(t.at)}</td><td>{bkLink(t.booking)}</td><td>{t.who}</td><td><Pill cat={t.cat} /></td>
            <td style={{ textAlign: 'right' }}>{t.amt > 0 ? <b style={{ color: 'var(--green)' }}>{inr(t.amt)}</b> : '—'}</td><td style={{ textAlign: 'right' }}>{t.amt < 0 ? <b style={{ color: 'var(--red)' }}>{inr(-t.amt)}</b> : '—'}</td><td style={{ whiteSpace: 'normal' }}>{t.rem || '—'}{t.voided && ' (voided)'}</td><td>{by(t.by)}</td></tr>)}
          {empty(mv.length, 'No cash movements on this date.', 8)}
          {!!mv.length && <tr style={{ fontWeight: 700 }}><td colSpan={4}>Total</td><td style={{ textAlign: 'right', color: 'var(--green)' }}>{inr(cin)}</td><td style={{ textAlign: 'right', color: 'var(--red)' }}>{inr(cout)}</td><td colSpan={2}></td></tr>}</tbody></table></div>
        <p className="mut" style={{ fontSize: 12, margin: '10px 0 0' }}>Only entries paid or received in Cash appear here. They come straight from Transactions and Expenses, so nothing needs to be entered twice.</p></div></>}

    {tab === 'exp' && <>
      <div className="k6" style={{ gridTemplateColumns: 'repeat(6,minmax(0,1fr))' }}>
        <Card ic="receipt" c="var(--blue)" v={inr(totalExp)} l="Total Expenses This Month" />
        {['Store Rent', 'Utilities', 'Salaries', 'Staff Bonus & Incentives', 'Staff Refreshments (Petty Cash)'].map(c => <Card key={c} ic={EXP[c][0]} c={EXP[c][1]} v={inr(sumCat(c))} l={c === 'Utilities' ? 'Utilities (Electricity & Water)' : c} />)}</div>
      <div className="k6" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>{['Dry Cleaning', 'Store Maintenance', 'Delivery / Transport', 'Business Overheads', 'Other Expenses'].map(c => <Card key={c} ic={EXP[c][0]} c={EXP[c][1]} v={inr(sumCat(c))} l={c} />)}</div>
      <div className="bk-card-t" style={{ padding: 14 }}>
        <div className="bk-bar" style={{ margin: '0 0 12px' }}><h2 style={{ fontSize: 26, marginRight: 'auto' }}>Expense Transactions</h2><MonthP /><button className="btn alt sm" onClick={exportExp} style={{ padding: '9px 14px' }}>Export</button><FBtn /></div>
        {showF && <div className="bk-filt"><Sel k="cat" label="Category" opts={[['', 'All categories'], ...EXP_NAMES.map(c => [c, c] as [string, string])]} /><Sel k="mode" label="Payment mode" opts={modeOpts} />
          <label>Search<input value={fl.q} onChange={e => set('q', e.target.value)} placeholder="Payee, remarks or booking" /></label><div style={{ alignSelf: 'end' }}><button className="btn alt sm" onClick={() => setFl({ mode: '', cat: '', dir: '', q: '' })}>Clear</button></div></div>}
        <div className="scroll"><table className="bt stack ex"><thead><tr><th>Date &amp; Time</th><th>Category (Expense Type)</th><th>Payee / Vendor</th><th>Booking ID</th><th>Payment Mode</th><th style={{ textAlign: 'right' }}>Amount</th><th>Remarks</th><th>Entered By</th></tr></thead><tbody>
          {loading && !exps.length && <tr><td colSpan={8} className="mut" style={{ padding: 20 }}>Loading…</td></tr>}
          {exRows.map(x => <tr key={x.id} style={x.voided_at ? { opacity: .5, textDecoration: 'line-through' } : undefined}><td style={{ whiteSpace: 'nowrap' }}>{when(x.created_at)}</td><td style={{ whiteSpace: 'normal' }}><Pill cat={x.category} /></td><td>{x.payee || <span className="mut">—</span>}</td><td>{bkLink(x.booking_id)}</td><td><ModeCell m={x.mode} /></td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b style={{ color: 'var(--red)' }}>−{inr(x.amount)}</b></td><td style={{ whiteSpace: 'normal', maxWidth: 240 }}>{x.remarks === x.category ? '—' : x.remarks}{x.voided_at && <div className="bad" style={{ fontSize: 11 }}>VOIDED: {x.void_reason}</div>}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{by(x.created_by)}{owner && !x.voided_at && <> <button className="btn alt sm" onClick={() => voidExp(x)}>Void</button></>}</td></tr>)}
          {empty(exRows.length, 'No expenses match.', 8)}</tbody></table></div></div>
      <div className="exp-sum">
        <div className="bk-card-t" style={{ padding: 16 }}><h3 className="ph">Expense Summary <span className="mut" style={{ fontSize: 13, fontWeight: 400 }}>({new Date(month + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })})</span></h3>
          {split.length ? <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>{donut()}<table className="bt" style={{ flex: 1, minWidth: 260 }}><tbody>{split.map(x => <tr key={x.c}><td style={{ padding: '5px 6px', borderTop: 0 }}><span className="dot" style={{ background: EXP[x.c][1] }} />{x.c}</td><td style={{ padding: '5px 6px', borderTop: 0, textAlign: 'right' }}><b>{inr(x.v)}</b></td><td style={{ padding: '5px 6px', borderTop: 0, textAlign: 'right', color: 'var(--mut)' }}>{(100 * x.v / totalExp).toFixed(1)}%</td></tr>)}</tbody></table></div> : <p className="mut">No expenses recorded this month.</p>}</div>
        <div className="bk-card-t" style={{ padding: 16 }}><h3 className="ph">Recent Expenses</h3>
          {live.slice(0, 5).map(x => <div key={x.id} className="crow" style={{ alignItems: 'center' }}><span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="ico" style={tint(EXP[x.category]?.[1] || '#888')}><Ic n={EXP[x.category]?.[0] || 'dots2'} s={18} /></span>{x.category}</span><b style={{ color: 'var(--red)' }}>−{inr(x.amount)}</b><span className="mut">{new Date(x.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}</span></div>)}
          {!live.length && <p className="mut">Nothing yet.</p>}</div></div></>}
  </div>)
}
