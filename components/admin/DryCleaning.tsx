'use client'
import { addD, dmy, inr, istDate, todayIST } from '@/lib/util'
const ERR = (m: string) => m.includes('CLEAN_CONFLICT') ? 'This dress is booked, or with a customer, during those dates. Choose an earlier return date, or move the booking first.' : m.includes('ALREADY_CLEANING') ? 'This dress is already out for dry cleaning.' : m
const retDate = (b: any) => b.returned_at ? istDate(b.returned_at) : b.end_date
// Every time a dress goes for dry cleaning is recorded here. While it is away it cannot be booked and it shows on the calendar.
export default function DryCleaning({ ctx }: { ctx: any }) {
  const today = todayIST(); const DC: any[] = ctx.DC, owner = ctx.owner
  const away = DC.filter(c => !c.returned_on)
  async function send(pre?: any) {
    const eligible = ctx.D.filter((d: any) => !['archived', 'retired'].includes(d.status) && !away.some(c => c.dress_id === d.id))
    const v = await ctx.ask('Send a dress for dry cleaning', [
      { name: 'd', label: 'Dress', options: eligible.map((d: any) => `${d.code} · ${d.name}`), value: pre ? `${pre.code} · ${pre.name}` : undefined, required: !pre },
      { name: 's', label: 'Sent on', type: 'date', value: today, required: true }, { name: 'e', label: 'Expected back on', type: 'date', value: addD(today, 3), required: true },
      { name: 'c', label: `Charge for this wash (₹). Leave empty to use the dress's standard charge`, type: 'number' }, { name: 'n', label: 'Notes (optional)' }],
      { ok: 'Send for cleaning', note: 'The dress cannot be booked for these dates while it is away.' }); if (!v) return
    const d = eligible.find((x: any) => `${x.code} · ${x.name}` === v.d); if (!d) return ctx.say('Choose a dress.')
    if (v.e < v.s) return ctx.say('Expected return cannot be before the date sent.')
    const { error } = await ctx.sb.from('dry_cleanings').insert({ dress_id: d.id, sent_on: v.s, expected_back: v.e, charge: v.c !== '' ? +v.c : (d.dry_clean_charge || 0), notes: v.n.trim() || null })
    ctx.say(error ? ERR(error.message) : `${d.code} sent for dry cleaning. Unavailable until ${dmy(v.e)}.`); ctx.load()
  }
  async function back(c: any) {
    const v = await ctx.ask('Dress back from dry cleaning', [{ name: 'r', label: 'Returned on', type: 'date', value: today, required: true }, { name: 'c', label: 'Final charge (₹)', type: 'number', value: String(c.charge), required: true }], { ok: 'Mark back' }); if (!v) return
    const { error } = await ctx.sb.from('dry_cleanings').update({ returned_on: v.r, charge: +v.c }).eq('id', c.id)
    ctx.say(error ? ERR(error.message) : 'Dress is back and can be booked again.'); ctx.load()
  }
  async function edit(c: any) {
    const v = await ctx.ask('Change this entry', [{ name: 'e', label: 'Expected back on', type: 'date', value: c.expected_back, required: true }, { name: 'c', label: 'Charge (₹)', type: 'number', value: String(c.charge), required: true }, { name: 'n', label: 'Notes', value: c.notes || '' }]); if (!v) return
    const { error } = await ctx.sb.from('dry_cleanings').update({ expected_back: v.e, charge: +v.c, notes: v.n.trim() || null }).eq('id', c.id)
    ctx.say(error ? ERR(error.message) : 'Saved'); ctx.load()
  }
  async function remove(c: any) { if (await ctx.askYes('Remove this entry?', 'Use this only for an entry made by mistake. It also removes the cost from dress performance.', 'Remove')) { await ctx.sb.from('dry_cleanings').delete().eq('id', c.id); ctx.say('Removed'); ctx.load() } }
  const need = ctx.D.filter((d: any) => !['archived', 'retired'].includes(d.status)).map((d: any) => {
    const mine = DC.filter(c => c.dress_id === d.id), last = mine[0]   // DC is newest first
    const since = ctx.B.filter((b: any) => b.dress_id === d.id && b.status === 'returned' && (!last || retDate(b) > last.sent_on)).length
    return { d, last, since, away: mine.some(c => !c.returned_on) } }).sort((a: any, b: any) => b.since - a.since || a.d.code.localeCompare(b.d.code))
  const total = DC.reduce((s, c) => s + c.charge, 0)
  const cell = (id: string) => { const d = ctx.dmap[id]; return <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{ctx.thumb(d)}<span>{d?.code}<br /><span className="mut" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 170 }}>{d?.name}</span></span></div> }
  return (<div style={{ display: 'grid', gap: 18 }}>
    <p className="mut" style={{ margin: 0, fontSize: 13 }}>Record each time a dress is sent for dry cleaning. Not every returned dress needs washing, so use the list at the bottom to decide. A dress that is away cannot be booked for those dates and shows on the calendar. The charge for each wash feeds the owner’s dress performance figures.</p>
    <div><button className="btn" onClick={() => send()}>Send a dress for dry cleaning</button></div>
    <div className="box" style={{ margin: 0 }}><h3 style={{ letterSpacing: '.08em', fontSize: 18 }}>OUT FOR DRY CLEANING NOW ({away.length})</h3>
      <div className="scroll"><table><thead><tr><th>Dress</th><th>Sent</th><th>Expected back</th><th>Charge</th><th>Notes</th><th></th></tr></thead><tbody>
        {away.map(c => { const late = c.expected_back < today; return <tr key={c.id} style={late ? { background: '#b4493f14' } : undefined}><td>{cell(c.dress_id)}</td><td>{dmy(c.sent_on)}</td><td>{dmy(c.expected_back)}{late && <div className="bad"><b>OVERDUE</b></div>}</td><td>{inr(c.charge)}</td><td style={{ whiteSpace: 'normal', minWidth: 140 }}>{c.notes || '–'}</td>
          <td style={{ whiteSpace: 'normal' }}><button className="btn sm" onClick={() => back(c)}>Mark back</button> <button className="btn alt sm" onClick={() => edit(c)}>Change</button>{owner && <> <button className="btn alt sm" onClick={() => remove(c)}>Remove</button></>}</td></tr> })}
        {!away.length && <tr><td colSpan={6} className="mut">No dress is out for dry cleaning.</td></tr>}</tbody></table></div></div>
    <div className="box" style={{ margin: 0 }}><h3 style={{ letterSpacing: '.08em', fontSize: 18 }}>RENTALS SINCE LAST WASH</h3>
      <p className="mut" style={{ fontSize: 13, margin: '2px 0 8px' }}>Completed rentals since the dress was last sent for dry cleaning. Dresses with 2 or more are highlighted.</p>
      <div className="scroll"><table><thead><tr><th>Dress</th><th>Last washed</th><th>Rentals since</th><th>Standard charge</th><th></th></tr></thead><tbody>
        {need.map(({ d, last, since, away: aw }: any) => <tr key={d.id} style={since >= 3 ? { background: '#b4493f14' } : since === 2 ? { background: '#c58a2b14' } : undefined}><td>{cell(d.id)}</td><td>{last ? dmy(last.returned_on || last.sent_on) : <span className="mut">Never</span>}</td><td><b>{since}</b></td><td>{inr(d.dry_clean_charge || 0)}</td>
          <td>{aw ? <span className="mut">Away now</span> : <button className="btn alt sm" onClick={() => send(d)}>Send for cleaning</button>}</td></tr>)}</tbody></table></div></div>
    <div className="box" style={{ margin: 0 }}><h3 style={{ letterSpacing: '.08em', fontSize: 18 }}>DRY CLEANING HISTORY</h3><p className="mut" style={{ fontSize: 13, margin: '2px 0 8px' }}>{DC.length} wash{DC.length === 1 ? '' : 'es'} recorded · total cost {inr(total)}</p>
      <div className="scroll"><table><thead><tr><th>Dress</th><th>Sent</th><th>Back</th><th>Charge</th><th>Notes</th></tr></thead><tbody>
        {DC.slice(0, 150).map(c => <tr key={c.id}><td>{cell(c.dress_id)}</td><td>{dmy(c.sent_on)}</td><td>{c.returned_on ? dmy(c.returned_on) : <span className="mut">away</span>}</td><td>{inr(c.charge)}</td><td style={{ whiteSpace: 'normal' }}>{c.notes || '–'}</td></tr>)}
        {!DC.length && <tr><td colSpan={5} className="mut">Nothing recorded yet.</td></tr>}</tbody></table></div></div>
  </div>)
}
