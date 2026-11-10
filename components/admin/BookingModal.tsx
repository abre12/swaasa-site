'use client'
import { useEffect, useMemo, useState } from 'react'
import PaymentSummary from './PaymentSummary'
import { buildPaymentSummary } from '@/lib/payments'
import { dmy, inr, istDate, istTime, nDays, todayIST } from '@/lib/util'
import { Ic } from './icons'
import { bookingReadiness } from '@/lib/readiness'
import { dispatchAlteration } from './Alterations'
import { dispatchToCleaner } from './DryCleaning'
import { summarise } from './AlterationDrawer'
import { PaymentTable, usePaymentRows } from './PaymentRecord'
import { altStatus, pickPrimary } from '@/lib/bookingAction'

function PaymentRecordInline({ ctx, b }: { ctx: any; b: any }) {
  const { rows, err } = usePaymentRows(ctx, b)
  return <PaymentTable ctx={ctx} b={b} rows={rows} err={err} />
}

const STATUS: Record<string, string> = { pending: 'Awaiting confirmation', confirmed: 'Confirmed', out: 'Delivered (with customer)', returned: 'Returned', cancelled: 'Cancelled' }

// Unified booking details. Preparation staff retain the existing restricted view.
export default function BookingModal({ ctx, b, limited, onClose }: { ctx: any; b: any; limited: boolean; onClose: () => void }) {
  const [edit, setEdit] = useState(false)
  const [txt, setTxt] = useState<string>(b.alteration_notes || '')
  const [inspection, setInspection] = useState<any>(null)
  const [pays, setPays] = useState<any[] | null>(null)
  const [saved, setSaved] = useState<any>(null)
  const [histOpen, setHistOpen] = useState(false), [payOpen, setPayOpen] = useState(false), [acting, setActing] = useState(false)
  const dress = ctx.dmap[b.dress_id]
  const img = dress?.images?.[0] || b.image
  const notes = saved ? saved.notes : b.alteration_notes
  const by = saved ? saved.by : b.alteration_updated_by
  const at = saved ? saved.at : b.alteration_updated_at
  const overdue = b.status === 'out' && b.end_date < todayIST()
  const visualState = overdue ? 'overdue' : ctx.state(b)
  const finance = buildPaymentSummary(b)
  const paymentLabel = !finance.showTotal || (finance.paid <= 0 && finance.due > 0)
    ? 'Payment Pending'
    : finance.due > 0 ? `${inr(finance.due)} Due` : 'Fully Paid'
  const bookingDate = b.created_at ? dmy(istDate(b.created_at)) : null

  useEffect(() => {
    if (limited) return
    ctx.sb.from('payments').select('kind,amount').eq('booking_id', b.id)
      .then(({ data, error }: any) => setPays(error ? null : (data || [])))
  }, [ctx.sb, b.id, b.paid, b.deposit_held, limited, ctx.tick])

  useEffect(() => {
    ctx.sb.from('return_inspections').select('*').eq('booking_id', b.id)
      .order('inspected_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }: any) => setInspection(data || null))
  }, [ctx.sb, b.id])

  // Status-aware primary action: lifecycle first, then the active Alterations / Dry Cleaning stage for confirmed bookings.
  const primary = useMemo(() => limited ? null : pickPrimary(ctx, b), [limited, ctx.AJ, ctx.CR, ctx.B, b.id, b.status, b.dress_id, b.start_date]) // eslint-disable-line react-hooks/exhaustive-deps
  async function runPrimary() {
    if (!primary || acting) return
    setActing(true)
    try {
      if (primary.kind === 'confirm') await ctx.patch(b, { status: 'confirmed' }, 'Confirmed')
      else if (primary.kind === 'deliver') await ctx.pickup(b)
      else if (primary.kind === 'return') await ctx.ret(b)
      else if (primary.kind === 'alt_dispatch') await dispatchAlteration(ctx, primary.job)
      else if (primary.kind === 'alt_open') ctx.focusWorkflow('alteration', primary.job.id)
      else if (primary.kind === 'clean_dispatch') await dispatchToCleaner(ctx, [primary.req])
      else if (primary.kind === 'clean_open') ctx.focusWorkflow('cleaning', primary.req.id)
    } finally { setActing(false) }
  }
  // Dry cleaning is shown only while the dress is waiting in the queue to be sent. Once it is back in the shop nothing is shown.
  const wf = [primary?.current, primary?.secondary, primary?.view].filter((w: any) => w && w.module === 'cleaning' && w.status === 'to_be_sent') as any[]
  // Preparation status is read from the Alterations module (this booking's own alteration job); it is never typed in.
  const bookingAlts = (ctx.AJ || []).filter((a: any) => a.booking_id === b.id && a.source !== 'damage' && a.status !== 'cancelled').slice().sort((x: any, y: any) => String(y.created_at || '').localeCompare(String(x.created_at || '')))
  const prepJob = bookingAlts.find((a: any) => a.status !== 'ready') || bookingAlts[0]
  const prepInfo = prepJob ? altStatus(prepJob) : { label: 'No alterations', hint: '', tone: 'off' as const }
  const altHistory = (ctx.AJ || []).filter((a: any) => a.dress_id === b.dress_id).slice().sort((x: any, y: any) => String(y.created_at || '').localeCompare(String(x.created_at || '')))

  const MODES: [string, string][] = [['', 'Not decided'], ['pickup', 'Customer collects from store'], ['courier', 'We deliver it']]
  const editDelivery = async () => {
    const v = await ctx.ask(`Delivery details: ${b.id}`, [
      { name: 'm', label: 'How will the dress reach the customer?', options: MODES.map(x => x[1]), value: (MODES.find(x => x[0] === (b.delivery_mode || '')) || MODES[0])[1] },
      { name: 's', label: 'Time slot', value: b.delivery_slot || '' }, { name: 'w', label: 'Taken by (staff or courier)', value: b.delivery_assignee || '' }, { name: 'a', label: 'Delivery address (only if we deliver)', value: b.delivery_address || '' }], { ok: 'Save details' }); if (!v) return
    const { error } = await ctx.sb.rpc('set_delivery_details', { p_id: b.id, p_mode: (MODES.find(x => x[1] === v.m) || MODES[0])[0], p_address: v.a || '', p_slot: v.s || '', p_assignee: v.w || '' })
    ctx.say(error ? 'Could not save the delivery details. Run migration-v17.' : 'Delivery details saved'); ctx.load()
  }
  async function saveNotes() {
    const { error } = await ctx.sb.rpc('set_alteration_notes', { p_id: b.id, p_notes: txt })
    if (error) return ctx.say('Could not save the alteration notes.')
    setSaved({ notes: txt.trim() || null, by: ctx.name, at: new Date().toISOString() })
    setEdit(false); ctx.say('Alteration notes saved'); ctx.load()
  }

  const who = (id?: string | null, ts?: string | null) => id
    ? `${ctx.staffName(id)}${ts ? ' · ' + dmy(istDate(ts)) : ''}`
    : '—'
  const handled = [
    ['Booking taken by', b.taken_by ? who(b.taken_by, b.created_at) : b.log?.[0]?.m === 'Requested online' ? 'Online (customer)' : '—'],
    ['Prepared by', who(b.prepared_by, b.prepared_at)],
    ['Delivered by', who(b.delivered_by, b.picked_up_at)],
    ['Return processed by', who(b.returned_by, b.returned_at)],
  ] as [string, string][]

  return <div className="bd-backdrop" onClick={onClose}>
    <section className="bd-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bd-title">
      <header className="bd-header">
        <div className="bd-header-title"><Ic n="calcheck" s={28} />
          <h2 id="bd-title">Booking {b.id}</h2>
          <span className="bd-status" style={{ '--status-color': ctx.COL?.[visualState] || 'var(--wine)' } as any}>
            <i />{overdue ? 'Overdue' : STATUS[b.status] || b.status}
          </span>
        </div>
        <div className="bd-header-end">
          {primary && primary.kind !== 'none' && <button type="button" className="bd-primary" onClick={runPrimary} disabled={acting} aria-label={primary.label}><Ic n={primary.icon} s={18} /><span>{primary.label}</span></button>}
          {primary && primary.kind === 'none' && <>
            <span className={'bd-state ' + (primary.state || '')}><Ic n={primary.icon} s={15} />{primary.label}</span>
            {primary.view && <button type="button" className="bd-primary" onClick={() => ctx.focusWorkflow(primary.view!.module, primary.view!.id)}><Ic n="search" s={18} /><span>{primary.view.repair ? 'View repair' : primary.view.module === 'cleaning' ? 'View cleaning' : 'View alteration'}</span></button>}
          </>}
          <button className="bd-close" type="button" onClick={onClose} aria-label="Close booking details">×</button>
        </div>
      </header>

      <div className="bd-scroll">
        <section className="bd-identity" aria-label="Booking identity">
          {img ? <a className="bd-dress-image" href={img} target="_blank" rel="noopener noreferrer" title="Open dress image">
            <img src={img} alt={b.dress_name || 'Dress'} />
          </a> : <div className="bd-dress-image bd-image-empty"><Ic n="dress" s={34} /></div>}
          <div className="bd-dress-info">
            <span className="bd-code">{b.dress_code || dress?.code || 'Dress'}</span>
            <h3>{b.dress_name || dress?.name || 'Dress details'}</h3>
            <span className="bd-category">{dress?.category || b.dress_category || 'Rental item'}</span>
          </div>
          <div className={'bd-identity-meta' + (limited ? ' limited' : '')}>
            <div><Ic n="user" s={21} /><span>Customer</span><b>{b.customer_name || '—'}</b></div>
            {!limited && <div><Ic n="phone" s={21} /><span>Phone</span><b>{b.phone ? <a href={'tel:' + b.phone}>{b.phone}</a> : '—'}</b></div>}
            <div><Ic n="calendar" s={21} /><span>Booked On</span><b>{bookingDate || '—'}</b></div>
          </div>
        </section>

        <section className={'bd-glance' + (limited ? ' bd-glance-limited' : '')} aria-label="Booking at a glance">
          <div><Ic n="user" s={28} /><span>Customer</span><b>{b.customer_name || '—'}</b></div>
          <div><Ic n="truck" s={28} /><span>Delivery Date</span><b>{dmy(b.start_date)}</b></div>
          <div><Ic n="calcheck" s={28} /><span>Return Date</span><b>{dmy(b.end_date)}</b></div>
          {!limited && <div className={'bd-glance-payment' + (finance.due > 0 ? ' due' : '')}>
            <Ic n="coins" s={29} /><span>Payment Status</span><b>{paymentLabel}</b>
          </div>}
        </section>

        <div className="bd-columns">
          <div className="bd-col">
          <section className="bd-card bd-operations">
            <h3 className="bd-section-title"><Ic n="receipt" s={23} />Booking &amp; Operations</h3>
            <div className="bd-period">
              <div><Ic n="calendar" s={19} /><span>Rental Period</span><b>{dmy(b.start_date)} – {dmy(b.end_date)}</b><em>{nDays(b.start_date, b.end_date)} Days</em></div>
              {bookingDate && <div><Ic n="calcheck" s={19} /><span>Booking Date</span><b>{bookingDate}</b></div>}
              {b.event_date && <div><Ic n="gift" s={19} /><span>Event</span><b>{b.event_type ? `${b.event_type} · ` : ''}{dmy(b.event_date)}</b></div>}
            </div>

            <div className="bd-prep-row">
              <Ic n="tag" s={20} /><b>Preparation Status</b>
              <div className="bd-prep-val">
                {prepJob
                  ? <button type="button" className={'bd-wf-chip bd-prep-' + prepInfo.tone} onClick={() => ctx.focusWorkflow('alteration', prepJob.id)} title="Open this alteration">{prepInfo.label}</button>
                  : <span className="bd-prep-value">{prepInfo.label}</span>}
                {prepInfo.hint && <small>{prepInfo.hint}</small>}
              </div>
            </div>

            {(() => { const rd = bookingReadiness(ctx, b); return rd.applicable ? <div className="bd-prep-row"><Ic n="checkc" s={20} /><b>Ready to deliver?</b><div className="bd-prep-val">{rd.ready ? <span className="bd-prep-value">Yes. Nothing is holding this dress back.</span> : rd.reasons.map(r => r.module ? <button key={r.code + r.id} type="button" className="bd-wf-chip" onClick={() => ctx.focusWorkflow(r.module, r.id)} title="Open this record">{r.label}</button> : <span key={r.code} className="bd-prep-value">{r.label}</span>)}</div></div> : null })()}
            <div className="bd-prep-row"><Ic n="pin" s={20} /><b>Delivery</b><div className="bd-prep-val"><span className="bd-prep-value">{[b.delivery_mode === 'pickup' ? 'Customer collects' : b.delivery_mode === 'courier' ? 'We deliver' : '', b.delivery_slot, b.delivery_assignee ? `Taken by ${b.delivery_assignee}` : '', b.delivery_address].filter(Boolean).join(' · ') || 'No delivery details added'}</span>{['pending', 'confirmed', 'out'].includes(b.status) && <button className="btn alt sm" type="button" onClick={editDelivery}><Ic n="pencil" s={15} />Edit</button>}</div></div>

            {wf.length > 0 && <div className="bd-wf"><b>Dry cleaning</b><div>{wf.map(w => <button key={w.id} type="button" className="bd-wf-chip" onClick={() => ctx.focusWorkflow(w.module, w.id)} title="Open this record">In queue to be sent</button>)}</div></div>}

            <div className="bd-notes">
              <div className="bd-subhead"><h4><Ic n="scissors" s={19} />Alteration Notes</h4>
                <span className="bd-subhead-actions"><button className="btn alt sm bd-hist-btn" type="button" aria-expanded={histOpen} aria-controls="bd-alt-history" onClick={() => setHistOpen(o => !o)}><Ic n="menu" s={15} />View all requests{altHistory.length ? ` (${altHistory.length})` : ''}</button>
                {b.status !== 'cancelled' && !edit && <button className="btn alt sm" type="button" onClick={() => { setTxt(notes || ''); setEdit(true) }}><Ic n="pencil" s={15} />{notes ? 'Edit' : 'Add notes'}</button>}</span>
              </div>
              {histOpen && <div id="bd-alt-history" className="bd-alt-history" role="region" aria-label="All alteration requests for this dress">
                {altHistory.length === 0 ? <p className="bd-note-empty">No alteration requests for this dress yet.</p> : altHistory.map((a: any) => <article key={a.id} className={'bd-alt-item' + (a.status === 'cancelled' ? ' cancelled' : '')}>
                  <div className="bd-alt-top"><span className={'bd-alt-stage st-' + a.status}>{altStatus(a).label}</span>{a.source === 'damage' && <span className="bd-alt-damage">Damage / Repair</span>}<time>{a.created_at ? dmy(istDate(a.created_at)) : '—'}</time></div>
                  <div className="bd-alt-body"><span>{a.booking_id ? <>Booking <b>{a.booking_id}</b>{a.booking_id === b.id ? ' (this booking)' : ''}</> : 'No booking linked'}</span><p>{summarise(a) || '—'}</p></div>
                </article>)}
              </div>}
              {edit ? <><textarea rows={3} value={txt} onChange={e => setTxt(e.target.value)} placeholder="e.g. Shorten sleeves, tighten waist, blouse measurements…" />
                <div className="bd-edit-actions"><button className="btn sm" type="button" onClick={saveNotes}>Save notes</button><button className="btn alt sm" type="button" onClick={() => setEdit(false)}>Cancel</button></div></>
                : <div className={notes ? 'bd-note-text' : 'bd-note-empty'}>{notes || 'No alteration notes added.'}</div>}
              {at && <small className="bd-updated">Updated {dmy(istDate(at))} {istTime(at)}{by ? ` · ${by}` : ''}</small>}
            </div>

            {!limited && <div className="bd-handled">
              <h4><Ic n="users" s={20} />Handled By</h4>
              <div>{handled.map(([label, value]) => <div className="bd-handled-row" key={label}><span>{label}</span><b className={value === '—' ? 'empty' : ''}>{value}</b></div>)}</div>
            </div>}
          </section>
            {!limited && <>
          {!!b.log?.length && <details className="bd-card bd-history"><summary>Booking History</summary>
            {b.log.slice().reverse().map((l: any, i: number) => <div key={i}>{new Date(l.t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {l.m}{l.by ? ` · ${l.by}` : ''}</div>)}</details>}
          {(b.return_notes || inspection) && <section className="bd-card bd-extra-card"><h3><Ic n="ret" s={19} />Return Condition</h3>
            {b.return_notes && <p className="bd-return-note">{b.return_notes}</p>}
            {inspection && <><div className="bd-inspection-condition"><span>Inspection</span><b>{({ good: 'Good', minor_marks: 'Minor Marks', needs_cleaning: 'Needs Cleaning', damage_repair: 'Damage / Repair Required' } as any)[inspection.condition] || inspection.condition}</b></div>
              {inspection.notes && <p className="bd-return-note">{inspection.notes}</p>}
              {inspection.photos?.length > 0 && <div className="inspection-photos">{inspection.photos.map((src: string, i: number) => <a key={i} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Return condition ${i + 1}`} loading="lazy" /></a>)}</div>}
              <small className="mut">Inspected {istTime(inspection.inspected_at)}</small></>}
          </section>}
            </>}
          </div>
          <div className="bd-col">
          {!limited && <section className="bd-financial" aria-label="Financial information">
            <PaymentSummary b={b} payments={pays} />
            <details className="bd-card bd-history bd-payrec" onToggle={e => setPayOpen((e.currentTarget as HTMLDetailsElement).open)}>
              <summary>Payment Record<small>Booking {b.id}</small></summary>
              {payOpen && <><PaymentRecordInline ctx={ctx} b={b} /><p className="bd-payrec-note">Payment transactions for this booking. Refunds and charges appear in the same list.</p></>}
            </details>
          </section>}
            {!limited && <>
          {(() => { const ap = (ctx.APPR || []).filter((a: any) => a.booking_id === b.id); if (!ap.length) return null
            return <section className="bd-card bd-extra-card"><h3><Ic n="bell" s={19} />Shortfall Approvals</h3>{ap.map((a: any) => <div key={a.id} className="bd-approval-row"><b className={'bd-approval-status ' + a.status}>{a.status.toUpperCase()}</b><span>Short by {inr(a.shortfall)} · asked by {ctx.staffName(a.requested_by) || 'staff'}{a.reason ? ` · “${a.reason}”` : ''}{a.decided_at ? ` · decided by ${ctx.staffName(a.decided_by) || 'owner'}${a.decision_note ? ` (${a.decision_note})` : ''}` : ''}</span></div>)}</section>
          })()}
            </>}
          </div>
        </div>

      </div>

      <footer className="bd-actionbar">
        {!limited ? <div className="bd-actions" aria-label="Booking actions">{ctx.selSecondary(b)}</div>
          : <span className="mut">Booking operations are managed by sales staff.</span>}
        {!limited && ['pending', 'confirmed'].includes(b.status) && <button type="button" className="bd-cancel-link" onClick={() => ctx.cancelBooking(b)}>Cancel booking…</button>}
        <button type="button" className="bd-footer-close" onClick={onClose}>Close</button>
      </footer>
    </section>
  </div>
}
