import Link from 'next/link'
import { supaServer } from '@/lib/supabase/server'
import { COLOURS, inr, MAIN_CATS } from '@/lib/util'
import { COLOUR_WORDS } from '@/lib/colours'
import ReelsCarousel from '@/components/ReelsCarousel'
import { INSTAGRAM_URL, REELS } from '@/lib/reels'
export const dynamic = 'force-dynamic'
type P = Record<string, string | undefined>
const SHORT: Record<string, string> = { 'Beige / Cream': 'Cream', 'Floral / Multicolour': 'Floral' }   // on-screen labels only; the full name is the tooltip
const href = (p: P) => { const u = new URLSearchParams(); Object.entries(p).forEach(([k, v]) => v && u.set(k, v)); const s = u.toString(); return (s ? `/collection?${s}` : '/collection') + '#collection' }
const pretty = (t: string) => t.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())      // LEHENGAS -> Lehengas, OTHER OCCASIONS -> Other Occasions
const ico = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const hico = { ...ico, width: 20, height: 20, strokeWidth: 1.8 }
export default async function Collection({ searchParams }: { searchParams: P }) {
  const sb = supaServer(); const { q, cat, colour, sort, max, from, to } = searchParams
  const main = MAIN_CATS.find(m => m.key === cat), okDates = !!(from && to && to >= from)
  let query = sb.from('dresses').select('id,code,name,category,price,images,thumbs,status,colour_tags').in('status', ['available', 'maintenance'])
  if (main) query = query.in('category', main.subs)
  if (colour && COLOURS.some(c => c.label === colour)) query = query.or([`colour_tags.cs.{"${colour}"}`, ...(COLOUR_WORDS[colour] || []).map(w => `colour.ilike.%${w}%`)].join(','))     // saved colour tags, or the colour words typed for the dress
  if (max && +max > 0) query = query.lte('price', +max)
  if (q) { const t = q.replace(/[%,()]/g, ''); query = query.or(`name.ilike.%${t}%,code.ilike.%${t}%`) }
  if (okDates) { const { data: bad } = await sb.rpc('dresses_unavailable', { p_from: from, p_to: to }); if (bad?.length) query = query.not('id', 'in', `(${bad.join(',')})`) }   // free for the WHOLE period, cleaning day included
  query = sort === 'pl' ? query.order('price') : sort === 'ph' ? query.order('price', { ascending: false }) : sort === 'pop' ? query.order('popularity', { ascending: false }) : query.order('created_at', { ascending: false })
  // Each "Browse by Category" card shows the newest dress photo in that category and how many dresses it has.
  const catInfo = Promise.all(MAIN_CATS.map(async m => {
    const { data, count } = await sb.from('dresses').select('thumbs,images', { count: 'exact' }).in('category', m.subs).in('status', ['available', 'maintenance']).order('created_at', { ascending: false }).limit(8)
    const d = (data || []).find((x: any) => x.thumbs?.[0] || x.images?.[0])
    return { pic: (d?.thumbs?.[0] || d?.images?.[0] || null) as string | null, n: count ?? data?.length ?? 0 }
  }))
  const [{ data: dresses }, info] = await Promise.all([query, catInfo])
  const cur: P = { q, cat, colour, sort, max, from, to }, any = !!(q || cat || colour || max || (okDates))
  const FEATURES = [
    { t: 'Flexible Rental Dates', i: <svg {...ico}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg> },
    { t: 'Premium Collection', i: <svg {...ico}><path d="M9 3h6l1 4-4 3-4-3 1-4Z" /><path d="M8 8.5 5 20h14l-3-11.5" /></svg> },
    { t: 'Alteration Support', i: <svg {...ico}><circle cx="6" cy="6.5" r="2.4" /><circle cx="6" cy="17.5" r="2.4" /><path d="M20 4 8 15.2M20 20 8 8.8" /></svg> },
    { t: 'Secure Booking', i: <svg {...ico}><path d="M12 3 4.5 6v5.5c0 4.4 3 7.9 7.5 9.5 4.5-1.6 7.5-5.1 7.5-9.5V6L12 3Z" /><path d="m8.8 12 2.4 2.4 4-4.6" /></svg> },
  ]
  const chips: { label: string; to: string }[] = []
  if (main) chips.push({ label: pretty(main.label), to: href({ ...cur, cat: undefined }) })
  if (colour) chips.push({ label: colour, to: href({ ...cur, colour: undefined }) })
  if (max && +max > 0) chips.push({ label: `Up to ${inr(+max)}`, to: href({ ...cur, max: undefined }) })
  if (q) chips.push({ label: `“${q}”`, to: href({ ...cur, q: undefined }) })
  if (okDates) chips.push({ label: `Free ${from} to ${to}`, to: href({ ...cur, from: undefined, to: undefined }) })
  const hanger = <svg {...ico} width={30} height={30}><path d="M12 7.5V6.2a2 2 0 1 1 2 2" /><path d="m12 8.2-8.4 6a1.4 1.4 0 0 0 .8 2.6h15.2a1.4 1.4 0 0 0 .8-2.6L12 8.2Z" /></svg>
  const n = dresses?.length || 0
  return (<div className="cl-page">
    <header className="cl-hd"><div className="cl-in">
      <Link href="/collection" className="cl-logo"><img src="/logo-mark.png" alt="" /><span><b>Swaasa</b><small>Wedding Rentals</small></span></Link>
      <div className="cl-tools">
        <a className="cl-ic" href="#collection" aria-label="Search the collection"><svg {...hico}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg></a>
        <Link className="cl-ic" href="/admin" aria-label="Staff dashboard"><svg {...hico}><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20c.6-3.7 3.5-5.6 7.2-5.6s6.6 1.9 7.2 5.6" /></svg></Link>
        <a className="cl-book" href="#collection">Book Now</a>
      </div></div></header>
    <div className="cl-in">
      <section className="cl-top">
        <div className="cl-hero">
          <div className="cl-hero-txt"><span className="cl-eyebrow">Bridal Dresses <i>•</i> Lehengas <i>•</i> Gowns</span>
            <h1>Rent Your<br />Dream Look</h1><p>A curated collection of bridal and special occasion wear, made for your big moments.</p></div>
          <div className="cl-hero-img" aria-hidden="true"><img src="/collection-hero.jpg" alt="" /></div>
        </div>
        <ul className="cl-feat">{FEATURES.map(f => <li key={f.t}>{f.i}<span>{f.t}</span></li>)}</ul>
      </section>
      <section className="cl-shop" id="collection" aria-label="The collection">
        <div className="cl-shop-cats"><h2>Browse by Category</h2>
          <nav className="cl-cats" aria-label="Categories">{MAIN_CATS.map((m, i) => {
            const c = info[i], inner = <><span className="pic">{c.pic ? <img src={c.pic} alt="" loading="lazy" decoding="async" /> : hanger}</span><span className="nm">{pretty(m.label)}</span><small>{c.n ? `${c.n} dress${c.n === 1 ? '' : 'es'}` : 'Coming soon'}</small></>
            return c.n || cat === m.key ? <Link key={m.key} href={href({ ...cur, cat: cat === m.key ? undefined : m.key })} className={cat === m.key ? 'on' : ''} aria-current={cat === m.key}>{inner}</Link> : <div key={m.key} className="off" aria-disabled="true">{inner}</div>
          })}</nav>
          <div className="cl-sw" role="list" aria-label="Filter by colour">{COLOURS.map(c => <Link key={c.label} role="listitem" title={c.label} aria-label={`${c.label}${colour === c.label ? ' (selected)' : ''}`} href={href({ ...cur, colour: colour === c.label ? undefined : c.label })} className={colour === c.label ? 'on' : ''}><i style={{ background: c.css }} /><b>{SHORT[c.label] || c.label}</b></Link>)}</div>
        </div>
        <div className="cl-shop-main">
          <div className="cl-shop-head"><h2>The collection</h2><p><b>{n}</b> dress{n === 1 ? '' : 'es'} {any ? 'match your filters' : 'in the collection'}</p></div>
          <form className="cl-flt">{cat && <input type="hidden" name="cat" value={cat} />}{colour && <input type="hidden" name="colour" value={colour} />}
            <input name="q" placeholder="Search name or ID" aria-label="Search name or ID" defaultValue={q} />
            <input name="max" type="number" placeholder="Max ₹" aria-label="Maximum price" defaultValue={max} style={{ width: 96 }} />
            <select name="sort" aria-label="Sort" defaultValue={sort}><option value="">Newest</option><option value="pl">Price: low</option><option value="ph">Price: high</option><option value="pop">Popular</option></select>
            <label>Free from<input name="from" type="date" defaultValue={from} /></label>
            <label>to<input name="to" type="date" defaultValue={to} /></label>
            <button className="cl-apply">Apply</button></form>
          {any && <div className="cl-chips" aria-label="Active filters">{chips.map(c => <Link key={c.label} href={c.to} aria-label={`Remove filter ${c.label}`}>{c.label}<span aria-hidden="true">×</span></Link>)}<Link className="all" href="/collection#collection">Clear all</Link></div>}
          <div className="cl-grid">{(dresses || []).map((d: any, i: number) => (
            <Link key={d.id} href={`/dress/${d.id}${okDates ? `?from=${from}&to=${to}` : ''}`} className="cl-card"><div className="ph">{(d.thumbs?.[0] || d.images?.[0]) && <img src={d.thumbs?.[0] || d.images[0]} alt={d.name} loading={i < 4 ? 'eager' : 'lazy'} decoding="async" />}</div>
              <span className="cd">{d.code} · {d.category}</span><b className="nm">{d.name}</b>
              {!!d.colour_tags?.length && <span className="dots">{d.colour_tags.slice(0, 5).map((t: string) => <i key={t} title={t} style={{ background: COLOURS.find(c => c.label === t)?.css || '#bbb' }} />)}</span>}
              <span className="pr"><b>{inr(d.price)}</b><em>Check availability</em></span></Link>))}
            {!n && <p className="cl-none">No dresses match these filters. Try removing a filter or changing the dates.</p>}</div>
        </div>
      </section>
      <ReelsCarousel reels={REELS} instagram={INSTAGRAM_URL} />
    </div>
  </div>)
}
