// BP-3: the customer's receipt and rental agreement. Built from the same numbers as the Payment Summary on the booking screen, so they cannot disagree.
import { buildDeposit, buildPaymentSummary } from './payments'
import { dmy, inr, phoneKey } from './util'

export type ReceiptInput = {
  b: any; payments?: any[] | null; dress?: any
  shop: { name?: string; phone?: string; address?: string }
  terms?: string
  issuedOn: string   // yyyy-mm-dd
}

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export function receiptHtml({ b, payments, dress, shop, terms, issuedOn }: ReceiptInput): string {
  const s = buildPaymentSummary(b), dep = buildDeposit(b, payments)
  const received = (payments || []).filter(p => ['rent', 'rent_refund'].includes(p.kind))
  const rows = s.items.map(i => `<tr><td>${esc(i.label)}</td><td class="r">${i.type === 'discount' ? '&minus; ' : ''}${esc(inr(i.value))}</td></tr>`).join('')
  const pays = received.map(p => `<tr><td>${esc(dmy(String(p.created_at).slice(0, 10)))} &middot; ${esc(p.mode || '')}${p.kind === 'rent_refund' ? ' (refund)' : ''}</td><td class="r">${p.kind === 'rent_refund' ? '&minus; ' : ''}${esc(inr(p.amount))}</td></tr>`).join('')
  const delivery = b.delivery_mode === 'delivery' ? `Delivery to: ${esc(b.delivery_address || '')}${b.delivery_slot ? ' &middot; ' + esc(b.delivery_slot) : ''}` : 'Collected from the shop'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receipt ${esc(b.id)}</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2428;margin:0}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #d9c9ce;padding-bottom:3px;color:#7a1538}
.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.mut{color:#6b6169}.box{border:1px solid #d9c9ce;border-radius:6px;padding:8px 12px}
table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}.r{text-align:right;white-space:nowrap}.tot td{border-top:1px solid #2b2428;font-weight:700;padding-top:5px}
.terms{white-space:pre-line;font-size:12px}.sign{display:flex;gap:40px;margin-top:38px}.sign div{flex:1;border-top:1px solid #2b2428;padding-top:4px;font-size:12px}
</style></head><body>
<div class="top"><div><h1>${esc(shop.name || 'Swaasa Wedding Rentals')}</h1><div class="mut">${esc(shop.address || '')}${shop.phone ? '<br>Phone: ' + esc(shop.phone) : ''}</div></div>
<div style="text-align:right"><b>Rental receipt &amp; agreement</b><br>Booking <b>${esc(b.id)}</b><br><span class="mut">Issued ${esc(dmy(issuedOn))}</span></div></div>
<h2>Customer</h2><div>${esc(b.customer_name)}<br><span class="mut">${esc(b.phone || '')}${b.email ? ' &middot; ' + esc(b.email) : ''}</span></div>
<h2>Dress and dates</h2><div class="box"><b>${esc(b.dress_code)} &middot; ${esc(b.dress_name || dress?.name || '')}</b><br>
Rental: ${esc(dmy(b.start_date))} to ${esc(dmy(b.end_date))}${b.event_date ? `<br>Event: ${esc(b.event_type || 'Event')} on ${esc(dmy(b.event_date))}` : ''}<br>${delivery}
${dress?.extra_day_fee ? `<br>Late return fee: ${esc(inr(dress.extra_day_fee))} for each extra day` : ''}${b.alteration_notes ? `<br>Alterations: ${esc(b.alteration_notes)}` : ''}</div>
<h2>Charges</h2><table>${rows}<tr class="tot"><td>Total amount</td><td class="r">${esc(inr(s.total))}</td></tr></table>
${pays ? `<h2>Payments received</h2><table>${pays}<tr class="tot"><td>Received so far</td><td class="r">${esc(inr(s.paid))}</td></tr></table>` : ''}
<table style="margin-top:6px"><tr class="tot"><td>Balance due</td><td class="r">${esc(inr(s.due))}</td></tr></table>
${dep ? `<h2>Refundable security deposit</h2><div class="box">${esc(inr(dep.amount))}: ${esc(dep.status)}${dep.held > 0 ? ` (${esc(inr(dep.held))} held by the shop)` : ''}. It is returned after the dress is back on time and checked.</div>` : ''}
${terms ? `<h2>Terms of rental</h2><div class="terms">${esc(terms)}</div>` : ''}
<div class="sign"><div>Customer signature &amp; date</div><div>For ${esc(shop.name || 'the shop')}</div></div>
</body></html>`
}

/** A short message for WhatsApp or SMS. */
export function receiptText({ b, payments, shop, issuedOn }: ReceiptInput): string {
  const s = buildPaymentSummary(b), dep = buildDeposit(b, payments)
  return [`*${shop.name || 'Swaasa Wedding Rentals'}*`, `Rental receipt · Booking ${b.id}`, `${b.dress_code} · ${b.dress_name || ''}`, `Rental: ${dmy(b.start_date)} to ${dmy(b.end_date)}`,
    `Total ${inr(s.total)} · Received ${inr(s.paid)} · Balance due ${inr(s.due)}`, dep ? `Refundable deposit ${inr(dep.amount)} (${dep.status})` : '', shop.phone ? `Questions? Call ${shop.phone}` : '', `Issued ${dmy(issuedOn)}`].filter(Boolean).join('\n')
}

/** wa.me link that opens WhatsApp to the customer with the message ready. */
export function whatsappLink(phone: string, text: string): string {
  const k = phoneKey(phone), digits = k.startsWith('+') ? k.slice(1) : '91' + k
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
