'use client'
import { useEffect, useMemo, useState } from 'react'
import { dmy, inr, PAY_MODES } from '@/lib/util'
import { Ic } from './icons'

const READY = 'Mark as Ready / Available', CLEAN = 'Add to Dry Cleaning List'
type Opt = { k: string; title: string; sub: string; icon: string; c: string }
const CONDS: Opt[] = [
  { k: 'Good', title: 'Good', sub: 'Ready and available', icon: 'checkc', c: 'var(--green)' },
  { k: 'Minor Marks', title: 'Minor marks', sub: 'Choose: ready or cleaning list', icon: 'search', c: 'var(--amber)' },
  { k: 'Needs Cleaning', title: 'Needs cleaning', sub: 'To be sent • Dry cleaning', icon: 'sparkle', c: 'var(--blue)' },
  { k: 'Damage / Repair Required', title: 'Damage / repair required', sub: 'Send to Damaged Queue (Alterations)', icon: 'wrench', c: 'var(--red)' },
]

/** One-screen return: condition, charges & deposit, notes, optional photos. Resolves with the keys the return logic expects. */
export default function ReturnForm({ ctx, b, owing, late, lateFee, onClose }: { ctx: any; b: any; owing: number; late: number; lateFee: number; onClose: (v: Record<string, any> | null) => void }) {
  const d = ctx.dmap[b.dress_id]
  const [cond, setCond] = useState('Good'), [minor, setMinor] = useState<'' | 'ready' | 'clean'>('')
  const [lf, setLf] = useState('0'), [dc, setDc] = useState('0'), [rm, setRm] = useState('Cash')
  const [notes, setNotes] = useState(''), [files, setFiles] = useState<File[]>([]), [err, setErr] = useState('')
  const urls = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls])
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(null); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
  const cleaning = cond === 'Needs Cleaning' || (cond === 'Minor Marks' && minor === 'clean')
  const active = cleaning ? ctx.CR?.find((r: any) => r.dress_id === b.dress_id && ['to_be_sent', 'sent', 'returned_pending_check'].includes(r.status)) : null
  const STAGE: Record<string, string> = { to_be_sent: 'To Be Sent', sent: 'Sent to Cleaner', returned_pending_check: 'Returned from Cleaner' }

  function submit() {
    if (cond === 'Minor Marks' && !minor) return setErr('Choose what happens to this dress: ready and available, or the cleaning list.')
    if (cond === 'Damage / Repair Required' && !notes.trim()) return setErr('Please describe the damage, so the repair team knows what to fix.')
    if (cond === 'Damage / Repair Required' && !files.length) return setErr('Please add at least one photo of the damage.')
    onClose({ condition: cond, clean: cleaning ? CLEAN : READY, n: notes.trim(), photos: files, lf, dc, rm })
  }
  const outcome = () => {
    if (cond === 'Good') return <div className="rf-out ok"><i><Ic n="checkc" s={18} /></i><div><b>Ready and available</b><span>This dress will be available right away.</span></div></div>
    if (cond === 'Minor Marks') return <div className="rf-out warn"><div className="rf-choice" role="radiogroup" aria-label="Minor marks next step">
      <b>What should happen to this dress?</b>
      <button role="radio" aria-checked={minor === 'ready'} className={minor === 'ready' ? 'on' : ''} onClick={() => { setMinor('ready'); setErr('') }}><i />Mark ready and available</button>
      <button role="radio" aria-checked={minor === 'clean'} className={minor === 'clean' ? 'on' : ''} onClick={() => { setMinor('clean'); setErr('') }}><i />Add to cleaning list</button></div></div>
    if (cond === 'Needs Cleaning') return <div className="rf-out clean"><i><Ic n="sparkle" s={18} /></i><div><b>Added to Dry Cleaning → To be sent</b><span>The dress stays at the shop until you send it to the cleaner.</span></div></div>
    return <div className="rf-out bad"><i><Ic n="wrench" s={18} /></i><div><b>Added to Alterations → Damaged Queue</b><span>The dress is held back from rental until the repair is approved.</span></div></div>
  }

  return <div className="rw-back" onClick={() => onClose(null)}><div className="rw rf" onClick={e => e.stopPropagation()} role="dialog" aria-label="Return a dress">
    <div className="rf-body">
      <h2>Return a dress</h2>
      <p className="rf-sub">Choose the dress condition. We’ll send it to the right next step.</p>
      <div className="rf-dress">{ctx.thumb(d, 40, 52)}<span><b>{d?.code}</b> · {d?.name}<small>{b.customer_name} · booking {b.id} · due back {dmy(b.end_date)}{late > 0 ? ` · ${late} day${late > 1 ? 's' : ''} late` : ''}</small></span></div>

      <h3 id="rf-cond">Overall dress condition <em>*</em></h3>
      <div className="rf-cards" role="radiogroup" aria-labelledby="rf-cond">{CONDS.map(c => <button key={c.k} role="radio" aria-checked={cond === c.k} className={'rf-c' + (cond === c.k ? ' on' : '')} style={{ ['--c' as any]: c.c }} onClick={() => { setCond(c.k); setErr('') }}><span className="rf-ic"><Ic n={c.icon} s={15} /></span><b>{c.title}</b><small>{c.sub}</small></button>)}</div>

      {outcome()}
      {active && <p className="rw-warn">This dress is already in the cleaning workflow ({STAGE[active.status]}). No second record will be created.</p>}

      <h3>Charges &amp; deposit</h3>
      <div className="rf-g">
        <label>Late-return fee (₹)<input type="number" min="0" inputMode="numeric" value={lf} onChange={e => setLf(e.target.value)} /></label>
        <label>Damage / repair (₹)<input type="number" min="0" inputMode="numeric" value={dc} onChange={e => setDc(e.target.value)} /></label>
        <label>Deposit hand-back<select value={rm} onChange={e => setRm(e.target.value)}>{PAY_MODES.map(m => <option key={m}>{m}</option>)}</select></label>
      </div>
      <p className="rw-note">{late > 0 && lateFee > 0 ? `${late} day${late > 1 ? 's' : ''} late — suggested late fee ${inr(lateFee)}. ` : ''}Deposit held {inr(b.deposit_held)}{owing > 0 ? `. Unpaid rent ${inr(owing)} is settled from the deposit.` : '.'}</p>

      <label className="rf-l">Condition notes <small>{cond === 'Damage / Repair Required' ? '(required for damage)' : '(optional)'}</small><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a note for the team…" /></label>
      <details key={cond === 'Damage / Repair Required' ? 'dmg' : 'ok'} className="rf-photos" open={cond === 'Damage / Repair Required' || undefined}><summary>Photos <small>{cond === 'Damage / Repair Required' ? '(at least one required for damage)' : '(optional)'}{files.length ? ` · ${files.length} attached` : ''}</small></summary>
        <div className="rw-ph"><label className="rw-add"><Ic n="plus" s={16} />Add photos<input type="file" accept="image/*" multiple hidden onChange={e => { if (e.target.files) setFiles(f => [...f, ...Array.from(e.target.files!).filter(x => x.type.startsWith('image/'))]); e.target.value = '' }} /></label>
          {urls.map((u, i) => <span key={u} className="rw-t"><img src={u} alt={`Condition photo ${i + 1}`} /><button aria-label="Remove photo" onClick={() => setFiles(f => f.filter((_, j) => j !== i))}>✕</button></span>)}</div></details>
      {err && <p className="rw-err" role="alert">{err}</p>}
    </div>
    <div className="rf-f"><button className="btn" onClick={submit}>Complete return</button><button className="btn alt" onClick={() => onClose(null)}>Cancel</button></div>
  </div></div>
}
