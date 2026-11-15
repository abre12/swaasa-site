'use client'
import { receiptHtml, receiptText, whatsappLink } from '@/lib/receipt'
import { todayIST } from '@/lib/util'

// BP-3: print or share the receipt and rental agreement for this booking.
function printHtml(html: string) {
  const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentWindow!.document; d.open(); d.write(html); d.close()
  setTimeout(() => { f.contentWindow!.focus(); f.contentWindow!.print(); setTimeout(() => f.remove(), 3000) }, 300)
}

export default function ReceiptBar({ ctx, b, pays }: { ctx: any; b: any; pays: any[] | null }) {
  if (!ctx.ops || b.status === 'cancelled') return null
  const st = ctx.st || {}
  const input = { b, payments: pays, dress: ctx.dmap?.[b.dress_id], shop: { name: st.shop_name, phone: st.shop_phone, address: st.shop_address }, terms: st.agreement_terms, issuedOn: todayIST() }
  const text = receiptText(input)
  return <section className="bd-card"><div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h3 style={{ margin: 0, flex: '1 1 auto' }}>Receipt &amp; agreement</h3>
    <button type="button" className="btn alt sm" onClick={() => printHtml(receiptHtml(input))}>Print / save as PDF</button>
    {b.phone && <a className="btn alt sm" href={whatsappLink(b.phone, text)} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>}
    <button type="button" className="btn alt sm" onClick={async () => { try { await navigator.clipboard.writeText(text); ctx.say('Receipt text copied') } catch { ctx.say('Could not copy. Use Print instead.') } }}>Copy text</button></div>
    <p className="mut" style={{ margin: '6px 0 0', fontSize: 12.5 }}>The receipt shows the charges, payments and deposit as they are now, with the rental terms from Settings and a place for the customer to sign.</p></section>
}
