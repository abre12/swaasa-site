-- Migration v17: one readiness model, atomic return, delivery guard, atomic booking.
-- Run AFTER migration-v16-performance.sql (and every earlier migration). Safe to run more than once.
-- It adds columns and functions only. It does not edit, delete or close any existing booking, job or payment.
-- After running it, run the three REVIEW queries at the bottom to see records that need a human decision.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. New optional fields
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table dresses  add column if not exists location text;            -- where the dress is kept in the store (shelf, rail, room)
alter table bookings add column if not exists delivery_mode text;       -- 'pickup' or 'courier'
alter table bookings add column if not exists delivery_address text;
alter table bookings add column if not exists delivery_slot text;       -- e.g. "10am to 12pm"
alter table bookings add column if not exists delivery_assignee text;   -- who is taking it
alter table bookings drop constraint if exists bookings_delivery_mode_check;
alter table bookings add constraint bookings_delivery_mode_check check (delivery_mode is null or delivery_mode in ('pickup','courier'));

-- Same view as before, with the four delivery columns added at the end (existing columns keep their positions).
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
  b.delivery_mode, b.delivery_address, b.delivery_slot, b.delivery_assignee
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

create or replace function set_dress_location(p_id uuid, p_location text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  update dresses set location = nullif(trim(coalesce(p_location,'')),'') where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Delivery guard: a dress can only be out with one customer at a time (hard rule, no override)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function enforce_one_out_per_dress() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'out' and (tg_op = 'INSERT' or old.status is distinct from 'out') then
    perform pg_advisory_xact_lock(hashtext(new.dress_id::text));
    if exists (select 1 from bookings o where o.dress_id = new.dress_id and o.id <> new.id and o.status = 'out') then
      raise exception 'DRESS_ALREADY_OUT';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_one_out_per_dress on bookings;
create trigger t_one_out_per_dress before insert or update of status on bookings for each row execute function enforce_one_out_per_dress();

create or replace function set_delivery_details(p_id text, p_mode text, p_address text, p_slot text, p_assignee text) returns void
language plpgsql security definer set search_path=public as $$
declare m text := nullif(trim(coalesce(p_mode,'')),'');
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if m is not null and m not in ('pickup','courier') then raise exception 'BAD_MODE'; end if;
  update bookings set delivery_mode = m, delivery_address = nullif(trim(coalesce(p_address,'')),''),
    delivery_slot = nullif(trim(coalesce(p_slot,'')),''), delivery_assignee = nullif(trim(coalesce(p_assignee,'')),''),
    log = log || jsonb_build_array(jsonb_build_object('t', now(), 'm', 'Delivery details updated', 'by', staff_name()))
  where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. return_dress: the whole return in ONE transaction (all of it is saved, or none of it)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The screen works out the money split exactly as before and passes it in; the database checks it adds up.
--   p_refund   deposit handed back now            p_refund_mode  how it was handed back
--   p_applied  [{amt, why}] deposit kept against dues that already existed
-- Late fee and damage charge are applied immediately for anyone processing the return (no approval step).
create or replace function return_dress(
  p_booking text, p_condition text, p_notes text, p_photos text[], p_clean_required boolean,
  p_late_fee int, p_damage_charge int, p_refund int, p_refund_mode text, p_applied jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b bookings; n text := nullif(trim(coalesce(p_notes,'')),''); cr boolean := coalesce(p_clean_required,false);
  lf int := greatest(0,coalesce(p_late_fee,0)); dc int := greatest(0,coalesce(p_damage_charge,0)); ref int := greatest(0,coalesce(p_refund,0));
  dep_held int; applied_total int := 0; a jsonb; ins_id uuid; already boolean := false; msg text;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_condition not in ('good','minor_marks','needs_cleaning','damage_repair') then raise exception 'BAD_CONDITION'; end if;
  if (p_condition in ('good','damage_repair') and cr) or (p_condition = 'needs_cleaning' and not cr) then raise exception 'BAD_CLEANING_CHOICE'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'out' then raise exception 'BAD_STATUS'; end if;

  select coalesce(sum(amount) filter (where kind='deposit'),0) - coalesce(sum(amount) filter (where kind in ('deposit_refund','charge')),0)
    into dep_held from payments where booking_id = p_booking;
  for a in select value from jsonb_array_elements(coalesce(p_applied,'[]'::jsonb)) loop
    if coalesce((a->>'amt')::int,0) <= 0 then raise exception 'BAD_AMOUNT'; end if;
    applied_total := applied_total + (a->>'amt')::int;
  end loop;
  if ref + applied_total > dep_held then raise exception 'BAD_AMOUNT'; end if;

  msg := 'Returned' || case when n is not null then ': '||n else '' end || '. Deposit handed back: Rs '||ref
    || case when applied_total > 0 then '. Deposit kept against dues: Rs '||applied_total else '' end
    || case when lf+dc > 0 then '. Charges: late fee Rs '||lf||', damage / repair Rs '||dc else '' end;

  update bookings set status = 'returned', returned_at = now(),
    charges = charges + lf + dc, late_fee = late_fee + lf, damage_charge = damage_charge + dc,
    return_notes = coalesce(n, return_notes),
    log = log || jsonb_build_array(jsonb_build_object('t', now(), 'm', msg, 'by', staff_name()))
  where id = p_booking;

  insert into return_inspections(booking_id, dress_id, condition, notes, photos, cleaning_required)
    values (p_booking, b.dress_id, p_condition, n, coalesce(p_photos,'{}'), cr) returning id into ins_id;

  if cr then
    select exists(select 1 from dry_clean_requests where dress_id = b.dress_id and status in ('to_be_sent','sent','returned_pending_check')) into already;
    if not already then
      insert into dry_clean_requests(dress_id, booking_id, inspection_id, condition, condition_notes, status)
        values (b.dress_id, p_booking, ins_id, p_condition, n, 'to_be_sent');
    end if;
  end if;

  if p_condition = 'damage_repair' then
    insert into alteration_jobs(booking_id, dress_id, inspection_id, source, requirements, status)
      values (p_booking, b.dress_id, ins_id, 'damage', coalesce(n,'Damage / repair required'), 'pending_dispatch');
    update dresses set status = 'maintenance', condition = coalesce(n,'Damage / repair required') where id = b.dress_id;
  elsif n is not null then
    update dresses set condition = n where id = b.dress_id;
  end if;

  if ref > 0 then
    insert into payments(booking_id, amount, kind, purpose, mode) values (p_booking, ref, 'deposit_refund', 'deposit_refund', coalesce(nullif(trim(p_refund_mode),''),'Cash'));
  end if;
  for a in select value from jsonb_array_elements(coalesce(p_applied,'[]'::jsonb)) loop
    insert into payments(booking_id, amount, kind, purpose, mode, remarks)
      values (p_booking, (a->>'amt')::int, 'charge', 'deposit_applied', 'From Security Deposit', nullif(a->>'why',''));
  end loop;

  return jsonb_build_object('inspection_id', ins_id, 'refund', ref, 'kept', applied_total, 'already_in_cleaning', already);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. staff_create_booking_full: booking + payments + event + delivery + alteration in ONE transaction
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function staff_create_booking_full(
  p_dress uuid, p_start date, p_end date, p_name text, p_phone text, p_email text, p_alt_notes text,
  p_advance int, p_mode text, p_discount int, p_override boolean, p_custom int,
  p_deposit int, p_deposit_ref text, p_cust_paid int,
  p_event_date date, p_event_type text, p_notes text, p_alt jsonb, p_delivery jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare v_id text; j uuid; dm text := nullif(trim(coalesce(p_delivery->>'mode','')),'');
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  v_id := staff_create_booking(p_dress, p_start, p_end, p_name, p_phone, p_email, p_alt_notes, p_advance, p_mode, p_discount, p_override, p_custom);
  if coalesce(p_deposit,0) > 0 then
    insert into payments(booking_id, amount, kind, purpose, mode, remarks) values (v_id, p_deposit, 'deposit', 'deposit', p_mode, nullif(trim(coalesce(p_deposit_ref,'')),''));
  end if;
  if coalesce(p_cust_paid,0) > 0 then
    insert into payments(booking_id, amount, kind, purpose, mode) values (v_id, p_cust_paid, 'rent', 'customization', p_mode);
  end if;
  perform set_booking_details(v_id, p_event_date, p_event_type, p_notes);
  if p_delivery is not null then
    if dm is not null and dm not in ('pickup','courier') then raise exception 'BAD_MODE'; end if;
    update bookings set delivery_mode = dm, delivery_address = nullif(trim(coalesce(p_delivery->>'address','')),''),
      delivery_slot = nullif(trim(coalesce(p_delivery->>'slot','')),''), delivery_assignee = nullif(trim(coalesce(p_delivery->>'assignee','')),'')
    where id = v_id;
  end if;
  if p_alt is not null then
    select id into j from alteration_jobs where booking_id = v_id and status <> 'cancelled' limit 1;
    if found then
      update alteration_jobs set checklist = coalesce(p_alt->'checklist','[]'::jsonb), measurements = coalesce(p_alt->'measurements','{}'::jsonb),
        measurements_pending = coalesce((p_alt->>'measurements_pending')::boolean,false), updated_at = now() where id = j;
    else
      insert into alteration_jobs(booking_id, dress_id, status, requirements, checklist, measurements, measurements_pending)
        values (v_id, p_dress, 'pending_dispatch', coalesce(nullif(trim(coalesce(p_alt->>'requirements','')),''), p_alt_notes, 'Alterations needed'),
          coalesce(p_alt->'checklist','[]'::jsonb), coalesce(p_alt->'measurements','{}'::jsonb), coalesce((p_alt->>'measurements_pending')::boolean,false));
    end if;
  end if;
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. prep_jobs: the real alteration queue for the Preparation role (no phone numbers, no money)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function prep_jobs() returns table(
  id uuid, booking_id text, dress_id uuid, dress_code text, dress_name text, image text, customer_name text, delivery_date date,
  status text, source text, requirements text, sent_on date, expected_return date, measurements_pending boolean)
language sql security definer stable set search_path=public as $$
  select j.id, j.booking_id, j.dress_id, d.code, d.name, d.images[1], b.customer_name, b.start_date,
         j.status, j.source, j.requirements, j.sent_on, j.expected_return, j.measurements_pending
  from alteration_jobs j join dresses d on d.id = j.dress_id left join bookings b on b.id = j.booking_id
  where is_staff() and j.status in ('pending_dispatch','at_unit','quality_check')
  order by coalesce(b.start_date, current_date), j.created_at $$;

revoke execute on function return_dress(text,text,text,text[],boolean,int,int,int,text,jsonb) from public;
revoke execute on function staff_create_booking_full(uuid,date,date,text,text,text,text,int,text,int,boolean,int,int,text,int,date,text,text,jsonb,jsonb) from public;
revoke execute on function set_delivery_details(text,text,text,text,text) from public;
revoke execute on function prep_jobs() from public;
revoke execute on function set_dress_location(uuid,text) from public;
grant execute on function set_dress_location(uuid,text) to authenticated;
grant execute on function return_dress(text,text,text,text[],boolean,int,int,int,text,jsonb) to authenticated;
grant execute on function staff_create_booking_full(uuid,date,date,text,text,text,text,int,text,int,boolean,int,int,text,int,date,text,text,jsonb,jsonb) to authenticated;
grant execute on function set_delivery_details(text,text,text,text,text) to authenticated;
grant execute on function prep_jobs() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- REVIEW queries (read-only). Run them once and decide each case by hand; nothing here changes data.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- (a) Bookings the OLD "Mark ready" button marked ready while a real alteration job is still open.
--     The new screens trust the job, so these now show as "not ready". Check each dress and close or finish the job.
--   select b.id, b.dress_id, b.start_date, j.id as job, j.status
--   from bookings b join alteration_jobs j on j.booking_id = b.id and j.source = 'booking' and j.status in ('pending_dispatch','at_unit','quality_check')
--   where b.prep_status = 'ready' and b.status in ('pending','confirmed');
-- (b) Dresses marked Damaged with no open repair job (valid if set by hand, but confirm).
--   select d.id, d.code, d.name from dresses d
--   where d.status = 'maintenance' and not exists (select 1 from alteration_jobs j where j.dress_id = d.id and j.source = 'damage' and j.status in ('pending_dispatch','at_unit','quality_check'));
-- (c) Dresses that already have two bookings Out (the new rule blocks this from now on; fix these by returning one).
--   select dress_id, array_agg(id) from bookings where status = 'out' group by dress_id having count(*) > 1;
