'use client'
import { useEffect, useMemo, useState } from 'react'
import { dmy, inr, PAY_MODES } from '@/lib/util'
import { Ic } from './icons'

export const CONDITIONS: { k: string; label: string; sub: string; icon: string; c: string }[] = [
  { k: 'Good', label: 'Good', sub: 'No cleaning required', icon: 'checkc', c: 'var(--green)' },
  { k: 'Minor Marks', label: 'Minor Marks', sub: 'Light cleaning (optional)', icon: 'search', c: 'var(--amber)' },
  { k: 'Needs Cleaning', label: 'Needs Cleaning', sub: 'Requires dry cleaning', icon: 'sparkle', c: 'var(--wine)' },
  { k: 'Damage / Repair Required', label: 'Damage / Repair', sub: 'Needs maintenance', icon: 'wrench', c: 'var(--red)' },
]
const READY = 'Mark as Ready / Available', CLEAN = 'Add to Dry Cleaning List'
const DAMAGE = ['Send to Maintenance', 'Send for Alteration', 'Mark as Unavailable Pending Review']
const STEPS = ['Return Details', 'Dress Condition', 'Complete']

/** Three-step return: details, mandatory condition inspection, confirm. Resolves with the same keys the old dialog returned. */
export default function ReturnWizard({ ctx, b, owing, late, lateFee, onClose }: { ctx: any; b: any; owing: number; late: number; lateFee: number; onClose: (v: Record<string, any> | null) => void }) {
  const d = ctx.dmap[b.dress_id], owner = ctx.owner
  const [step, setStep] = useState(0)
  const [lf, setLf] = useState('0'), [dc, setDc] = useState('0'), [rm, setRm] = useState('Cash')
  const [cond, setCond] = useState(''), [notes, setNotes] = useState(''), [files, setFiles] = useState<File[]>([]), [next, setNext] = useState('')
  const [err, setErr] = useState('')
  const urls = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls])
  useEffect(() => { if (cond === 'Needs Cleaning') setNext(CLEAN); else if (cond === 'Good') setNext(READY); else if (cond === 'Damage / Repair Required') setNext(DAMAGE[0]); else setNext('') }, [cond])
  const active = ctx.CR?.find((r: any) => r.dress_id === b.dress_id && ['to_be_sent', 'sent', 'returned_pending_check'].includes(r.status))
  const cleaning = next === CLEAN
  function go() {
    setErr('')
    if (step === 1) {
      if (!cond) return setErr('Select the overall condition of the dress.')
      if (cond !== 'Good' && !notes.trim()) return setErr('Add a condition note describing what you found.')
      if (!next) return setErr('Choose the next action for this dress.')
    }
    setStep(step + 1)
  }
  function finish() {
    const dmg = cond === 'Damage / Repair Required'
    onClose({ condition: cond, clean: cleaning ? CLEAN : READY, n: notes.trim(), photos: files, lf, dc, rm, route: dmg ? next : '' })
  }
  const addFiles = (l: FileList | null) => { if (l) setFiles(f => [...f, ...Array.from(l).filter(x => x.type.startsWith('image/'))]) }
  const cur = CONDITIONS.find(c => c.k === cond)

  return <div className="rw-back" onClick={() => onClose(null)}><div className="rw" onClick={e => e.stopPropagation()} role="dialog" aria-label="Return booking">
    <div className="rw-h"><h2>Return Booking – {b.id}</h2><button onClick={() => onClose(null)} aria-label="Close">✕</button></div>
    <ol className="rw-steps">{STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'cur' : ''}><i>{i < step ? '✓' : i + 1}</i><span>{s}</span></li>)}</ol>
    <div className="rw-body">
      <div className="rw-dress">{ctx.thumb(d, 54, 70)}<div><b>{d?.code}</b><span>{d?.name}</span><small>{b.customer_name} · due back {dmy(b.end_date)}{late > 0 ? ` · ${late} day${late > 1 ? 's' : ''} late` : ''}</small></div></div>

      {step === 0 && <>
        <h3>Return details</h3>
        <div className="rw-g">
          <label>Late-return fee (₹)<input type="number" min="0" value={lf} onChange={e => setLf(e.target.value)} />{late > 0 && <small>Suggested for {late} late day{late > 1 ? 's' : ''}: {inr(lateFee)}</small>}</label>
          <label>Damage / repair charge (₹)<input type="number" min="0" value={dc} onChange={e => setDc(e.target.value)} /></label>
          <label>Deposit hand-back mode<select value={rm} onChange={e => setRm(e.target.value)}>{PAY_MODES.map(m => <option key={m}>{m}</option>)}</select></label>
        </div>
        {!owner && (+lf > 0 || +dc > 0) && <p className="rw-note">Charges you enter are passed to the owner to add; the deposit amount shown at the end excludes them.</p>}
        <p className="rw-note">Deposit held {inr(b.deposit_held)}{owing > 0 ? `. Unpaid rent ${inr(owing)} will be settled from the deposit.` : '.'}</p>
      </>}

      {step === 1 && <>
        <h3>Inspect dress &amp; record condition <em>*</em></h3>
        <div className="rw-cards" role="radiogroup" aria-label="Overall condition">{CONDITIONS.map(c => <button key={c.k} role="radio" aria-checked={cond === c.k} className={'rw-c' + (cond === c.k ? ' on' : '')} style={{ ['--c' as any]: c.c }} onClick={() => setCond(c.k)}><Ic n={c.icon} s={30} /><b>{c.label}</b><small>{c.sub}</small>{cond === c.k && <i>✓</i>}</button>)}</div>
        <label className="rw-l">Condition notes {cond && cond !== 'Good' && <em>*</em>}<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Makeup marks on neckline, slight stain on hem." /></label>
        <div className="rw-ph"><label className="rw-add"><Ic n="plus" s={16} />Add Photos{files.length ? ` (${files.length})` : ''}<input type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></label>
          {urls.map((u, i) => <span key={u} className="rw-t"><img src={u} alt={`Condition photo ${i + 1}`} /><button aria-label="Remove photo" onClick={() => setFiles(f => f.filter((_, j) => j !== i))}>✕</button></span>)}</div>
        {cond && <>
          <h3>Next action <em>*</em></h3>
          <div className="rw-opts">
            {cond === 'Good' && <Opt on label={READY} sub="Dress is clean and can be used" />}
            {cond === 'Minor Marks' && <><Opt on={next === READY} label={READY} sub="Dress is clean and can be used" pick={() => setNext(READY)} /><Opt on={next === CLEAN} label={CLEAN} sub="Send later from the Dry Cleaning section" pick={() => setNext(CLEAN)} /></>}
            {cond === 'Needs Cleaning' && <Opt on label={CLEAN} sub="The dress stays at the shop until staff confirm it is sent" />}
            {cond === 'Damage / Repair Required' && DAMAGE.map(o => <Opt key={o} on={next === o} label={o} sub={o === DAMAGE[0] ? 'Dress is held back for maintenance' : o === DAMAGE[1] ? 'Creates an alteration job for its next booking' : 'Not available until the owner reviews it'} pick={() => setNext(o)} />)}
          </div>
          {cond === 'Damage / Repair Required' && <p className="rw-note">Damaged dresses are not added to dry cleaning.</p>}
          {active && cleaning && <p className="rw-warn">This dress is already in the cleaning workflow ({active.status === 'to_be_sent' ? 'To Be Sent' : active.status === 'sent' ? 'Sent to Cleaner' : 'Returned from Cleaner'}). No second record will be created.</p>}
        </>}
      </>}

      {step === 2 && <>
        <h3>Review &amp; complete</h3>
        <div className="rw-sum">
          <div><span>Condition</span><b style={{ color: cur?.c }}>{cur?.label}</b></div>
          <div><span>Next action</span><b>{cond === 'Damage / Repair Required' ? next : cleaning ? CLEAN : READY}</b></div>
          {notes.trim() && <div><span>Notes</span><b>{notes.trim()}</b></div>}
          {files.length > 0 && <div><span>Photos</span><b>{files.length} attached</b></div>}
          {(+lf > 0 || +dc > 0) && <div><span>Charges entered</span><b>{inr(+lf + +dc)}</b></div>}
          <div><span>Deposit hand-back</span><b>{rm}</b></div>
        </div>
        <p className="rw-note">{cleaning ? 'The dress stays at the shop in the To Be Sent list. It is only marked out for dry cleaning when you confirm dispatch.' : cond === 'Damage / Repair Required' ? 'The dress will not be available for rent until this issue is resolved.' : 'The dress becomes available again after the cleaning period.'}</p>
      </>}
      {err && <p className="rw-err" role="alert">{err}</p>}
    </div>
    <div className="rw-f">{step > 0 ? <button className="btn alt" onClick={() => { setErr(''); setStep(step - 1) }}>Back</button> : <button className="btn alt" onClick={() => onClose(null)}>Cancel</button>}
      {step < 2 ? <button className="btn" onClick={go}>{step === 1 ? 'Save & Continue' : 'Continue'}</button> : <button className="btn" onClick={finish}>Complete Return</button>}</div>
  </div></div>
}

function Opt({ on, label, sub, pick }: { on: boolean; label: string; sub: string; pick?: () => void }) {
  return <button type="button" role="radio" aria-checked={on} className={'rw-o' + (on ? ' on' : '')} onClick={pick} disabled={!pick}><i /><span><b>{label}</b><small>{sub}</small></span></button>
}
