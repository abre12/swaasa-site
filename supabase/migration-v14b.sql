-- v14: expose staff booking and event dates in the existing booking details view.
-- Keep every existing output column in place; append new fields for compatibility.

create or replace view public.booking_view
with (security_invoker = true)
as
select
  b.id,
  b.dress_id,
  b.customer_name,
  b.phone,
  b.email,
  b.notes,
  b.start_date,
  b.end_date,
  b.rent,
  b.discount,
  b.charges,
  b.deposit,
  b.status,
  b.gap_override,
  b.hold,
  b.picked_up_at,
  b.returned_at,
  b.log,
  b.created_at,
  b.alteration_notes,
  b.alteration_updated_at,
  b.alteration_updated_by,
  b.prep_status,
  b.late_fee,
  b.damage_charge,
  b.return_notes,
  b.taken_by,
  b.prepared_by,
  b.prepared_at,
  b.delivered_by,
  b.returned_by,
  b.custom_charge,
  d.code as dress_code,
  d.name as dress_name,
  d.category,
  (coalesce(rp.rent_in, 0::bigint) - coalesce(rp.rent_out, 0::bigint))::integer as paid,
  (coalesce(rp.dep_in, 0::bigint) - coalesce(rp.dep_out, 0::bigint))::integer as deposit_held,
  coalesce(rp.rent_out, 0::bigint)::integer as rent_refunded,
  b.booking_date,
  b.event_type,
  b.event_date
from public.bookings b
join public.dresses d on d.id = b.dress_id
left join lateral (
  select
    sum(p.amount) filter (where p.kind = any (array['rent'::text, 'charge'::text])) as rent_in,
    sum(p.amount) filter (where p.kind = 'rent_refund'::text) as rent_out,
    sum(p.amount) filter (where p.kind = 'deposit'::text) as dep_in,
    sum(p.amount) filter (where p.kind = any (array['deposit_refund'::text, 'charge'::text])) as dep_out
  from public.payments p
  where p.booking_id = b.id
) rp on true;
