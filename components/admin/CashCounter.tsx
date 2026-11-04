'use client'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { addD, dmy, inr, istTime, modeGroup, PAY_MODES, todayIST } from '@/lib/util'
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
type Tx = { key: string; at: string; booking: string | null; code: string | null; dressId: string | null; who: string; note: string; remark: string; colour: string; group: string; amount: number; mode: string; by: string | null; flow: 'in' | 'out' | 'book' | 'exp'; voided?: boolean; id?: number; reason?: string }

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
  const [loading, setLoading] = useState(true), [err, setErr] = useState('')
  const [er, setEr] = useState({ from: todayIST(), to: todayIST() }), [erows, setErows] = useState<any[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const from = new Date(`${date}T00:00:00+05:30`).toISOString(), to = new Date(`${addD(date, 1)}T00:00:00+05:30`).toISOString()
    const [p, x, cb, lb] = await Promise.all([
      ctx.sb.from('payments').select('id,booking_id,amount,kind,purpose,mode,created_at,created_by,bookings(id,customer_name,dress_id,dresses(code,name))').gte('created_at', from).lt('created_at', to).order('created_at'),
      ctx.sb.from('cash_expenses').select('*').eq('spent_on', date).order('created_at'), ctx.sb.rpc('cash_book', { p_day: date }), ctx.sb.rpc('cash_liabilities', { p_day: date })])
    if (cb.error) setErr(cb.error.message.includes('FORBIDDEN') ? 'Only the owner can open dates before this month.' : 'Could not load the cash book. Please refresh.')
    else if (p.error || x.error || lb.error) setErr('Could not load this date. Please refresh.')
    setPays(p.data || []); setExps(x.data || []); setBook(cb.data?.[0] || null); setLiab(lb.data?.[0] || null); setLoading(false)
  }, [date, ctx.sb])
  useEffect(() => { load() }, [load, ctx.tick])

  // every payment and expense becomes one row, so nothing is counted twice and every figure comes from the same list
  const all: Tx[] = useMemo(() => {
    const rows: Tx[] = pays.map(r => { const pu = r.purpose || KIND_PURPOSE[r.kind] || 'rent', [label, colour, group] = PURPOSE[pu] || PURPOSE.rent, b = r.bookings, refund = r.kind.endsWith('refund'), book = r.kind === 'charge'
      return { key: 'p' + r.id, at: r.created_at, booking: r.booking_id, code: b?.dresses?.code || null, dressId: b?.dress_id || null, who: b?.customer_name || '', note: b?.dresses?.name || '', remark: label, colour, group,
        amount: refund ? -r.amount : r.amount, mode: book ? 'Book Entry' : r.mode || '', by: r.created_by, flow: book ? 'book' : refund ? 'out' : 'in' } })
    exps.forEach(x => rows.push({ key: 'e' + x.id, at: x.created_at, booking: null, code: null, dressId: null, who: x.payee || x.remarks, note: x.payee ? `${x.category}: ${x.remarks}` : x.category, remark: expRemark(x.category), colour: RED, group: 'expense',
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
    const { error } = await ctx.sb.from('payments').insert({ booking_id: b.id, amount: a, kind, purpose, mode: v.m }); ctx.say(error ? error.message : `${inr(a)} recorded`); ctx.load(); load()
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
    const tx: Cell[][] = shown.map(t => [`${dmy(date)} ${istTime(t.at)}`, t.booking || '—', t.code || '', t.who, t.remark + (t.voided ? ' (VOIDED)' : ''), t.note, M(t.voided ? 0 : t.amount, style(t)), t.flow === 'book' ? 'Book Entry' : t.mode, ctx.staffName(t.by) || ''])
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

  const sel = (l: string, v: string, set: (x: string) => void, opts: [string, string][]) => <select aria-label={l} value={v} onChange={e => set(e.target.value)} style={{ width: 'auto' }}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
  const card = (l: string, v: string, tip: string, sub?: string, c?: string) => <div key={l} className="stat-card" title={tip} style={c ? { borderColor: c } : undefined}><span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 24, fontFamily: 'Cormorant Garamond, serif', color: c }}>{v}</b>{sub && <span className="mut" style={{ fontSize: 11 }}>{sub}</span>}</div>
  const filtered = !!(mode || type)
  return (<div>
    <div className="flt" style={{ justifyContent: 'flex-start' }}><input type="date" value={date} max={todayIST()} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Date" style={{ width: 'auto' }} /><button className="btn alt sm" onClick={() => setDate(todayIST())}>Today</button>
      {sel('Payment mode', mode, setMode, [['', 'All payment modes'], ['Cash', 'Cash'], ['GPay / UPI', 'GPay / UPI'], ['Card', 'Card'], ['Other', 'Other'], ['Book entry', 'Book entries']])}
      {sel('Type', type, setType, [['', 'All transaction types'], ['advance', 'Advance'], ['rent', 'Rent'], ['customization', 'Customization'], ['charges', 'Damage / cleaning / other charges'], ['deposit', 'Deposits'], ['refund', 'Refunds'], ['expense', 'Expenses'], ['book', 'Book entries']])}
      <button className="btn sm" onClick={record}>Record payment</button><button className="btn sm" onClick={() => pettyCashEntry(ctx).then(ok => ok && load())}>Petty cash expense</button><button className="btn alt sm" onClick={exportXlsx}>Export to Excel</button></div>
    {err && <p className="bad"><b>{err}</b></p>}
    <p className="mut" style={{ fontSize: 13 }}>{dmy(date)}. Money actually received or paid out on this date, not the full booking price. <span style={{ color: BLUE }}><b>Blue = refundable deposits</b></span> (not income) · <span style={{ color: TEAL }}><b>teal = advance</b></span> · <span style={{ color: PURPLE }}><b>purple = customization</b></span> · <span style={{ color: 'var(--bad)' }}><b>red = money paid out</b></span>.</p>

    <div className="box" style={{ margin: '0 0 14px' }}>
      <h3 style={{ letterSpacing: '.08em', fontSize: 18 }}>CASH DRAWER · {dmy(date)}</h3>
      <p className="mut" style={{ fontSize: 12, margin: '0 0 8px' }}>Physical cash only. GPay / UPI, Card and book entries never change it.</p>
      {loading && !book ? <p className="mut">Loading…</p> : !known ? <div style={{ border: '1px solid #c58a2b', background: '#c58a2b14', padding: 12 }}><b>The opening cash has not been set.</b> The drawer cannot be worked out until you say how much cash was in it at the start.{' '}
        {owner ? <button className="btn sm" onClick={setupOpening}>Set opening cash</button> : <span>Please ask the owner to set it.</span>}</div> : <>
        <div className="adm-cards">{[['Opening cash', inr(book.opening), 'Brought forward from ' + (book.anchor || '')], ['+ Cash received', inr(book.cash_in), 'Cash receipts from customers'], ['− Cash refunds paid', inr(book.cash_refunds), 'Refunds paid out in cash'], ['− Cash expenses', inr(book.expenses), 'Petty cash and other expenses paid in cash']].map(([l, v, t]) => card(l, v, t, undefined))}
          <div className="stat-card" title="Opening + cash received − cash refunds − cash expenses. Count the drawer and compare." style={{ borderColor: 'var(--ink)', borderWidth: 2 }}><span style={{ fontSize: 13 }}><b>= Expected closing cash</b></span><b style={{ fontSize: 28, fontFamily: 'Cormorant Garamond, serif' }}>{inr(book.expected)}</b></div></div>
        <p className="mut" style={{ fontSize: 12, margin: '6px 0' }}>Opening is {book.anchor}. Paid in non-cash modes today (no effect on the drawer): received {inr(nonCash.in)}, refunds {inr(nonCash.out)}, expenses {inr(nonCash.exp)}.</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0' }}>
          {tallied ? <><b style={{ color: book.status === 'reconciled' ? 'var(--ok)' : 'var(--bad)' }}>{book.status === 'reconciled' ? '✓ Reconciled' : `⚠ Discrepancy of ${inr(book.difference)}`}</b><span className="mut">Counted {inr(book.counted)} · expected {inr(book.expected)} when tallied · by {ctx.staffName(book.tallied_by) || 'staff'} at {istTime(book.tallied_at)}{book.note ? ` · “${book.note}”` : ''}</span></> : <b style={{ color: '#c58a2b' }}>Not tallied</b>}
          {(!tallied || owner) && <button className="btn sm" onClick={tally}>{tallied ? 'Change tally' : 'Tally cash (end of day)'}</button>}
          {owner && <button className="btn alt sm" onClick={setupOpening}>Opening cash…</button>}</div></>}
    </div>

    <h3 style={{ letterSpacing: '.08em', fontSize: 18, margin: '4px 0 8px' }}>DAILY FINANCIAL SUMMARY{filtered && <span className="mut" style={{ fontSize: 12, letterSpacing: 0 }}> · filtered view (balances below are never filtered)</span>}</h3>
    <div className="adm-cards">
      {card('Transactions', String(T.dresses), 'Number of different dresses with at least one payment, refund or adjustment on this date.', 'dresses today')}
      {card('Rental value (after discounts)', inr(T.rental), 'The rent after discounts for the bookings that had activity today. This is booking value, not money received.', 'bookings with activity')}
      {card('Customization charges', inr(T.custom), 'Customization charged on those bookings. Payments settle rent first, then customization.', `unpaid ${inr(T.customUnpaid)} · received today ${inr(T.customToday)}`, PURPLE)}
      {card('Rent received', inr(T.rent), 'Advance and rent actually received today. Refunds are shown separately under Refunds paid.', 'advance + rent')}
      {card('Advance received, pending refund', inr(liab?.advance_pending || 0), 'Advances held for bookings not yet delivered or cancelled, less advance refunds paid. All bookings, as at the end of the selected day. Becomes rent once the dress is delivered.', 'all bookings · end of day', TEAL)}
      {card('Refundable deposits held', inr(liab?.deposits_held || 0), 'Deposits received less deposits returned and deposits kept against dues. Not income. All bookings, as at the end of the selected day.', 'all bookings · end of day', BLUE)}
      {card('Total received', inr(T.total), 'Everything received from customers today: rent, advance, customization, charges and deposits, in every payment mode.', 'all modes')}
      {card('Cash', inr(T.cash), 'Received in physical cash today.')}{card('GPay / UPI', inr(T.upi), 'Received by GPay or UPI today (goes to the bank, not the drawer).')}{card('Card', inr(T.card), 'Received by card today (goes to the bank, not the drawer).')}
      {card('Refunds paid', inr(T.refunds), 'Refunds actually paid out today in any mode: deposit, advance and rent refunds. Not pending refunds.', 'today only')}
      {card('Cash counter balance', known ? inr(book.expected) : 'Not set', 'The same figure as Expected closing cash in the drawer panel above.', 'expected closing cash')}
      {card('Outstanding balances', inr(T.outstanding), 'What customers still owe on the bookings that had activity today. Not cash in hand.', 'bookings with activity')}
    </div>
    {T.other > 0 && <p className="mut" style={{ fontSize: 12 }}>Received by other modes (bank transfer and similar): {inr(T.other)}. Cash + GPay / UPI + Card + other = Total received.</p>}

    <h3 style={{ letterSpacing: '.08em', fontSize: 18, margin: '18px 0 8px' }}>TRANSACTIONS</h3>
    <div className="scroll"><table><thead><tr><th>Time</th><th>Booking ID</th><th>Item Code</th><th>Customer / Payee</th><th>Remarks</th><th>Amount</th><th>Payment Mode</th><th>Entered By</th></tr></thead><tbody>
      {loading && !all.length && <tr><td colSpan={8} className="mut">Loading…</td></tr>}
      {shown.map(t => <tr key={t.key} style={t.voided ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
        <td>{istTime(t.at)}</td>
        <td>{t.booking ? <a href="#" title="Open this booking" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }} onClick={e => { e.preventDefault(); ctx.openBooking(t.booking) }}>{t.booking}</a> : '—'}</td>
        <td>{t.code || '—'}</td><td style={{ whiteSpace: 'normal', minWidth: 130 }}>{t.who}{t.note && <div className="mut" style={{ fontSize: 11 }}>{t.note}</div>}</td>
        <td style={{ color: t.colour || undefined, fontWeight: t.colour ? 600 : 400, fontStyle: t.flow === 'book' ? 'italic' : undefined }}>{t.remark}{t.voided && <div style={{ fontSize: 11 }}>VOIDED: {t.reason}</div>}</td>
        <td style={{ color: t.flow === 'in' && !t.colour ? undefined : t.colour || undefined, fontWeight: 700, fontStyle: t.flow === 'book' ? 'italic' : undefined }}>{t.flow === 'book' ? inr(t.amount) : (t.amount < 0 ? '−' : '+') + inr(Math.abs(t.amount))}</td>
        <td>{t.flow === 'book' ? <span className="mut">Book Entry</span> : t.mode}</td><td>{ctx.staffName(t.by) || '—'}{owner && t.flow === 'exp' && !t.voided && <> <button className="btn alt sm" onClick={() => voidExp(t)}>Void</button></>}</td></tr>)}
      {!loading && !shown.length && <tr><td colSpan={8} className="mut">No transactions for this date{filtered ? ' and filters' : ''}.</td></tr>}</tbody></table></div>

    <details style={{ marginTop: 18 }}><summary style={{ cursor: 'pointer', letterSpacing: '.08em', fontSize: 15 }}><b>EXPENSE RECORDS (any dates)</b></summary>
      <div className="flt" style={{ justifyContent: 'flex-start', marginTop: 10 }}><input type="date" value={er.from} onChange={e => setEr({ ...er, from: e.target.value })} aria-label="From" style={{ width: 'auto' }} /><input type="date" value={er.to} onChange={e => setEr({ ...er, to: e.target.value })} aria-label="To" style={{ width: 'auto' }} />
        <button className="btn sm" onClick={showExpenses}>Show</button>{erows && <button className="btn alt sm" onClick={exportExpenses}>Export expenses</button>}</div>
      {erows && <div className="scroll"><table><thead><tr><th>Date</th><th>Category</th><th>Paid to / Remarks</th><th>Mode</th><th>Amount</th><th>Entered by</th></tr></thead><tbody>
        {erows.map(x => <tr key={x.id} style={x.voided_at ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}><td>{dmy(x.spent_on)}</td><td>{x.category}</td><td style={{ whiteSpace: 'normal' }}>{x.payee ? `${x.payee}: ` : ''}{x.remarks}</td><td>{x.mode}</td><td style={{ color: RED, fontWeight: 600 }}>{inr(x.amount)}</td><td>{ctx.staffName(x.created_by) || '—'}</td></tr>)}
        {!erows.length && <tr><td colSpan={6} className="mut">No expenses in this range.</td></tr>}
        {!!erows.length && <tr style={{ fontWeight: 700 }}><td colSpan={4}>Total (voided excluded)</td><td>{inr(erows.filter(x => !x.voided_at).reduce((s, x) => s + x.amount, 0))}</td><td></td></tr>}</tbody></table></div>}
    </details>
  </div>)
}
