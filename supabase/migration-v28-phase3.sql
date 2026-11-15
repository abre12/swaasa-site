-- Migration v28 (Phase 3): ADDITIVE except OP-7, which removes a table nothing reads. Run it BEFORE you deploy the Phase 3 website. Run it after v27.
--
--   N-11  handover_notes     "customer collecting at 5": a note on a booking or on a day.
--   N-13  lost_demand        missed enquiries (dates not free, not in stock, price...), so you know what to buy.
--   N-12  dress_costs        what each dress cost (owner only) + stock_performance(): payback, utilisation, dead stock.
--   N-10  day_closes         the end-of-day close checklist and its result.
--   IN-2 / N-15  scorecard(), leakage_by_month()   on-time rates, turnaround against promise, discounts, refunds, deposits kept, cash differences.
--   BP-3  settings           shop name, phone, address and the rental agreement terms used on the receipt.
--   OP-7  admin_notifications  the triggers that wrote to it, and the table, are removed.
-- Every new function checks who is calling. Every new table can be changed only through those functions.

-- ───────────────────────── OP-7: stop writing to a table nothing reads ─────────────────────────
drop function if exists notify_alteration_change() cascade;       -- cascade also removes its trigger
drop function if exists notify_cleaning_request() cascade;
drop function if exists notify_pending_approval() cascade;
drop table if exists admin_notifications;

-- ───────────────────────── BP-3: shop details and agreement terms (editable in Settings) ─────────────────────────
alter table settings add column if not exists shop_name text not null default 'Swaasa Wedding Rentals';
alter table settings add column if not exists shop_phone text not null default '';
alter table settings add column if not exists shop_address text not null default '';
alter table settings add column if not exists agreement_terms text not null default
'1. The dress stays the property of the shop. The customer is responsible for it from delivery until it is returned.
2. The refundable deposit is returned when the dress is back on time and in the same condition, after the shop has checked it.
3. A return after the agreed date is charged the late fee per extra day shown for the dress.
4. Stains, tears, missing parts or damage beyond normal wear are charged at repair or replacement cost and may be taken from the deposit.
5. Please do not alter, dry clean or repair the dress yourself. Alterations are done only by the shop.
6. Cancellations follow the shop''s cancellation policy. Rent already paid is refunded only as that policy allows.
7. By taking the dress the customer confirms that the details on this receipt are correct.';

-- ───────────────────────── N-11: handover notes ─────────────────────────
create table if not exists handover_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id text references bookings(id) on delete cascade,
  note_date date not null,
  note text not null check (length(trim(note)) between 1 and 500),
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by_name text
);
create index if not exists handover_notes_date_idx on handover_notes (note_date);
create index if not exists handover_notes_booking_idx on handover_notes (booking_id);
alter table handover_notes enable row level security;
drop policy if exists handover_notes_ops_r on handover_notes;
create policy handover_notes_ops_r on handover_notes for select using (is_ops());
revoke insert, update, delete on handover_notes from authenticated, anon;

