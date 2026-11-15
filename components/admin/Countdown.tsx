'use client'
import { useMemo } from 'react'
import { addD, dmy, todayIST } from '@/lib/util'
import { bookingReadiness } from '@/lib/readiness'
import { prepSteps, STEP_COL } from '@/lib/countdown'

export default function Countdown({ ctx }: { ctx: any }) {
  const today = todayIST()
  const items = useMemo(() => {
    const rctx = { B: ctx.B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC, dmap: ctx.dmap }
    return (ctx.B as any[]).filter(b => ['pending', 'confirmed'].includes(b.status) && b.start_date >= today && b.start_date <= addD(today, 3))
      .map(b => ({ b, n: Math.round((Date.parse(b.start_date) - Date.parse(today)) / 864e5), rd: bookingReadiness(rctx, b), steps: prepSteps(rctx, b) }))
      .sort((x, y) => x.n - y.n || String(x.b.delivery_slot || '').localeCompare(String(y.b.delivery_slot || '')))
  }, [ctx.B, ctx.D, ctx.AJ, ctx.CR, ctx.DC, ctx.dmap, today])
  const shown = items.filter(i => i.n >= 1)   // today's deliveries are already in the Today block above
  let last = -1
  if (!shown.length) return null
  const sorted = shown.filter(i => !i.rd.ready).length
  return <details className="fold" aria-label="Delivery countdown">
    <summary>Next 3 days<span className="fold-n">{shown.length}</span><small>{sorted ? `${sorted} still to prepare` : 'all ready'}</small></summary>
    <div className="fold-body">
    {shown.map(({ b, n, rd, steps }) => {
      const head = n !== last; last = n
      const late = !rd.ready && n <= 1
      return <div key={b.id}>
        {head && <h4 style={{ margin: '10px 0 4px', fontSize: 13 }}>{n === 1 ? 'Tomorrow' : dmy(b.start_date)} <span className="mut">· D-{n}</span></h4>}
        <div className="cd-row" onClick={() => ctx.openBooking(b.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderTop: '1px solid #f1e8ea', cursor: 'pointer' }}>
          {ctx.thumb(ctx.dmap[b.dress_id], 40, 54)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="cd-d" style={{ fontWeight: 700, color: late ? '#b3261e' : 'var(--wine)' }}>D-{n}</span>
              <b>{b.dress_code} · {b.dress_name}</b><span className="mut">{b.customer_name}</span>
              {b.delivery_slot && <span className="mut">· {b.delivery_slot}</span>}
              {b.event_date && <span className="ac-event" style={{ margin: 0 }}>{b.event_type || 'Event'} {dmy(b.event_date)}</span>}</div>
            <div className="cd-steps" style={{ display: 'flex', gap: 4, marginTop: 5 }} aria-label="Preparation progress">
              {steps.map(s => <span key={s.label} title={`${s.label}: ${s.state === 'na' ? 'not needed' : s.state === 'doing' ? 'in progress' : s.state === 'done' ? 'done' : 'not started'}`} style={{ flex: 1, minWidth: 0 }}>
                <i style={{ display: 'block', height: 5, borderRadius: 3, background: STEP_COL[s.state] }} />
                <small style={{ fontSize: 10.5, color: s.state === 'na' ? '#b5a9ad' : 'var(--mut)' }}>{s.label}</small></span>)}</div>
            {(ctx.NOTES || []).filter((x: any) => x.booking_id === b.id && !x.done_at).map((x: any) => <div key={x.id} style={{ fontSize: 12.5, marginTop: 2 }}>📝 {x.note}</div>)}
            <div style={{ fontSize: 12.5, color: rd.ready ? '#2f7d4f' : late ? '#b3261e' : '#8a6414', marginTop: 2 }}>{rd.ready ? 'Ready to deliver' : rd.reasons.map(r => r.label).join(' · ')}</div></div>
        </div></div>
    })}
    </div></details>
}
