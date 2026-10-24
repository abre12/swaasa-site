-- Swaasa v3 migration. Run ONCE in Supabase > SQL Editor, AFTER schema.sql and migration-v2.sql. Safe to run again.
-- Adds: dry cleaning (blocks the dress while it is away), per-dress dry-cleaning charge, booking-advance settings,
-- the booking-level revenue report, and dry-cleaning costs in the dress performance figures.

-- 1. Settings and inventory ---------------------------------------------------------------------------------------------
alter table settings add column if not exists advance_min int not null default 1000;
update settings set advance_pct = 50 where advance_pct = 30;          -- booking advance = 50% of rent or the minimum, whichever is higher
alter table dresses add column if not exists dry_clean_charge int not null default 0;

-- 2. Dry cleaning ---------------------------------------------------------------------------------------------------------
create table if not exists dry_cleanings(
  id uuid primary key default gen_random_uuid(), dress_id uuid not null references dresses,
  sent_on date not null default ist_today(), expected_back date not null, returned_on date,
  charge int not null default 0 check (charge>=0), notes text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  check (expected_back >= sent_on), check (returned_on is null or returned_on >= sent_on));
create index if not exists dry_cleanings_dress on dry_cleanings(dress_id, sent_on);
-- The last day a dress is away: the day it came back, or (until then) the expected day, or today if it is overdue.
create or replace function dc_end(c dry_cleanings) returns date language sql stable as $$ select coalesce(c.returned_on, greatest(c.expected_back, ist_today())) $$;
alter table dry_cleanings enable row level security;
drop policy if exists dc_r on dry_cleanings; drop policy if exists dc_i on dry_cleanings; drop policy if exists dc_u on dry_cleanings; drop policy if exists dc_d on dry_cleanings;
create policy dc_r on dry_cleanings for select using (is_ops());
create policy dc_i on dry_cleanings for insert with check (is_ops());
create policy dc_u on dry_cleanings for update using (is_ops());
create policy dc_d on dry_cleanings for delete using (is_owner());

create or replace function dry_cleanings_before() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.dress_id::text));
  if new.returned_on is null then
    -- cannot be away while a customer has it or has it booked (a dress already returned does not count)
    if exists(select 1 from bookings b where b.dress_id=new.dress_id and b.status in ('pending','confirmed','out')
        and b.hold && daterange(new.sent_on, greatest(new.expected_back, ist_today())+1,'[)')) then raise exception 'CLEAN_CONFLICT'; end if;
    if exists(select 1 from dry_cleanings c where c.dress_id=new.dress_id and c.returned_on is null and c.id<>new.id) then raise exception 'ALREADY_CLEANING'; end if;
  end if;
  return new; end $$;
drop trigger if exists t_dc_before on dry_cleanings;
create trigger t_dc_before before insert or update on dry_cleanings for each row execute function dry_cleanings_before();

-- 3. A dress that is away for dry cleaning cannot be booked for those dates ------------------------------------------------------
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
  if tg_op='UPDATE' then
    if not is_owner() and (new.rent<>old.rent or new.discount<>old.discount or new.deposit<>old.deposit) then raise exception 'OWNER_ONLY'; end if;
  end if;
  return new; end $$;

create or replace function dress_busy(p_dress uuid) returns table(start_date date, hold_end date, end_date date)
language sql security definer stable set search_path=public as $$
  select o.start_date, o.end_date + (select buffer_days from settings), o.end_date from bookings o
    where o.dress_id=p_dress and o.status<>'cancelled' and o.end_date + (select buffer_days from settings) >= current_date
  union all select k.start_date, k.end_date, k.end_date from blocks k where k.dress_id=p_dress and k.end_date>=current_date
  union all select c.sent_on, dc_end(c), dc_end(c) from dry_cleanings c where c.dress_id=p_dress and dc_end(c)>=current_date $$;

create or replace function dresses_unavailable(p_from date, p_to date) returns setof uuid
language sql security definer stable set search_path=public as $$
  select d.id from dresses d where d.status<>'available'
  or exists(select 1 from bookings o where o.dress_id=d.id and o.status<>'cancelled'
      and daterange(o.start_date, o.end_date + (select buffer_days from settings) + 1,'[)') && daterange(p_from, p_to + (select buffer_days from settings) + 1,'[)'))
  or exists(select 1 from blocks k where k.dress_id=d.id and daterange(k.start_date,k.end_date+1,'[)') && daterange(p_from,p_to+1,'[)'))
  or exists(select 1 from dry_cleanings c where c.dress_id=d.id and daterange(c.sent_on, dc_end(c)+1,'[)') && daterange(p_from,p_to+1,'[)')) $$;

