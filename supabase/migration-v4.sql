-- Swaasa v4 migration. Run ONCE in Supabase > SQL Editor, AFTER migration-v3.sql. Safe to run again.
-- Adds: named staff logins (with an on/off switch), and a record of who took each booking, prepared it, delivered it and processed the return.

-- 1. Staff ---------------------------------------------------------------------------------------------------------------------
alter table staff add column if not exists active boolean not null default true;
alter table staff add column if not exists email text;
create or replace function is_staff() returns boolean language sql security definer stable set search_path=public
  as $$ select exists(select 1 from staff where user_id=auth.uid() and active) $$;
create or replace function is_owner() returns boolean language sql security definer stable set search_path=public
  as $$ select exists(select 1 from staff where user_id=auth.uid() and role='owner' and active) $$;
create or replace function is_ops() returns boolean language sql security definer stable set search_path=public
  as $$ select exists(select 1 from staff where user_id=auth.uid() and role in ('owner','manager') and active) $$;
-- Every active staff member can see the team's names (needed to show who did what). Only the owner can change anything.
drop policy if exists staff_read on staff;
create policy staff_read on staff for select using (is_staff());

-- 2. Who did what --------------------------------------------------------------------------------------------------------------
alter table bookings add column if not exists taken_by uuid references staff(user_id) on delete set null;
alter table bookings add column if not exists prepared_by uuid references staff(user_id) on delete set null;
alter table bookings add column if not exists prepared_at timestamptz;
alter table bookings add column if not exists delivered_by uuid references staff(user_id) on delete set null;
alter table bookings add column if not exists returned_by uuid references staff(user_id) on delete set null;
alter table payments add column if not exists created_by uuid;

create or replace function bookings_before() returns trigger language plpgsql security definer set search_path=public as $$
declare b int; chk boolean; begin
  perform pg_advisory_xact_lock(hashtext(new.dress_id::text));
  select buffer_days into b from settings;
  new.hold := daterange(new.start_date, new.end_date + 1, '[)');
  if tg_op='INSERT' then chk := true;
  else chk := (new.start_date<>old.start_date or new.end_date<>old.end_date or new.dress_id<>old.dress_id or old.status='cancelled'); end if;
  if chk and new.status<>'cancelled' then
    if exists(select 1 from blocks k where k.dress_id=new.dress_id and daterange(k.start_date,k.end_date+1,'[)') && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if exists(select 1 from dry_cleanings c where c.dress_id=new.dress_id and daterange(c.sent_on, dc_end(c)+1,'[)') && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if exists(select 1 from bookings o where o.dress_id=new.dress_id and o.id<>new.id and o.status<>'cancelled' and o.hold && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if not new.gap_override and exists(select 1 from bookings o where o.dress_id=new.dress_id and o.id<>new.id and o.status<>'cancelled'
       and daterange(o.start_date, o.end_date + b + 1, '[)') && daterange(new.start_date, new.end_date + b + 1, '[)')) then raise exception 'GAP_CLASH'; end if;
  end if;
  if new.status='out' then new.prep_status := 'delivered'; end if;
  if new.status in ('pending','confirmed') and new.prep_status='delivered' then raise exception 'BAD_PREP'; end if;
  -- Who did what: stamped by the database from the signed-in user, so it cannot be typed in or forged.
  if tg_op='INSERT' then
    if is_staff() then new.taken_by := auth.uid(); end if;                       -- online customer bookings stay empty
  else
    if new.prep_status='ready' and old.prep_status<>'ready' then new.prepared_by := auth.uid(); new.prepared_at := now(); end if;
    if old.prep_status='ready' and new.prep_status not in ('ready','delivered') then new.prepared_by := null; new.prepared_at := null; end if;
    if new.status='out' and old.status<>'out' then new.delivered_by := auth.uid(); end if;
    if new.status='returned' and old.status<>'returned' then new.returned_by := auth.uid(); end if;
  end if;
  if tg_op='UPDATE' then
    if not is_owner() and (new.rent<>old.rent or new.discount<>old.discount or new.deposit<>old.deposit) then raise exception 'OWNER_ONLY'; end if;
  end if;
  return new; end $$;

drop view if exists booking_view;
create view booking_view with (security_invoker=true) as
  select b.*, d.code dress_code, d.name dress_name, d.category,
    (coalesce(rp.rent_in,0)-coalesce(rp.rent_out,0))::int paid,
    (coalesce(rp.dep_in,0)-coalesce(rp.dep_out,0))::int deposit_held,
    coalesce(rp.rent_out,0)::int rent_refunded
  from bookings b join dresses d on d.id=b.dress_id
  -- kind 'charge' = part of the deposit kept to settle unpaid rent or charges (a book entry, not cash received).
  left join lateral (select sum(amount) filter (where kind in ('rent','charge')) rent_in, sum(amount) filter (where kind='rent_refund') rent_out,
                            sum(amount) filter (where kind='deposit') dep_in, sum(amount) filter (where kind in ('deposit_refund','charge')) dep_out
                     from payments p where p.booking_id=b.id) rp on true;

revoke execute on all functions in schema public from public;
grant execute on function dress_busy, create_booking, lookup_booking, dresses_unavailable to anon, authenticated;
grant execute on function set_dress_status, is_staff, is_owner, is_ops, ist_today, staff_create_booking, set_alteration_notes, set_prep_status, prep_list, dress_performance, dress_history, dress_washes, revenue_report to authenticated;
