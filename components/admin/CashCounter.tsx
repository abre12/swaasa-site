'use client'
import { useCallback, useEffect, useState } from 'react'
import { addD, dmy, inr, istTime, modeGroup, PAY_MODES, todayIST } from '@/lib/util'
import { downloadBlob, makeXlsx, Cell } from '@/lib/xlsx'

const CUS = '#8a4fbf'
const ADV = '#237c91'
const DEP = '#2f6fd0'
const LABEL: Record<string, string> = {
  deposit: 'Deposit', deposit_refund: 'Deposit Refund', rent_refund: 'Rent Refund',
  charge: 'Deposit Applied to Dues'
}
const isCash = (m: string | null) => modeGroup(m) === 'Cash'
const money = (n: number) => inr(Math.abs(n))

export async function pettyCashEntry(ctx: any): Promise<boolean> {
  const v = await ctx.ask('Record business expense', [
    { name: 'a', label: 'Amount (₹)', type: 'number', required: true },
    { name: 'c', label: 'Expense category', options: ['Petty Cash', 'Dry Cleaning', 'Laundry', 'Repairs / Alterations', 'Supplies', 'Transport / Delivery', 'Other'], required: true },
    { name: 'r', label: 'Remarks / Payee', required: true },
    { name: 'm', label: 'Payment mode', options: PAY_MODES, required: true }
  ], { ok: 'Save expense', note: 'Cash expenses reduce the drawer balance. UPI, card and bank expenses do not reduce physical cash.' })
  if (!v) return false
  const a = +v.a, r = v.r.trim()
  if (!(a > 0) || !r) { ctx.say('Enter a valid amount and remark.'); return false }
  const { error } = await ctx.sb.from('cash_expenses').insert({ amount: a, remarks: r, category: v.c, mode: v.m })
  ctx.say(error ? error.message : `${inr(a)} expense recorded`)
  ctx.load()
  return !error
}

