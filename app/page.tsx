import Link from 'next/link'
import { supaServer } from '@/lib/supabase/server'
import { COLOURS, inr, MAIN_CATS } from '@/lib/util'
import Hero from '@/components/Hero'
export const dynamic = 'force-dynamic'
type P = Record<string, string | undefined>
const href = (p: P) => { const u = new URLSearchParams(); Object.entries(p).forEach(([k, v]) => v && u.set(k, v)); const s = u.toString(); return (s ? `/?${s}` : '/') + '#collection' }
const CSS = `.band{background:#000;color:#f4ecdc;padding:6px 16px 34px}.band .in{max-width:1280px;margin:0 auto}
.cats{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 34px;padding:18px 0 22px}
.cats a{font:500 clamp(18px,3.6vw,34px)/1.1 "Cormorant Garamond",Georgia,serif;letter-spacing:.06em;color:#9b9384;text-decoration:none;padding:4px 2px;border-bottom:2px solid transparent}
.cats a:hover{color:#f4ecdc}.cats a.on{color:#fff;border-bottom-color:#d2b074}
.sw{display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:10px}
.sw a{display:flex;flex-direction:column;align-items:stretch;gap:5px;text-decoration:none;color:#b9b2a3;font-size:11px;text-align:center;letter-spacing:.04em}
.sw a i{display:block;height:92px;border:3px solid #5b0f1c}.sw a:hover i{border-color:#d2b074}.sw a.on i{border-color:#fff;outline:3px solid #d2b074;outline-offset:2px}.sw a.on{color:#fff;font-weight:600}
.cnt{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px}.cnt a{font-size:12px;letter-spacing:.16em;text-transform:uppercase;border-bottom:1px solid var(--ink);text-decoration:none}
.dress .dots{display:flex;gap:4px;margin:4px 0}.dress .dots i{width:11px;height:11px;border:1px solid #8884;border-radius:50%;display:inline-block}.dress .cta{font-size:11px;letter-spacing:.16em;text-transform:uppercase;border-bottom:1px solid var(--ink)}`
export default async function Home({ searchParams }: { searchParams: P }) {
  const sb = supaServer(); const { q, cat, colour, sort, max, from, to } = searchParams
  const main = MAIN_CATS.find(m => m.key === cat), okDates = !!(from && to && to >= from)
  let query = sb.from('dresses').select('id,code,name,category,price,images,status,colour_tags').in('status', ['available', 'maintenance'])
  if (main) query = query.in('category', main.subs)
  if (colour && COLOURS.some(c => c.label === colour)) query = query.contains('colour_tags', [colour])
  if (max && +max > 0) query = query.lte('price', +max)
  if (q) { const t = q.replace(/[%,()]/g, ''); query = query.or(`name.ilike.%${t}%,code.ilike.%${t}%`) }
  if (okDates) { const { data: bad } = await sb.rpc('dresses_unavailable', { p_from: from, p_to: to }); if (bad?.length) query = query.not('id', 'in', `(${bad.join(',')})`) }   // free for the WHOLE period, cleaning day included
  query = sort === 'pl' ? query.order('price') : sort === 'ph' ? query.order('price', { ascending: false }) : sort === 'pop' ? query.order('popularity', { ascending: false }) : query.order('created_at', { ascending: false })
  const { data: dresses } = await query
  const cur: P = { q, cat, colour, sort, max, from, to }, any = !!(q || cat || colour || max || (okDates))
  return (<>
    <Hero /><style>{CSS}</style>
    <section className="band"><div className="in">
      <nav className="cats" aria-label="Categories">{MAIN_CATS.map(m => <Link key={m.key} href={href({ ...cur, cat: cat === m.key ? undefined : m.key })} className={cat === m.key ? 'on' : ''} aria-current={cat === m.key}>{m.label}</Link>)}</nav>
      <div className="sw" role="list" aria-label="Colours">{COLOURS.map(c => <Link key={c.label} role="listitem" title={c.label} aria-label={`${c.label}${colour === c.label ? ' (selected)' : ''}`} href={href({ ...cur, colour: colour === c.label ? undefined : c.label })} className={colour === c.label ? 'on' : ''}><i style={{ background: c.css }} />{c.label}</Link>)}</div></div></section>
    <section className="sec" id="collection"><h2>The collection</h2>
      <form className="flt">{cat && <input type="hidden" name="cat" value={cat} />}{colour && <input type="hidden" name="colour" value={colour} />}
        <input name="q" placeholder="Search name or ID" defaultValue={q} />
        <input name="max" type="number" placeholder="Max ₹" defaultValue={max} style={{ width: 90 }} />
        <select name="sort" defaultValue={sort}><option value="">Newest</option><option value="pl">Price: low</option><option value="ph">Price: high</option><option value="pop">Popular</option></select>
        <label className="mut" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>Free from<input name="from" type="date" defaultValue={from} /></label>
        <label className="mut" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>to<input name="to" type="date" defaultValue={to} /></label>
        <button className="btn sm">Apply</button></form>
      <div className="cnt"><b>{dresses?.length || 0} dress{dresses?.length === 1 ? '' : 'es'} {any ? 'match your filters' : 'in the collection'}{main ? ` · ${main.label}` : ''}{colour ? ` · ${colour}` : ''}{okDates ? ` · free ${from} to ${to}` : ''}</b>{any && <Link href="/#collection">Clear all filters</Link>}</div>
      <div className="grid">{(dresses || []).map((d: any) => (
        <Link key={d.id} href={`/dress/${d.id}${okDates ? `?from=${from}&to=${to}` : ''}`} className="dress"><div className="ph" style={d.images?.[0] ? { backgroundImage: `url(${d.images[0]})` } : {}} />
          <span className="mut" style={{ fontSize: 12 }}>{d.code} · {d.category}</span><b>{d.name}</b>
          {!!d.colour_tags?.length && <span className="dots">{d.colour_tags.slice(0, 5).map((t: string) => <i key={t} title={t} style={{ background: COLOURS.find(c => c.label === t)?.css || '#bbb' }} />)}</span>}
          <span>{inr(d.price)}</span> <span className="cta">Check availability</span></Link>))}
        {!dresses?.length && <p className="mut">No dresses match these filters. Try removing a filter or changing the dates.</p>}</div></section></>)
}
