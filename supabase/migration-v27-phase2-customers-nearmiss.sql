-- Migration v27 (Phase 2): ADDITIVE and SAFE. Run it in the Supabase SQL editor BEFORE you deploy this website. Run it after v26.
--
--   N-3   customers table      a real customer record. Phone numbers are checked (Indian mobile, or + and an international number) and
--                              a shared family number no longer merges two people. Existing bookings are linked automatically.
--   IN-1 / IN-3  readiness_log  the cron job records, for every delivery, whether the dress was ready at 2 days, 1 day and on the day.
--                              That feeds the Delivery Confidence board (% ready at D-2) and the near-miss log.
--   Also: puts booking_view back to its plain form (an earlier draft of v26 hid phone numbers in it, which would have blanked them in the Telegram messages).

-- ───────────────────────── N-3: customers ─────────────────────────
-- One key per phone: 10 digits for an Indian number (any +91 / 0 prefix removed), or "+" and the digits for an international number.
create or replace function phone_key(p text) returns text language sql immutable as $$
  select case
    when p ~ '^\s*\+' and regexp_replace(p, '\D', '', 'g') !~ '^91' then '+' || regexp_replace(p, '\D', '', 'g')
    else right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) end $$;
create or replace function phone_valid(p text) returns boolean language sql immutable as $$
  select phone_key(p) ~ '^[6-9][0-9]{9}$' or phone_key(p) ~ '^\+[0-9]{8,15}$' $$;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone_key text not null,
  email text,
  created_at timestamptz not null default now()
);
create unique index if not exists customers_phone_name_uq on customers (phone_key, lower(trim(name)));   -- two people may share a number; the same person is one record
create index if not exists customers_phone_idx on customers (phone_key);
alter table customers enable row level security;
drop policy if exists customers_ops_r on customers;
create policy customers_ops_r on customers for select using (is_ops());
revoke insert, update, delete on customers from authenticated, anon;      -- written only by the functions and trigger below

alter table bookings add column if not exists customer_id uuid references customers(id) on delete set null;
create index if not exists bookings_customer_idx on bookings (customer_id);

-- Backfill from what already exists: one customer per (phone, name); notes-only profiles with no bookings too.
insert into customers (name, phone_key, email, created_at)
select distinct on (phone_key(b.phone), lower(trim(b.customer_name))) trim(b.customer_name), phone_key(b.phone), nullif(trim(coalesce(b.email, '')), ''), b.created_at
from bookings b where length(trim(coalesce(b.customer_name, ''))) > 0 and length(phone_key(b.phone)) > 0
order by phone_key(b.phone), lower(trim(b.customer_name)), b.created_at desc
on conflict do nothing;
insert into customers (name, phone_key, email, created_at)
select p.name, phone_key(p.phone), nullif(trim(coalesce(p.email, '')), ''), p.created_at from customer_profiles p
where length(trim(coalesce(p.name, ''))) > 0 and length(phone_key(p.phone)) > 0
  and not exists (select 1 from customers c where c.phone_key = phone_key(p.phone))
on conflict do nothing;
update bookings b set customer_id = c.id from customers c
 where b.customer_id is null and c.phone_key = phone_key(b.phone) and lower(trim(c.name)) = lower(trim(b.customer_name));

-- Every new or changed booking is linked to its customer (created if new). A new or changed phone number must be valid.
create or replace function bookings_link_customer() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; c uuid;
begin
  if tg_op = 'INSERT' or new.phone is distinct from old.phone then
    if not phone_valid(new.phone) then raise exception 'BAD_PHONE'; end if;
  end if;
  if tg_op = 'INSERT' or new.phone is distinct from old.phone or new.customer_name is distinct from old.customer_name or new.customer_id is null then
    k := phone_key(new.phone);
    if length(trim(coalesce(new.customer_name, ''))) = 0 or length(k) = 0 then return new; end if;
    select id into c from customers where phone_key = k and lower(trim(name)) = lower(trim(new.customer_name));
    if c is null then
      insert into customers (name, phone_key, email) values (trim(new.customer_name), k, nullif(trim(coalesce(new.email, '')), ''))
        on conflict (phone_key, lower(trim(name))) do nothing;
      select id into c from customers where phone_key = k and lower(trim(name)) = lower(trim(new.customer_name));
    end if;
    new.customer_id := c;
  end if;
  return new;
end $$;
revoke execute on function bookings_link_customer() from public, anon;       -- a trigger function: nobody calls it directly
drop trigger if exists t_bookings_link_customer on bookings;
create trigger t_bookings_link_customer before insert or update of phone, customer_name on bookings for each row execute function bookings_link_customer();

