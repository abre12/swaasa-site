'use client'
import { useEffect, useState } from 'react'
import { addD, dmy, todayIST } from '@/lib/util'
import { Ic } from './icons'

export const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: 'Fit & Size', items: [['waist', 'Waist Adjustment'], ['bust', 'Bust Adjustment'], ['hem', 'Length / Hem']] },
  { title: 'Upper Body', items: [['shoulder', 'Shoulder Adjustment'], ['strap', 'Strap Adjustment'], ['sleeve', 'Sleeve Adjustment']] },
  { title: 'Bridal Wear', items: [['blouse', 'Blouse Fitting'], ['padding', 'Padding Adjustment'], ['hooks', 'Hooks / Zip Adjustment']] },
  { title: 'Other', items: [['other', 'Other Alteration']] },
]
const LBL: Record<string, string> = Object.fromEntries(GROUPS.flatMap(g => g.items))
const MEAS: [string, string][] = [['bust', 'Bust'], ['waist', 'Waist'], ['hip', 'Hip'], ['length', 'Length'], ['other', 'Other']]
const QC: [string, string][] = [['done', 'All requested alterations completed'], ['meets', 'Alteration meets the recorded requirements'], ['nodamage', 'No damage caused to the dress'], ['presentable', 'Dress is presentable and ready']]
const STEPS: [string, string][] = [['pending_dispatch', 'Pending Dispatch'], ['at_unit', 'At Tailoring Unit'], ['quality_check', 'Quality Check at Store'], ['ready', 'Ready']]

/** One-line summary of what is being altered: the checklist if filled in, else the booking's free-text notes. */
export const summarise = (j: any) => (j.checklist || []).length ? (j.checklist as any[]).map(c => LBL[c.k] || c.k).join(', ') : j.requirements