export default function CashCounter({ ctx }: { ctx: any }) {
  const [date, setDate] = useState(todayIST())
  const [mode, setMode] = useState('')
  const [type, setType] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [pos, setPos] = useState<any>(null)
  const [exp, setExp] = useState<any[]>([])
  const [advancePending, setAdvancePending] = useState(0)
  const owner = ctx.owner, mStart = todayIST().slice(0, 7) + '-01'

  const load = useCallback(async () => {
    const from = new Date(`${date}T00:00:00+05:30`).toISOString()
    const to = new Date(`${addD(date, 1)}T00:00:00+05:30`).toISOString()
    const { data, error } = await ctx.sb.from('payments')
      .select('id,booking_id,amount,kind,mode,created_at,created_by,bookings(id,status,customer_name,rent,discount,charges,deposit,custom_charge,dresses(code,name))')
      .gte('created_at', from).lt('created_at', to).order('created_at')
    if (error) { setErr('Could not load payments for this date.'); return }
    setErr('')
    const ids = [...new Set((data || []).map((r: any) => r.booking_id))]
    const { data: all } = ids.length ? await ctx.sb.from('payments').select('id,booking_id,kind,created_at,amount').in('booking_id', ids) : { data: [] }
    const first: Record<string, string> = {}
    ;(all || []).filter((p: any) => p.kind === 'rent').sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)).forEach((p: any) => { first[p.booking_id] ??= p.id })
    setRows((data || []).map((r: any) => ({ ...r, isAdvance: r.kind === 'rent' && first[r.booking_id] === r.id })))

    // A first rent receipt is treated as an advance by this application's existing convention.
    // Only cancelled bookings can have an unallocated advance refund liability.
    const { data: cancelled } = await ctx.sb.from('bookings').select('id').eq('status', 'cancelled')
    const cids = (cancelled || []).map((b: any) => b.id)
    if (cids.length) {
      const { data: cp } = await ctx.sb.from('payments').select('booking_id,amount,kind,created_at').in('booking_id', cids).order('created_at')
      const firstBy: Record<string, number> = {}, refunded: Record<string, number> = {}
      ;(cp || []).forEach((p: any) => { if (p.kind === 'rent') firstBy[p.booking_id] ??= p.amount; if (p.kind === 'rent_refund') refunded[p.booking_id] = (refunded[p.booking_id] || 0) + p.amount })
      setAdvancePending(Object.keys(firstBy).reduce((s, id) => s + Math.max(0, firstBy[id] - (refunded[id] || 0)), 0))
    } else setAdvancePending(0)
  }, [date, ctx.sb])

  const loadBook = useCallback(async () => {
    const [p, x] = await Promise.all([
      ctx.sb.rpc('cash_position', { p_day: date }),
      ctx.sb.from('cash_expenses').select('id,amount,remarks,category,mode,created_by,created_at').eq('spent_on', date).order('created_at')
    ])
    setPos(p.error ? null : (p.data?.[0] ?? null))
    setExp(x.data || [])
  }, [date, ctx.sb])

  useEffect(() => { load(); loadBook() }, [load, loadBook, ctx.tick])

  const label = (r: any) => r.kind === 'rent' ? (r.isAdvance ? 'Advance' : 'Rent') : LABEL[r.kind] || r.kind
  const shown = rows.filter(r => (!mode || modeGroup(r.mode) === mode) && (!type || (type === 'refund' ? r.kind.endsWith('refund') : type === 'advance' ? r.isAdvance : type === 'custom' ? false : r.kind === type)))
  const dueOf = (id: string) => { const b = ctx.B.find((x: any) => x.id === id); return b ? Math.max(0, b.rent + b.charges - b.paid) : 0 }

  const uniqueBookings = (list: any[]) => [...new Map(list.map(r => [r.booking_id, r.bookings])).values()].filter(Boolean) as any[]
  const uniqueDresses = (list: any[]) => new Set(list.map(r => r.bookings?.dresses?.code).filter(Boolean)).size
  function totals(list: any[]) {
    const sum = (a: any[]) => a.reduce((s, r) => s + Number(r.amount || 0), 0)
    const rec = list.filter(r => ['rent', 'deposit'].includes(r.kind))
    const refunds = list.filter(r => r.kind.endsWith('refund'))
    const by = (g: string) => sum(rec.filter(r => modeGroup(r.mode) === g))
    const bks = uniqueBookings(list)
    return {
      n: uniqueDresses(list),
      rental: bks.reduce((s, b) => s + Number(b.rent || 0), 0),
      custom: bks.reduce((s, b) => s + Number(b.custom_charge || 0), 0),
      rent: sum(list.filter(r => r.kind === 'rent')),
      dep: sum(list.filter(r => r.kind === 'deposit')),
      total: sum(rec), cash: by('Cash'), upi: by('GPay / UPI'), card: by('Card'), other: by('Other'),
      refunds: sum(refunds),
      outstanding: [...new Set(list.map(r => r.booking_id))].reduce((s, id) => s + dueOf(id), 0)
    }
  }
  const T = totals(rows), TS = totals(shown)

  async function record() {
    const cand = ctx.B.filter((b: any) => b.status !== 'cancelled').sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)).slice(0, 80)
    const v = await ctx.ask('Record a payment', [
      { name: 'b', label: 'Booking', options: cand.map((b: any) => `${b.id} · ${b.dress_code} · ${b.customer_name} · due ${inr(Math.max(0, b.rent + b.charges - b.paid))}`), required: true },
      { name: 't', label: 'Type', options: ['Rent payment (advance or balance)', 'Refundable deposit received', 'Deposit refund paid', 'Rental refund paid'], required: true },
      { name: 'a', label: 'Amount (₹)', type: 'number', required: true }, { name: 'm', label: 'Payment mode', options: PAY_MODES, required: true }
    ], { ok: 'Save payment', note: 'Recorded with today’s date and time. Earlier payments are never changed.' })
    if (!v) return
    const b = ctx.B.find((x: any) => x.id === v.b.split(' · ')[0]), a = +v.a
    const kind = v.t.startsWith('Rent payment') ? 'rent' : v.t.startsWith('Refundable') ? 'deposit' : v.t.startsWith('Deposit refund') ? 'deposit_refund' : 'rent_refund'
    if (!b || !(a > 0)) return ctx.say('Enter a valid amount.')
    if (kind === 'deposit_refund' && a > b.deposit_held) return ctx.say(`Only ${inr(b.deposit_held)} of deposit is held for this booking.`)
    if (kind === 'rent_refund' && a > b.paid) return ctx.say(`Only ${inr(b.paid)} of rent has been received for this booking.`)
    const { error } = await ctx.sb.from('payments').insert({ booking_id: b.id, amount: a, kind, mode: v.m })
    ctx.say(error ? error.message : `${inr(a)} recorded`); ctx.load(); load()
  }

  async function addExpense() {
    if (date !== todayIST()) return ctx.say('Expenses can only be entered for today.')
    if (await pettyCashEntry(ctx)) loadBook()
  }
  async function setOpeningCash() {
    if (!owner) return ctx.say('Only the owner can configure opening cash.')
    const v = await ctx.ask('Configure opening cash', [
      { name: 'a', label: 'Physical cash available at start of first business date (₹)', type: 'number', required: true },
      { name: 'd', label: 'First business date (YYYY-MM-DD)', value: todayIST(), required: true }
    ], { ok: 'Save opening cash', note: 'Use this only to establish the starting cash balance for the cash counter. It does not create a customer receipt.' })
    if (!v) return
    const a = +v.a
    if (!(a >= 0) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(v.d)) return ctx.say('Enter a valid amount and date.')
    const { error } = await ctx.sb.rpc('set_cash_opening', { p_amount: a, p_effective_date: v.d })
    ctx.say(error ? error.message : `Opening cash configured: ${inr(a)} from ${dmy(v.d)}`)
    loadBook()
  }

  async function tally() {
    if (!pos) return ctx.say('Cash balance is not available. Apply the latest cash-counter migration first.')
    const v = await ctx.ask(`Tally cash for ${dmy(date)}`, [
      { name: 'c', label: 'Actual cash counted in drawer (₹)', type: 'number', value: String(pos.expected), required: true },
      { name: 'n', label: 'Discrepancy note (optional)' }
    ], { ok: 'Save tally', note: `Opening cash ${inr(pos.opening)} + cash received ${inr(pos.cash_in)} − cash refunds ${inr(pos.cash_out)} − cash expenses ${inr(pos.expenses)} = expected closing cash ${inr(pos.expected)}. The counted amount becomes tomorrow’s opening cash.` })
    if (!v) return
    const c = +v.c
    if (!(c >= 0) || v.c === '') return ctx.say('Enter the cash counted.')
    if (c !== pos.expected && !(await ctx.askYes('Cash does not match', `Counted ${inr(c)} but expected ${inr(pos.expected)} (difference ${c - pos.expected > 0 ? '+' : '−'}${inr(Math.abs(c - pos.expected))}). Save this count?`, 'Save count'))) return
    const { error } = await ctx.sb.rpc('cash_tally_day', { p_day: date, p_counted: c, p_note: v.n || null })
    ctx.say(error ? error.message : `Cash tallied: ${inr(c)}`); loadBook()
  }

  async function exportXlsx() {
    const R = (n: number): Cell => ({ n, s: 'money' }), RB = (n: number): Cell => ({ n, s: 'moneyBold' })
    const head = ['Time', 'Booking ID', 'Item Code', 'Customer / Payee', 'Remarks', 'Amount', 'Payment Mode', 'Entered By'].map(t => ({ t, s: 'head' as const }))
    const body: Cell[][] = shown.map(r => {
      const b = r.bookings, refund = r.kind.endsWith('refund'), bookEntry = r.kind === 'charge'
      return [istTime(r.created_at), r.booking_id, b?.dresses?.code || '', b?.customer_name || '', label(r), { n: bookEntry ? 0 : refund ? -r.amount : r.amount, s: bookEntry ? 'money' : r.kind === 'deposit' ? 'moneyBlue' : 'money' }, bookEntry ? 'Book Entry' : r.mode || '', ctx.staffName(r.created_by) || '']
    })
    const expenseRows: Cell[][] = exp.map(x => [istTime(x.created_at), '—', '—', x.remarks, x.category || 'Business Expense', { n: isCash(x.mode) ? -x.amount : -x.amount, s: 'money' }, x.mode || 'Cash', ctx.staffName(x.created_by) || ''])
    const filt = [mode && `Payment mode: ${mode}`, type && `Type: ${type}`].filter(Boolean).join(', ') || 'None'
    const summary: Cell[][] = [
      [], [{ t: 'DAILY FINANCIAL SUMMARY', s: 'bold' }], ['Unique dresses with transactions', TS.n],
      ['Rental value (unique bookings represented)', RB(TS.rental)], ['Customization charges (unique bookings represented)', R(TS.custom)],
      ['Rent received', RB(TS.rent)], ['Refundable deposits received', { n: TS.dep, s: 'moneyBlue' }],
      ['Advance refund pending (cancelled bookings)', RB(advancePending)], ['Total customer receipts', RB(TS.total)],
      ['Cash received', R(TS.cash)], ['GPay / UPI received', R(TS.upi)], ['Card received', R(TS.card)],
      ['Refunds paid', R(TS.refunds)], ['Outstanding balances (bookings in list)', R(TS.outstanding)],
      ...(pos ? [[], [{ t: 'PHYSICAL CASH RECONCILIATION', s: 'bold' }], ['Opening cash', R(pos.opening)], ['Cash received', R(pos.cash_in)], ['Cash refunds paid', R(pos.cash_out)], ['Cash expenses', R(pos.expenses)], ['Expected closing cash', RB(pos.expected)], ...(pos.counted != null ? [['Actual counted cash', R(pos.counted)], ['Difference', R(pos.counted - pos.expected)]] : [])] as Cell[][] : []),
      [], [{ t: 'BUSINESS EXPENSES', s: 'bold' }], ...expenseRows
    ]
    downloadBlob(await makeXlsx('Daily Cash Counter', [[{ t: 'Swaasa Wedding Rentals', s: 'title' }], [{ t: 'Daily Cash Counter', s: 'bold' }, { d: date, s: 'date' }], [{ t: 'Filters applied', s: 'bold' }, filt], [], head, ...body, ...summary], [12, 18, 14, 26, 28, 16, 20, 20]), `swaasa-cash-counter-${date}.xlsx`)
  }

  const sel = (l: string, v: string, set: (x: string) => void, opts: [string, string][]) =>
    <select aria-label={l} value={v} onChange={e => set(e.target.value)} style={{ width: 'auto' }}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>

  const cards: [string, string, string?][] = [
    ['Transactions (unique dresses)', String(T.n)], ['Rental value (after discounts)', inr(T.rental)],
    ['Customization charges', inr(T.custom), CUS], ['Rent received', inr(T.rent)],
    ['Advance refund pending', inr(advancePending), ADV], ['Refundable deposits received', inr(T.dep), DEP],
    ['Total received', inr(T.total)], ['Cash received', inr(T.cash)], ['GPay / UPI received', inr(T.upi)],
    ['Card received', inr(T.card)], ['Refunds paid today', inr(T.refunds)], ['Outstanding balances', inr(T.outstanding)]
  ]

  return <div>
    <div className="flt" style={{ justifyContent: 'flex-start' }}>
      <input type="date" value={date} min={owner ? undefined : mStart} max={todayIST()} onChange={e => e.target.value && (owner || e.target.value >= mStart) && e.target.value <= todayIST() && setDate(e.target.value)} aria-label="Date" style={{ width: 'auto' }} />
      <button className="btn alt sm" onClick={() => setDate(todayIST())}>Today</button>
      {sel('Payment mode', mode, setMode, [['', 'All payment modes'], ['Cash', 'Cash'], ['GPay / UPI', 'GPay / UPI'], ['Card', 'Card'], ['Other', 'Other']])}
      {sel('Type', type, setType, [['', 'All transaction types'], ['rent', 'Rent'], ['advance', 'Advance'], ['deposit', 'Deposit'], ['refund', 'Refunds'], ['charge', 'Deposit applied to dues']])}
      <button className="btn sm" onClick={record}>Record payment</button>
      <button className="btn sm" onClick={addExpense} disabled={date !== todayIST()}>Record expense</button>
      <button className="btn sm" onClick={tally}>Tally cash (end of day)</button>\n      {owner && <button className="btn alt sm" onClick={setOpeningCash}>Set opening cash</button>}
      <button className="btn alt sm" onClick={exportXlsx}>Export to Excel</button>
    </div>
    {err && <p className="bad">{err}</p>}
    <p className="mut" style={{ fontSize: 13 }}>{dmy(date)}. This report shows actual money received or paid on this date, not the full booking price. <span style={{ color: DEP }}><b>Blue = refundable deposits</b></span>; purple = customization; teal = advances. Book entries are allocations, not cash movements. {(mode || type) && 'The transaction table and export use the selected filters.'}{!owner && ' Cash history is shown for the current month only.'}</p>

    <div className="box" style={{ margin: '0 0 12px' }}>
      <h3 style={{ letterSpacing: '.08em', fontSize: 18 }}>PHYSICAL CASH RECONCILIATION · {dmy(date)}</h3>
      {pos ? <>
        <div className="adm-cards">{([
          ['Opening cash (brought forward)', pos.opening], ['Cash received', pos.cash_in],
          ['Cash refunds paid', pos.cash_out], ['Cash expenses', pos.expenses],
          ['Expected closing cash', pos.expected],
          ...(pos.counted != null ? [['Actual counted cash', pos.counted], ['Difference', pos.counted - pos.expected]] : [])
        ] as [string, number][]).map(([l, v]) =>
          <div key={l} className="stat-card" style={l === 'Difference' && v !== 0 ? { borderColor: 'var(--bad)' } : undefined}>
            <span className="mut" style={{ fontSize: 13 }}>{l}</span>
            <b style={{ fontSize: 24, fontFamily: 'Cormorant Garamond, serif', color: l === 'Difference' && v !== 0 ? 'var(--bad)' : undefined }}>{l === 'Difference' && v > 0 ? '+' : v < 0 ? '−' : ''}{money(v)}</b>
          </div>)}</div>
        <p className="mut" style={{ fontSize: 13, margin: '8px 0 0' }}>{pos.counted != null ? `Reconciled${pos.tallied_by ? ' by ' + (ctx.staffName(pos.tallied_by) || 'staff') : ''} at ${istTime(pos.tallied_at)}${pos.note ? ': ' + pos.note : ''}. Counted cash is carried forward.` : 'Not reconciled. Count the cash drawer at day end and select “Tally cash”. The expected closing balance carries forward until a tally is saved.'}</p>
      </> : <p className="mut">Cash reconciliation is unavailable. Apply the supplied migration-v7.sql in Supabase and refresh.</p>}
      <b style={{ display: 'block', margin: '12px 0 4px', fontSize: 14 }}>Business expenses</b>
      <div className="scroll"><table><thead><tr><th>Time</th><th>Category</th><th>Amount</th><th>Payment Mode</th><th>Remarks / Payee</th><th>Entered By</th><th>Booking ID</th></tr></thead><tbody>
        {exp.map(x => <tr key={x.id}><td>{istTime(x.created_at)}</td><td>{x.category || 'Petty Cash'}</td><td style={{ color: 'var(--bad)', fontWeight: 600 }}>−{inr(x.amount)}</td><td>{x.mode || 'Cash'}</td><td style={{ whiteSpace: 'normal' }}>{x.remarks}</td><td>{ctx.staffName(x.created_by) || '—'}</td><td>—</td></tr>)}
        {!exp.length && <tr><td colSpan={7} className="mut">No business expenses recorded for this date.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="adm-cards">{cards.map(([l, v, c]) => <div key={l} className="stat-card" style={c ? { borderColor: c } : undefined}><span className="mut" style={{ fontSize: 13 }}>{l}</span><b style={{ fontSize: 24, fontFamily: 'Cormorant Garamond, serif', color: c }}>{v}</b></div>)}</div>
    {T.other > 0 && <p className="mut" style={{ fontSize: 12 }}>Other payment modes: {inr(T.other)}</p>}

    <div className="scroll" style={{ marginTop: 12 }}><table><thead><tr>
      <th>Time</th><th>Booking ID</th><th>Item Code</th><th>Customer / Payee</th><th>Remarks</th><th>Amount</th><th>Payment Mode</th><th>Entered By</th>
    </tr></thead><tbody>
      {shown.map(r => {
        const b = r.bookings, refund = r.kind.endsWith('refund'), deposit = r.kind === 'deposit', bookEntry = r.kind === 'charge'
        const remark = label(r), colour = r.kind === 'rent' && r.isAdvance ? ADV : deposit ? DEP : undefined
        return <tr key={r.id}>
          <td>{istTime(r.created_at)}</td>
          <td><a href="#" onClick={e => { e.preventDefault(); ctx.openBooking(r.booking_id) }} style={{ fontWeight: 600, textDecoration: 'underline' }}>{r.booking_id}</a></td>
          <td>{b?.dresses?.code || '—'}</td><td>{b?.customer_name || '—'}</td>
          <td style={{ color: colour || (refund ? 'var(--bad)' : undefined), fontWeight: r.kind === 'rent' && r.isAdvance ? 600 : undefined }}>{remark}</td>
          <td style={{ color: bookEntry ? 'var(--mut)' : refund ? 'var(--bad)' : colour || (r.kind === 'rent' && r.isAdvance ? ADV : undefined), fontWeight: 600, fontStyle: bookEntry ? 'italic' : undefined }}>
            {bookEntry ? 'Book entry' : `${refund ? '−' : ''}${inr(r.amount)}`}
            {deposit && <div style={{ fontSize: 11, fontWeight: 400 }}>Refundable deposit</div>}
          </td>
          <td>{bookEntry ? 'Book Entry (no cash)' : r.mode || '—'}</td><td>{ctx.staffName(r.created_by) || '—'}</td>
        </tr>
      })}
      {!shown.length && <tr><td colSpan={8} className="mut">No transactions for this date{(mode || type) ? ' and filters' : ''}.</td></tr>}
    </tbody></table></div>
  </div>
}