-- Owner: add a customer by hand (with the same phone check), and merge two records of the same person.
create or replace function add_customer(p_name text, p_phone text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'NAME_REQUIRED'; end if;
  if not phone_valid(p_phone) then raise exception 'BAD_PHONE'; end if;
  insert into customers (name, phone_key, email) values (trim(p_name), phone_key(p_phone), nullif(trim(coalesce(p_email, '')), ''))
    on conflict (phone_key, lower(trim(name))) do nothing returning id into c;
  if c is null then raise exception 'ALREADY_EXISTS'; end if;
  return c;
end $$;
create or replace function merge_customers(p_from uuid, p_into uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  if p_from = p_into or not exists (select 1 from customers where id = p_from) or not exists (select 1 from customers where id = p_into) then raise exception 'NOT_FOUND'; end if;
  update bookings set customer_id = p_into where customer_id = p_from;
  get diagnostics n = row_count;
  update customers t set email = coalesce(t.email, f.email) from customers f where t.id = p_into and f.id = p_from;
  delete from customers where id = p_from;
  return n;
end $$;
revoke execute on function add_customer(text, text, text), merge_customers(uuid, uuid), phone_key(text), phone_valid(text) from public, anon;
grant execute on function add_customer(text, text, text), merge_customers(uuid, uuid), phone_key(text), phone_valid(text) to authenticated;

-- ───────────────────────── IN-1 / IN-3: delivery readiness log ─────────────────────────
-- One row per delivery per stage, written by the scheduled job (service role). stage D-2 = two days before delivery, D-1, D-0 = the day itself.
create table if not exists readiness_log (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references bookings(id) on delete cascade,
  dress_id uuid,
  delivery_date date not null,
  stage text not null check (stage in ('D-2', 'D-1', 'D-0')),
  ready boolean not null,
  reason_codes text[] not null default '{}',     -- previous_out | alteration | repair | cleaning | damaged | unavailable
  reasons text,
  recorded_at timestamptz not null default now(),
  unique (booking_id, stage)
);
create index if not exists readiness_log_date_idx on readiness_log (delivery_date);
alter table readiness_log enable row level security;
drop policy if exists readiness_log_ops_r on readiness_log;
create policy readiness_log_ops_r on readiness_log for select using (is_ops());
revoke insert, update, delete on readiness_log from authenticated, anon;

-- ───────────────────────── booking_view: plain again, plus the customer link ─────────────────────────
create or replace view public.booking_view
with (security_invoker = true)
as
select
  b.id, b.dress_id, b.customer_name, b.phone, b.email,
  b.notes, b.start_date, b.end_date, b.rent, b.discount, b.charges, b.deposit,
  b.status, b.gap_override, b.hold, b.picked_up_at, b.returned_at, b.log, b.created_at, b.alteration_notes, b.alteration_updated_at,
  b.alteration_updated_by, b.prep_status, b.late_fee, b.damage_charge, b.return_notes, b.taken_by, b.prepared_by, b.prepared_at,
  b.delivered_by, b.returned_by, b.custom_charge,
  d.code as dress_code, d.name as dress_name, d.category,
  (coalesce(rp.rent_in, 0::bigint) - coalesce(rp.rent_out, 0::bigint))::integer as paid,
  (coalesce(rp.dep_in, 0::bigint) - coalesce(rp.dep_out, 0::bigint))::integer as deposit_held,
  coalesce(rp.rent_out, 0::bigint)::integer as rent_refunded,
  b.booking_date, b.event_type, b.event_date,
  b.delivery_mode, b.delivery_address, b.delivery_slot, b.delivery_assignee,
  b.packed_at, b.packed_by,
  b.customer_id
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

-- ───────────────────────── SA-4 / OP-4: the Dashboard chart is counted in the database ─────────────────────────
-- The website now loads only open bookings and the last 90 days. The 13-month chart no longer needs every booking on every device.
create or replace function bookings_per_month(p_by text) returns table(month text, n int)
language sql stable security definer set search_path = public as $$
  select to_char(d, 'YYYY-MM'), count(*)::int
  from (select case when p_by = 'created' then (b.created_at at time zone 'Asia/Kolkata')::date else b.start_date end as d
        from bookings b where is_ops() and b.status <> 'cancelled') x
  where d >= (date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) - interval '12 months')::date
  group by 1 order by 1 $$;
revoke execute on function bookings_per_month(text) from public, anon;
grant execute on function bookings_per_month(text) to authenticated;

-- Bookings made per person per month (Team Momentum), counted in the database for the same reason.
create or replace function staff_bookings_per_month() returns table(month text, taken_by uuid, n int)
language sql stable security definer set search_path = public as $$
  select to_char((b.created_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM'), b.taken_by, count(*)::int
  from bookings b
  where is_ops() and b.status <> 'cancelled' and b.taken_by is not null
    and (b.created_at at time zone 'Asia/Kolkata')::date >= (date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) - interval '12 months')::date
  group by 1, 2 $$;
revoke execute on function staff_bookings_per_month() from public, anon;
grant execute on function staff_bookings_per_month() to authenticated;

-- ───────────────────────── IN-1 / IN-3: the website also records the daily readiness check ─────────────────────────
-- The scheduled job writes readiness_log. As a back-up (the scheduler is shared and can be late or off), the first staff login of each day writes it too.
-- The database only accepts a row if the stage matches the real number of days to delivery today, so a wrong or old row cannot be written.
create or replace function log_readiness(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; today date := (now() at time zone 'Asia/Kolkata')::date; b bookings; stg int; got int;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  for r in select value from jsonb_array_elements(p_rows) limit 200 loop
    select * into b from bookings where id = r->>'booking_id' and status in ('pending', 'confirmed'); if not found then continue; end if;
    stg := b.start_date - today; if stg not between 0 and 2 or (r->>'stage') <> 'D-' || stg then continue; end if;
    insert into readiness_log (booking_id, dress_id, delivery_date, stage, ready, reason_codes, reasons)
      values (b.id, b.dress_id, b.start_date, 'D-' || stg, coalesce((r->>'ready')::boolean, false),
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'reason_codes', '[]'::jsonb)) x), '{}'), left(r->>'reasons', 600))
      on conflict (booking_id, stage) do nothing;
    get diagnostics got = row_count; n := n + got;
  end loop;
  return n;
end $$;
revoke execute on function log_readiness(jsonb) from public, anon;
grant execute on function log_readiness(jsonb) to authenticated;
