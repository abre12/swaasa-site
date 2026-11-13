'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dmy, istDate, istTime, todayIST } from '@/lib/util'
import { computeAlerts, type Alert, type Level } from '@/lib/alerts'
import { ago, approvalDetail, approvalIcon, approvalName, approvalReason, approvalRef, approvalTitle, needsConfirm } from '@/lib/approvals'
import { thumbOf, mediumOf } from '@/lib/images'
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
  const { alerts, summary, all: issues } = useMemo(() => computeAlerts({ B: ctx.B, D: ctx.D, AJ: ctx.AJ, CR: ctx.CR, DC: ctx.DC, st: ctx.st }, todayIST(), hourIST()), [ctx.B, ctx.D, ctx.AJ, ctx.CR, ctx.DC, ctx.st, now])   // eslint-disable-line react-hooks/exhaustive-deps
  const isRead = (a: Alert) => (read[a.key] || 0) >= a.rank     // an alert that becomes more urgent shows as unread again
  const unreadAlerts = alerts.filter(a => !isRead(a)).length
  // Critical alerts (Delivery at Risk + Critical) keep their count on the bell until the problem is actually fixed. Reading them does not clear the count.
  // CH-5: the bell counts every ISSUE (a dress with two problems counts twice), and shows critical, approvals and other unread as separate chips.
  const criticalN = issues.filter(a => a.level === 'risk' || a.level === 'critical').length
  // SA-3: information-only notes for the owner (a dress delivered although not ready, a changed late fee). They never block anything.
  const notices: any[] = ctx.owner ? (ctx.NOTICES || []) : []
  const noticeRead = (n: any) => (read['notice:' + n.id] || 0) >= 1
  const unreadNotices = notices.filter(n => !noticeRead(n)).length
  const unreadOther = issues.filter(a => a.level === 'high' && !isRead(a)).length + unreadNotices

  // ---- approvals ----
  const owner = !!ctx.owner, canAsk = !!ctx.ops && !owner
  const all: any[] = ctx.APPR || []
  const pending = all.filter(a => a.status === 'pending')
  const decided = all.filter(a => a.status !== 'pending').sort((a, b) => String(b.decided_at || '').localeCompare(String(a.decided_at || ''))).slice(0, 15)
  const mine = [...all].sort((a, b) => String(b.requested_at || '').localeCompare(String(a.requested_at || ''))).slice(0, 15)
  const approvalsN = owner ? pending.length : 0, badge = criticalN + approvalsN + unreadOther
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
  const markRead = (a: Alert) => { const same = issues.filter(x => x.dressId === a.dressId && !isRead(x)); if (same.length || !isRead(a)) { const next = { ...read, [a.key]: a.rank }; for (const x of same) next[x.key] = x.rank; save(next) } }
  const markAll = () => { const next: Record<string, number> = {}; for (const a of issues) next[a.key] = a.rank; save(next) }
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
  const refOf = (a: any) => approvalRef(a, bookingOf(a.booking_id)?.customer_name)
  const whoAsked = (a: any) => a.requested_by_name || ctx.staffName?.(a.requested_by) || 'Staff'
  const whoDecided = (a: any) => a.decided_by_name || ctx.staffName?.(a.decided_by) || 'Owner'
  const when = (iso?: string) => iso ? `${dmy(istDate(iso))}, ${istTime(iso)}` : ''
  const clock = now >= 0 ? Date.now() : 0
  // Small dress photo with the customer's name and booking number. Click opens the booking (or the workflow when no booking is behind the alert).
  const refBlock = (a: Alert) => {
    const b = a.bookingId ? bookingOf(a.bookingId) : null, d = ctx.dmap?.[a.dressId], src = d ? (thumbOf(d) || mediumOf(d)) : ''
    const go = (e: React.MouseEvent) => { e.stopPropagation(); if (b) { markRead(a); setOpen(false); ctx.openBooking(b.id) } else run(a) }
    return <button type="button" className="ac-ref" onClick={go} title={b ? 'Open this booking' : a.action.label}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <span className="ac-th" />}
      <span><b>{b?.customer_name || d?.code || 'Dress'}</b><small>{b ? `Booking ${b.id}` : a.action.label}</small></span>
    </button>
  }

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
    <button className="notif-bell" aria-haspopup="dialog" aria-expanded={open} aria-label={`Notifications${criticalN ? `, ${criticalN} critical` : ''}${approvalsN ? `, ${approvalsN} approval${approvalsN === 1 ? '' : 's'} waiting` : ''}${unreadOther ? `, ${unreadOther} other unread` : ''}`} onClick={toggleOpen}><Ic n="bell" s={20} />{badge > 0 && <i className="nb-chips">
      {criticalN > 0 && <b className="c" title="Critical issues">{criticalN > 99 ? '99+' : criticalN}</b>}
      {approvalsN > 0 && <b className="a" title="Approvals waiting">{approvalsN}</b>}
      {unreadOther > 0 && <b className="o" title="Other unread">{unreadOther}</b>}</i>}</button>
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
                <button type="button" className="ap-ref" onClick={() => { if (!a.booking_id) return; setOpen(false); ctx.openBooking(a.booking_id) }} title={a.booking_id ? 'Open this booking' : undefined}>{refOf(a)}</button>
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
          {notices.length > 0 && <section className="ac-group lvl-high"><div className="ac-gh" style={{ cursor: 'default' }}><span className="ac-gic"><Ic n="bell" s={16} /></span><b>For your information ({unreadNotices} new)</b>
            {unreadNotices > 0 && <button type="button" className="ac-link" onClick={() => { const next = { ...read }; for (const n of notices) next['notice:' + n.id] = 1; save(next) }}>Got it</button>}</div>
            <div className="ac-list">{notices.slice(0, 6).map(n => <article key={n.id} className={'ac-card' + (noticeRead(n) ? '' : ' unread')} onClick={() => { if (!noticeRead(n)) save({ ...read, ['notice:' + n.id]: 1 }) }}>
              <div className="ac-main"><span className="ac-tag">{n.kind === 'deliver_anyway' ? 'DELIVERED ALTHOUGH NOT READY' : 'LATE FEE CHANGED'}</span>
                <p>{n.message}</p><small className="ac-meta">{[n.created_by_name, ago(n.created_at)].filter(Boolean).join(' · ')}{n.booking_id ? ` · ${n.booking_id}` : ''}</small></div>
              {n.booking_id && <button type="button" className="ac-act" onClick={e => { e.stopPropagation(); setOpen(false); ctx.openBooking(n.booking_id) }}>View Booking</button>}</article>)}</div></section>}
          {!total && !summary && <div className="ac-clear"><Ic n="checkc" s={32} /><b>All clear</b><p>No deliveries at risk and nothing overdue.</p></div>}
          {GROUPS.map(g => { const list = alerts.filter(a => a.level === g.level); if (!list.length) return null; const expanded = isOpen(g.level, list.length, g.open); const fresh = list.filter(a => !isRead(a)).length
            return <section key={g.level} className={'ac-group lvl-' + g.level}>
              <button type="button" className="ac-ghd" aria-expanded={expanded} onClick={() => toggle(g.level, list.length, g.open)}>
                <span className="ac-gic"><Ic n={g.icon} s={18} /></span>
                <span className="ac-gt"><b>{g.title} ({list.length}){fresh > 0 && <i className="ac-new">{fresh} new</i>}</b><small>{breakdown(list)}</small></span>
                <span className={'ac-chev' + (expanded ? ' up' : '')}><Ic n="down" s={16} /></span>
              </button>
              {expanded && <div className="ac-list">{list.map(a => <article key={a.key} className={'ac-card' + (isRead(a) ? '' : ' unread')} onClick={() => markRead(a)}>
                <div className="ac-main"><span className="ac-tag">{a.tag}</span>{a.event && <span className="ac-event">{a.event}</span>}<b>{a.dress}</b>{refBlock(a)}<p>{a.body}</p>
                  {(a.meta || a.more.length > 0) && <small className="ac-meta">{[a.meta, a.more.length > 0 && `Also: ${a.more.join(', ').toLowerCase()}`].filter(Boolean).join(' · ')}</small>}</div>
                <button type="button" className="ac-act" onClick={e => { e.stopPropagation(); run(a) }}>{a.action.label}</button>
              </article>)}</div>}
            </section> })}
          {summary && <section className="ac-group lvl-summary"><div className="ac-sum ac-sum-slim">
            <span className="ac-gic"><Ic n="truck" s={18} /></span>
            <div className="ac-main"><span className="ac-tag">TOMORROW · {dmy(summary.date)}</span>
              <b>{[summary.total > 0 && `${summary.total} deliver${summary.total === 1 ? 'y' : 'ies'}`, summary.returns > 0 && `${summary.returns} return${summary.returns === 1 ? '' : 's'} due`].filter(Boolean).join(' · ') || 'Nothing scheduled'}</b>
              {summary.total > 0 && (summary.ready === summary.total ? <small className="ac-meta">All ready to deliver.</small> : <small className="ac-meta">{[summary.ready > 0 && `${summary.ready} ready`, summary.alteration > 0 && `${summary.alteration} need alteration`, summary.prep > 0 && `${summary.prep} need preparation`, summary.notBack > 0 && `${summary.notBack} not yet returned`].filter(Boolean).join(' · ')}</small>)}</div>
            <button type="button" className="ac-act" onClick={() => { setOpen(false); ctx.showDay(summary.date) }}>View Schedule</button>
          </div></section>}
        </>}
      </div>
    </section>}
  </div>
}
