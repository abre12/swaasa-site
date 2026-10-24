'use client'
import { useCallback, useEffect, useState } from 'react'
import { addD, dmy, inr, istTime, modeGroup, PAY_MODES, todayIST } from '@/lib/util'
import { downloadBlob, makeXlsx, Cell } from '@/lib/xlsx'
const REC = ['rent', 'deposit']                                // money received from the customer
const TYPES: Record<string, string> = { rent: 'Rent payment', deposit: 'Security deposit', deposit_refund: 'Deposit refund', rent_refund: 'Rental refund', charge: 'Deposit applied to dues' }
export default function CashCounter({ ctx }: { ctx: any }) {
  const [date, setDate] = useState(todayIST()); const [mode, setMode] = useState(''); const [type, setType] = useState('')
  const [rows, setRows] = useState<any[]>([]); const [open, setOpen] = useState<string | null>(null); const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const from = new Date(`${date}T00:00:00+05:30`).toISOString(), to = new Date(`${addD(date, 1)}T00:00:00+05:30`).toISOString()
    const { data, error } = await ctx.sb.from('payments').select('id,booking_id,amount,kind,mode,created_at,bookings(id,customer_name,rent,discount,charges,deposit,dresses(code,name))').gte('created_at', from).lt('created_at', to).order('created_at')
    if (error) return setErr('Could not load payments for this date.'); setErr('')
    const ids = [...new Set((data || []).map((r: any) => r.booking_id))]
    const { data: all } = ids.length ? await ctx.sb.from('payments').select('id,booking_id,kind,created_at').in('booking_id', ids) : { data: [] }
    const first: Record<string, string> = {}                    // the first rent payment on a booking is its advance
    ;(all || []).filter((p: any) => p.kind === 'rent').sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)).forEach((p: any) => { first[p.booking_id] ??= p.id })
    setRows((data || []).map((r: any) => ({ ...r, isAdvance: r.kind === 'rent' && first[r.booking_id] === r.id })))
  }, [date, ctx.sb])
  useEffect(() => { load() }, [load, ctx.tick])
  const label = (r: any) => r.kind === 'rent' ? (r.isAdvance ? 'Advance' : 'Balance payment') : TYPES[r.kind]
  const shown = rows.filter(r => (!mode || modeGroup(r.mode) === mode) && (!type || (type === 'refund' ? r.kind.endsWith('refund') : type === 'rent' ? r.kind === 'rent' : r.kind === type)))
  const dueOf = (id: string) => { const b = ctx.B.find((x: any) => x.id === id); return b ? Math.max(0, b.rent + b.charges - b.paid) : 0 }
  function totals(list: any[]) {
    const rec = list.filter(r => REC.includes(r.kind)), ref = list.filter(r => r.kind.endsWith('refund')), sum = (a: any[]) => a.reduce((s, r) => s + r.amount, 0)
    const bks = [...new Map(list.map(r => [r.booking_id, r.bookings])).values()].filter(Boolean) as any[]
    return { n: list.length, rental: bks.reduce((s, b) => s + b.rent, 0), collected: sum(rec), cash: sum(rec.filter(r => modeGroup(r.mode) === 'Cash')), upi: sum(rec.filter(r => modeGroup(r.mode) === 'GPay / UPI')),
      card: sum(rec.filter(r => modeGroup(r.mode) === 'Card')), other: sum(rec.filter(r => modeGroup(r.mode) === 'Other')), refunds: sum(ref), outstanding: [...new Set(list.map(r => r.booking_id))].reduce((s, id) => s + dueOf(id), 0) }
  }
  const T = totals(rows), TS = totals(shown)
  async function record() {
    const cand = ctx.B.filter((b: any) => b.status !== 'cancelled').sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)).slice(0, 80)
    const v = await ctx.ask('Record a payment', [
      { name: 'b', label: 'Booking', options: cand.map((b: any) => `${b.id} · ${b.dress_code} · ${b.customer_name} · due ${inr(Math.max(0, b.rent + b.charges - b.paid))}`), required: true },
      { name: 't', label: 'Type', options: ['Rent payment (advance or balance)', 'Security deposit received', 'Deposit refund paid', 'Rental refund paid'], required: true },
      { name: 'a', label: 'Amount (₹)', type: 'number', required: true }, { name: 'm', label: 'Payment mode', options: PAY_MODES, required: true }], { ok: 'Save payment', note: 'Recorded with today’s date and time. Earlier payments are never changed.' }); if (!v) return
    const b = ctx.B.find((x: any) => x.id === v.b.split(' · ')[0]), a = +v.a, kind = v.t.startsWith('Rent payment') ? 'rent' : v.t.startsWith('Security') ? 'deposit' : v.t.startsWith('Deposit refund') ? 'deposit_refund' : 'rent_refund'
    if (!b || !(a > 0)) return ctx.say('Enter a valid amount.')
    if (kind === 'deposit_refund' && a > b.deposit_held) return ctx.say(`Only ${inr(b.deposit_held)} of deposit is held for this booking.`)
    if (kind === 'rent_refund' && a > b.paid) return ctx.say(`Only ${inr(b.paid)} of rent has been received for this booking.`)
    const { error } = await ctx.sb.from('payments').insert({ booking_id: b.id, amount: a, kind, mode: v.m }); ctx.say(error ? error.message : `${inr(a)} recorded`); ctx.load(); load()
  }
  async function exportXlsx() {
    const R = (n: number): Cell => ({ n, s: 'money' }), RB = (n: number): Cell => ({ n, s: 'moneyBold' })
    const head = ['Time', 'Booking ID', 'Item Code', 'Customer Name', 'Price', 'Discount', 'Transaction Type', 'Amount Received / (Refunded)', 'Net Amount', 'Payment Mode'].map(t => ({ t, s: 'head' as const }))
    const body: Cell[][] = shown.map(r => { const b = r.bookings; return [istTime(r.created_at), r.booking_id, b?.dresses?.code || '', b?.customer_name || '', R((b?.rent || 0) + (b?.discount || 0)), R(b?.discount || 0), label(r), R(r.kind.endsWith('refund') ? -r.amount : r.amount), R(b?.rent || 0), r.mode || ''] })
    const filt = [mode && `Payment mode: ${mode}`, type && `Type: ${type}`].filter(Boolean).join(', ') || 'None'
    const sum: Cell[][] = [[], [{ t: 'DAILY COLLECTION SUMMARY', s: 'bold' }], ['Transactions', TS.n], ['Rental value after discounts (bookings in this list)', RB(TS.rental)], ['Total collected', RB(TS.collected)], ['   Cash', R(TS.cash)], ['   GPay / UPI', R(TS.upi)], ['   Card', R(TS.card)], ...(TS.other ? [['   Other', R(TS.other)] as Cell[]] : []), ['Refunds paid', R(TS.refunds)], ['Net cash movement', RB(TS.collected - TS.refunds)], ['Outstanding customer balances (these bookings)', R(TS.outstanding)]]
    const blob = await makeXlsx('Daily Cash Counter', [[{ t: 'Swaasa Wedding Rentals', s: 'title' }], [{ t: 'Daily Cash Counter', s: 'bold' }, { d: date, s: 'date' }], [{ t: 'Filters applied', s: 'bold' }, filt], [], head, ...body, ...sum], [10, 14, 12, 26, 14, 14, 24, 26, 14, 16])
    downloadBlob(blob, `swaasa-cash-counter-${date}.xlsx`)
  }
  const sel = (l: string, v: string, set: (x: string) => void, opts: [string, string][]) => <select aria-label={l} value={v} onChange={e => set(e.target.value)}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
  return (<div>
    <div className="flt" style={{ justifyContent: 'flex-start' }}><input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Date" /><button className="btn alt sm" onClick={() => setDate(todayIST())}>Today</button>
      {sel('Payment mode', mode, setMode, [['', 'All payment modes'], ['Cash', 'Cash'], ['GPay / UPI', 'GPay / UPI'], ['Card', 'Card'], ['Other', 'Other']])}
      {sel('Type', type, setType, [['', 'All transaction types'], ['rent', 'Rent payments'], ['deposit', 'Security deposits'], ['refund', 'Refunds'], ['charge', 'Deposit applied to dues']])}
      <button className="btn sm" onClick={record}>Record payment</button><button className="btn alt sm" onClick={exportXlsx}>EXPORT TO EXCEL</button></div>
    {err && <p className="bad">{err}</p>}
    <p className="mut" style={{ fontSize: 13 }}>{dmy(date)}. The summary shows money actually received or paid out on this date, not the full booking price.{(mode || type) && ' The table and the Excel export use your filters.'}</p>
    <div className="adm-cards">{([['Transactions', String(T.n)], ['Rental value (after discounts)', inr(T.rental)], ['Total collected', inr(T.collected)], ['Cash', inr(T.cash)], ['GPay / UPI', inr(T.upi)], ['Card', inr(T.card)], ['Refunds paid', inr(T.refunds)], ['Outstanding balances', inr(T.outstanding)]] as [string, string][]).map(([l, v]) => <div key={l} className="stat-card"><span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 24, fontFamily: 'Cormorant Garamond, serif' }}>{v}</b></div>)}</div>
    {T.other > 0 && <p className="mut" style={{ fontSize: 12 }}>Other payment modes: {inr(T.other)}</p>}
    <div className="scroll" style={{ marginTop: 12 }}><table><thead><tr><th>Item Code</th><th>Customer Name</th><th>Price</th><th>Discount / Advance</th><th>Net Amount</th><th>Payment Mode</th></tr></thead><tbody>
      {shown.map(r => { const b = r.bookings, refund = r.kind.endsWith('refund'), non = r.kind === 'charge'; return <><tr key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
        <td>{b?.dresses?.code}</td><td>{b?.customer_name}</td><td>{inr((b?.rent || 0) + (b?.discount || 0))}</td>
        <td style={{ whiteSpace: 'normal' }}>{b?.discount > 0 && <div>Discount {inr(b.discount)}</div>}<div className={refund ? 'bad' : ''}><b>{label(r)} {refund ? '−' : ''}{inr(r.amount)}</b></div></td>
        <td>{inr(b?.rent || 0)}</td><td>{non ? 'Book entry (no cash)' : r.mode}</td></tr>
        {open === r.id && <tr key={r.id + 'x'}><td colSpan={6} className="mut" style={{ whiteSpace: 'normal', background: 'var(--blush)' }}>Booking {r.booking_id} · {istTime(r.created_at)} · Outstanding on this booking now: {inr(dueOf(r.booking_id))} · <a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(r.booking_id) }}>Open booking</a></td></tr>}</>})}
      {!shown.length && <tr><td colSpan={6} className="mut">No transactions for this date{(mode || type) ? ' and filters' : ''}.</td></tr>}</tbody></table></div>
  </div>)
}