-- 4. Owner-only analytics -----------------------------------------------------------------------------------------------------
drop function if exists dress_performance(date, date);
create function dress_performance(p_from date default null, p_to date default null)
returns table(dress_id uuid, code text, name text, category text, colour_tags text[], image text, status text, acquired_on date, added_on date,
  completed int, rental_days int, gross int, discounts int, net_rent int, avg_net int, late_fees int, damage_charges int, other_charges int,
  collected int, first_booking date, last_booking date, washes int, wash_cost int)
language plpgsql security definer stable set search_path=public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  return query
  select d.id,d.code,d.name,d.category,d.colour_tags,d.images[1],d.status,d.acquired_on,d.created_at::date,
    count(v.id)::int, coalesce(sum(v.end_date-v.start_date+1),0)::int,
    coalesce(sum(v.rent+v.discount),0)::int, coalesce(sum(v.discount),0)::int,
    coalesce(sum(v.rent - v.rent_refunded),0)::int,
    case when count(v.id)>0 then round(sum(v.rent - v.rent_refunded)::numeric/count(v.id))::int else 0 end,
    coalesce(sum(v.late_fee),0)::int, coalesce(sum(v.damage_charge),0)::int, coalesce(sum(greatest(0,v.charges-v.late_fee-v.damage_charge)),0)::int,
    coalesce(sum(v.paid),0)::int, min(v.start_date), max(v.start_date),
    (select count(*) from dry_cleanings c where c.dress_id=d.id and (p_from is null or c.sent_on>=p_from) and (p_to is null or c.sent_on<=p_to))::int,
    (select coalesce(sum(c.charge),0) from dry_cleanings c where c.dress_id=d.id and (p_from is null or c.sent_on>=p_from) and (p_to is null or c.sent_on<=p_to))::int
  from dresses d
  left join booking_view v on v.dress_id=d.id and v.status='returned'
       and (p_from is null or v.start_date>=p_from) and (p_to is null or v.start_date<=p_to)
  where d.status<>'archived'
  group by d.id;
end $$;

create or replace function dress_washes(p_dress uuid, p_from date default null, p_to date default null)
returns table(id uuid, sent_on date, expected_back date, returned_on date, charge int, notes text)
language plpgsql security definer stable set search_path=public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  return query select c.id,c.sent_on,c.expected_back,c.returned_on,c.charge,c.notes from dry_cleanings c
    where c.dress_id=p_dress and (p_from is null or c.sent_on>=p_from) and (p_to is null or c.sent_on<=p_to) order by c.sent_on desc;
end $$;

-- One row per booking. Advance = the first rent payment on the booking; Rent received = every later rent payment.
-- Net amount = Advance received + Rent received + Late fees + Damage charges - Advance refunded.
create or replace function revenue_report(p_from date default null, p_to date default null)
returns table(id text, dress_code text, dress_name text, category text, customer_name text, phone text, start_date date, end_date date,
  advance_received int, rent_received int, late_fee int, damage_charge int, status text, advance_refunded int, net_amount int)
language plpgsql security definer stable set search_path=public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  return query
  select b.id,d.code,d.name,d.category,b.customer_name,b.phone,b.start_date,b.end_date,
    coalesce(x.adv,0)::int, (coalesce(x.rent_all,0)-coalesce(x.adv,0))::int, b.late_fee, b.damage_charge, b.status, coalesce(x.refunded,0)::int,
    (coalesce(x.rent_all,0) + b.late_fee + b.damage_charge - coalesce(x.refunded,0))::int
  from bookings b join dresses d on d.id=b.dress_id
  left join lateral (select (array_agg(p.amount order by p.created_at, p.id) filter (where p.kind='rent'))[1] as adv,
      coalesce(sum(p.amount) filter (where p.kind='rent'),0) as rent_all, coalesce(sum(p.amount) filter (where p.kind='rent_refund'),0) as refunded
      from payments p where p.booking_id=b.id) x on true
  where b.status<>'pending' and (p_from is null or b.start_date>=p_from) and (p_to is null or b.start_date<=p_to)
  order by b.start_date, b.id;
end $$;

revoke execute on all functions in schema public from public;
grant execute on function dress_busy, create_booking, lookup_booking, dresses_unavailable to anon, authenticated;
grant execute on function set_dress_status, is_staff, is_owner, is_ops, ist_today, staff_create_booking, set_alteration_notes, set_prep_status, prep_list, dress_performance, dress_history, dress_washes, revenue_report to authenticated;
