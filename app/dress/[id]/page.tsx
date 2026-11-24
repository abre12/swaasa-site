import { notFound } from 'next/navigation'
import { supaServer } from '@/lib/supabase/server'
import { inr } from '@/lib/util'
import BookingFlow from '@/components/BookingFlow'
import Gallery from '@/components/Gallery'
import BookedDates from '@/components/BookedDates'
import { signDressImageValues } from '@/lib/dressImages'
export const dynamic = 'force-dynamic'
export default async function DressPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params; const sp = await searchParams
  const sb = await supaServer()
  // Fetch everything at the same time instead of one after another (each call has a round trip to the database).
  const [{ data: d }, { data: s }, { data: { user } }] = await Promise.all([sb.from('dresses').select('*').eq('id', id).maybeSingle(), sb.from('settings').select('advance_pct,advance_min,tailor_days').single(), sb.auth.getUser()])
  if (!d) notFound()
  const [images, medium, thumbs] = await Promise.all([
    signDressImageValues(sb, d.images || [], 3600),
    signDressImageValues(sb, d.medium || [], 3600),
    signDressImageValues(sb, d.thumbs || [], 3600),
  ])
  const dress = { ...d, images, medium, thumbs }
  const { data: st } = user ? await sb.from('staff').select('role').eq('user_id', user.id).maybeSingle() : { data: null }
  const viewOnly = st?.role === 'preparation'           // preparation staff can look, not book
  const left = <div className="bk-card"><Gallery images={dress.images || []} medium={dress.medium || []} thumbs={dress.thumbs || []} name={dress.name} />
    <h2 style={{ fontSize: 24, margin: '14px 0 2px' }}>{dress.name}</h2><span className="mut">{dress.code} · {dress.category}</span>
    <div style={{ margin: '12px 0' }}><div className="row"><span>Rental ({dress.included_days} days)</span><b>{inr(dress.price)}</b></div>
      <div className="row"><span>Extra day (per day)</span><span>{inr(dress.extra_day_fee)}</span></div></div>
    <p className="mut" style={{ fontSize: 13, margin: 0 }}>{dress.policy || 'Cleaning included. Damage beyond normal wear is charged at repair cost.'}</p>
    <details className="bk-more"><summary>Dress details</summary>
      {dress.description && <p>{dress.description}</p>}<p className="mut" style={{ fontSize: 13 }}>Colour: {dress.colour} · Sizes: {dress.sizes?.join(', ')}<br />Alterations: {dress.alterations || 'On request'}</p></details>
    <BookedDates dressId={dress.id} /></div>
  const info = <details className="bf-dd" open><summary>Dress details</summary>{dress.description && <p>{dress.description}</p>}
    <dl><div><dt>Colour</dt><dd>{dress.colour}</dd></div><div><dt>Sizes</dt><dd>{dress.sizes?.join(', ')}</dd></div><div><dt>Alterations</dt><dd>{dress.alterations || 'On request'}</dd></div></dl></details>
  if (viewOnly || !st) return (<section className="sec"><div className="bk-top"><h1>{dress.name}</h1><span className="chip-id">Dress ID: {dress.code}</span></div><div className="bk-page"><div>{left}</div><div><p className="mut">Your login can view dresses but not make bookings.</p></div></div></section>)
  return <BookingFlow dress={dress} advancePct={s?.advance_pct ?? 50} advanceMin={s?.advance_min ?? 1000} tailorDays={s?.tailor_days ?? 3} staff={st.role} initialFrom={sp.from} initialTo={sp.to} left={left} info={info} />
}
