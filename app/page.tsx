import Link from 'next/link'
import { supaServer } from '@/lib/supabase/server'
import { CATS, inr } from '@/lib/util'
export const dynamic = 'force-dynamic'
export default async function Home({ searchParams }: { searchParams: Record<string, string> }) {
  const sb = supaServer(); const { q, cat, sort, max } = searchParams
  let query = sb.from('dresses').select('id,code,name,category,price,images,status').in('status', ['available', 'maintenance'])
  if (cat) query = query.eq('category', cat)
  if (max) query = query.lte('price', +max)
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,]/g, '')}%,code.ilike.%${q.replace(/[%,]/g, '')}%`)
  query = sort === 'pl' ? query.order('price') : sort === 'ph' ? query.order('price', { ascending: false }) : sort === 'pop' ? query.order('popularity', { ascending: false }) : query.order('created_at', { ascending: false })
  const { data: dresses } = await query
  return (<>
    <section className="hero"><img src="/logo-full.jpg" alt="Swaasa" /><h1>Bridal couture, on rent</h1><p className="mut">Gowns, lehengas and bridal sarees · Trivandrum</p></section>
    <section className="sec" id="collection"><h2>The collection</h2>
      <form className="flt"><input name="q" placeholder="Search name or ID" defaultValue={q} />
        <select name="cat" defaultValue={cat}><option value="">All categories</option>{CATS.map(c => <option key={c}>{c}</option>)}</select>
        <input name="max" type="number" placeholder="Max ₹" defaultValue={max} style={{ width: 90 }} />
        <select name="sort" defaultValue={sort}><option value="">Newest</option><option value="pl">Price: low</option><option value="ph">Price: high</option><option value="pop">Popular</option></select>
        <button className="btn sm">Apply</button></form>
      <div className="grid">{(dresses || []).map((d: any) => (
        <Link key={d.id} href={`/dress/${d.id}`} className="dress"><div className="ph" style={d.images?.[0] ? { backgroundImage: `url(${d.images[0]})` } : {}} />
          <span className="mut" style={{ fontSize: 12 }}>{d.code} · {d.category}</span><b>{d.name}</b><span>{inr(d.price)}</span></Link>))}
        {!dresses?.length && <p className="mut">No dresses found.</p>}</div></section></>)
}
