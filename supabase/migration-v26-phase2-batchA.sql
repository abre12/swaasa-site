-- Migration v26 (Phase 2, batch A, part 1 of 2): ADDITIVE and SAFE. Run it in the Supabase SQL editor BEFORE you deploy the batch A website.
-- The old website keeps working after this; nothing is removed or locked. The lock-down is migration-v26b-lockdown.sql (run it LAST).
--
--   MR-3  deliver_booking()        collecting the deposit and rent and marking delivered is ONE all-or-nothing step, safe against double taps.
--   MR-3  record_payment()         the one place the website records payments (needed before the v26b lock-down).
--   MR-4  return_preview(), return_booking()   late fee, deposit kept and refund are worked out by the database. Grace days is a Setting.
--   SA-3  owner_notices            "Deliver anyway" tells the owner (information only).
--   SA-3  gap override approval    a cleaning-gap override by staff needs an owner-approved request; the owner can still override directly.
--   (SA-4: the bookings table is already readable only by owner and manager since migration v2, so no change was needed here.)

-- ───────────────────────── Settings ─────────────────────────
alter table settings add column if not exists late_grace_days int not null default 0;     -- free days after the return date before the late fee starts
alter table settings drop constraint if exists settings_grace_range;
alter table settings add constraint settings_grace_range check (late_grace_days between 0 and 14);

-- ───────────────────────── SA-3: owner notices (information only) ─────────────────────────
create table if not exists owner_notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- 'deliver_anyway'
  booking_id text references bookings(id) on delete set null,
  message text not null,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table owner_notices enable row level security;
drop policy if exists owner_notices_r on owner_notices;
create policy owner_notices_r on owner_notices for select using (is_owner());
revoke insert, update, delete on owner_notices from authenticated, anon;    -- rows are written only by the database functions below

-- ───────────────────────── SA-3: cleaning-gap override needs the owner's approval ─────────────────────────
alter table approvals alter column booking_id drop not null;                 -- a new booking does not exist yet when the override is requested
alter table approvals drop constraint if exists approvals_action_type_check;
alter table approvals add constraint approvals_action_type_check check (action_type in ('shortfall','discount','booking_cancellation','refund','gap_override'));
create table if not exists gap_grant_uses (approval_id uuid primary key references approvals(id) on delete cascade, used_at timestamptz not null default now(), used_for text);
alter table gap_grant_uses enable row level security;
revoke all on gap_grant_uses from authenticated, anon;

