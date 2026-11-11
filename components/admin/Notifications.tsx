'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dmy, istDate, istTime, todayIST } from '@/lib/util'
import { computeAlerts, type Alert, type Level } from '@/lib/alerts'
import { ago, approvalDetail, approvalIcon, approvalName, approvalReason, approvalTitle, needsConfirm } from '@/lib/approvals'
import { Ic } from './icons'

// The notification bell.
//  Owner: Pending Approvals (decide right here), Action Center (operational alerts), Recent (decisions).
//  Staff: Action Center and My Requests (the status of what they asked the owner to approve).
// Operational alerts come live from lib/alerts.ts; approvals come from the approvals table, whose rules (who may decide, one pending request
// per action, decisions frozen once made, payments never editable) are enforced in the database.

const GROUPS: { level: Exclude<Level, 'summary'>; title: string; icon: string; open: number }[] = [
  { level: 'risk', title: 'Delivery at Risk', icon: 'warn', open: 3 },
  { level: 'critical', title: 'Critical', icon: 'warn', open: 2 },
  { level: 'high', title: 'High Priority', icon: 'clock', open: 2 },
]
const hourIST = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })) % 24
type Tab = 'approvals' | 'alerts' | 'recent' | 'mine'

export default function Notifications({ ctx, placement }: { ctx: any; placement?: 'side' }) {
  const [open, setOpen] = useState(false), [now, setNow] = useState(0), [tab, setTab] = useState<Tab>('alerts'), [folded, setFolded] = useState<Record<string, boolean>>({})
  const [read, setRead] = useState<Record<string, number>>({}), ref = useRef<HTMLDivElement>(null)
  const [rejecting, setRejecting] = useState<string | null>(null), [confirming, setConfirming] = useState<string | null>(null), [reason, setReason] = useState(''), [busy, setBusy] = useState<string | null>(null)
  const storeKey = `swaasa.actioncenter.read.${ctx.name || 'staff'}`

  // Read marks belong to the PERSON, not the browser: they are kept in the database (alert_reads) and the browser keeps a copy so the bell
  // is right instantly. If the table is not there yet (migration-v21 not run) it quietly falls back to this browser only.
  const uid = useRef<string | null>(null)
  useEffect(() => {
    let local: Record<string, number> = {}; try { local = JSON.parse(localStorage.getItem(storeKey) || '{}') } catch { local = {} }
    setRead(local)
    ;(async () => {
      uid.current = (await ctx.sb.auth.getUser()).data.user?.id || null
      const { data, error } = await ctx.sb.from('alert_reads').select('alert_key,rank')
      if (!error && data) { const merged = { ...local }; for (const r of data) merged[r.alert_key] = Math.max(merged[r.alert_key] || 0, r.rank); setRead(merged) }
      ctx.sb.from('alert_reads').delete().lt('updated_at', new Date(Date.now() - 30 * 864e5).toISOString()).then(() => {})   // tidy: marks for alerts long gone
    })()
  }, [storeKey, ctx.sb])
  useEffect(() => { const t = setInterval(() => setNow(n => n + 1), 60000); return () => clearInterval(t) }, [])   // keeps "5 minutes ago", the 5 PM summary and the date current
  useEffect(() => {
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', click); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key) }
  }, [])

  // ---- operational alerts ----
  const { alerts, summary } = useMemo(() => computeAlerts({ B: ctx.B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC }, todayIST(), hourIST()), [ctx.B, ctx.D, ctx.AJ, ctx.CR, ctx.DC, now])   // eslint-disable-line react-hooks/exhaustive-deps
  const isRead = (a: Alert) => (read[a.key] || 0) >= a.rank     // an alert that becomes more urgent shows as unread again
  const unreadAlerts = alerts.filter(a => !isRead(a)).length

  // ---- approvals ----
  const owner = !!ctx.owner, canAsk = !!ctx.ops && !owner
  const all: any[] = ctx.APPR || []
  const pending = all.filter(a => a.status === 'pending')
  const decided = all.filter(a => a.status !== 'pending').sort((a, b) => String(b.decided_at || '').localeCompare(String(a.decided_at || ''))).slice(0, 15)
  const mine = [...all].sort((a, b) => String(b.requested_at || '').localeCompare(String(a.requested_at || ''))).slice(0, 15)
  const badge = (owner ? pending.length : 0) + unreadAlerts
  const tabs: { id: Tab; label: string; n?: number }[] = owner
    ? [{ id: 'approvals', label: 'Pending Approvals', n: pending.length }, { id: 'alerts', label: 'Action Center', n: alerts.length }, { id: 'recent', label: 'Recent' }]
    : canAsk ? [{ id: 'alerts', label: 'Action Center', n: alerts.length }, { id: 'mine', label: 'My Requests', n: pending.length || undefined }] : []
  const total = alerts.length

  function toggleOpen() {
    if (!open) { setTab(owner ? (pending.length > 0 || total === 0 ? 'approvals' : 'alerts') : 'alerts'); setRejecting(null); setConfirming(null); setReason('') }
    setOpen(!open)
  }
  function save(next: Record<string, number>) {
    const changed = Object.entries(next).filter(([k, v]) => read[k] !== v).map(([alert_key, rank]) => ({ user_id: uid.current, alert_key, rank, updated_at: new Date().toISOString() }))
    setRead(next); try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch { /* private mode: marks last for this visit only */ }
    if (changed.length && uid.current) ctx.sb.from('alert_reads').upsert(changed, { onConflict: 'user_id,alert_key' }).then(() => {})
  }
  const markRead = (a: Alert) => { if (!isRead(a)) save({ ...read, [a.key]: a.rank }) }
  const markAll = () => { const next: Record<string, number> = {}; for (const a of alerts) next[a.key] = a.rank; save(next) }
  function run(a: Alert) {
    markRead(a); setOpen(false)
    if (a.action.kind === 'booking' && a.action.bookingId) ctx.openBooking(a.action.bookingId)
    else if (a.action.kind === 'workflow' && a.action.id) ctx.focusWorkflow(a.action.module, a.action.id)
  }
  const isOpen = (level: string, n: number, def: number) => folded[level] === undefined ? n <= def : !folded[level]
  const toggle = (level: string, n: number, def: number) => setFolded({ ...folded, [level]: isOpen(level, n, def) })
  const breakdown = (list: Alert[]) => { const c = new Map<string, number>(); for (const a of list) c.set(a.short, (c.get(a.short) || 0) + 1); return Array.from(c).map(([k, v]) => `${v} ${k}`).join(' · ') }

  async function decide(a: any, yes: boolean, note = '') {
    setBusy(a.id)
    await ctx.decideApproval(a, yes, note)
    setBusy(null); setRejecting(null); setConfirming(null); setReason('')
  }
  const bookingOf = (id: string) => (ctx.B || []).find((b: any) => b.id === id)
  const refOf = (a: any) => { const b = bookingOf(a.booking_id); return `${a.booking_id}${b?.customer_name ? ' · ' + b.customer_name : ''}` }
  const whoAsked = (a: any) => a.requested_by_name || ctx.staffName?.(a.requested_by) || 'Staff'
  const whoDecided = (a: any) => a.decided_by_name || ctx.staffName?.(a.decided_by) || 'Owner'
  const when = (iso?: string) => iso ? `${dmy(istDate(iso))}, ${istTime(iso)}` : ''
  const clock = now >= 0 ? Date.now() : 0

  const sub = tab === 'approvals' ? (pending.length ? `${pending.length} pending approval${pending.length === 1 ? '' : 's'}` : 'No pending approvals')
    : tab === 'recent' ? 'Recent decisions' : tab === 'mine' ? 'Requests you sent to the owner'
    : total ? `${total} item${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} your attention` : 'Nothing needs your attention'

  const Status = ({ s }: { s: string }) => <span className={'ap-st ' + s}>{s === 'approved' ? 'Approved' : s === 'rejected' ? 'Rejected' : 'Pending'}</span>
  const HistoryRow = ({ a, mineView }: { a: any; mineView?: boolean }) => <article className="ap-row">
    <span className={'ap-ic sm t-' + a.action_type}><Ic n={approvalIcon(a.action_type)} s={18} /></span>
    <div className="ap-main"><b>{approvalName(a.action_type)} · {refOf(a)}</b>
      <small>{approvalDetail(a, ctx.B)}</small>
      <small className="ap-meta">{mineView ? (a.status === 'pending' ? `Sent ${ago(a.requested_at, clock)}, waiting for the owner` : `${a.status === 'approved' ? 'Approved' : 'Rejected'} by ${whoDecided(a)} · ${when(a.decided_at)}`) : `Requested by ${whoAsked(a)} · ${a.status === 'approved' ? 'Approved' : 'Rejected'} by ${whoDecided(a)} · ${when(a.decided_at)}`}</small>
      {a.status === 'rejected' && a.decision_note && <small className="ap-reason">Reason: {a.decision_note}</small>}</div>
    <Status s={a.status} />
  </article>

  return <div className={'notif-wrap' + (placement === 'side' ? ' side' : '')} ref={ref}>
    <button className="notif-bell" aria-haspopup="dialog" aria-expanded={open} aria-label={`Notifications${badge ? `, ${badge} need attention` : ''}`} onClick={toggleOpen}><Ic n="bell" s={20} />{badge > 0 && <span>{badge > 99 ? '99+' : badge}</span>}</button>
    {open && <section className="notif-pop ac-pop" role="dialog" aria-label="Notifications">
      <header><div><b>Notifications</b><small>{sub}</small></div>
        <div className="ac-hd">{tab === 'alerts' && unreadAlerts > 0 && <button type="button" className="ac-link" onClick={markAll}>Mark all as read</button>}<button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}>×</button></div></header>
      {tabs.length > 0 && <div className="ac-tabs" role="tablist">{tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.n ? <i>{t.n}</i> : null}</button>)}</div>}
      <div className="ac-body">

        {tab === 'approvals' && owner && <>
          {!pending.length && <div className="ac-clear"><Ic n="checkc" s={32} /><b>No pending approvals</b><p>You’re all caught up. No actions require your approval right now.</p></div>}
          {pending.map(a => { const r = approvalReason(a), isBusy = busy === a.id
            return <article key={a.id} className="ap-card">
              <span className={'ap-ic t-' + a.action_type}><Ic n={approvalIcon(a.action_type)} s={22} /></span>
              <div className="ap-main">
                <b className="ap-title">{approvalTitle(a.action_type)}</b>
                <button type="button" className="ap-ref" onClick={() => { setOpen(false); ctx.openBooking(a.booking_id) }} title="Open this booking">{refOf(a)}</button>
                <p>{approvalDetail(a, ctx.B)}</p>
                {r && <small className="ap-reason">“{r}”</small>}
                <small className="ap-meta">Requested by: {whoAsked(a)} · {ago(a.requested_at, clock)}</small>
              </div>
              <div className="ap-act">
                {rejecting === a.id ? <div className="ap-inline">
                  <input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for the team (optional)" aria-label="Reason for rejecting" onKeyDown={e => { if (e.key === 'Enter') decide(a, false, reason) }} />
                  <div><button type="button" className="ap-rej" disabled={isBusy} onClick={() => decide(a, false, reason)}>Confirm reject</button><button type="button" className="ap-back" onClick={() => setRejecting(null)}>Back</button></div></div>
                : confirming === a.id ? <div className="ap-inline">
                  <span className="ap-ask">{a.action_type === 'booking_cancellation' ? 'Cancel this booking and record the refunds?' : 'Record this refund?'}</span>
                  <div><button type="button" className="ap-ok" disabled={isBusy} onClick={() => decide(a, true)}>{isBusy ? 'Saving…' : 'Confirm approve'}</button><button type="button" className="ap-back" onClick={() => setConfirming(null)}>Back</button></div></div>
                : <><button type="button" className="ap-rej" disabled={isBusy} onClick={() => { setRejecting(a.id); setConfirming(null); setReason('') }}>Reject</button>
                  <button type="button" className="ap-ok" disabled={isBusy} onClick={() => needsConfirm(a.action_type) ? setConfirming(a.id) : decide(a, true)}>{isBusy ? 'Saving…' : 'Approve'}</button></>}
              </div>
            </article> })}
        </>}

        {tab === 'recent' && owner && <>
          {!decided.length && <div className="ac-clear mute"><Ic n="clock" s={30} /><b>Nothing decided yet</b><p>Approved and rejected requests will show here.</p></div>}
          {decided.length > 0 && <div className="ap-list">{decided.map(a => <HistoryRow key={a.id} a={a} />)}</div>}
        </>}

        {tab === 'mine' && canAsk && <>
          {!mine.length && <div className="ac-clear mute"><Ic n="clock" s={30} /><b>No requests yet</b><p>Discounts, refunds and cancellations you send to the owner will show here with their status.</p></div>}
          {mine.length > 0 && <div className="ap-list">{mine.map(a => <HistoryRow key={a.id} a={a} mineView />)}</div>}
        </>}

        {tab === 'alerts' && <>
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
            <div className="ac-main"><span className="ac-tag">TOMORROW</span>
              <b>{summary.total ? `${summary.total} deliver${summary.total === 1 ? 'y' : 'ies'} scheduled for ${dmy(summary.date)}` : `No deliveries scheduled for ${dmy(summary.date)}`}</b>
              {summary.total > 0 && (summary.ready === summary.total ? <p>All scheduled and ready for tomorrow.</p> : <ul>
                {summary.ready > 0 && <li className="ok">{summary.ready} ready for delivery</li>}
                {summary.alteration > 0 && <li className="warn">{summary.alteration} requires alteration</li>}
                {summary.prep > 0 && <li className="warn">{summary.prep} requires preparation</li>}
                {summary.notBack > 0 && <li className="warn">{summary.notBack} not yet returned by the previous customer</li>}</ul>)}
              {summary.returns > 0 && <p>{summary.returns} return{summary.returns === 1 ? '' : 's'} due tomorrow.</p>}</div>
            <button type="button" className="ac-act" onClick={() => { setOpen(false); ctx.showDay(summary.date) }}>{summary.ready === summary.total ? 'View Schedule' : "View Tomorrow's Schedule"}</button>
          </div></section>}
        </>}
      </div>
    </section>}
  </div>
}
