'use client'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { addD, dbMsg, dmy, inr, istTime, modeGroup, PAY_MODES, todayIST } from '@/lib/util'
import { downloadBlob, makeWorkbook, Cell } from '@/lib/xlsx'

// ---- How the Daily Cash Counter counts money (also written in the README) --------------------------------------------------------------
//  * Receipts (rent, advance, customization, charges, deposits) and refunds come from the payments table, by the date they were recorded (India time).
//  * Expenses (tea, dry cleaning, supplies...) come from the expenses table. Voided expenses are shown struck through and never counted.
//  * The physical drawer uses ONLY entries whose payment mode is Cash. GPay / UPI, Card, bank transfers and "book entries" never touch it.
//  * Expected closing cash = opening + cash received - cash refunds paid - cash expenses. Opening = the counted cash of the last tallied day, else the owner's configured opening.
const TEAL = '#0e8f8f', PURPLE = '#8a4fbf', BLUE = '#2f6fd0', RED = 'var(--bad)'
const CATS = ['Tea & refreshments', 'Dry cleaning', 'Alterations & repairs', 'Packaging & supplies', 'Transport & delivery', 'Other']
const MODES = [...PAY_MODES, 'Bank transfer']
// purpose -> [label shown, colour, group used by the Type filter]
const PURPOSE: Record<string, [string, string, string]> = {
  advance: ['Advance', TEAL, 'advance'], rent: ['Rent', '', 'rent'], customization: ['Customization', PURPLE, 'customization'], damage: ['Damage Charges', '', 'charges'], cleaning: ['Cleaning Charges', '', 'charges'],
  other_charge: ['Other Charges', '', 'charges'], deposit: ['Deposit', BLUE, 'deposit'], deposit_refund: ['Deposit Refund', RED, 'refund'], advance_refund: ['Advance Refund', RED, 'refund'],
  rent_refund: ['Rent Refund', RED, 'refund'], deposit_applied: ['Deposit Applied to Dues', 'var(--mut)', 'book'] }
const KIND_PURPOSE: Record<string, string> = { rent: 'rent', deposit: 'deposit', deposit_refund: 'deposit_refund', rent_refund: 'rent_refund', charge: 'deposit_applied' }
const expRemark = (c: string) => c === 'Dry cleaning' ? 'Dry-Cleaning Expense' : c === 'Tea & refreshments' || c === 'Petty cash' ? 'Petty Cash Expense' : 'Other Business Expense'
type Tx = { key: string; at: string; booking: string | null; code: string | null; dressId: string | null; who: string; note: string; detail: string; sub: string; rem: string; remark: string; colour: string; group: string; amount: number; mode: string; by: string | null; flow: 'in' | 'out' | 'book' | 'exp'; voided?: boolean; id?: number; reason?: string }

// Petty cash / business expense entry. Also used by the Overview Dashboard's quick button.
export async function pettyCashEntry(ctx: any): Promise<boolean> {
  const v = await ctx.ask('Petty cash / business expense', [
    { name: 'a', label: 'Amount (₹)', type: 'number', required: true }, { name: 'c', label: 'Category', options: CATS, required: true }, { name: 'm', label: 'Paid by', options: MODES, value: 'Cash' },
    { name: 'p', label: 'Paid to (optional)' }, { name: 'r', label: 'Remarks: what was this for?', required: true }],
    { ok: 'Save expense', note: 'A cash expense lowers the expected cash in the drawer straight away. An expense paid by UPI, Card or bank transfer does not. It cannot be edited later; the owner can void a wrong entry.' }); if (!v) return false
  const a = Math.round(+v.a), r = v.r.trim(); if (!(a > 0) || !r) { ctx.say('Enter an amount and a remark.'); return false }
  const { error } = await ctx.sb.from('cash_expenses').insert({ amount: a, category: v.c, mode: v.m || 'Cash', payee: v.p.trim() || null, remarks: r })
  ctx.say(error ? error.message : `${inr(a)} expense recorded${(v.m || 'Cash') === 'Cash' ? ' (taken from the drawer)' : ''}`); ctx.load(); return !error
}