create or replace function request_gap_override(p_dress uuid, p_start date, p_end date, p_booking text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if not is_ops() or is_owner() then raise exception 'FORBIDDEN'; end if;
  if p_dress is null or p_start is null or p_end is null or p_end < p_start then raise exception 'BAD_DATES'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if exists (select 1 from approvals where action_type = 'gap_override' and status = 'pending' and requested_by = auth.uid()
             and request_details->>'dress_id' = p_dress::text and request_details->>'start' = p_start::text and request_details->>'end' = p_end::text) then raise exception 'PENDING_EXISTS'; end if;
  insert into approvals(booking_id, shortfall, action_type, request_details, reason, status, requested_by)
    values (nullif(p_booking, ''), null, 'gap_override', jsonb_build_object('dress_id', p_dress, 'dress_code', (select code from dresses where id = p_dress), 'dress_name', (select name from dresses where id = p_dress), 'start', p_start, 'end', p_end, 'reason', trim(p_reason)), trim(p_reason), 'pending', auth.uid())
    returning id into aid;
  return aid;
end $$;

-- Every booking that carries the override flag by a non-owner must use one approved, unused request for exactly that dress and those dates (valid 3 days).
create or replace function gap_override_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if not new.gap_override or auth.uid() is null or is_owner() then return new; end if;
  if tg_op = 'UPDATE' and old.gap_override and new.start_date = old.start_date and new.end_date = old.end_date and new.dress_id = old.dress_id then return new; end if;
  select a.id into aid from approvals a
   where a.action_type = 'gap_override' and a.status = 'approved' and a.requested_by = auth.uid() and a.decided_at > now() - interval '3 days'
     and a.request_details->>'dress_id' = new.dress_id::text and a.request_details->>'start' = new.start_date::text and a.request_details->>'end' = new.end_date::text
     and not exists (select 1 from gap_grant_uses u where u.approval_id = a.id)
   order by a.decided_at desc limit 1 for update;
  if aid is null then raise exception 'GAP_APPROVAL_REQUIRED'; end if;
  insert into gap_grant_uses(approval_id, used_for) values (aid, new.id);
  return new;
end $$;
drop trigger if exists t_gap_override_guard on bookings;
create trigger t_gap_override_guard before insert or update of gap_override, start_date, end_date, dress_id on bookings for each row execute function gap_override_guard();

-- ───────────────────────── MR-3: one payments function ─────────────────────────
create or replace function record_payment(p_booking text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; a int; k text;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from bookings where id = p_booking) then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'BAD_AMOUNT'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    a := coalesce((r->>'amount')::int, 0); k := r->>'kind';
    if a <= 0 then raise exception 'BAD_AMOUNT'; end if;
    if k not in ('rent', 'deposit', 'rent_refund', 'deposit_refund', 'charge') then raise exception 'BAD_KIND'; end if;
    if length(trim(coalesce(r->>'mode', ''))) = 0 then raise exception 'MODE_REQUIRED'; end if;
    insert into payments(booking_id, amount, kind, purpose, mode, remarks, approval_id)
      values (p_booking, a, k, nullif(r->>'purpose', ''), r->>'mode', nullif(left(trim(coalesce(r->>'remarks', '')), 500), ''), nullif(r->>'approval_id', '')::uuid);
    n := n + 1;     -- the amount, refund-approval and who/when rules are triggers on payments and fire here
  end loop;
  return n;
end $$;

-- ───────────────────────── MR-3: deliver_booking ─────────────────────────
create table if not exists delivery_requests (idem text primary key, booking_id text, created_at timestamptz not null default now());
alter table delivery_requests enable row level security;
revoke all on delivery_requests from authenticated, anon;

-- Collects the deposit and the rent, asks for shortfall approval if needed, and marks the booking delivered, in ONE transaction.
-- Returns 'delivered', 'pending_approval' (money recorded, the owner must approve the shortfall first) or 'duplicate' (same tap sent twice).
create or replace function deliver_booking(p_id text, p_deposit int, p_rent int, p_mode text, p_note text, p_idem text, p_shortfall_reason text, p_not_ready_note text) returns text
language plpgsql security definer set search_path = public as $$
declare b bookings; paid int; dep_held int; dep_pending int; owing int; r int; cl int; c int; o int; st text; msg text; nm text := staff_name();
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if length(coalesce(p_idem, '')) < 8 then raise exception 'BAD_REQUEST'; end if;
  insert into delivery_requests(idem, booking_id) values (p_idem, p_id) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'BAD_STATUS'; end if;

  select coalesce(sum(amount) filter (where kind in ('rent', 'charge')), 0) - coalesce(sum(amount) filter (where kind = 'rent_refund'), 0),
         coalesce(sum(amount) filter (where kind = 'deposit'), 0) - coalesce(sum(amount) filter (where kind in ('deposit_refund', 'charge')), 0)
    into paid, dep_held from payments where booking_id = p_id;
  dep_pending := greatest(0, b.deposit - dep_held); owing := greatest(0, b.rent + b.charges - paid);
  p_deposit := coalesce(p_deposit, 0); p_rent := coalesce(p_rent, 0);
  if dep_pending > 0 and p_deposit <> dep_pending then raise exception 'DEPOSIT_FULL_REQUIRED'; end if;
  if dep_pending = 0 then p_deposit := 0; end if;
  if p_rent < 0 or p_rent > owing then raise exception 'BAD_AMOUNT'; end if;
  if (p_deposit > 0 or p_rent > 0) and length(trim(coalesce(p_mode, ''))) = 0 then raise exception 'MODE_REQUIRED'; end if;

  if p_deposit > 0 then insert into payments(booking_id, amount, kind, purpose, mode) values (p_id, p_deposit, 'deposit', 'deposit', p_mode); end if;
  if p_rent > 0 then   -- rent first, then customization, then any other charge (same order the website used)
    r := least(p_rent, greatest(0, b.rent - paid)); cl := greatest(0, coalesce(b.custom_charge, 0) - greatest(0, paid - b.rent)); c := least(p_rent - r, cl); o := p_rent - r - c;
    if r > 0 then insert into payments(booking_id, amount, kind, purpose, mode) values (p_id, r, 'rent', 'rent', p_mode); end if;
    if c > 0 then insert into payments(booking_id, amount, kind, purpose, mode) values (p_id, c, 'rent', 'customization', p_mode); end if;
    if o > 0 then insert into payments(booking_id, amount, kind, purpose, mode) values (p_id, o, 'rent', 'other_charge', p_mode); end if;
  end if;

  -- Shortfall: the existing approval rule decides. If the owner has not approved it yet, the money stays recorded and delivery waits.
  begin
    st := request_shortfall(p_id, p_shortfall_reason);
  exception when others then
    if sqlerrm like '%NO_SHORTFALL%' then st := 'none'; else raise; end if;
  end;
  if st = 'pending' then return 'pending_approval'; end if;

  msg := 'Delivered' || case when p_deposit > 0 then '. Deposit Rs ' || p_deposit || ' collected (' || p_mode || ')' else '' end
      || case when p_rent > 0 then '. Rent Rs ' || p_rent || ' collected (' || p_mode || ')' else '' end
      || case when owing - p_rent > 0 then '. Shortfall of Rs ' || (owing - p_rent) || ' approved' else '' end
      || case when length(trim(coalesce(p_not_ready_note, ''))) > 0 then '. Delivered although not ready. Reason: ' || left(trim(p_not_ready_note), 600) else '' end;
  update bookings set status = 'out', picked_up_at = now(),
    log = coalesce(log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('t', now(), 'm', left(msg, 1500), 'by', nm))
  where id = p_id;           -- one-dress-out, deposit and shortfall rules fire here; any failure undoes the payments above too

  if length(trim(coalesce(p_not_ready_note, ''))) > 0 then   -- SA-3: tell the owner (information only)
    insert into owner_notices(kind, booking_id, message, created_by_name)
      values ('deliver_anyway', p_id, 'Delivered although not ready. ' || left(trim(p_not_ready_note), 600), nm);
  end if;
  return 'delivered';
end $$;

-- ───────────────────────── MR-4: late fee, deposit kept and refund are worked out by the database ─────────────────────────
create or replace function _return_calc(p_booking text, p_lf int, p_dc int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b bookings; d dresses; g int := 0; today date := (now() at time zone 'Asia/Kolkata')::date; paid int; dep_held int;
  lf int := greatest(0, coalesce(p_lf, 0)); dc int := greatest(0, coalesce(p_dc, 0)); late int := 0; suggested int := 0; due int; refund int; kept int; lft int;
  cust int; u_rent int; u_cust int; u_prev int; applied jsonb := '[]'::jsonb; t int; x record;
begin
  select * into b from bookings where id = p_booking; if not found then raise exception 'NOT_FOUND'; end if;
  select * into d from dresses where id = b.dress_id;
  select coalesce(late_grace_days, 0) into g from settings limit 1;
  if b.end_date < today then late := greatest(0, (today - b.end_date) - g); end if;
  suggested := late * coalesce(d.extra_day_fee, 0);
  select coalesce(sum(amount) filter (where kind in ('rent', 'charge')), 0) - coalesce(sum(amount) filter (where kind = 'rent_refund'), 0),
         coalesce(sum(amount) filter (where kind = 'deposit'), 0) - coalesce(sum(amount) filter (where kind in ('deposit_refund', 'charge')), 0)
    into paid, dep_held from payments where booking_id = p_booking;
  due := greatest(0, b.rent + b.charges + lf + dc - paid);
  refund := greatest(0, dep_held - due);
  kept := greatest(0, least(dep_held - refund, due));
  cust := coalesce(b.custom_charge, 0); u_rent := greatest(0, b.rent - paid); u_cust := greatest(0, cust - greatest(0, paid - b.rent));
  u_prev := greatest(0, greatest(0, b.rent + b.charges - paid) - u_rent - u_cust);
  lft := kept;
  for x in select * from (values (1, u_rent, 'Unpaid rent'), (2, u_cust, 'Unpaid customization charge'), (3, u_prev, 'Earlier late fee / charges'), (4, lf, 'Late-return fee'), (5, dc, 'Damage / repair / cleaning charge')) v(o, amt, why) order by o loop
    t := least(lft, x.amt); if t > 0 then applied := applied || jsonb_build_array(jsonb_build_object('amt', t, 'why', x.why)); lft := lft - t; end if;
  end loop;
  if lft > 0 then applied := applied || jsonb_build_array(jsonb_build_object('amt', lft, 'why', 'Unpaid dues')); end if;
  return jsonb_build_object('late_days', late, 'grace_days', g, 'per_day', coalesce(d.extra_day_fee, 0), 'suggested_late_fee', suggested, 'deposit_held', dep_held,
    'owing', greatest(0, b.rent + b.charges - paid), 'refund', refund, 'kept', kept, 'applied', applied);
end $$;

create or replace function return_preview(p_booking text, p_late_fee int, p_damage_charge int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  return _return_calc(p_booking, p_late_fee, p_damage_charge);
end $$;

-- The website sends only what a person decides (condition, notes, photos, the fees charged, how the refund is paid).
-- The database works out the refund and what the deposit is kept against, then runs the existing return_dress().
create or replace function return_booking(p_booking text, p_condition text, p_notes text, p_photos text[], p_clean_required boolean, p_late_fee int, p_damage_charge int, p_refund_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c jsonb; res jsonb; sug int;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  c := _return_calc(p_booking, p_late_fee, p_damage_charge);
  res := return_dress(p_booking, p_condition, p_notes, p_photos, p_clean_required, greatest(0, coalesce(p_late_fee, 0)), greatest(0, coalesce(p_damage_charge, 0)),
                      (c->>'refund')::int, p_refund_mode, c->'applied');
  sug := (c->>'suggested_late_fee')::int;
  if greatest(0, coalesce(p_late_fee, 0)) <> sug then   -- a late fee different from the calculated one is allowed, but it is on record and the owner is told
    insert into owner_notices(kind, booking_id, message, created_by_name)
      values ('late_fee_changed', p_booking, 'Late fee charged Rs ' || greatest(0, coalesce(p_late_fee, 0)) || ' (calculated Rs ' || sug || ').', staff_name());
    update bookings set log = coalesce(log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('t', now(), 'by', staff_name(), 'm', 'Late fee set to Rs ' || greatest(0, coalesce(p_late_fee, 0)) || ' (calculated Rs ' || sug || ')')) where id = p_booking;
  end if;
  return res;
end $$;

-- ───────────────────────── Grants for the new functions ─────────────────────────
revoke execute on function request_gap_override(uuid, date, date, text, text), record_payment(text, jsonb),
  deliver_booking(text, int, int, text, text, text, text, text), _return_calc(text, int, int), return_preview(text, int, int),
  return_booking(text, text, text, text[], boolean, int, int, text) from public, anon;
grant execute on function request_gap_override(uuid, date, date, text, text), record_payment(text, jsonb),
  deliver_booking(text, int, int, text, text, text, text, text), return_preview(text, int, int),
  return_booking(text, text, text, text[], boolean, int, int, text) to authenticated;
