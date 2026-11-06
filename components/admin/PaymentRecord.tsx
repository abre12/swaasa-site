'use client'
import { useEffect, useState } from 'react'
import { dmy, inr, istDate, istTime } from '@/lib/util'
const CUS = '#8a4fbf'                                     // customization is its own entry, in purple
const DEP = '#2f6fd0'                                   // refundable deposits are shown in blue: refundable, not income
const LABEL: Record<string, string> = { rent: 'Rent payment', deposit: 'Refundable deposit received', deposit_refund: 'Deposit refunded', rent_refund: 'Rent refunded', charge: 'Deposit applied to dues' }
// Every payment on one booking: what is owed, what has been paid, and what is still to be handed back.
const TEAL = '#0e8f8f'
const PUR: Record<string, [string, string]> = { advance: ['Advance', TEAL], customization: ['Customization payment', '#8a4fbf'], damage: ['Damage charges', ''], cleaning: ['Cleaning charges', ''], other_charge: ['Other charges', ''], advance_refund: ['Advance refund', 'var(--bad)'] }
import PaymentSummary from './PaymentSummary'
export function usePaymentRows(ctx: any, b: any) {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState('')
  useEffect(() => {
    ctx.sb.from('payments').select('id,amount,kind,purpose,remarks,mode,created_at,created_by').eq('booking_id', b.id).order('created_at')
      .then(({ data, error }: any) => { if (error) setErr('Could not load the payments.'); else { setErr(''); setRows(data || []) } })
  }, [ctx.sb, b.id, b.paid, b.deposit_held, ctx.tick])
  return { rows, err }
}
// The same transactions table in the popup and inline in the booking details modal.
export function PaymentTable({ ctx, b, rows, err }: { ctx: any; b: any; rows: any[] | null; err: string }) {
  const custom = b.custom_charge || 0
  return <>{err && <p className="bad">{err}</p>}
    <div className="scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Mode</th><th>Amount</th><th>Entered by</th></tr></thead><tbody>
      {custom > 0 && <tr><td className="mut">{dmy(istDate(b.created_at))}</td><td style={{ whiteSpace: 'normal', color: CUS }}>Customization charge (collected with the rent)</td><td>–</td><td style={{ fontWeight: 600, color: CUS }}>{inr(custom)}</td><td>–</td></tr>}
      {(rows || []).map(r => { const refund = r.kind.endsWith('refund'), dep = r.kind === 'deposit'
        return <tr key={r.id}><td>{dmy(istDate(r.created_at))}<div className="mut" style={{ fontSize: 11 }}>{istTime(r.created_at)}</div></td><td style={{ whiteSpace: 'normal', color: PUR[r.purpose]?.[1] || (dep ? DEP : undefined) }}>{PUR[r.purpose]?.[0] || LABEL[r.kind] || r.kind}{r.remarks && <div className="mut" style={{ fontSize: 11 }}>{r.remarks}</div>}</td>
          <td>{r.kind === 'charge' ? 'From security deposit' : r.mode || '–'}</td><td style={{ fontWeight: 600, color: refund ? 'var(--bad)' : PUR[r.purpose]?.[1] || (dep ? DEP : r.kind === 'charge' ? 'var(--mut)' : undefined) }}>{refund ? '−' : ''}{inr(r.amount)}</td><td>{ctx.staffName(r.created_by) || '–'}</td></tr> })}
      {rows && !rows.length && !custom && <tr><td colSpan={5} className="mut">No payments recorded yet.</td></tr>}
      {!rows && !err && <tr><td colSpan={5} className="mut">Loading…</td></tr>}</tbody></table></div></>
}
export default function PaymentRecord({ ctx, b, onClose }: { ctx: any; b: any; onClose: () => void }) {
  const { rows, err } = usePaymentRows(ctx, b)
  const sum = (k: string) => (rows || []).filter(r => r.kind === k).reduce((t, r) => t + r.amount, 0)
  const rentAmount = b.rent + b.charges, owing = Math.max(0, rentAmount - b.paid), custom = b.custom_charge || 0, otherCh = b.charges - custom
  const depositPaid = sum('deposit')
  const toRefund = Math.max(0, b.deposit_held - owing)   // deposit held, less any rent or charges still unpaid
  const line = (l: string, v: any, bold = false, c?: string) => <div className="row" style={{ color: c }}><span className={bold ? undefined : 'mut'}>{l}</span>{bold ? <b>{v}</b> : <span>{v}</span>}</div>
  return (<div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 85, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 16 }}>
    <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 560, width: '100%', margin: 0 }}>
      <div className="row"><h3 style={{ margin: 0 }}>Payment record · {b.id}</h3><button className="btn alt sm" onClick={onClose}>Close</button></div>
      <p className="mut" style={{ margin: '4px 0 10px', fontSize: 13 }}>{b.dress_code} · {b.customer_name} · {dmy(b.start_date)} to {dmy(b.end_date)}</p>
      <PaymentSummary b={b} payments={rows} />
      <b style={{ display: 'block', margin: '14px 0 6px' }}>Payments</b>
      <PaymentTable ctx={ctx} b={b} rows={rows} err={err} />
    </div></div>)
}
