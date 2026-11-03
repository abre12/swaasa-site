'use client'
import { useEffect, useState } from 'react'
import { dmy, inr, istDate, istTime } from '@/lib/util'
const CUS = '#8a4fbf'                                     // customization is its own entry, in purple
const DEP = '#2f6fd0'                                   // refundable deposits are shown in blue: refundable, not income
const LABEL: Record<string, string> = { rent: 'Rent payment', deposit: 'Refundable deposit received', deposit_refund: 'Deposit refunded', rent_refund: 'Rent refunded', charge: 'Deposit applied to dues' }
// Every payment on one booking: what is owed, what has been paid, and what is still to be handed back.
export default function PaymentRecord({ ctx, b, onClose }: { ctx: any; b: any; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState('')
  useEffect(() => {
    ctx.sb.from('payments').select('id,amount,kind,mode,created_at,created_by').eq('booking_id', b.id).order('created_at')
      .then(({ data, error }: any) => { if (error) setErr('Could not load the payments.'); else { setErr(''); setRows(data || []) } })
  }, [ctx.sb, b.id, b.paid, b.deposit_held, ctx.tick])
  const sum = (k: string) => (rows || []).filter(r => r.kind === k).reduce((t, r) => t + r.amount, 0)
  const rentAmount = b.rent + b.charges, owing = Math.max(0, rentAmount - b.paid), custom = b.custom_charge || 0, otherCh = b.charges - custom
  const depositPaid = sum('deposit')
  const toRefund = Math.max(0, b.deposit_held - owing)   // deposit held, less any rent or charges still unpaid
  const line = (l: string, v: any, bold = false, c?: string) => <div className="row" style={{ color: c }}><span className={bold ? undefined : 'mut'}>{l}</span>{bold ? <b>{v}</b> : <span>{v}</span>}</div>
  return (<div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 70, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 16 }}>
    <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 560, width: '100%', margin: 0 }}>
      <div className="row"><h3 style={{ margin: 0 }}>Payment record · {b.id}</h3><button className="btn alt sm" onClick={onClose}>Close</button></div>
      <p className="mut" style={{ margin: '4px 0 10px', fontSize: 13 }}>{b.dress_code} · {b.customer_name} · {dmy(b.start_date)} to {dmy(b.end_date)}</p>
      <div className="box" style={{ margin: 0 }}>
        {line('Rent Amount:', inr(b.rent), true)}
        {b.discount > 0 && line('Original price, less discount ' + inr(b.discount), inr(b.rent + b.discount))}
        {custom > 0 && line('Customization charge:', inr(custom), true, CUS)}
        {otherCh > 0 && line('Late fee / damage charges:', inr(otherCh))}
        {(custom > 0 || otherCh > 0) && line('Total to collect:', inr(rentAmount), true)}
        {line('Deposit Paid:', inr(depositPaid), true, DEP)}
        {line('Refundable deposit for this booking', inr(b.deposit))}
        {line(custom > 0 ? 'Paid so far (rent and customization):' : 'Rent Paid:', inr(b.paid), true)}
        {line(owing > 0 ? 'Balance due' : 'Balance', inr(owing))}
        {line('Balance to be Refunded:', inr(toRefund), true, toRefund > 0 ? DEP : undefined)}
        <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>Balance to be refunded is the deposit still held, less any rent or charges not yet paid. It is handed back when the dress is returned.</p>
      </div>
      <b style={{ display: 'block', margin: '14px 0 6px' }}>Payments</b>
      {err && <p className="bad">{err}</p>}
      <div className="scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Mode</th><th>Amount</th><th>Entered by</th></tr></thead><tbody>
        {custom > 0 && <tr><td className="mut">{dmy(istDate(b.created_at))}</td><td style={{ whiteSpace: 'normal', color: CUS }}>Customization charge (collected with the rent)</td><td>–</td><td style={{ fontWeight: 600, color: CUS }}>{inr(custom)}</td><td>–</td></tr>}
        {(rows || []).map(r => { const refund = r.kind.endsWith('refund'), dep = r.kind === 'deposit'
          return <tr key={r.id}><td>{dmy(istDate(r.created_at))}<div className="mut" style={{ fontSize: 11 }}>{istTime(r.created_at)}</div></td><td style={{ whiteSpace: 'normal', color: dep ? DEP : undefined }}>{LABEL[r.kind] || r.kind}</td>
            <td>{r.kind === 'charge' ? 'Book entry' : r.mode || '–'}</td><td style={{ fontWeight: 600, color: refund ? 'var(--bad)' : dep ? DEP : r.kind === 'charge' ? 'var(--mut)' : undefined }}>{refund ? '−' : ''}{inr(r.amount)}</td><td>{ctx.staffName(r.created_by) || '–'}</td></tr> })}
        {rows && !rows.length && <tr><td colSpan={5} className="mut">No payments recorded yet.</td></tr>}
        {!rows && !err && <tr><td colSpan={5} className="mut">Loading…</td></tr>}</tbody></table></div>
    </div></div>)
}
