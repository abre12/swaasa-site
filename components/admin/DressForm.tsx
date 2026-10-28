'use client'
import { useEffect, useState } from 'react'
import { CATS, COLOURS, mainCatOf } from '@/lib/util'
import { autoColours } from '@/lib/colours'
import { makeSizes } from '@/lib/images'
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size']
type Item = { key: string; src: string; kind: 'old' | 'new'; i: number }
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '0 14px' }
const head = (n: number, t: string, hint?: string) => <div style={{ margin: '0 0 8px' }}><b style={{ letterSpacing: '.06em' }}><span style={{ display: 'inline-block', width: 22, height: 22, lineHeight: '22px', textAlign: 'center', background: 'var(--ink)', color: 'var(--bg)', borderRadius: 11, fontSize: 12, marginRight: 8 }}>{n}</span>{t}</b>{hint && <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>{hint}</div>}</div>
const lab = (t: string, req = false) => <div style={{ fontSize: 13, color: 'var(--mut)', margin: '6px 0 2px' }}>{t}{req && <span className="bad"> *</span>}</div>
// Add or edit a dress in five short steps. Colours are worked out for you from the colour words and the photo.
export default function DressForm({ ctx, ed, onClose }: { ctx: any; ed: any | null; onClose: () => void }) {
  const blank = { code: '', name: '', category: ed?.category || CATS[0], colour: '', price: '', days: '3', extra: '', dcc: '', acquired: '', description: '' }
  const [f, setF] = useState(ed ? { code: ed.code || '', name: ed.name || '', category: ed.category || CATS[0], colour: ed.colour || '', price: ed.price != null ? String(ed.price) : '', days: String(ed.included_days ?? 3), extra: ed.extra_day_fee != null ? String(ed.extra_day_fee) : '', dcc: ed.dry_clean_charge != null ? String(ed.dry_clean_charge) : '', acquired: ed.acquired_on || '', description: ed.description || '' } : blank)
  const [sizes, setSizes] = useState<string[]>(ed?.sizes || []), [more, setMore] = useState('')
  const [old, setOld] = useState<{ url: string; thumb: string; medium: string }[]>(() => (ed?.images || []).map((u: string, i: number) => ({ url: u, thumb: ed.thumbs?.[i] || '', medium: ed.medium?.[i] || '' })))
  const [news, setNews] = useState<{ file: File; preview: string }[]>([]), [main, setMain] = useState<string>(ed?.images?.[0] || '')
  const [tags, setTags] = useState<string[]>(ed?.colour_tags || []), [touched, setTouched] = useState(!!ed?.colour_tags?.length), [note, setNote] = useState('')
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }))
  const items: Item[] = [...old.map((o, i) => ({ key: o.url, src: o.thumb || o.url, kind: 'old' as const, i })), ...news.map((n, i) => ({ key: 'new:' + i, src: n.preview, kind: 'new' as const, i }))]
  const mainKey = items.find(x => x.key === main)?.key || items[0]?.key || '', mainItem = items.find(x => x.key === mainKey)
  const photoSrc = (): string | File | null => !mainItem ? null : mainItem.kind === 'new' ? news[mainItem.i]?.file : (old[mainItem.i]?.medium || old[mainItem.i]?.thumb || old[mainItem.i]?.url)
  // Colours are filled in automatically (colour words first, then the photo) until someone picks colours by hand.
  useEffect(() => {
    if (touched) return
    const t = setTimeout(async () => {
      const r = await autoColours(`${f.colour} ${f.name} ${f.description}`, photoSrc())
      if (r.tags.length) { setTags(r.tags); setNote(r.source === 'words' ? 'Worked out from the colour words and name.' : 'Detected from the photo.') } else setNote('')
    }, 700)
    return () => clearTimeout(t)
  }, [f.colour, f.name, f.description, mainKey, news.length, old.length, touched])
  useEffect(() => () => news.forEach(n => URL.revokeObjectURL(n.preview)), [])
  function addFiles(list: FileList | null) {
    const add = Array.from(list || []).filter(x => x.type.startsWith('image/')).map(file => ({ file, preview: URL.createObjectURL(file) })); if (!add.length) return
    setNews(n => [...n, ...add]); if (!items.length) setMain('new:0')
  }
  function removeItem(it: Item) {
    if (it.kind === 'old') setOld(o => o.filter((_, i) => i !== it.i))
    else { setNews(n => n.filter((_, i) => i !== it.i)); if (main.startsWith('new:')) { const j = +main.slice(4); setMain(j === it.i ? '' : j > it.i ? 'new:' + (j - 1) : main) } }
    if (main === it.key) setMain('')
  }
  async function save(another: boolean) {
    setErr(''); const code = f.code.trim(), name = f.name.trim(), price = Math.round(+f.price)
    if (!code) return setErr('Enter the dress code.'); if (!name) return setErr('Enter the dress name.'); if (!(price > 0)) return setErr('Enter the rent amount.')
    setBusy(true)
    try {
      const up = (p: string, b: Blob) => ctx.sb.storage.from('dress-images').upload(p, b, { cacheControl: '31536000', contentType: 'image/jpeg' }), url = (p: string) => ctx.sb.storage.from('dress-images').getPublicUrl(p).data.publicUrl
      const entries: { key: string; url: string; thumb: string; medium: string }[] = old.map(o => ({ key: o.url, ...o }))
      for (const [i, n] of news.entries()) {
        ctx.say(`Uploading photo ${i + 1} of ${news.length}…`)
        try { const z = await makeSizes(n.file), base = `${Date.now()}-${i}`
          const [o, m, t] = await Promise.all([up(`${base}.jpg`, z.original), up(`m-${base}.jpg`, z.medium), up(`t-${base}.jpg`, z.thumb)])
          if (o.error) { setErr('A photo could not be uploaded. Please try again.'); setBusy(false); return }
          entries.push({ key: 'new:' + i, url: url(`${base}.jpg`), thumb: m.error || t.error ? '' : url(`t-${base}.jpg`), medium: m.error ? '' : url(`m-${base}.jpg`) })
        } catch { setErr('A photo could not be read. Please choose it again.'); setBusy(false); return }
      }
      const at = entries.findIndex(e => e.key === mainKey); if (at > 0) entries.unshift(...entries.splice(at, 1))     // the main photo goes first
      let final = tags; if (!final.length) final = (await autoColours(`${f.colour} ${f.name} ${f.description}`, photoSrc())).tags; if (!final.length) final = ['Other']
      const sz = [...sizes, ...more.split(',').map(x => x.trim()).filter(Boolean)].filter((x, i, a) => a.indexOf(x) === i)
      const body = { code, name, category: f.category, colour: f.colour.trim() || final.join(', '), colour_tags: final, acquired_on: f.acquired || null, sizes: sz, price, included_days: Math.round(+f.days) || 3, extra_day_fee: Math.round(+f.extra) || 0, dry_clean_charge: Math.round(+f.dcc) || 0, description: f.description.trim(),
        images: entries.map(e => e.url), thumbs: entries.map(e => e.thumb), medium: entries.map(e => e.medium), try_on_image: entries[0]?.url || null }
      const { error } = ed ? await ctx.sb.from('dresses').update(body).eq('id', ed.id) : await ctx.sb.from('dresses').insert(body)
      if (error) { setErr(error.message.includes('duplicate') ? 'That code is already used by another dress.' : error.message); setBusy(false); return }
      ctx.say(ed ? `${code} saved` : `${code} added`); ctx.load()
      if (another && !ed) { news.forEach(n => URL.revokeObjectURL(n.preview)); setF({ ...blank, category: f.category }); setSizes([]); setMore(''); setOld([]); setNews([]); setMain(''); setTags([]); setTouched(false); setNote(''); setBusy(false); document.getElementById('dress-form-top')?.scrollIntoView() }
      else onClose()
    } catch { setErr('Something went wrong. Please try again.'); setBusy(false) }
  }
  return (<div style={{ position: 'fixed', inset: 0, background: '#0007', zIndex: 55, overflow: 'auto', padding: 14 }}>
    <div style={{ background: 'var(--bg)', maxWidth: 920, margin: '0 auto', padding: 18 }}><div id="dress-form-top" />
      <div className="row"><h3 style={{ margin: 0, fontSize: 26 }}>{ed ? `Edit ${ed.code}` : 'Add a dress'}</h3><button className="btn alt sm" onClick={onClose}>Close</button></div>
      {ed && <p className="mut" style={{ fontSize: 12, margin: '4px 0 0' }}>Changing the code or any detail updates it everywhere. Existing bookings stay linked to this dress.</p>}
      <div className="box">{head(1, 'Photos', 'The main photo is shown first on the website. Photos are resized automatically so the site stays fast.')}
        <label className="btn sm" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 10 }}>＋ Add photos<input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{items.map(it => <div key={it.key} style={{ width: 118, textAlign: 'center', border: `2px solid ${it.key === mainKey ? 'var(--gold)' : 'var(--line)'}`, padding: 4 }}>
          <img src={it.src} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
          <button type="button" className={'btn sm' + (it.key === mainKey ? '' : ' alt')} style={{ width: '100%', marginTop: 4, padding: '5px 4px' }} onClick={() => setMain(it.key)}>{it.key === mainKey ? '★ Main photo' : 'Make main'}</button>
          <button type="button" className="btn alt sm" style={{ width: '100%', marginTop: 4, padding: '4px' }} onClick={() => removeItem(it)}>Remove</button></div>)}
          {!items.length && <span className="mut" style={{ fontSize: 13 }}>No photos yet.</span>}</div></div>
      <div className="box">{head(2, 'Basics')}<div style={grid}><div>{lab('Code', true)}<input value={f.code} onChange={e => set('code', e.target.value)} placeholder="e.g. LH0022166" /></div><div>{lab('Name', true)}<input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Royal Maroon Bridal Lehenga" /></div>
        <div>{lab('Category')}<select value={f.category} onChange={e => set('category', e.target.value)}>{CATS.map(c => <option key={c} value={c}>{c} → {mainCatOf(c)}</option>)}</select></div></div></div>
      <div className="box">{head(3, 'Pricing')}<div style={grid}><div>{lab('Rent (₹)', true)}<input type="number" min="0" value={f.price} onChange={e => set('price', e.target.value)} /></div><div>{lab('Days included')}<input type="number" min="1" value={f.days} onChange={e => set('days', e.target.value)} /></div>
        <div>{lab('Extra day (₹)')}<input type="number" min="0" value={f.extra} onChange={e => set('extra', e.target.value)} /></div><div>{lab('Dry-cleaning charge per wash (₹)')}<input type="number" min="0" value={f.dcc} onChange={e => set('dcc', e.target.value)} /></div></div></div>
      <div className="box">{head(4, 'Details')}{lab('Sizes')}<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>{SIZES.map(s => <button type="button" key={s} className={'tagchip' + (sizes.includes(s) ? ' on' : '')} onClick={() => setSizes(sizes.includes(s) ? sizes.filter(x => x !== s) : [...sizes, s])}>{s}</button>)}</div>
        <input value={more} onChange={e => setMore(e.target.value)} placeholder="Other sizes, separated by commas (optional)" />
        <div style={grid}><div>{lab('Colour in words (optional)')}<input value={f.colour} onChange={e => set('colour', e.target.value)} placeholder="e.g. maroon and gold" /></div><div>{lab('Acquired on (optional)')}<input type="date" value={f.acquired} onChange={e => set('acquired', e.target.value)} /></div></div>
        {lab('Description (optional)')}<textarea rows={3} value={f.description} onChange={e => set('description', e.target.value)} /></div>
      <div className="box">{head(5, 'Colours', 'Used by the colour filter on the website. They are filled in for you; change them if they are wrong.')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 8px' }}>{COLOURS.map(c => <button type="button" key={c.label} className={'tagchip' + (tags.includes(c.label) ? ' on' : '')} onClick={() => { setTouched(true); setTags(tags.includes(c.label) ? tags.filter(x => x !== c.label) : [...tags, c.label]) }}><i style={{ width: 14, height: 14, background: c.css, border: '1px solid #8886', display: 'inline-block' }} />{c.label}</button>)}</div>
        <span className="mut" style={{ fontSize: 12 }}>{touched ? 'Chosen by you.' : note || 'Add a photo or type the colour and the colours appear here.'}</span> {touched && <button type="button" className="btn alt sm" onClick={() => setTouched(false)}>Work out again</button>}</div>
      {err && <p className="bad" style={{ margin: '10px 0 0' }}><b>{err}</b></p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0' }}><button className="btn" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : ed ? 'Save changes' : 'Save dress'}</button>
        {!ed && <button className="btn alt" disabled={busy} onClick={() => save(true)}>Save and add another</button>}<button className="btn alt" disabled={busy} onClick={onClose}>Cancel</button></div>
    </div></div>)
}