create or replace function add_handover_note(p_booking text, p_date date, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d date; nid uuid; b bookings;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  if nullif(p_booking, '') is not null then
    select * into b from bookings where id = p_booking; if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  d := coalesce(p_date, b.start_date, (now() at time zone 'Asia/Kolkata')::date);
  insert into handover_notes(booking_id, note_date, note, created_by_name) values (nullif(p_booking, ''), d, left(trim(p_note), 500), staff_name()) returning handover_notes.id into nid;
  return nid;
end $$;
create or replace function set_handover_note_done(p_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  update handover_notes set done_at = case when p_done then now() else null end, done_by_name = case when p_done then staff_name() else null end where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ───────────────────────── N-13: missed enquiries ─────────────────────────
create table if not exists lost_demand (
  id uuid primary key default gen_random_uuid(),
  logged_at timestamptz not null default now(),
  logged_by uuid default auth.uid(),
  logged_by_name text,
  dress_id uuid references dresses(id) on delete set null,
  category text,
  wanted_from date,
  wanted_to date,
  reason text not null check (reason in ('dates_taken', 'not_in_stock', 'price', 'size_or_style', 'other')),
  customer_name text,
  phone text,
  note text
);
create index if not exists lost_demand_logged_idx on lost_demand (logged_at);
alter table lost_demand enable row level security;
drop policy if exists lost_demand_owner_r on lost_demand;
create policy lost_demand_owner_r on lost_demand for select using (is_owner());
revoke insert, update, delete on lost_demand from authenticated, anon;

create or replace function log_lost_demand(p_dress uuid, p_category text, p_from date, p_to date, p_reason text, p_customer text, p_phone text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid; cat text := nullif(trim(coalesce(p_category, '')), '');
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_reason not in ('dates_taken', 'not_in_stock', 'price', 'size_or_style', 'other') then raise exception 'BAD_REASON'; end if;
  if p_to is not null and p_from is not null and p_to < p_from then raise exception 'BAD_DATES'; end if;
  if p_dress is not null then select category into cat from dresses where id = p_dress; end if;
  insert into lost_demand(dress_id, category, wanted_from, wanted_to, reason, customer_name, phone, note, logged_by_name)
    values (p_dress, cat, p_from, p_to, p_reason, nullif(left(trim(coalesce(p_customer, '')), 120), ''), nullif(left(trim(coalesce(p_phone, '')), 30), ''), nullif(left(trim(coalesce(p_note, '')), 500), ''), staff_name())
    returning lost_demand.id into nid;
  return nid;
end $$;

-- ───────────────────────── N-12: what each dress cost (owner only) ─────────────────────────
-- Kept apart from the dresses table on purpose: dresses can be read by the public pages, a purchase price must not be.
create table if not exists dress_costs (
  dress_id uuid primary key references dresses(id) on delete cascade,
  purchase_cost integer not null check (purchase_cost >= 0),
  purchased_on date,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table dress_costs enable row level security;
drop policy if exists dress_costs_owner_r on dress_costs;
create policy dress_costs_owner_r on dress_costs for select using (is_owner());
revoke insert, update, delete on dress_costs from authenticated, anon;

create or replace function set_dress_cost(p_dress uuid, p_cost integer, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  if p_cost is null or p_cost < 0 then raise exception 'BAD_AMOUNT'; end if;
  if not exists (select 1 from dresses where id = p_dress) then raise exception 'NOT_FOUND'; end if;
  insert into dress_costs(dress_id, purchase_cost, purchased_on) values (p_dress, p_cost, p_date)
    on conflict (dress_id) do update set purchase_cost = excluded.purchase_cost, purchased_on = excluded.purchased_on, updated_at = now(), updated_by = auth.uid();
end $$;

-- One row per dress: cost, what it has earned, payback, how much of the last 365 days it was out, and whether it is dead stock.
-- Earned = rent after discounts and rental refunds, minus what dry cleaning cost. Rented days count only dresses that were actually delivered.
create or replace function stock_performance() returns table (
  dress_id uuid, code text, name text, category text, status text, listed_on date, purchase_cost integer,
  rentals integer, earned integer, payback_pct integer, rented_days integer, available_days integer, utilisation_pct integer, last_rented date, dead_stock boolean)
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  return query
  with ref as (select b.dress_id, b.start_date, b.end_date, b.status,
                 b.rent - coalesce(b.discount, 0) - coalesce((select sum(p.amount) from payments p where p.booking_id = b.id and p.kind = 'rent_refund'), 0) as net
               from bookings b where b.status in ('out', 'returned')),
       agg as (select r.dress_id, count(*)::int as rentals, coalesce(sum(r.net), 0)::int as net,
                 coalesce(sum(greatest(0, least(r.end_date, today) - greatest(r.start_date, today - 364) + 1)), 0)::int as days,
                 max(r.start_date) as last_rented
               from ref r group by r.dress_id),
       clean as (select c.dress_id, coalesce(sum(c.charge), 0)::int as cost from dry_cleanings c group by c.dress_id),
       upcoming as (select distinct b.dress_id from bookings b where b.status in ('pending', 'confirmed') and b.start_date >= today)
  select d.id, d.code, d.name, d.category, d.status, coalesce(d.acquired_on, d.created_at::date),
         k.purchase_cost,
         coalesce(a.rentals, 0),
         (coalesce(a.net, 0) - coalesce(c.cost, 0))::int,
         case when coalesce(k.purchase_cost, 0) > 0 then round((coalesce(a.net, 0) - coalesce(c.cost, 0)) * 100.0 / k.purchase_cost)::int end,
         coalesce(a.days, 0),
         greatest(1, least(365, today - coalesce(d.acquired_on, d.created_at::date) + 1))::int,
         least(100, round(coalesce(a.days, 0) * 100.0 / greatest(1, least(365, today - coalesce(d.acquired_on, d.created_at::date) + 1)))::int),
         a.last_rented,
         (d.status in ('available', 'maintenance') and coalesce(d.acquired_on, d.created_at::date) < today - 90
            and coalesce(a.last_rented, date '1900-01-01') < today - 90 and not exists (select 1 from upcoming u where u.dress_id = d.id))
  from dresses d
  left join dress_costs k on k.dress_id = d.id
  left join agg a on a.dress_id = d.id
  left join clean c on c.dress_id = d.id
  order by d.code;
end $$;

-- ───────────────────────── N-10: end-of-day close ─────────────────────────
create table if not exists day_closes (
  day date primary key,
  closed_by uuid default auth.uid(),
  closed_by_name text,
  closed_at timestamptz not null default now(),
  cash_tallied boolean not null,
  cash_difference integer,
  tomorrow_deliveries integer not null default 0,
  tomorrow_not_ready integer not null default 0,
  tomorrow_checked boolean not null default false,
  overdue_returns integer not null default 0,
  overdue_called integer not null default 0,
  note text
);
alter table day_closes enable row level security;
drop policy if exists day_closes_ops_r on day_closes;
create policy day_closes_ops_r on day_closes for select using (is_ops());
revoke insert, update, delete on day_closes from authenticated, anon;

-- The database works out what it can (cash tallied, how many overdue returns, how many deliveries tomorrow); staff say what they checked.
create or replace function close_day(p_day date, p_tomorrow_not_ready integer, p_tomorrow_checked boolean, p_overdue_called integer, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; t cash_tally; has_tally boolean; tom int; od int; row day_closes;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_day is null or p_day not between today - 1 and today then raise exception 'BAD_DATES'; end if;
  select * into t from cash_tally where day = p_day;
  has_tally := found;          -- read it now: the queries below would overwrite FOUND
  select count(*) into tom from bookings where status in ('pending', 'confirmed') and start_date = p_day + 1;
  select count(*) into od from bookings where status = 'out' and end_date < p_day;
  insert into day_closes(day, closed_by_name, cash_tallied, cash_difference, tomorrow_deliveries, tomorrow_not_ready, tomorrow_checked, overdue_returns, overdue_called, note)
  values (p_day, staff_name(), has_tally, t.difference, tom, greatest(0, least(coalesce(p_tomorrow_not_ready, 0), tom)), coalesce(p_tomorrow_checked, false), od, greatest(0, least(coalesce(p_overdue_called, 0), od)), nullif(left(trim(coalesce(p_note, '')), 500), ''))
  on conflict (day) do update set closed_by = auth.uid(), closed_by_name = excluded.closed_by_name, closed_at = now(), cash_tallied = excluded.cash_tallied, cash_difference = excluded.cash_difference,
    tomorrow_deliveries = excluded.tomorrow_deliveries, tomorrow_not_ready = excluded.tomorrow_not_ready, tomorrow_checked = excluded.tomorrow_checked,
    overdue_returns = excluded.overdue_returns, overdue_called = excluded.overdue_called, note = excluded.note
  returning * into row;
  return to_jsonb(row);
end $$;

-- ───────────────────────── IN-2 scorecard and N-15 leakage ─────────────────────────
create or replace function scorecard(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; r jsonb := '{}'::jsonb; x record;
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'BAD_DATES'; end if;
  -- deliveries: on time = the dress went out on or before its delivery date
  select count(*) filter (where picked_up_at is not null and (picked_up_at at time zone 'Asia/Kolkata')::date <= start_date) as on_time,
         count(*) filter (where picked_up_at is not null and (picked_up_at at time zone 'Asia/Kolkata')::date > start_date) as late,
         count(*) filter (where picked_up_at is null and status in ('pending', 'confirmed') and start_date < today) as missed
    into x from bookings where start_date between p_from and p_to and status <> 'cancelled';
  r := r || jsonb_build_object('deliveries', jsonb_build_object('on_time', x.on_time, 'late', x.late, 'missed', x.missed, 'total', x.on_time + x.late + x.missed));
  -- returns: late = came back after the return date
  select count(*) filter (where returned_at is not null and (returned_at at time zone 'Asia/Kolkata')::date <= end_date) as on_time,
         count(*) filter (where returned_at is not null and (returned_at at time zone 'Asia/Kolkata')::date > end_date) as late,
         coalesce(round(avg(((returned_at at time zone 'Asia/Kolkata')::date - end_date)) filter (where returned_at is not null and (returned_at at time zone 'Asia/Kolkata')::date > end_date), 1), 0) as avg_days_late,
         count(*) filter (where returned_at is null and status = 'out' and end_date < today) as overdue_now
    into x from bookings where end_date between p_from and p_to and status in ('out', 'returned');
  r := r || jsonb_build_object('returns', jsonb_build_object('on_time', x.on_time, 'late', x.late, 'avg_days_late', x.avg_days_late, 'overdue_now', x.overdue_now, 'total', x.on_time + x.late + x.overdue_now));
  -- tailor and cleaner: how long it took against what was promised
  select count(*) as n, coalesce(round(avg(expected_return - sent_on), 1), 0) as promised, coalesce(round(avg(received_at::date - sent_on), 1), 0) as actual,
         count(*) filter (where received_at::date > expected_return) as late
    into x from alteration_jobs where sent_on between p_from and p_to and received_at is not null and expected_return is not null;
  r := r || jsonb_build_object('tailor', jsonb_build_object('jobs', x.n, 'avg_promised_days', x.promised, 'avg_actual_days', x.actual, 'late', x.late));
  select count(*) as n, coalesce(round(avg(expected_back - sent_on), 1), 0) as promised, coalesce(round(avg(returned_on - sent_on), 1), 0) as actual,
         count(*) filter (where returned_on > expected_back) as late
    into x from dry_cleanings where sent_on between p_from and p_to and returned_on is not null;
  r := r || jsonb_build_object('cleaner', jsonb_build_object('jobs', x.n, 'avg_promised_days', x.promised, 'avg_actual_days', x.actual, 'late', x.late));
  -- discounts, in total and by who made the booking
  select count(*) filter (where discount > 0) as with_disc, coalesce(sum(discount), 0) as total, count(*) as all_b
    into x from bookings where (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to and status <> 'cancelled';
  r := r || jsonb_build_object('discounts', jsonb_build_object('bookings_with_discount', x.with_disc, 'total', x.total, 'bookings', x.all_b,
    'by_staff', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(s.name, 'Unknown'), 'bookings', g.n, 'with_discount', g.wd, 'total', g.tot) order by g.tot desc)
       from (select b.taken_by, count(*) as n, count(*) filter (where b.discount > 0) as wd, coalesce(sum(b.discount), 0) as tot from bookings b
              where (b.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to and b.status <> 'cancelled' group by b.taken_by) g
       left join staff s on s.user_id = g.taken_by), '[]'::jsonb)));
  -- money that left or was kept
  select coalesce(sum(amount) filter (where kind = 'rent_refund'), 0) as refunds, count(*) filter (where kind = 'rent_refund') as refund_n,
         coalesce(sum(amount) filter (where kind = 'charge'), 0) as kept, coalesce(sum(amount) filter (where kind = 'deposit_refund'), 0) as dep_back
    into x from payments where (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  r := r || jsonb_build_object('money', jsonb_build_object('rent_refunds', x.refunds, 'rent_refund_count', x.refund_n, 'deposits_kept', x.kept, 'deposits_returned', x.dep_back));
  select coalesce(sum(late_fee), 0) as late_fees, coalesce(sum(damage_charge), 0) as damage
    into x from bookings where returned_at is not null and (returned_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
  r := r || jsonb_build_object('recovered', jsonb_build_object('late_fees', x.late_fees, 'damage', x.damage));
  r := r || jsonb_build_object('cash', jsonb_build_object(
    'days_tallied', (select count(*) from cash_tally where day between p_from and p_to),
    'discrepancy_days', (select count(*) from cash_tally where day between p_from and p_to and coalesce(difference, 0) <> 0),
    'net_difference', (select coalesce(sum(difference), 0) from cash_tally where day between p_from and p_to),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'expected', expected, 'counted', counted, 'difference', difference) order by day desc)
                      from cash_tally where day between p_from and p_to and coalesce(difference, 0) <> 0), '[]'::jsonb)));
  return r;
end $$;

-- The same money measures month by month, so a slow leak shows as a trend.
create or replace function leakage_by_month(p_months integer) returns table (month text, discounts integer, rent_refunds integer, deposits_kept integer, damage_recovered integer, late_fees integer, late_returns integer, cash_difference integer)
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; first_m date;
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  p_months := least(24, greatest(1, coalesce(p_months, 6)));
  first_m := (date_trunc('month', today) - make_interval(months => p_months - 1))::date;
  return query
  select to_char(m.d, 'YYYY-MM'),
    coalesce((select sum(b.discount) from bookings b where b.status <> 'cancelled' and date_trunc('month', (b.created_at at time zone 'Asia/Kolkata')) = m.d), 0)::int,
    coalesce((select sum(p.amount) from payments p where p.kind = 'rent_refund' and date_trunc('month', (p.created_at at time zone 'Asia/Kolkata')) = m.d), 0)::int,
    coalesce((select sum(p.amount) from payments p where p.kind = 'charge' and date_trunc('month', (p.created_at at time zone 'Asia/Kolkata')) = m.d), 0)::int,
    coalesce((select sum(b.damage_charge) from bookings b where b.returned_at is not null and date_trunc('month', (b.returned_at at time zone 'Asia/Kolkata')) = m.d), 0)::int,
    coalesce((select sum(b.late_fee) from bookings b where b.returned_at is not null and date_trunc('month', (b.returned_at at time zone 'Asia/Kolkata')) = m.d), 0)::int,
    (select count(*) from bookings b where b.returned_at is not null and date_trunc('month', b.end_date::timestamp) = m.d and (b.returned_at at time zone 'Asia/Kolkata')::date > b.end_date)::int,
    coalesce((select sum(t.difference) from cash_tally t where date_trunc('month', t.day::timestamp) = m.d), 0)::int
  from (select generate_series(first_m::timestamp, date_trunc('month', today::timestamp), interval '1 month') as d) m
  order by 1;
end $$;

-- ───────────────────────── N-17: one money symbol in every message the database writes ─────────────────────────
-- Messages in the booking history used to mix "Rs 500" and "₹500". Every function is re-created with the rupee sign. Old history lines are left as they
-- are in the database; the website shows them with the rupee sign.
do $$ declare r record;
begin
  for r in select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ~ '(^|[^A-Za-z])Rs '
  loop
    execute regexp_replace(r.def, '(^|[^A-Za-z])Rs ', E'\\1₹', 'g');
  end loop;
end $$;

-- ───────────────────────── grants ─────────────────────────
revoke execute on function add_handover_note(text, date, text), set_handover_note_done(uuid, boolean), log_lost_demand(uuid, text, date, date, text, text, text, text),
  set_dress_cost(uuid, integer, date), stock_performance(), close_day(date, integer, boolean, integer, text), scorecard(date, date), leakage_by_month(integer) from public, anon;
grant execute on function add_handover_note(text, date, text), set_handover_note_done(uuid, boolean), log_lost_demand(uuid, text, date, date, text, text, text, text),
  set_dress_cost(uuid, integer, date), stock_performance(), close_day(date, integer, boolean, integer, text), scorecard(date, date), leakage_by_month(integer) to authenticated;
