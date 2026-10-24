import { notFound } from 'next/navigation'
import { supaServer } from '@/lib/supabase/server'
import { inr } from '@/lib/util'
import Booking from '@/components/Booking'
import TryOn from '@/components/TryOn'
import Gallery from '@/components/Gallery'
import BookedDates from '@/components/BookedDates'
export const dynamic = 'force-dynamic'
export default async function DressPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) {
  const sb = supaServer()
  const { data: d } = await sb.from('dresses').select('*').eq('id', params.id).maybeSingle()
  if (!d) notFound()
  const { data: s } = await sb.from('settings').select('advance_pct').single()
  const { data: { user } } = await sb.auth.getUser()
  const { data: st } = user ? await sb.from('staff').select('role').eq('user_id', user.id).maybeSingle() : { data: null }
  return (<section className="sec"><div className="two">
    <div><Gallery images={d.images || []} name={d.name} />
      <BookedDates dressId={d.id} />
      <TryOn dressId={d.id} hasImage={!!process.env.FASHN_API_KEY && !!(d.try_on_image || d.images?.length)} /></div>
    <div><span className="mut">{d.code} · {d.category}</span><h1 style={{ fontSize: 40 }}>{d.name}</h1><p>{d.description}</p>
      <p className="mut">Colour: {d.colour} · Sizes: {d.sizes?.join(', ')}<br />Alterations: {d.alterations || 'On request'}</p>
      <div className="row"><span>Rental ({d.included_days} days)</span><b>{inr(d.price)}</b></div>
      <div className="row"><span>Extra day</span><span>{inr(d.extra_day_fee)}</span></div>
      <div className="row"><span>Refundable deposit</span><span>{inr(d.deposit)}</span></div>
      <p className="mut" style={{ fontSize: 12 }}>{d.policy || 'Cleaning included. Damage beyond normal wear is charged at repair cost.'}</p>
      <Booking dress={d} advancePct={s?.advance_pct ?? 30} staff={st?.role ?? null} initialFrom={searchParams.from} initialTo={searchParams.to} /></div></div></section>)
}