export default function AlterationDrawer({ ctx, job, onClose, onDispatch, onReceive, onApprove }: { ctx: any; job: any; onClose: () => void; onDispatch: (j: any) => void; onReceive: (j: any) => void; onApprove: (j: any, qc: Record<string, boolean>, notes: string) => Promise<void> }) {
  const today = todayIST(), b = ctx.B.find((x: any) => x.id === job.booking_id), d = ctx.dmap[job.dress_id]
  const locked = job.status === 'ready' || job.status === 'cancelled'
  const [list, setList] = useState<Record<string, string>>(() => Object.fromEntries((job.checklist || []).map((c: any) => [c.k, c.note || ''])))
  const [meas, setMeas] = useState<Record<string, string>>(job.measurements || {})
  const [qc, setQc] = useState<Record<string, boolean>>(job.qc || {})
  const [qn, setQn] = useState<string>(job.qc_notes || '')
  const [detailTab, setDetailTab] = useState<'alterations' | 'history'>('alterations')
  const [busy, setBusy] = useState(false)
  const dmg = job.source === 'damage'
  const [insp, setInsp] = useState<any>(null)
  useEffect(() => { if (!job.inspection_id) return; ctx.sb.from('return_inspections').select('photos,notes,condition,inspected_at').eq('id', job.inspection_id).maybeSingle().then(({ data }: any) => setInsp(data || null)) }, [job.inspection_id, ctx.sb])
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
  const dirty = JSON.stringify(Object.entries(list).map(([k, note]) => ({ k, note }))) !== JSON.stringify((job.checklist || []).map((c: any) => ({ k: c.k, note: c.note || '' }))) || JSON.stringify(meas) !== JSON.stringify(job.measurements || {})
  const nb = dmg ? ctx.B.filter((x: any) => x.dress_id === job.dress_id && ['pending', 'confirmed'].includes(x.status) && x.start_date >= today).sort((x: any, y: any) => x.start_date.localeCompare(y.start_date))[0] : b
  const left = nb ? Math.round((+new Date(nb.start_date) - +new Date(today)) / 864e5) : null
  const stepIx = STEPS.findIndex(s => s[0] === job.status)
  const late = job.status === 'at_unit' && job.expected_return && job.expected_return < today
  const risk = !locked && !dmg && b && job.status !== 'quality_check' && (job.expected_return ? job.expected_return >= addD(b.start_date, -1) : false)
  const soon = job.status === 'at_unit' && job.expected_return && !late && job.expected_return <= addD(today, 1)
  const toggle = (k: string) => setList(l => { const n = { ...l }; if (k in n) delete n[k]; else n[k] = ''; return n })
  async function save() {
    setBusy(true)
    const checklist = Object.entries(list).map(([k, note]) => ({ k, note: note.trim() }))
    const m = Object.fromEntries(Object.entries(meas).filter(([, v]) => String(v).trim()))
    const { error } = await ctx.sb.from('alteration_jobs').update({ checklist, measurements: m, updated_at: new Date().toISOString() }).eq('id', job.id)
    setBusy(false); ctx.say(error ? 'Could not save. Has migration v12 been run? ' + error.message : 'Alteration details saved.'); if (!error) ctx.load()
  }
  const qcAll = QC.every(([k]) => qc[k])
  const prog = (label: string, val: string | null, extra?: React.ReactNode) => <div className="ad-pr"><Ic n="calendar" s={16} /><span>{label}</span><b>{val ? dmy(val) : '—'}</b>{extra}</div>

  return <div className="ad-back" onClick={onClose}><aside className="ad" onClick={e => e.stopPropagation()} role="dialog" aria-label="Alteration details">
    <div className="ad-h"><Ic n="scissors" s={26} /><div><h2>Alteration Details</h2><button type="button" className="ad-chip ad-booking-link" onClick={() => ctx.openBooking(job.booking_id)}>Booking #{job.booking_id}</button></div><button className="ad-x" onClick={onClose} aria-label="Close">✕</button></div>
    <div className="ad-body">
      <div className="ad-dress">{ctx.thumb(d, 96, 128)}<div><b>{d?.name || '—'}</b><span className="ad-chip">SKU: {d?.code}</span>
        {b && dmg && <><p><Ic n="user" s={14} />Returned by {b.customer_name} ({b.id})</p><p><Ic n="truck" s={14} />Next booking: {nb ? dmy(nb.start_date) : 'none'} {left !== null && <em className={left <= 2 ? 'hot' : ''}>({left === 0 ? 'today' : left === 1 ? 'tomorrow' : left + ' days'})</em>}</p></>}
        {b && !dmg && <><p><Ic n="user" s={14} />{b.customer_name}</p><p><Ic n="flag" s={14} />{b.phone}</p><p><Ic n="truck" s={14} />Delivery: {dmy(b.start_date)} {left !== null && <em className={left <= 2 ? 'hot' : ''}>({left < 0 ? Math.abs(left) + ' days ago' : left === 0 ? 'today' : left === 1 ? 'tomorrow' : left + ' days'})</em>}</p><p><Ic n="ret" s={14} />Return: {dmy(b.end_date)}</p></>}</div></div>

      <nav className="ad-tabs" role="tablist" aria-label="Alteration details"><button className={detailTab === 'alterations' ? 'on' : ''} role="tab" aria-selected={detailTab === 'alterations'} onClick={() => setDetailTab('alterations')}>Alterations</button><button className={detailTab === 'history' ? 'on' : ''} role="tab" aria-selected={detailTab === 'history'} onClick={() => setDetailTab('history')}>Notes &amp; History</button></nav>

      {detailTab === 'alterations' && <>
      {late && <div className="ad-warn bad"><Ic n="warn" s={16} /><b>Overdue – Awaiting Return from Tailoring Unit</b></div>}
      {risk && <div className="ad-warn"><Ic n="warn" s={16} />Expected return is close to the scheduled delivery date.</div>}

      <h3>Alterations Required</h3>
      {job.requirements && <p className="ad-bn"><b>{dmg ? 'Damage notes' : 'Booking notes'}:</b> {job.requirements}</p>}
      {dmg && insp && <div className="ad-insp"><b>Return inspection · {dmy(insp.inspected_at.slice(0, 10))}</b>{insp.notes && <p>{insp.notes}</p>}{(insp.photos || []).length > 0 ? <div className="ad-ph">{insp.photos.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Return condition" /></a>)}</div> : <small className="mut">No photos were attached.</small>}</div>}
      {GROUPS.map(g => <div key={g.title} className="ad-g"><h4>{g.title}</h4>{g.items.map(([k, l]) => <div key={k} className="ad-it"><label><input type="checkbox" disabled={locked} checked={k in list} onChange={() => toggle(k)} />{l}</label>{k in list && <input className="ad-note" disabled={locked} value={list[k]} onChange={e => setList({ ...list, [k]: e.target.value })} placeholder="Add notes…" />}</div>)}</div>)}

      <details className="ad-meas" open={Object.values(meas).some(Boolean)}><summary>Measurements (optional)</summary>
        <div className="ad-mg">{MEAS.map(([k, l]) => <label key={k}>{l}<input disabled={locked} value={meas[k] || ''} onChange={e => setMeas({ ...meas, [k]: e.target.value })} placeholder={k === 'other' ? 'e.g. shoulder 15 in' : 'inches'} /></label>)}</div></details>

      <h3>Tailoring Progress</h3>
      <div className="ad-prog">
        {prog('Sent to Tailoring Unit', job.sent_on, job.status === 'pending_dispatch' && <button className="btn sm" onClick={() => onDispatch(job)}>Send to Tailoring</button>)}
        {prog('Expected Return Date', job.expected_return, job.status === 'at_unit' ? (late ? <span className="ad-tag bad">Overdue</span> : soon ? <span className="ad-tag warn">Expected soon</span> : <span className="ad-tag ok">On schedule</span>) : null)}
        {prog('Received at Store', job.received_at ? job.received_at.slice(0, 10) : null, job.status === 'at_unit' && <button className="btn sm" onClick={() => onReceive(job)}>Receive at Store</button>)}
      </div>

      {(job.status === 'quality_check' || job.status === 'ready') && <><h3>Quality Check at Store</h3>
        <div className="ad-qc">{QC.map(([k, l]) => <label key={k}><input type="checkbox" disabled={job.status === 'ready'} checked={!!qc[k]} onChange={e => setQc({ ...qc, [k]: e.target.checked })} />{l}</label>)}
          <textarea disabled={job.status === 'ready'} value={qn} onChange={e => setQn(e.target.value)} placeholder="Quality check notes (optional)" rows={2} />
          {job.status === 'quality_check' && <button className="btn" disabled={!qcAll || busy} onClick={async () => { setBusy(true); await onApprove(job, qc, qn); setBusy(false) }}>Approve &amp; Mark Ready</button>}
          {job.status === 'quality_check' && !qcAll && <small className="mut">Tick all four checks to approve.</small>}
          {job.status === 'ready' && job.checked_at && <small className="mut">Approved {dmy(job.checked_at.slice(0, 10))}</small>}</div></>}
      <h3>Status</h3><div className="ad-track">{STEPS.map(([k, l], i) => <div key={k} className={'st' + (i < stepIx || job.status === 'ready' ? ' done' : i === stepIx ? ' cur' : '')}><i>{i < stepIx || job.status === 'ready' ? '✓' : ''}</i><span>{l}</span></div>)}</div>
      </>}
      {detailTab === 'history' && <section className="ad-history"><h3>Notes &amp; History</h3><div className="ad-history-card"><b>Alteration requirements</b><p>{job.requirements || 'No free-text requirements recorded.'}</p></div>{job.notes && <div className="ad-history-card"><b>Work notes</b><p>{job.notes}</p></div>}{job.qc_notes && <div className="ad-history-card"><b>Quality check notes</b><p>{job.qc_notes}</p></div>}<div className="ad-history-list"><div><i>✓</i><span><b>Alteration added to queue</b><small>{job.created_at ? dmy(job.created_at.slice(0, 10)) : 'Date not recorded'}</small></span></div>{job.sent_on && <div><i>↗</i><span><b>Sent to tailoring unit</b><small>{dmy(job.sent_on)}{job.expected_return ? ` · Expected ${dmy(job.expected_return)}` : ''}</small></span></div>}{job.received_at && <div><i>↓</i><span><b>Received at store</b><small>{dmy(job.received_at.slice(0, 10))}</small></span></div>}{job.checked_at && <div><i>✓</i><span><b>Quality check approved</b><small>{dmy(job.checked_at.slice(0, 10))}</small></span></div>}</div></section>}
    </div>
    <div className="ad-f"><button className="btn alt" onClick={onClose}>{dirty ? 'Cancel' : 'Close'}</button>{!locked && <button className="btn" disabled={!dirty || busy} onClick={save}>Save Changes</button>}</div>
  </aside></div>
}
