'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dmy, todayIST } from '@/lib/util'
import { computeAlerts, type Alert, type Level } from '@/lib/alerts'
import { Ic } from './icons'

// Action Center: the notification bell. It shows only actionable operational issues (deliveries, returns, alterations, dry cleaning,
// dress readiness), derived live by lib/alerts.ts. Reading an alert never resolves it: it disappears only when the real problem is fixed.

const GROUPS: { level: Exclude<Level, 'summary'>; title: string; icon: string; open: number }[] = [
  { level: 'risk', title: 'Delivery at Risk', icon: 'warn', open: 3 },
  { level: 'critical', title: 'Critical', icon: 'warn', open: 2 },
  { level: 'high', title: 'High Priority', icon: 'clock', open: 2 },
]
const hourIST = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })) % 24

export default function Notifications({ ctx }: { ctx: any }) {
  const [open, setOpen] = useState(false), [now, setNow] = useState(0), [folded, setFolded] = useState<Record<string, boolean>>({})
  const [read, setRead] = useState<Record<string, number>>({}), ref = useRef<HTMLDivElement>(null)
  const storeKey = `swaasa.actioncenter.read.${ctx.name || 'staff'}`

  // read state is per person and per device; it only remembers which alert (and how urgent it was) has been seen
  useEffect(() => { try { setRead(JSON.parse(localStorage.getItem(storeKey) || '{}')) } catch { setRead({}) } }, [storeKey])
  useEffect(() => { const t = setInterval(() => setNow(n => n + 1), 60000); return () => clearInterval(t) }, [])   // lets the 5 PM summary and the date change appear on their own
  useEffect(() => {
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', click); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key) }
  }, [])

  const { alerts, summary } = useMemo(() => computeAlerts({ B: ctx.B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC }, todayIST(), hourIST()), [ctx.B, ctx.D, ctx.AJ, ctx.CR, ctx.DC, now])   // eslint-disable-line react-hooks/exhaustive-deps
  const isRead = (a: Alert) => (read[a.key] || 0) >= a.rank     // an alert that becomes more urgent shows as unread again
  const unread = alerts.filter(a => !isRead(a)).length
  const total = alerts.length

  function save(next: Record<string, number>) { setRead(next); try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch { /* private mode: read marks last for this visit only */ } }
  const markRead = (a: Alert) => { if (!isRead(a)) save({ ...read, [a.key]: a.rank }) }
  const markAll = () => { const next: Record<string, number> = {}; for (const a of alerts) next[a.key] = a.rank; save(next) }   // also drops marks for resolved alerts
  function run(a: Alert) {
    markRead(a); setOpen(false)
    if (a.action.kind === 'booking' && a.action.bookingId) ctx.openBooking(a.action.bookingId)
    else if (a.action.kind === 'workflow' && a.action.id) ctx.focusWorkflow(a.action.module, a.action.id)
  }
  const isOpen = (level: string, n: number, def: number) => folded[level] === undefined ? n <= def : !folded[level]
  const toggle = (level: string, n: number, def: number) => setFolded({ ...folded, [level]: isOpen(level, n, def) })
  const breakdown = (list: Alert[]) => { const c = new Map<string, number>(); for (const a of list) c.set(a.short, (c.get(a.short) || 0) + 1); return [...c].map(([k, v]) => `${v} ${k}`).join(' · ') }
  const pendingApprovals = ctx.owner ? (ctx.APPR || []).filter((a: any) => a.status === 'pending').length : 0

  return <div className="notif-wrap" ref={ref}>
    <button className="notif-bell" aria-haspopup="dialog" aria-expanded={open} aria-label={`Action Center${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen(!open)}><Ic n="bell" s={20} />{unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <section className="notif-pop ac-pop" role="dialog" aria-label="Action Center">
      <header><div><b>Action Center</b><small>{total ? `${total} item${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} your attention` : 'Nothing needs your attention'}</small></div>
        <div className="ac-hd">{unread > 0 && <button type="button" className="ac-link" onClick={markAll}>Mark all as read</button>}<button type="button" aria-label="Close Action Center" onClick={() => setOpen(false)}>×</button></div></header>
      <div className="ac-body">
        {!total && !summary && <div className="ac-clear"><Ic n="checkc" s={32} /><b>All clear</b><p>No deliveries at risk and nothing overdue.</p></div>}
        {GROUPS.map(g => { const list = alerts.filter(a => a.level === g.level); if (!list.length) return null; const expanded = isOpen(g.level, list.length, g.open); const fresh = list.filter(a => !isRead(a)).length
          return <section key={g.level} className={'ac-group lvl-' + g.level}>
            <button type="button" className="ac-ghd" aria-expanded={expanded} onClick={() => toggle(g.level, list.length, g.open)}>
              <span className="ac-gic"><Ic n={g.icon} s={18} /></span>
              <span className="ac-gt"><b>{g.title} ({list.length}){fresh > 0 && <i className="ac-new">{fresh} new</i>}</b><small>{breakdown(list)}</small></span>
              <span className={'ac-chev' + (expanded ? ' up' : '')}><Ic n="down" s={16} /></span>
            </button>
            {expanded && <div className="ac-list">{list.map(a => <article key={a.key} className={'ac-card' + (isRead(a) ? '' : ' unread')} onClick={() => markRead(a)}>
              <div className="ac-main"><span className="ac-tag">{a.tag}</span><b>{a.dress}</b><p>{a.body}</p>
                {a.meta && <small className="ac-meta">{a.meta}</small>}
                {a.more.length > 0 && <small className="ac-more">Also: {a.more.join(', ').toLowerCase()}</small>}</div>
              <button type="button" className="ac-act" onClick={e => { e.stopPropagation(); run(a) }}>{a.action.label}</button>
            </article>)}</div>}
          </section> })}
        {summary && <section className="ac-group lvl-summary"><div className="ac-sum">
          <span className="ac-gic"><Ic n="truck" s={18} /></span>
          <div className="ac-main"><span className="ac-tag">TOMORROW'S DELIVERIES</span>
            <b>{summary.total} deliver{summary.total === 1 ? 'y' : 'ies'} scheduled for {dmy(summary.date)}</b>
            {summary.ready === summary.total ? <p>All scheduled and ready for tomorrow.</p> : <ul>
              {summary.ready > 0 && <li className="ok">{summary.ready} ready for delivery</li>}
              {summary.alteration > 0 && <li className="warn">{summary.alteration} requires alteration</li>}
              {summary.prep > 0 && <li className="warn">{summary.prep} requires preparation</li>}</ul>}</div>
          <button type="button" className="ac-act" onClick={() => { setOpen(false); ctx.showDay(summary.date) }}>{summary.ready === summary.total ? 'View Schedule' : "View Tomorrow's Schedule"}</button>
        </div></section>}
        {pendingApprovals > 0 && <button type="button" className="ac-foot" onClick={() => { setOpen(false); ctx.go('approvals') }}><Ic n="bell" s={16} />{pendingApprovals} approval{pendingApprovals === 1 ? '' : 's'} waiting<span>Open Approvals</span></button>}
      </div>
    </section>}
  </div>
}
