'use client'
import { inr } from '@/lib/util'
import { buildDeposit, buildPaymentSummary } from '@/lib/payments'
import { Ic } from './icons'

/** Payment Summary + (separate) Security Deposit card. Renders only what applies to this booking. */
export default function PaymentSummary({ b, payments }: { b: any; payments?: any[] | null }) {
  const s = buildPaymentSummary(b), dep = buildDeposit(b, payments)
  const sum = (k: string) => (payments || []).filter(p => p.kind === k).reduce((t, p) => t + (Number(p.amount) || 0), 0)
  const refunded = sum('deposit_refund'), applied = sum('charge')
  return <>
    <div className="box ps"><b className="ps-h">Payment Summary</b>
      {s.items.map(i => <div key={i.label} className={'ps-r' + (i.type === 'discount' ? ' disc' : '')}><span>{i.label}</span><span>{i.type === 'discount' ? '− ' : ''}{inr(i.value)}</span></div>)}
      {s.showTotal ? <>
        <div className="ps-total"><b>Total Amount</b><b>{inr(s.total)}</b></div>
        <div className="ps-r"><span>Amount Received</span><span>{inr(s.paid)}</span></div>
        {s.due > 0 && <div className="ps-r due"><b>Balance Due</b><b>{inr(s.due)}</b></div>}
        {s.over > 0 && <div className="ps-r"><span>Overpaid</span><span>{inr(s.over)}</span></div>}
      </> : <span className="mut" style={{ fontSize: 13 }}>No charges recorded yet.</span>}
    </div>
    {dep && <div className="box ps-dep"><Ic n="coins" s={26} /><div>
      <b>Security Deposit</b>
      <div className="ps-amt">{inr(dep.amount)} <span>(Refundable)</span></div>
      <div className={'ps-st ' + dep.tone}>{dep.status}</div>
      {dep.held > 0 && dep.held !== dep.amount && <small>{inr(dep.held)} currently held</small>}
      {dep.held > 0 && dep.held === dep.amount && dep.status === 'Collected' && <small>Held by the shop</small>}
      {refunded > 0 && <small>{inr(refunded)} refunded</small>}
      {applied > 0 && <small>{inr(applied)} applied to unpaid charges</small>}
      {dep.toRefund > 0 && <small>{inr(dep.toRefund)} to refund on return</small>}
    </div></div>}
  </>
}
