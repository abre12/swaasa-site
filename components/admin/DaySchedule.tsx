'use client'
import { inr } from '@/lib/util'

// The schedule popup for one day (opened from "View Schedule" in the notifications and from the calendar). Moved out of AdminApp.tsx (N-17).
type Props = { day: string; onClose: () => void; live: any[]; DC: any[]; K: any[]; dcEnd: (c: any) => string; dmap: Record<string, any>; thumb: (d: any, w: number, h: number) => React.ReactNode; COL: Record<string, string>; state: (b: any) => string; openBooking: (id: string) => void; go: (tab: string) => void }

export default function DaySchedule({ day, onClose, live, DC, K, dcEnd, dmap, thumb, COL, state, openBooking, go }: Props) {
      // Group the day by what actually happens on it, so the list matches the counts in the notification (e.g. "1 delivery, 2 returns").
      // Bookings that merely overlap the date (still with a customer, or already returned early) go in a collapsed "also" section.
      const on = live.filter(b => day >= b.start_date && day <= b.end_date), away = DC.filter(c => day >= c.sent_on && day <= dcEnd(c)), blk = K.filter(k => day >= k.start_date && day <= k.end_date)
      const dels = on.filter(b => b.start_date === day), rets = on.filter(b => b.end_date === day && b.start_date !== day), rest = on.filter(b => b.start_date !== day && b.end_date !== day)
      const pill = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
      const card = (b: any, what: string) => <div key={b.id} className="box" onClick={() => openBooking(b.id)} style={{ display: 'flex', gap: 12, cursor: 'pointer' }}>{thumb(dmap[b.dress_id], 72, 96)}<div style={{ flex: 1, minWidth: 0 }}><div className="row"><b>{b.dress_code} · {b.dress_name}</b><span style={{ color: COL[state(b)] }}>{state(b)}</span></div>
        <div>{what} · {b.customer_name} · <a href={'tel:' + b.phone} onClick={e => e.stopPropagation()}>{b.phone}</a></div>
        <div className="mut">{b.start_date} → {b.end_date} · Balance {inr(b.rent + b.charges - b.paid)} · ID {b.id}</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 4 }}>{b.alteration_notes ? <>✂ {b.alteration_notes}</> : <span className="mut">No alteration notes</span>}</div></div></div>
      const head = (t: string) => <h4 style={{ margin: '14px 0 6px' }}>{t}</h4>
      return (<div onClick={() => onClose()} style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }}>
        <div className="box" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', maxWidth: 580, width: '100%' }}>
          <div className="row"><h3>{new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button className="btn alt sm" onClick={() => onClose()}>Close</button></div>
          {(dels.length > 0 || rets.length > 0) && <p className="mut" style={{ margin: '2px 0 0' }}>{[dels.length && pill(dels.length, 'delivery', 'deliveries'), rets.length && pill(rets.length, 'return due', 'returns due')].filter(Boolean).join(' · ')}</p>}
          {!on.length && !away.length && !blk.length && <p className="mut">No bookings on this day.</p>}
          {dels.length > 0 && <>{head(`Deliveries (${dels.length})`)}{dels.map(b => card(b, 'Delivery'))}</>}
          {rets.length > 0 && <>{head(`Returns due (${rets.length})`)}{rets.map(b => card(b, 'Return due'))}</>}
          {rest.length > 0 && <details style={{ marginTop: 14 }}><summary className="mut" style={{ cursor: 'pointer' }}>Also booked on this date, no action needed ({rest.length})</summary>{rest.map(b => card(b, b.status === 'out' ? 'With customer' : state(b) === 'returned' ? 'Already returned' : 'Booked'))}</details>}
          {away.length > 0 && <>{head('At the dry cleaner')}{away.map(c => <div key={c.id} className="box" style={{ display: 'flex', gap: 12, cursor: 'pointer' }} onClick={() => go('drycleaning')}>{thumb(dmap[c.dress_id], 48, 64)}<div>Out for dry cleaning: <b>{dmap[c.dress_id]?.code} · {dmap[c.dress_id]?.name}</b><div className="mut">Sent {c.sent_on}{c.returned_on ? `, back ${c.returned_on}` : `, expected back ${c.expected_back}`}</div></div></div>)}</>}
          {blk.length > 0 && <>{head('Blocked')}{blk.map(k => <div key={k.id} className="box" style={{ display: 'flex', gap: 12 }}>{thumb(dmap[k.dress_id], 48, 64)}<div>Blocked: <b>{dmap[k.dress_id]?.code} · {dmap[k.dress_id]?.name}</b> · {k.reason || 'no reason given'} ({k.start_date} → {k.end_date})</div></div>)}</>}
        </div></div>)
}
