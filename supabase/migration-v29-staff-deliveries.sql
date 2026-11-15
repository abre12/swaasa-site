-- Migration v29: actual deliveries per staff member per month, for the Team Momentum chart. ADDITIVE (one new read-only function).
-- Run it in Supabase > SQL Editor. Safe to run more than once. Run it BEFORE or after deploying the website: until it is run,
-- the chart counts deliveries from the last 90 days of bookings that the device already holds.
--
-- A delivery = a booking that was really handed over (picked_up_at is set), counted in the month it was handed over (IST),
-- by the staff member who recorded it (delivered_by).
create or replace function staff_deliveries_per_month() returns table(month text, delivered_by uuid, n int)
language sql stable security definer set search_path = public as $$
  select to_char((b.picked_up_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM'), b.delivered_by, count(*)::int
  from bookings b
  where is_ops() and b.picked_up_at is not null and b.delivered_by is not null
    and (b.picked_up_at at time zone 'Asia/Kolkata')::date >= (date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) - interval '12 months')::date
  group by 1, 2 $$;
revoke execute on function staff_deliveries_per_month() from public, anon;
grant execute on function staff_deliveries_per_month() to authenticated;
