import { notFound } from 'next/navigation'
import { supaServer } from '@/lib/supabase/server'
import { inr } from '@/lib/util'
import BookingFlow from '@/components/BookingFlow'
import Gallery from '@/components/Gallery'
import BookedDates from '@/components/BookedDates'
export const dynamic = 'force-dynamic'
export default async function DressPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) {
  const sb = supaServer()
  // Fetch everything at the same time instead of one after another (each call has a round trip to the database).
  const [{ data: d }, { data: s }, { data: { user } }] = await Promise.all([sb.from('dresses').select('*').eq('id', params.id).maybeSingle(), sb.from('settings').select('advance_pct,advance_min,tailor_days').single(), sb.auth.getUser()])
  if (!d) notFound()
  const { data: st } = user ? await sb.from('staff').select('role').eq('user_id', user.id).maybeSingle() : { data: null }
  const viewOnly = st?.role === 'preparation'           // preparation staff can look, not book
  const left = <div className="bk-card"><Gallery images={d.images || []} medium={d.medium || []} thumbs={d.thumbs || []} name={d.name} />
    <h2 style={{ fontSize: 24, margin: '14px 0 2px' }}>{d.name}</h2><span className="mut">{d.code} · {d.category}</span>
    <div style={{ margin: '12px 0' }}><div className="row"><span>Rental ({d.included_days} days)</span><b>{inr(d.price)}</b></div>
      <div className="row"><span>Extra day (per day)</span><span>{inr(d.extra_day_fee)}</span></div></div>
    <p className="mut" style={{ fontSize: 13, margin: 0 }}>{d.policy || 'Cleaning included. Damage beyond normal wear is charged at repair cost.'}</p>
    <details className="bk-more"><summary>Dress details</summary>
      {d.description && <p>{d.description}</p>}<p className="mut" style={{ fontSize: 13 }}>Colour: {d.colour} · Sizes: {d.sizes?.join(', ')}<br />Alterations: {d.alterations || 'On request'}</p></details>
    <BookedDates dressId={d.id} /></div>
  const info = <details className="bf-dd" open><summary>Dress details</summary>{d.description && <p>{d.description}</p>}
    <dl><div><dt>Colour</dt><dd>{d.colour}</dd></div><div><dt>Sizes</dt><dd>{d.sizes?.join(', ')}</dd></div><div><dt>Alterations</dt><dd>{d.alterations || 'On request'}</dd></div></dl></details>
  if (viewOnly || !st) return (<section className="sec"><div className="bk-top"><h1>{d.name}</h1><span className="chip-id">Dress ID: {d.code}</span></div><div className="bk-page"><div>{left}</div><div><p className="mut">Your login can view dresses but not make bookings.</p></div></div></section>)
  return <BookingFlow dress={d} advancePct={s?.advance_pct ?? 50} advanceMin={s?.advance_min ?? 1000} tailorDays={s?.tailor_days ?? 3} staff={st.role} initialFrom={searchParams.from} initialTo={searchParams.to} left={left} info={info} />
}
