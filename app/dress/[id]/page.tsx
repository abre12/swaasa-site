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
  // Fetch everything at the same time instead of one after another (each call has a round trip to the database).
  const [{ data: d }, { data: s }, { data: { user } }] = await Promise.all([sb.from('dresses').select('*').eq('id', params.id).maybeSingle(), sb.from('settings').select('advance_pct,advance_min').single(), sb.auth.getUser()])
  if (!d) notFound()
  const { data: st } = user ? await sb.from('staff').select('role').eq('user_id', user.id).maybeSingle() : { data: null }
  const viewOnly = st?.role === 'preparation'           // preparation staff can look, not book
  return (<section className="sec"><div className="two">
    <div><Gallery images={d.images || []} medium={d.medium || []} thumbs={d.thumbs || []} name={d.name} />
      <BookedDates dressId={d.id} />
      <TryOn dressId={d.id} hasImage={!!process.env.FASHN_API_KEY && !!(d.try_on_image || d.images?.length)} /></div>
    <div><span className="mut">{d.code} · {d.category}</span><h1 style={{ fontSize: 40 }}>{d.name}</h1><p>{d.description}</p>
      <p className="mut">Colour: {d.colour} · Sizes: {d.sizes?.join(', ')}<br />Alterations: {d.alterations || 'On request'}</p>
      <div className="row"><span>Rental ({d.included_days} days)</span><b>{inr(d.price)}</b></div>
      <div className="row"><span>Extra day</span><span>{inr(d.extra_day_fee)}</span></div>
      <p className="mut" style={{ fontSize: 12 }}>{d.policy || 'Cleaning included. Damage beyond normal wear is charged at repair cost.'}</p>
      {viewOnly ? <p className="mut">Your login can view dresses but not make bookings.</p> : <Booking dress={d} advancePct={s?.advance_pct ?? 50} advanceMin={s?.advance_min ?? 1000} staff={st?.role ?? null} initialFrom={searchParams.from} initialTo={searchParams.to} />}</div></div></section>)
}
