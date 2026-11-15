'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addD, dmy, todayIST } from '@/lib/util'
import { bookingReadiness } from '@/lib/readiness'
import { useDialogFocus } from './useDialogFocus'

// N-10: end-of-day close. Cash tallied, tomorrow's dresses checked, overdue returns called. The result goes to the owner.
export default function CloseDay({ ctx }: { ctx: any }) {
  const today = todayIST(), [open, setOpen] = useState(false), [tally, setTally] = useState<any>(undefined), [closed, setClosed] = useState<any>(null)
  const [checked, setChecked] = useState(false), [called, setCalled] = useState<Record<string, boolean>>({}), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, open, () => setOpen(false))

  const loadClosed = async () => { const r = await ctx.sb.from('day_closes').select('*').eq('day', today).maybeSingle(); setClosed(r.data || null) }
  useEffect(() => { loadClosed() }, [today, ctx.fullTick])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) return; ctx.sb.from('cash_tally').select('*').eq('day', today).maybeSingle().then((r: any) => setTally(r.data || null)) }, [open, today, ctx.sb])

  const tomorrow = useMemo(() => {
    const rctx = { B: ctx.B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC, dmap: ctx.dmap }
    return (ctx.B as any[]).filter(b => ['pending', 'confirmed'].includes(b.status) && b.start_date === addD(today, 1)).map(b => ({ b, rd: bookingReadiness(rctx, b) }))
  }, [ctx.B, ctx.D, ctx.AJ, ctx.CR, ctx.DC, ctx.dmap, today])
  const overdue = useMemo(() => (ctx.B as any[]).filter(b => b.status === 'out' && b.end_date < today).sort((a, b) => a.end_date.localeCompare(b.end_date)), [ctx.B, today])
  const notReady = tomorrow.filter(t => !t.rd.ready).length, calledN = overdue.filter(b => called[b.id]).length

  async function submit() {
    if (tomorrow.length && !checked) return ctx.say('Please tick that you have checked tomorrow\u2019s dresses.')
    setBusy(true)
    try {
      const r = await fetch('/api/close-day', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day: today, notReady, checked: tomorrow.length ? checked : true, called: calledN, note }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return ctx.say(j.error?.includes('BAD_DATES') ? 'That day can no longer be closed.' : 'Could not close the day. Please try again.')
      ctx.say(j.sent ? 'Day closed. The owner has been told.' : 'Day closed.'); setOpen(false); loadClosed()
    } finally { setBusy(false) }
  }
  return <section className="box" aria-label="End of day" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
    <div style={{ flex: '1 1 220px' }}><b>End of day</b><div className="mut" style={{ fontSize: 13 }}>{closed ? `Closed by ${closed.closed_by_name} at ${new Date(closed.closed_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}` : 'Not closed yet. Check the cash, tomorrow\u2019s dresses and overdue returns, then close.'}</div></div>
    <button type="button" className={'btn sm ' + (closed ? 'alt' : '')} onClick={() => { setChecked(false); setCalled({}); setNote(''); setTally(undefined); setOpen(true) }}>{closed ? 'Update the close' : 'Close the day'}</button>
    <button type="button" className="btn alt sm" onClick={() => ctx.logLostDemand()}>Log a missed enquiry</button>
    {open && <div style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 90, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }} onClick={() => setOpen(false)} data-overlay>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="cd-title" className="box" style={{ background: 'var(--bg)', maxWidth: 560, width: '100%' }} onClick={e => e.stopPropagation()}>
        <h3 id="cd-title">Close the day · {dmy(today)}</h3>
        <h4 style={{ margin: '10px 0 4px' }}>1. Cash</h4>
        {tally === undefined ? <p className="mut">Checking…</p> : tally
          ? <p style={{ color: tally.difference ? '#b3261e' : '#2f7d4f', margin: 0 }}>{tally.difference ? `Tallied, but there is a difference of ₹${tally.difference}.` : 'Tallied. No difference.'}</p>
          : <p style={{ margin: 0, color: '#b3261e' }}>The cash has not been tallied today. <button type="button" className="textlink" onClick={() => { setOpen(false); ctx.go('cash') }}>Open the Cash Counter</button></p>}
        <h4 style={{ margin: '12px 0 4px' }}>2. Tomorrow&rsquo;s deliveries ({tomorrow.length})</h4>
        {!tomorrow.length && <p className="mut" style={{ margin: 0 }}>None.</p>}
        {tomorrow.map(({ b, rd }) => <div key={b.id} style={{ fontSize: 13, padding: '2px 0', color: rd.ready ? '#2f7d4f' : '#b3261e' }}>{rd.ready ? '✓' : '✗'} {b.dress_code} · {b.customer_name} <span className="mut">{rd.ready ? 'ready' : rd.reasons.map((x: any) => x.label).join(' · ')}</span></div>)}
        {tomorrow.length > 0 && <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 0' }}><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I have checked these dresses{notReady ? ` (${notReady} not ready, the owner will be told)` : ''}</label>}
        <h4 style={{ margin: '12px 0 4px' }}>3. Overdue returns ({overdue.length})</h4>
        {!overdue.length && <p className="mut" style={{ margin: 0 }}>None.</p>}
        {overdue.map(b => <label key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '2px 0' }}><input type="checkbox" checked={!!called[b.id]} onChange={e => setCalled(c => ({ ...c, [b.id]: e.target.checked }))} />
          <span>{b.dress_code} · {b.customer_name} · due {dmy(b.end_date)} · {b.phone ? <a href={'tel:' + b.phone} onClick={e => e.stopPropagation()}>{b.phone}</a> : 'no phone'} <span className="mut">called</span></span></label>)}
        <h4 style={{ margin: '12px 0 4px' }}>Note for the owner (optional)</h4>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500} style={{ width: '100%' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button type="button" className="btn" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Close the day'}</button><button type="button" className="btn alt" onClick={() => setOpen(false)}>Cancel</button></div>
      </div></div>}
  </section>
}
