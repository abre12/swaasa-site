-- Migration v25 (Phase 1, part 1 of 2): ADDITIVE and SAFE. Run it in the Supabase SQL editor BEFORE you deploy the v25 website.
-- It only adds things (a rule, new columns, new functions). Nothing existing is removed or locked, so the old website keeps working
-- until the new one is live. The lock-down comes later, in migration-v25b-lockdown.sql.
--
--   1. Payments: an amount must be above zero, and the database (not the browser) stamps who recorded it and when. (MR-2)
--   2. Settings: delivery checkpoint days and tailor turnaround (DA-2, DA-3).
--   3. Packed-and-checked step before delivery (DA-6): two new columns on bookings, shown through booking_view.
--   4. Server-side functions for the three booking changes the browser used to write directly (MR-5, MR-1):
--        confirm_booking, mark_delivered, reschedule_booking, set_packed.   The history line is added by the database.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Payments
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table payments drop constraint if exists payments_amount_positive;
alter table payments add constraint payments_amount_positive check (amount > 0) not valid;   -- enforced for every NEW row straight away
do $$ begin
  alter table payments validate constraint payments_amount_positive;                           -- also checks the rows already there
exception when check_violation then
  raise notice 'Some existing payments are zero or negative, so the rule applies to new payments only. Run:  select id, booking_id, amount, kind, created_at from payments where amount <= 0;  and review them with the owner.';
end $$;

create or replace function payments_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;   -- a signed-in user cannot record a payment in someone else's name
  new.created_at := now();                                               -- and cannot back-date it into a day that was already tallied
  return new;
end $$;
drop trigger if exists t_payments_stamp on payments;
create trigger t_payments_stamp before insert on payments for each row execute function payments_stamp();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Settings (the owner changes these under Settings)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table settings add column if not exists measure_by_days int not null default 5;   -- measurements must be taken this many days before delivery
alter table settings add column if not exists send_by_days    int not null default 4;   -- the dress must be with the tailor this many days before delivery
alter table settings add column if not exists tailor_days     int not null default 3;   -- usual tailor turnaround (used for the booking-time warning)
alter table settings drop constraint if exists settings_checkpoint_ranges;
alter table settings add constraint settings_checkpoint_ranges check (measure_by_days between 1 and 30 and send_by_days between 1 and 30 and tailor_days between 1 and 21);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Packed and checked
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table bookings add column if not exists packed_at timestamptz;
alter table bookings add column if not exists packed_by uuid;

-- Same view as before (copied from migration v17) with the two packed columns added at the end. Existing columns keep their positions.
create or replace view public.booking_view
with (security_invoker = true)
as
select
  b.id, b.dress_id, b.customer_name, b.phone, b.email, b.notes, b.start_date, b.end_date, b.rent, b.discount, b.charges, b.deposit,
  b.status, b.gap_override, b.hold, b.picked_up_at, b.returned_at, b.log, b.created_at, b.alteration_notes, b.alteration_updated_at,
  b.alteration_updated_by, b.prep_status, b.late_fee, b.damage_charge, b.return_notes, b.taken_by, b.prepared_by, b.prepared_at,
  b.delivered_by, b.returned_by, b.custom_charge,
  d.code as dress_code, d.name as dress_name, d.category,
  (coalesce(rp.rent_in, 0::bigint) - coalesce(rp.rent_out, 0::bigint))::integer as paid,
  (coalesce(rp.dep_in, 0::bigint) - coalesce(rp.dep_out, 0::bigint))::integer as deposit_held,
  coalesce(rp.rent_out, 0::bigint)::integer as rent_refunded,
  b.booking_date, b.event_type, b.event_date,
  b.delivery_mode, b.delivery_address, b.delivery_slot, b.delivery_assignee,
  b.packed_at, b.packed_by
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Booking changes, done by the database
--    The booking's own rules (no double booking, cleaning gap, deposit/rent received before delivery, one dress out at a time,
--    owner-only prices) are triggers on the bookings table, so they still apply to every one of these.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function confirm_booking(p_id text) returns void language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'pending' then raise exception 'BAD_STATUS'; end if;
  update bookings set status = 'confirmed',
    log = coalesce(log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('t', now(), 'm', 'Confirmed', 'by', staff_name()))
  where id = p_id;
end $$;

create or replace function mark_delivered(p_id text, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'BAD_STATUS'; end if;
  update bookings set status = 'out', picked_up_at = now(),
    log = coalesce(log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('t', now(), 'm', left(coalesce(nullif(trim(p_note), ''), 'Delivered'), 1500), 'by', staff_name()))
  where id = p_id;                         -- the shortfall, one-dress-out and deposit rules fire here, exactly as before
end $$;

create or replace function reschedule_booking(p_id text, p_start date, p_end date, p_override boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; why text := trim(coalesce(p_reason, ''));
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'BAD_DATES'; end if;
  if length(why) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'BAD_STATUS'; end if;
  update bookings set start_date = p_start, end_date = p_end, gap_override = coalesce(p_override, false),
    log = coalesce(log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('t', now(), 'by', staff_name(),
      'm', 'Rescheduled from ' || b.start_date || ' → ' || b.end_date || ' to ' || p_start || ' → ' || p_end
           || case when coalesce(p_override, false) then ' (cleaning gap override confirmed)' else '' end || '. Reason: ' || left(why, 500)))
  where id = p_id;                         -- double-booking, cleaning-gap and past-date rules fire here, exactly as before
end $$;

create or replace function set_packed(p_id text, p_done boolean, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'BAD_STATUS'; end if;
  update bookings set packed_at = case when p_done then now() else null end, packed_by = case when p_done then auth.uid() else null end,
    log = coalesce(log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('t', now(), 'by', staff_name(),
      'm', case when p_done then 'Packed and checked' || coalesce('. ' || nullif(left(trim(p_note), 300), ''), '') else 'Packed mark removed' end))
  where id = p_id;
end $$;

revoke execute on function confirm_booking(text), mark_delivered(text, text), reschedule_booking(text, date, date, boolean, text), set_packed(text, boolean, text) from public, anon;
grant  execute on function confirm_booking(text), mark_delivered(text, text), reschedule_booking(text, date, date, boolean, text), set_packed(text, boolean, text) to authenticated;