export default function CashCounter({ ctx }: { ctx: any }) {
  const owner = ctx.owner
  const [date, setDate] = useState(todayIST()); const [mode, setMode] = useState(''); const [type, setType] = useState('')
  const [pays, setPays] = useState<any[]>([]), [exps, setExps] = useState<any[]>([]), [book, setBook] = useState<any>(null), [liab, setLiab] = useState<any>(null)
  const [loading, setLoading] = useState(true), [err, setErr] = useState(''), [view, setView] = useState<'overview' | 'transactions' | 'expenses' | 'summary'>('overview'), [showF, setShowF] = useState(false)
  const [er, setEr] = useState({ from: todayIST(), to: todayIST() }), [erows, setErows] = useState<any[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const from = new Date(`${date}T00:00:00+05:30`).toISOString(), to = new Date(`${addD(date, 1)}T00:00:00+05:30`).toISOString()
    const [p, x, cb, lb] = await Promise.all([
      ctx.sb.from('payments').select('id,booking_id,amount,kind,purpose,mode,created_at,created_by,remarks,bookings(id,customer_name,dress_id,dresses(code,name))').gte('created_at', from).lt('created_at', to).order('created_at'),
      ctx.sb.from('cash_expenses').select('*').eq('spent_on', date).order('created_at'), ctx.sb.rpc('cash_book', { p_day: date }), ctx.sb.rpc('cash_liabilities', { p_day: date })])
    if (cb.error) setErr(cb.error.message.includes('FORBIDDEN') ? 'Only the owner can open dates before this month.' : 'Could not load the cash book. Please refresh.')
    else if (p.error || x.error || lb.error) setErr('Could not load this date. Please refresh.')
    setPays(p.data || []); setExps(x.data || []); setBook(cb.data?.[0] || null); setLiab(lb.data?.[0] || null); setLoading(false)
  }, [date, ctx.sb])
  useEffect(() => { load() }, [load, ctx.tick])

  // every payment and expense becomes one row, so nothing is counted twice and every figure comes from the same list
  const all: Tx[] = useMemo(() => {
    const rows: Tx[] = pays.map(r => { const pu = r.purpose || KIND_PURPOSE[r.kind] || 'rent', [label, colour, group] = PURPOSE[pu] || PURPOSE.rent, b = r.bookings, refund = r.kind.endsWith('refund'), book = r.kind === 'charge'
      return { key: 'p' + r.id, at: r.created_at, booking: r.booking_id, code: b?.dresses?.code || null, dressId: b?.dress_id || null, who: b?.customer_name || '', note: b?.dresses?.name || '', detail: r.remarks || '', sub: [b?.dresses?.code, b?.dresses?.name].filter(Boolean).join(' · '), rem: r.remarks || '', remark: label, colour, group,
        amount: refund ? -r.amount : r.amount, mode: book ? 'Book Entry' : r.mode || '', by: r.created_by, flow: book ? 'book' : refund ? 'out' : 'in' } })
    exps.forEach(x => rows.push({ key: 'e' + x.id, at: x.created_at, booking: null, code: null, dressId: null, who: x.payee || x.category, note: x.payee ? `${x.category}: ${x.remarks}` : x.category, detail: '', sub: x.payee ? x.category : '', rem: x.remarks || '', remark: expRemark(x.category), colour: RED, group: 'expense',
      amount: -x.amount, mode: x.mode, by: x.created_by, flow: 'exp', voided: !!x.voided_at, id: x.id, reason: x.void_reason }))
    return rows.sort((a, b) => a.at.localeCompare(b.at))
  }, [pays, exps])
  const shown = all.filter(t => (!mode || (t.flow === 'book' ? mode === 'Book entry' : modeGroup(t.mode) === mode)) && (!type || t.group === type || (type === 'charges' && t.group === 'charges')))
  const bk = (id: string) => ctx.B.find((b: any) => b.id === id)
  const dueOf = (b: any) => b ? Math.max(0, b.rent + b.charges - b.paid) : 0

  function totals(list: Tx[]) {
    const live = list.filter(t => !t.voided), pay = live.filter(t => t.flow !== 'exp'), rec = live.filter(t => t.flow === 'in'), sum = (a: Tx[]) => a.reduce((s, t) => s + Math.abs(t.amount), 0)
    const bks = [...new Set(pay.map(t => t.booking!))].map(bk).filter(Boolean) as any[], by = (g: string) => sum(rec.filter(t => modeGroup(t.mode) === g))
    const custom = bks.reduce((s, b) => s + (b.custom_charge || 0), 0), unpaid = bks.reduce((s, b) => s + Math.min(b.custom_charge || 0, dueOf(b)), 0)    // convention: payments settle rent first, then customization
    return { dresses: new Set(pay.map(t => t.dressId).filter(Boolean)).size, rental: bks.reduce((s, b) => s + b.rent, 0), custom, customUnpaid: unpaid, customToday: sum(rec.filter(t => t.group === 'customization')),
      rent: sum(rec.filter(t => t.group === 'advance' || t.group === 'rent')), total: sum(rec), cash: by('Cash'), upi: by('GPay / UPI'), card: by('Card'), other: by('Other'),
      refunds: sum(live.filter(t => t.flow === 'out')), outstanding: bks.reduce((s, b) => s + dueOf(b), 0) }
  }
  const T = totals(shown), live = all.filter(t => !t.voided)
  const nonCash = { in: live.filter(t => t.flow === 'in' && modeGroup(t.mode) !== 'Cash').reduce((s, t) => s + t.amount, 0), out: live.filter(t => t.flow === 'out' && modeGroup(t.mode) !== 'Cash').reduce((s, t) => s + -t.amount, 0), exp: live.filter(t => t.flow === 'exp' && modeGroup(t.mode) !== 'Cash').reduce((s, t) => s + -t.amount, 0) }
  const known = !!book?.opening_known, tallied = !!book?.status
  const cashExp = exps.filter(x => !x.voided_at && /cash/i.test(x.mode))

  async function setupOpening() {
    if (!owner) return ctx.say('Ask the owner to set the opening cash first.')
    const v = await ctx.ask('Set opening cash', [{ name: 'a', label: 'Cash in the drawer at the START of that day (₹)', type: 'number', required: true }, { name: 'd', label: 'Date', type: 'date', value: date, required: true }], { ok: 'Save opening cash', note: 'Do this once, for the first day you use the cash counter. After this, every day opens with the previous day’s counted cash.' }); if (!v) return
    const { error } = await ctx.sb.rpc('set_cash_opening', { p_amount: Math.round(+v.a), p_date: v.d })
    ctx.say(error ? (error.message.includes('ALREADY_TALLIED') ? 'A day on or after that date has already been tallied, so the opening cannot be moved.' : 'Could not save the opening cash.') : 'Opening cash saved'); load()
  }
  async function tally() {
    if (!known) return setupOpening()
    const v1 = await ctx.ask(tallied ? 'Change the tally' : 'Tally cash (end of day)', [{ name: 'c', label: 'Physical cash counted in the drawer (₹)', type: 'number', required: true }, { name: 'n', label: 'Remark (needed if there is a difference)' }],
      { ok: 'Continue', note: `Expected closing cash: ${inr(book.expected)}. Count the drawer and enter what is really there. A tally only records the count; it never adds or removes a payment.` }); if (!v1) return
    const counted = Math.round(+v1.c), diff = counted - book.expected; let note = v1.n.trim()
    if (diff !== 0 && note.length < 3) {
      const v2 = await ctx.ask(`${inr(Math.abs(diff))} ${diff < 0 ? 'short' : 'over'}`, [{ name: 'n', label: 'Why is there a difference?', required: true }], { ok: 'Save tally', note: `Expected ${inr(book.expected)}, counted ${inr(counted)}.` }); if (!v2) return; note = v2.n.trim()
    }
    const { error } = await ctx.sb.rpc('tally_cash', { p_day: date, p_counted: counted, p_note: note })
    const m = error?.message || ''
    ctx.say(!error ? (diff === 0 ? 'Reconciled: the cash matches.' : `Saved with a difference of ${inr(diff)}.`) : m.includes('ALREADY_TALLIED') ? 'This day was already tallied. Only the owner can change it.' : m.includes('OPENING_REQUIRED') ? 'Set the opening cash first.' : m.includes('REMARK') ? 'Please add a remark for the difference.' : 'Could not save the tally.'); load()
  }
  async function record() {
    const cand = ctx.B.filter((b: any) => b.status !== 'cancelled').sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)).slice(0, 80)
    const OPT: Record<string, [string, string, string]> = { 'Rent (balance)': ['rent', 'rent', ''], 'Customization charge': ['rent', 'customization', ''], 'Damage charges': ['rent', 'damage', ''], 'Cleaning charges': ['rent', 'cleaning', ''], 'Other charges': ['rent', 'other_charge', ''],
      'Refundable deposit received': ['deposit', 'deposit', ''], 'Deposit refund paid': ['deposit_refund', 'deposit_refund', ''], 'Advance refund paid': ['rent_refund', 'advance_refund', ''], 'Rent refund paid': ['rent_refund', 'rent_refund', ''] }
    const v = await ctx.ask('Record a payment', [
      { name: 'b', label: 'Booking', options: cand.map((b: any) => `${b.id} · ${b.dress_code} · ${b.customer_name} · due ${inr(dueOf(b))}`), required: true },
      { name: 't', label: 'What is it for?', options: Object.keys(OPT), required: true }, { name: 'a', label: 'Amount (₹)', type: 'number', required: true }, { name: 'm', label: 'Payment mode', options: PAY_MODES, required: true }],
      { ok: 'Save payment', note: 'Recorded with today’s date and time. Earlier entries are never changed. For the advance taken when booking, use the booking screen.' }); if (!v) return
    const b = ctx.B.find((x: any) => x.id === v.b.split(' · ')[0]), a = Math.round(+v.a), [kind, purpose] = OPT[v.t]
    if (!b || !(a > 0)) return ctx.say('Enter a valid amount.')
    if (kind === 'deposit_refund' && a > b.deposit_held) return ctx.say(`Only ${inr(b.deposit_held)} of deposit is held for this booking.`)
    if (kind === 'rent_refund' && a > b.paid) return ctx.say(`Only ${inr(b.paid)} of rent has been received for this booking.`)
    const { error } = await ctx.sb.from('payments').insert({ booking_id: b.id, amount: a, kind, purpose, mode: v.m }); ctx.say(error ? dbMsg(error.message) : `${inr(a)} recorded`); ctx.load(); load()
  }
  async function voidExp(t: Tx) {
    const v = await ctx.ask('Void this expense?', [{ name: 'r', label: 'Reason (kept in the audit trail)', required: true }], { ok: 'Void expense', note: `${inr(-t.amount)} · ${t.who}. A voided expense stops counting and the drawer total goes back up. Nothing is deleted.` }); if (!v) return
    const { error } = await ctx.sb.rpc('void_expense', { p_id: t.id, p_reason: v.r }); ctx.say(error ? 'Could not void it.' : 'Expense voided'); load()
  }
  async function showExpenses() {
    const { data, error } = await ctx.sb.from('cash_expenses').select('*').gte('spent_on', er.from).lte('spent_on', er.to).order('spent_on').order('created_at')
    if (error) { ctx.say('Could not load the expenses.'); return }; setErows(data || [])
  }
  async function exportExpenses() {
    if (!erows) return; const R = (n: number): Cell => ({ n, s: 'money' })
    const head = ['Date', 'Time', 'Category', 'Paid to', 'Remarks', 'Payment mode', 'Amount', 'Status', 'Entered by'].map(t => ({ t, s: 'head' as const }))
    const rows: Cell[][] = erows.map(x => [{ d: x.spent_on }, istTime(x.created_at), x.category, x.payee || '', x.remarks, x.mode, { n: x.voided_at ? 0 : x.amount, s: 'moneyRed' }, x.voided_at ? `Voided: ${x.void_reason || ''}` : '', ctx.staffName(x.created_by) || ''])
    downloadBlob(await makeWorkbook([{ name: 'Expenses', widths: [14, 10, 24, 18, 36, 14, 14, 26, 16], rows: [[{ t: 'Swaasa Wedding Rentals: expenses', s: 'title' }], [{ t: 'From', s: 'bold' }, { d: er.from }, { t: 'To', s: 'bold' }, { d: er.to }], [], head, ...rows, [{ t: 'Total (voided entries excluded)', s: 'bold' }, null, null, null, null, null, { n: erows.filter(x => !x.voided_at).reduce((s, x) => s + x.amount, 0), s: 'moneyBold' }]] }]), `swaasa-expenses-${er.from}-to-${er.to}.xlsx`)
  }
  async function exportXlsx() {
    const M = (n: number, s: any = 'money'): Cell => ({ n, s }), head = ['Date and time', 'Booking ID', 'Item Code', 'Customer / Payee', 'Transaction type', 'Remarks', 'Amount', 'Payment mode', 'Entered by'].map(t => ({ t, s: 'head' as const }))
    const style = (t: Tx) => t.flow === 'exp' || t.flow === 'out' ? 'moneyRed' : t.group === 'advance' ? 'moneyTeal' : t.group === 'customization' ? 'moneyPurple' : t.group === 'deposit' ? 'moneyBlue' : 'money'
    const tx: Cell[][] = shown.map(t => [`${dmy(date)} ${istTime(t.at)}`, t.booking || '—', t.code || '', t.who, t.remark + (t.voided ? ' (VOIDED)' : ''), t.detail ? `${t.detail} (${t.note})` : t.note, M(t.voided ? 0 : t.amount, style(t)), t.flow === 'book' ? 'Book Entry' : t.mode, ctx.staffName(t.by) || ''])
    const petty = cashExp.filter(x => x.category === 'Petty cash' || x.category === 'Tea & refreshments').reduce((s, x) => s + x.amount, 0), other = cashExp.reduce((s, x) => s + x.amount, 0) - petty
    const f = (l: string, v: Cell, bold = false): Cell[] => [bold ? { t: l, s: 'bold' } : l, v]
    const recon: Cell[][] = [[{ t: 'Swaasa Wedding Rentals: cash reconciliation', s: 'title' }], [{ t: 'Date', s: 'bold' }, { d: date }], [],
      f('Opening cash (brought forward)', known ? M(book.opening) : 'NOT SET'), f('Cash receipts from customers', M(book?.cash_in || 0)), f('Cash refunds paid', M(-(book?.cash_refunds || 0), 'moneyRed')), f('Petty cash expenses', M(-petty, 'moneyRed')), f('Other cash expenses', M(-other, 'moneyRed')),
      f('Expected closing cash', known ? M(book.expected, 'moneyBold') : 'NOT AVAILABLE', true), f('Actual counted cash', tallied ? M(book.counted) : 'Not counted'), f('Difference', tallied ? M(book.difference, book.difference ? 'moneyRed' : 'money') : ''),
      f('Reconciliation status', tallied ? (book.status === 'reconciled' ? 'Reconciled' : 'Discrepancy') : 'Not tallied'), f('Remark', book?.note || ''), f('Tallied by', tallied ? `${ctx.staffName(book.tallied_by) || ''} on ${dmy(date)} ${istTime(book.tallied_at)}` : ''), f('Opening taken from', book?.anchor || '')]
    const fin: Cell[][] = [[{ t: 'Swaasa Wedding Rentals: financial summary', s: 'title' }], [{ t: 'Date', s: 'bold' }, { d: date }], [{ t: 'Filters', s: 'bold' }, [mode && `Mode: ${mode}`, type && `Type: ${type}`].filter(Boolean).join(', ') || 'None'], [],
      f('Transactions (unique dresses)', T.dresses), f('Rental value after discounts', M(T.rental)), f('Customization charges (these bookings)', M(T.custom, 'moneyPurple')), f('   of which still unpaid', M(T.customUnpaid, 'moneyPurple')), f('Customization received on this date', M(T.customToday, 'moneyPurple')),
      f('Rent received (advance + rent)', M(T.rent)), f('Advance received, pending refund (all bookings, end of day)', M(liab?.advance_pending || 0, 'moneyTeal')), f('Refundable deposits held (all bookings, end of day)', M(liab?.deposits_held ?? 0, 'moneyBlue')),
      f('Total received', M(T.total, 'moneyBold'), true), f('   Cash', M(T.cash)), f('   GPay / UPI', M(T.upi)), f('   Card', M(T.card)), ...(T.other ? [f('   Other', M(T.other))] : []), f('Refunds paid', M(T.refunds, 'moneyRed')), f('Cash counter balance (expected closing cash)', known ? M(book.expected, 'moneyBold') : 'NOT SET'), f('Outstanding customer balances (these bookings)', M(T.outstanding))]
    downloadBlob(await makeWorkbook([{ name: 'Transactions', widths: [20, 16, 12, 26, 26, 34, 16, 16, 16], rows: [[{ t: 'Swaasa Wedding Rentals: daily transactions', s: 'title' }], [{ t: 'Date', s: 'bold' }, { d: date }], [], head, ...tx] }, { name: 'Cash reconciliation', widths: [48, 36], rows: recon }, { name: 'Financial summary', widths: [58, 22], rows: fin }]), `swaasa-cash-counter-${date}.xlsx`)
  }

  const sel = (l: string, v: string, set: (x: string) => void, opts: [string, string][]) => <select aria-label={l} value={v} onChange={e => set(e.target.value)} style={{ width: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 8px' }}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
  const filtered = !!(mode || type), nF = (mode ? 1 : 0) + (type ? 1 : 0)
  const money = (t: Tx) => t.flow === 'book' ? <span className="mut" style={{ fontStyle: 'italic' }}>{inr(t.amount)}</span> : <b style={{ color: t.amount < 0 ? 'var(--bad)' : 'var(--ok)' }}>{t.amount < 0 ? '−' : '+'}{inr(Math.abs(t.amount))}</b>
  const modeCell = (t: Tx) => t.flow === 'book' ? <span className="mut">Book entry</span> : <><span className="dot" style={{ background: { Cash: 'var(--ok)', 'GPay / UPI': PURPLE, Card: BLUE }[modeGroup(t.mode)] || 'var(--mut)' }} />{t.mode}</>
  const txTable = (list: Tx[], empty: string) => <div className="scroll"><table className="cc-table"><thead><tr><th>Time</th><th>Booking ID</th><th>Customer / Payee</th><th>Type</th><th>Remarks</th><th style={{ textAlign: 'right' }}>Amount</th><th>Payment mode</th><th>Entered by</th></tr></thead><tbody>
    {loading && !all.length && <tr><td colSpan={8} className="mut">Loading…</td></tr>}
    {list.map(t => <tr key={t.key} style={t.voided ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
      <td>{istTime(t.at)}</td>
      <td>{t.booking ? <a href="#" title="Open this booking" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: BLUE }} onClick={e => { e.preventDefault(); ctx.openBooking(t.booking) }}>{t.booking}</a> : '—'}</td>
      <td style={{ whiteSpace: 'normal', minWidth: 130 }}>{t.who}{t.sub && <div className="mut" style={{ fontSize: 11 }}>{t.sub}</div>}</td>
      <td><span className="tag" style={{ color: t.colour || 'var(--ink)' }}>{t.remark}</span></td>
      <td style={{ whiteSpace: 'normal', minWidth: 140, fontSize: 13 }}>{t.rem || <span className="mut">—</span>}{t.voided && <div className="bad" style={{ fontSize: 11 }}>VOIDED: {t.reason}</div>}</td>
      <td style={{ textAlign: 'right' }}>{money(t)}</td><td>{modeCell(t)}</td>
      <td>{ctx.staffName(t.by) || '—'}{owner && t.flow === 'exp' && !t.voided && <> <button className="btn alt sm" onClick={() => voidExp(t)}>Void</button></>}</td></tr>)}
    {!loading && !list.length && <tr><td colSpan={8} className="mut">{empty}{filtered ? ' with these filters' : ''}.</td></tr>}</tbody></table></div>
  const kc = (l: string, v: string, tip: string, sub?: string, c?: string, main = false) => <div key={l} className={'cc-card' + (main ? ' main' : '')} title={tip} style={c ? ({ '--c': c } as any) : undefined}><span>{l}</span><b>{v}</b>{sub && <small>{sub}</small>}</div>
  const card = (l: string, v: string, tip: string, sub?: string, c?: string) => <div key={l} className="stat-card" title={tip} style={{ cursor: 'default', ...(c ? { borderColor: c } : {}) }}><span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 22, fontFamily: 'Cormorant Garamond, serif', color: c }}>{v}</b>{sub && <span className="mut" style={{ fontSize: 11 }}>{sub}</span>}</div>
  const TABS: [typeof view, string][] = [['overview', 'Overview'], ['transactions', 'Transactions'], ['expenses', 'Expenses'], ['summary', 'Summary']]
  return (<div>
    <div className="cc-head"><h2>Daily Cash Counter</h2>
      <input type="date" value={date} max={todayIST()} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Date" style={{ width: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 8px' }} />
      <button className="btn alt sm" onClick={() => setDate(todayIST())}>Today</button><span className="cc-sp" />
      <button className="btn wine sm" onClick={record}>+ Record payment</button><button className="btn alt sm" onClick={() => pettyCashEntry(ctx).then(ok => ok && load())}>+ Petty cash expense</button><button className="btn alt sm" onClick={exportXlsx}>Export</button></div>
    {err && <p className="bad"><b>{err}</b></p>}
    {!loading && !known && <div className="cc-banner"><b>Opening cash not set</b><span className="mut">Set the opening cash to start the cash counter.</span><span className="cc-sp" />{owner ? <button className="btn sm" onClick={setupOpening}>Set opening cash</button> : <span>Ask the owner to set it.</span>}</div>}
    <div className="cc-tabs">{TABS.map(([k, l]) => <button key={k} className={'t' + (view === k ? ' on' : '')} onClick={() => setView(k)}>{l}</button>)}<span className="cc-sp" />
      {(view === 'overview' || view === 'transactions') && <button className="btn alt sm" onClick={() => setShowF(!showF)}>Filters{nF ? ` (${nF})` : ''}</button>}</div>
    {showF && (view === 'overview' || view === 'transactions') && <div className="cc-filters">
      {sel('Payment mode', mode, setMode, [['', 'All payment modes'], ['Cash', 'Cash'], ['GPay / UPI', 'GPay / UPI'], ['Card', 'Card'], ['Other', 'Other'], ['Book entry', 'Book entries']])}
      {sel('Type', type, setType, [['', 'All transaction types'], ['advance', 'Advance'], ['rent', 'Rent'], ['customization', 'Customization'], ['charges', 'Damage / cleaning / other charges'], ['deposit', 'Deposits'], ['refund', 'Refunds'], ['expense', 'Expenses'], ['book', 'Book entries']])}
      {filtered && <button className="btn alt sm" onClick={() => { setMode(''); setType('') }}>Clear</button>}<span className="mut" style={{ fontSize: 12 }}>Balances never change with filters.</span></div>}

    {view === 'overview' && <>
      {known && <div className="cc-drawer">
        <div className="cc-eq"><div><small>Opening cash</small><b>{inr(book.opening)}</b></div><i>+</i><div><small>Cash received</small><b>{inr(book.cash_in)}</b></div><i>−</i><div><small>Cash refunds</small><b>{inr(book.cash_refunds)}</b></div><i>−</i><div><small>Cash expenses</small><b>{inr(book.expenses)}</b></div><i>=</i><div><small>Expected closing cash</small><b style={{ fontSize: 24, fontFamily: 'Cormorant Garamond, serif' }}>{inr(book.expected)}</b></div></div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingTop: 10 }}>
          {tallied ? <><b style={{ color: book.status === 'reconciled' ? 'var(--ok)' : 'var(--bad)' }}>{book.status === 'reconciled' ? '✓ Reconciled' : `⚠ Discrepancy of ${inr(book.difference)}`}</b><span className="mut" style={{ fontSize: 13 }}>Counted {inr(book.counted)} by {ctx.staffName(book.tallied_by) || 'staff'} at {istTime(book.tallied_at)}{book.note ? ` · “${book.note}”` : ''}</span></> : <b style={{ color: '#c58a2b' }}>Not tallied</b>}
          {(!tallied || owner) && <button className="btn sm" onClick={tally}>{tallied ? 'Change tally' : 'Tally cash (end of day)'}</button>}{owner && <button className="btn alt sm" onClick={setupOpening}>Opening cash…</button>}</div></div>}
      <div className="cc-cards">
        {kc('Total received', inr(T.total), 'Everything received from customers on this date: rent, advance, customization, charges and deposits, in every mode.', `Rent ${inr(T.rent)} · Customization ${inr(T.customToday)}`, undefined, true)}
        {kc('Total cash', inr(T.cash), 'Received in physical cash.', undefined, 'var(--ok)')}
        {kc('GPay / UPI', inr(T.upi), 'Goes to the bank, not the drawer.', undefined, PURPLE)}
        {kc('Card', inr(T.card), 'Goes to the bank, not the drawer.', undefined, BLUE)}
        {kc('Refunds paid', inr(T.refunds), 'Refunds actually paid out on this date, in any mode.', undefined, 'var(--bad)')}
        {kc('Counter balance', known ? inr(book.expected) : 'Not set', 'Expected closing cash, the same as in the drawer line above.', undefined, TEAL)}</div>
      {T.other > 0 && <p className="mut" style={{ fontSize: 12, marginTop: -10 }}>Also received by other modes (bank transfer and similar): {inr(T.other)}.</p>}
      <div className="cc-h"><h3>Recent transactions{filtered && <span className="mut" style={{ fontSize: 12, fontWeight: 400 }}> · filtered</span>}</h3>{shown.length > 5 && <a href="#" onClick={e => { e.preventDefault(); setView('transactions') }}>View all {shown.length}</a>}</div>
      {txTable(shown.slice(-5), 'No transactions for this date')}</>}

    {view === 'transactions' && <><div className="cc-h"><h3>{dmy(date)} · {shown.length} transaction{shown.length === 1 ? '' : 's'}</h3></div>{txTable(shown, 'No transactions for this date')}
      <p className="mut" style={{ fontSize: 12 }}>Money actually received or paid out on this date, not the full booking price. Amounts in green came in, red went out; Book entries are adjustments that move no money.</p></>}

    {view === 'expenses' && <>
      <div className="cc-h"><h3>Expense records</h3></div>
      <div className="flt" style={{ justifyContent: 'flex-start' }}><input type="date" value={er.from} onChange={e => setEr({ ...er, from: e.target.value })} aria-label="From" style={{ width: 'auto' }} /><input type="date" value={er.to} onChange={e => setEr({ ...er, to: e.target.value })} aria-label="To" style={{ width: 'auto' }} />
        <button className="btn sm" onClick={showExpenses}>Show</button>{erows && <button className="btn alt sm" onClick={exportExpenses}>Export expenses</button>}</div>
      {!erows && <p className="mut">Pick a date range and press Show.</p>}
      {erows && <div className="scroll"><table className="cc-table"><thead><tr><th>Date</th><th>Category</th><th>Paid to / Remarks</th><th>Mode</th><th style={{ textAlign: 'right' }}>Amount</th><th>Entered by</th></tr></thead><tbody>
        {erows.map(x => <tr key={x.id} style={x.voided_at ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}><td>{dmy(x.spent_on)}</td><td>{x.category}</td><td style={{ whiteSpace: 'normal' }}>{x.payee ? `${x.payee}: ` : ''}{x.remarks}</td><td>{x.mode}</td><td style={{ color: RED, fontWeight: 600, textAlign: 'right' }}>{inr(x.amount)}</td><td>{ctx.staffName(x.created_by) || '—'}</td></tr>)}
        {!erows.length && <tr><td colSpan={6} className="mut">No expenses in this range.</td></tr>}
        {!!erows.length && <tr style={{ fontWeight: 700 }}><td colSpan={4}>Total (voided excluded)</td><td style={{ textAlign: 'right' }}>{inr(erows.filter(x => !x.voided_at).reduce((s, x) => s + x.amount, 0))}</td><td></td></tr>}</tbody></table></div>}</>}

    {view === 'summary' && <>
      <div className="cc-h"><h3>Bookings with activity on {dmy(date)}</h3></div>
      <div className="adm-cards">
        {card('Dresses', String(T.dresses), 'Different dresses with at least one payment, refund or adjustment on this date.')}
        {card('Rental value', inr(T.rental), 'Rent after discounts for bookings with activity today. Booking value, not money received.')}
        {card('Customization charges', inr(T.custom), 'Payments settle rent first, then customization.', `unpaid ${inr(T.customUnpaid)} · received ${inr(T.customToday)}`, PURPLE)}
        {card('Outstanding balances', inr(T.outstanding), 'What customers still owe on these bookings. Not cash in hand.')}</div>
      <div className="cc-h" style={{ marginTop: 18 }}><h3>Held for customers (all bookings, end of day)</h3></div>
      <div className="adm-cards">
        {card('Advance pending refund', inr(liab?.advance_pending || 0), 'Advances held for bookings not yet delivered or cancelled, less advance refunds paid. Becomes rent once the dress is delivered.', undefined, TEAL)}
        {card('Refundable deposits held', inr(liab?.deposits_held || 0), 'Deposits received less deposits returned and deposits kept against dues. Not income.', undefined, BLUE)}</div>
      <p className="mut" style={{ fontSize: 12, marginTop: 14 }}>The Excel export has the full transaction list, the cash reconciliation and this summary on three sheets.</p></>}
  </div>)
}
