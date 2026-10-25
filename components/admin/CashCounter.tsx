'use client'
import { useCallback, useEffect, useState } from 'react'
import { addD, dmy, inr, istTime, modeGroup, PAY_MODES, todayIST } from '@/lib/util'
import { downloadBlob, makeXlsx, Cell } from '@/lib/xlsx'
const DEP = '#2f6fd0'                                            // refundable deposits are shown in blue: refundable, not income
const REC = ['rent', 'deposit']                                  // money received from the customer
const TYPES: Record<string, string> = { deposit: 'Refundable deposit', deposit_refund: 'Deposit refund', rent_refund: 'Rental refund', charge: 'Deposit applied to dues' }
export default function CashCounter({ ctx }: { ctx: any }) {
  const [date, setDate] = useState(todayIST()); const [mode, setMode] = useState(''); const [type, setType] = useState('')
  const [rows, setRows] = useState<any[]>([]); const [open, setOpen] = useState<string | null>(null); const [err, setErr] = useState('')
  const [pos, setPos] = useState<any>(null); const [exp, setExp] = useState<any[]>([]); const owner = ctx.owner, mStart = todayIST().slice(0, 7) + '-01'   // managers see the current month only
  const load = useCallback(async () => {
    const from = new Date(`${date}T00:00:00+05:30`).toISOString(), to = new Date(`${addD(date, 1)}T00:00:00+05:30`).toISOString()
    const { data, error } = await ctx.sb.from('payments').select('id,booking_id,amount,kind,mode,created_at,created_by,bookings(id,customer_name,rent,discount,charges,deposit,dresses(code,name))').gte('created_at', from).lt('created_at', to).order('created_at')
    if (error) return setErr('Could not load payments for this date.'); setErr('')
    const ids = [...new Set((data || []).map((r: any) => r.booking_id))]
    const { data: all } = ids.length ? await ctx.sb.from('payments').select('id,booking_id,kind,created_at').in('booking_id', ids) : { data: [] }
    const first: Record<string, string> = {}                    // the first rent payment on a booking is its advance
    ;(all || []).filter((p: any) => p.kind === 'rent').sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)).forEach((p: any) => { first[p.booking_id] ??= p.id })
    setRows((data || []).map((r: any) => ({ ...r, isAdvance: r.kind === 'rent' && first[r.booking_id] === r.id })))
  }, [date, ctx.sb])
  const loadBook = useCallback(async () => {
    const [p, x] = await Promise.all([ctx.sb.rpc('cash_position', { p_day: date }), ctx.sb.from('cash_expenses').select('id,amount,remarks,created_by,created_at').eq('spent_on', date).order('created_at')])
    setPos(p.error ? null : (p.data?.[0] ?? null)); setExp(x.data || [])
  }, [date, ctx.sb])
  useEffect(() => { load(); loadBook() }, [load, loadBook, ctx.tick])
  const label = (r: any) => r.kind === 'rent' ? (r.isAdvance ? 'Advance' : 'Balance payment') : TYPES[r.kind]
  const shown = rows.filter(r => (!mode || modeGroup(r.mode) === mode) && (!type || (type === 'refund' ? r.kind.endsWith('refund') : r.kind === type)))
  const dueOf = (id: string) => { const b = ctx.B.find((x: any) => x.id === id); return b ? Math.max(0, b.rent + b.charges - b.paid) : 0 }
  function totals(list: any[]) {
    const sum = (a: any[]) => a.reduce((s, r) => s + r.amount, 0), rec = list.filter(r => REC.includes(r.kind)), ref = list.filter(r => r.kind.endsWith('refund'))
    const bks = [...new Map(list.map(r => [r.booking_id, r.bookings])).values()].filter(Boolean) as any[], by = (g: string) => sum(rec.filter(r => modeGroup(r.mode) === g))
    return { n: list.length, rental: bks.reduce((s, b) => s + b.rent, 0), rent: sum(list.filter(r => r.kind === 'rent')), dep: sum(list.filter(r => r.kind === 'deposit')), total: sum(rec), cash: by('Cash'), upi: by('GPay / UPI'), card: by('Card'), other: by('Other'), refunds: sum(ref), outstanding: [...new Set(list.map(r => r.booking_id))].reduce((s, id) => s + dueOf(id), 0) }
  }
  const T = totals(rows), TS = totals(shown)
  async function record() {
    const cand = ctx.B.filter((b: any) => b.status !== 'cancelled').sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)).slice(0, 80)
    const v = await ctx.ask('Record a payment', [
      { name: 'b', label: 'Booking', options: cand.map((b: any) => `${b.id} · ${b.dress_code} · ${b.customer_name} · due ${inr(Math.max(0, b.rent + b.charges - b.paid))}`), required: true },
      { name: 't', label: 'Type', options: ['Rent payment (advance or balance)', 'Refundable deposit received', 'Deposit refund paid', 'Rental refund paid'], required: true },
      { name: 'a', label: 'Amount (₹)', type: 'number', required: true }, { name: 'm', label: 'Payment mode', options: PAY_MODES, required: true }], { ok: 'Save payment', note: 'Recorded with today’s date and time. Earlier payments are never changed.' }); if (!v) return
    const b = ctx.B.find((x: any) => x.id === v.b.split(' · ')[0]), a = +v.a, kind = v.t.startsWith('Rent payment') ? 'rent' : v.t.startsWith('Security') ? 'deposit' : v.t.startsWith('Deposit refund') ? 'deposit_refund' : 'rent_refund'
    if (!b || !(a > 0)) return ctx.say('Enter a valid amount.')
    if (kind === 'deposit_refund' && a > b.deposit_held) return ctx.say(`Only ${inr(b.deposit_held)} of deposit is held for this booking.`)
    if (kind === 'rent_refund' && a > b.paid) return ctx.say(`Only ${inr(b.paid)} of rent has been received for this booking.`)
    const { error } = await ctx.sb.from('payments').insert({ booking_id: b.id, amount: a, kind, mode: v.m }); ctx.say(error ? error.message : `${inr(a)} recorded`); ctx.load(); load()
  }
  async function addExpense() {
    if (date !== todayIST()) return ctx.say('Petty cash can only be added for today.')
    const v = await ctx.ask('Petty cash expense', [{ name: 'a', label: 'Amount paid out in cash (₹)', type: 'number', required: true }, { name: 'r', label: 'Remarks: what was this expense for?', required: true }], { ok: 'Save expense', note: 'Taken out of the cash drawer today. It cannot be changed later, so check the amount and the remark.' }); if (!v) return
    const a = +v.a, r = v.r.trim(); if (!(a > 0) || !r) return ctx.say('Enter an amount and a remark.')
    const { error } = await ctx.sb.from('cash_expenses').insert({ amount: a, remarks: r }); ctx.say(error ? error.message : `${inr(a)} petty cash recorded`); loadBook()
  }
  async function tally() {
    if (!pos) return ctx.say('Cash in hand is not available yet. Run supabase/migration-v5.sql in Supabase first.')
    const v = await ctx.ask(`Tally cash for ${dmy(date)}`, [{ name: 'c', label: 'Cash counted in the drawer (₹)', type: 'number', value: String(pos.expected), required: true }, { name: 'n', label: 'Note (optional, for example the reason for a difference)' }],
      { ok: 'Save tally', note: `Opening ${inr(pos.opening)} + cash received ${inr(pos.cash_in)} − cash refunds ${inr(pos.cash_out)} − petty cash ${inr(pos.expenses)} = expected ${inr(pos.expected)}. Count the cash and enter it. The counted amount becomes the opening cash for the next day.` }); if (!v) return
    const c = +v.c; if (!(c >= 0) || v.c === '') return ctx.say('Enter the cash counted.')
    if (c !== pos.expected && !(await ctx.askYes('Cash does not match', `Counted ${inr(c)} but expected ${inr(pos.expected)} (difference ${c - pos.expected > 0 ? '+' : '−'}${inr(Math.abs(c - pos.expected))}). Save this count anyway?`, 'Save count'))) return
    const { error } = await ctx.sb.rpc('cash_tally_day', { p_day: date, p_counted: c, p_note: v.n || null }); ctx.say(error ? error.message : `Cash tallied: ${inr(c)}`); loadBook()
  }
  async function exportXlsx() {
    const R = (n: number): Cell => ({ n, s: 'money' }), RB = (n: number): Cell => ({ n, s: 'moneyBold' })
    const head = ['Time', 'Booking ID', 'Item Code', 'Customer Name', 'Price', 'Discount', 'Transaction Type', 'Amount', 'Payment Mode'].map(t => ({ t, s: 'head' as const }))
    const body: Cell[][] = shown.map(r => { const b = r.bookings, refund = r.kind.endsWith('refund'); return [istTime(r.created_at), r.booking_id, b?.dresses?.code || '', b?.customer_name || '', R((b?.rent || 0) + (b?.discount || 0)), R(b?.discount || 0), label(r) + (r.kind === 'deposit' ? ' (refundable)' : ''), { n: refund ? -r.amount : r.amount, s: r.kind === 'deposit' ? 'moneyBlue' : 'money' }, r.kind === 'charge' ? 'Book entry (no cash)' : r.mode || ''] })
    const filt = [mode && `Payment mode: ${mode}`, type && `Type: ${TYPES[type] || type}`].filter(Boolean).join(', ') || 'None'
    const sum: Cell[][] = [[], [{ t: 'DAILY COLLECTION SUMMARY', s: 'bold' }], ['Transactions', TS.n], ['Rental value after discounts (bookings in this list)', RB(TS.rental)], ['Rent received', RB(TS.rent)], ['Refundable deposits received (refundable, shown in blue)', { n: TS.dep, s: 'moneyBlue' }], ['Total received', RB(TS.total)],
      ['   Cash', R(TS.cash)], ['   GPay / UPI', R(TS.upi)], ['   Card', R(TS.card)], ...(TS.other ? [['   Other', R(TS.other)] as Cell[]] : []), ['Refunds paid', R(TS.refunds)], ['Net cash movement', RB(TS.total - TS.refunds)], ['Outstanding customer balances (these bookings)', R(TS.outstanding)],
      ...((pos ? [[], [{ t: 'CASH IN HAND', s: 'bold' }], ['Opening cash (brought forward)', R(pos.opening)], ['Cash received', R(pos.cash_in)], ['Cash refunds paid', R(pos.cash_out)], ['Petty cash expenses', R(pos.expenses)], ['Expected cash in hand', RB(pos.expected)], ...(pos.counted != null ? [['Counted at day end', R(pos.counted)]] : [])] : []) as unknown as Cell[][])]
    downloadBlob(await makeXlsx('Daily Cash Counter', [[{ t: 'Swaasa Wedding Rentals', s: 'title' }], [{ t: 'Daily Cash Counter', s: 'bold' }, { d: date, s: 'date' }], [{ t: 'Filters applied', s: 'bold' }, filt], [], head, ...body, ...sum], [10, 14, 12, 26, 14, 14, 30, 16, 20]), `swaasa-cash-counter-${date}.xlsx`)
  }
  const sel = (l: string, v: string, set: (x: string) => void, opts: [string, string][]) => <select aria-label={l} value={v} onChange={e => set(e.target.value)} style={{ width: 'auto' }}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
  const cards: [string, string, string?][] = [['Transactions', String(T.n)], ['Rental value (after discounts)', inr(T.rental)], ['Rent received', inr(T.rent)], ['Refundable deposits received', inr(T.dep), DEP], ['Total received', inr(T.total)], ['Cash', inr(T.cash)], ['GPay / UPI', inr(T.upi)], ['Card', inr(T.card)], ['Refunds paid', inr(T.refunds)], ['Outstanding balances', inr(T.outstanding)]]
  return (<div>
    <div className="flt" style={{ justifyContent: 'flex-start' }}><input type="date" value={date} min={owner ? undefined : mStart} max={todayIST()} onChange={e => e.target.value && (owner || e.target.value >= mStart) && e.target.value <= todayIST() && setDate(e.target.value)} aria-label="Date" style={{ width: 'auto' }} /><button className="btn alt sm" onClick={() => setDate(todayIST())}>Today</button>
      {sel('Payment mode', mode, setMode, [['', 'All payment modes'], ['Cash', 'Cash'], ['GPay / UPI', 'GPay / UPI'], ['Card', 'Card'], ['Other', 'Other']])}
      {sel('Type', type, setType, [['', 'All transaction types'], ['rent', 'Rent payments'], ['deposit', 'Refundable deposits'], ['refund', 'Refunds'], ['charge', 'Deposit applied to dues']])}
      <button className="btn sm" onClick={record}>Record payment</button><button className="btn sm" onClick={addExpense} disabled={date !== todayIST()}>Petty cash expense</button><button className="btn sm" onClick={tally}>Tally cash (end of day)</button><button className="btn alt sm" onClick={exportXlsx}>EXPORT TO EXCEL</button></div>
    {err && <p className="bad">{err}</p>}
    <p className="mut" style={{ fontSize: 13 }}>{dmy(date)}. Money actually received or paid out on this date, not the full booking price. <span style={{ color: DEP }}><b>Blue amounts are refundable deposits</b></span>: they are not income and must be returned to the customer after the dress is checked for damage. Cash, GPay / UPI and Card totals include deposits.{(mode || type) && ' The table and the Excel export use your filters.'}{!owner && ' Cash history is shown for the current month only.'}</p>
    <div className="box" style={{ margin: '0 0 12px' }}><h3 style={{ letterSpacing: '.08em', fontSize: 18 }}>CASH IN HAND · {dmy(date)}</h3>
      {pos ? <>
        <div className="adm-cards">{([['Opening cash (brought forward)', pos.opening], ['Cash received', pos.cash_in], ['Cash refunds paid', pos.cash_out], ['Petty cash expenses', pos.expenses], ['Expected cash in hand', pos.expected], ...(pos.counted != null ? [['Counted at day end', pos.counted], ['Difference', pos.counted - pos.expected]] : [])] as [string, number][]).map(([l, v]) =>
          <div key={l} className="stat-card" style={l === 'Difference' && v !== 0 ? { borderColor: 'var(--bad)' } : undefined}><span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 24, fontFamily: 'Cormorant Garamond, serif', color: l === 'Difference' && v !== 0 ? 'var(--bad)' : undefined }}>{l === 'Difference' && v > 0 ? '+' : v < 0 ? '−' : ''}{inr(Math.abs(v))}</b></div>)}</div>
        <p className="mut" style={{ fontSize: 13, margin: '8px 0 0' }}>{pos.counted != null ? `Tallied${pos.tallied_by ? ' by ' + (ctx.staffName(pos.tallied_by) || 'staff') : ''} at ${istTime(pos.tallied_at)}${pos.note ? ': ' + pos.note : ''}. This count is tomorrow’s opening cash.` : 'Not tallied yet. At the end of the day count the cash drawer and press “Tally cash”. Until then the expected amount carries forward to the next day.'}</p></>
        : <p className="mut" style={{ margin: 0 }}>Cash in hand is not available yet. Run <b>supabase/migration-v5.sql</b> in Supabase, then refresh.</p>}
      <b style={{ display: 'block', margin: '12px 0 4px', fontSize: 14 }}>Petty cash expenses</b>
      <div className="scroll"><table><thead><tr><th>Time</th><th>Amount</th><th>Remarks</th><th>Entered by</th></tr></thead><tbody>
        {exp.map(x => <tr key={x.id}><td>{istTime(x.created_at)}</td><td style={{ color: 'var(--bad)', fontWeight: 600 }}>−{inr(x.amount)}</td><td style={{ whiteSpace: 'normal' }}>{x.remarks}</td><td>{ctx.staffName(x.created_by) || '–'}</td></tr>)}
        {!exp.length && <tr><td colSpan={4} className="mut">No petty cash expenses on this date.</td></tr>}</tbody></table></div></div>
    <div className="adm-cards">{cards.map(([l, v, c]) => <div key={l} className="stat-card" style={c ? { borderColor: c } : undefined}><span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 24, fontFamily: 'Cormorant Garamond, serif', color: c }}>{v}</b></div>)}</div>
    {T.other > 0 && <p className="mut" style={{ fontSize: 12 }}>Other payment modes: {inr(T.other)}</p>}
    <div className="scroll" style={{ marginTop: 12 }}><table><thead><tr><th>Item Code</th><th>Customer Name</th><th>Price</th><th>Discount / Advance</th><th>Amount</th><th>Payment Mode</th></tr></thead><tbody>
      {shown.map(r => { const b = r.bookings, refund = r.kind.endsWith('refund'), dep = r.kind === 'deposit', nonCash = r.kind === 'charge'; return <><tr key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
        <td>{b?.dresses?.code}</td><td>{b?.customer_name}</td><td>{inr((b?.rent || 0) + (b?.discount || 0))}</td>
        <td style={{ whiteSpace: 'normal' }}>{b?.discount > 0 && <div>Discount {inr(b.discount)}</div>}<div style={{ color: dep ? DEP : undefined }}>{label(r)}</div></td>
        <td style={{ color: nonCash ? 'var(--mut)' : refund ? 'var(--bad)' : dep ? DEP : undefined, fontWeight: 600, fontStyle: nonCash ? 'italic' : undefined }}>{refund ? '−' : ''}{inr(r.amount)}{dep && <div style={{ fontSize: 11, fontWeight: 400 }}>Refundable deposit</div>}{r.kind === 'deposit_refund' && <div style={{ fontSize: 11, fontWeight: 400 }}>Deposit returned</div>}</td>
        <td>{nonCash ? 'Book entry (no cash)' : r.mode}</td></tr>
        {open === r.id && <tr key={r.id + 'x'}><td colSpan={6} className="mut" style={{ whiteSpace: 'normal', background: 'var(--blush)' }}>Booking {r.booking_id} · {istTime(r.created_at)}{r.created_by ? ` · Entered by ${ctx.staffName(r.created_by) || 'staff'}` : ''} · Net rental charge {inr(b?.rent || 0)} · Outstanding on this booking now: {inr(dueOf(r.booking_id))} · <a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(r.booking_id) }}>Open booking</a> · <a href="#" onClick={e => { e.preventDefault(); ctx.openPayments(r.booking_id) }}>Payment record</a></td></tr>}</>})}
      {!shown.length && <tr><td colSpan={6} className="mut">No transactions for this date{(mode || type) ? ' and filters' : ''}.</td></tr>}</tbody></table></div>
  </div>)
}
