-- Migration v20: stage-two controls. Run after v19. Safe to run more than once. Changes no existing data.
--   1. No booking can start in the past.
--   2. Extend a rental that is out (checks the next booking, prices the extra days).
--   3. Cleaner final check: a dress coming back from the cleaner must be confirmed clean, sent back, or marked damaged.
--   4. A damage return needs a note and at least one photo.
--   5. Optional handover photos on a booking.
--   6. Return-inspection photos move to a private bucket (the app now opens them with short-lived links).
--   7. A history of changes (who, when, what) for dresses, alterations and cleaning.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. No past start dates (new bookings, and any change to the start date of an unfinished booking)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function booking_start_guard() returns trigger language plpgsql as $$
begin
  if new.status in ('pending','confirmed') and (tg_op = 'INSERT' or new.start_date is distinct from old.start_date) and new.start_date < ist_today() then
    raise exception 'PAST_START';
  end if;
  return new;
end $$;
drop trigger if exists t_booking_start_guard on bookings;
create trigger t_booking_start_guard before insert or update of start_date, status on bookings for each row execute function booking_start_guard();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Extend a rental that is out. The existing date rules still apply (overlaps and cleaning blocks raise DATES_TAKEN).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function extend_rental(p_booking text, p_new_end date, p_charge int, p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b bookings; why text := nullif(trim(coalesce(p_reason,'')),''); ch int := greatest(0, coalesce(p_charge,0)); extra int;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if why is null then raise exception 'REASON_REQUIRED'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'out' then raise exception 'BAD_STATUS'; end if;
  if p_new_end is null or p_new_end <= b.end_date then raise exception 'BAD_DATES'; end if;
  extra := p_new_end - b.end_date;
  update bookings set end_date = p_new_end, charges = charges + ch,
    log = log || jsonb_build_array(jsonb_build_object('t', now(),
      'm', 'Rental extended from ' || to_char(b.end_date,'DD Mon YYYY') || ' to ' || to_char(p_new_end,'DD Mon YYYY') || ' (' || extra || ' day' || case when extra = 1 then '' else 's' end || '). Extension charge Rs ' || ch || '. Reason: ' || why,
      'by', staff_name()))
  where id = p_booking;
  return jsonb_build_object('days', extra, 'charge', ch);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Cleaner final check, in one transaction.  p_result: 'ok' (clean and ready) | 'reclean' (send back) | 'damaged'
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function finish_dry_clean(p_request uuid, p_date date, p_cost int, p_notes text, p_result text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r dry_clean_requests; n text := nullif(trim(coalesce(p_notes,'')),''); cost int := greatest(0, coalesce(p_cost,0)); jobs int := 0;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_result not in ('ok','reclean','damaged') then raise exception 'BAD_RESULT'; end if;
  if p_result <> 'ok' and n is null then raise exception 'NOTE_REQUIRED'; end if;
  select * into r from dry_clean_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status not in ('sent','returned_pending_check') then raise exception 'BAD_STATUS'; end if;
  if r.sent_on is not null and p_date < r.sent_on then raise exception 'BAD_DATES'; end if;

  if r.dry_cleaning_id is not null then
    update dry_cleanings set charge = cost, returned_on = p_date, notes = nullif(concat_ws(' · ', notes, n), '') where id = r.dry_cleaning_id;
  end if;

  if p_result = 'ok' then
    update dry_clean_requests set status = 'complete', returned_on = p_date, returned_by = auth.uid(), final_charge = cost, returned_condition = 'Ready',
      return_notes = n, completed_at = now(), completed_by = auth.uid() where id = r.id;
    update dresses set condition = coalesce(n, 'Ready after dry cleaning') where id = r.dress_id;
  elsif p_result = 'reclean' then
    -- Back in the queue, to be sent again. The round that just ended stays in the history with its cost.
    update dry_clean_requests set status = 'to_be_sent', dry_cleaning_id = null, sent_on = null, sent_by = null, expected_back = null, vendor = null,
      estimated_charge = 0, returned_on = null, final_charge = null, condition_notes = 'Not satisfactory, send to cleaner again: ' || n, added_at = now() where id = r.id;
    update dresses set condition = n where id = r.dress_id;
  else
    update dry_clean_requests set status = 'complete', returned_on = p_date, returned_by = auth.uid(), final_charge = cost, returned_condition = 'Damaged',
      return_notes = n, completed_at = now(), completed_by = auth.uid() where id = r.id;
    update dresses set status = 'maintenance', condition = n where id = r.dress_id;
    if r.booking_id is not null and not exists (select 1 from alteration_jobs j where j.booking_id = r.booking_id and j.source = 'damage' and j.status in ('pending_dispatch','at_unit','quality_check')) then
      insert into alteration_jobs(booking_id, dress_id, source, requirements, status) values (r.booking_id, r.dress_id, 'damage', 'Damaged at the cleaner: ' || n, 'pending_dispatch');
      jobs := 1;
    end if;
  end if;
  return jsonb_build_object('result', p_result, 'repair_job', jobs);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. return_dress: a damage return needs a note and at least one photo (everything else in it is unchanged from v17)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Same function as v17 plus one check: a damage return must have a note and at least one photo.
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
  if p_condition = 'damage_repair' and (n is null or coalesce(array_length(p_photos,1),0) < 1) then raise exception 'DAMAGE_EVIDENCE'; end if;
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
-- 5. Optional handover photos
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table bookings add column if not exists handover_photos text[] not null default '{}';
create or replace function add_handover_photos(p_id text, p_urls text[]) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if coalesce(array_length(p_urls,1),0) = 0 then return; end if;
  update bookings set handover_photos = handover_photos || p_urls,
    log = log || jsonb_build_array(jsonb_build_object('t', now(), 'm', 'Handover photo added (' || array_length(p_urls,1) || ')', 'by', staff_name()))
  where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Private photo bucket. Only signed-in staff can open the files (the read policy already requires is_ops()).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
update storage.buckets set public = false where id = 'return-inspection-photos';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. History of changes: append-only, written by the database, never by the browser
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by_user uuid default auth.uid(),
  by_name text,
  entity text not null,            -- 'dress' | 'alteration' | 'cleaning'
  entity_id text,
  dress_id uuid,
  booking_id text,
  action text not null,
  detail text
);
create index if not exists events_dress_idx on events(dress_id, at desc);
create index if not exists events_booking_idx on events(booking_id, at desc);
alter table events enable row level security;
drop policy if exists events_read on events;
create policy events_read on events for select using (is_ops());
-- no insert / update / delete policy: only the triggers below (security definer) can write.

create or replace function log_event(p_entity text, p_id text, p_dress uuid, p_booking text, p_action text, p_detail text) returns void
language plpgsql security definer set search_path=public as $$
declare nm text;
begin
  begin nm := staff_name(); exception when others then nm := null; end;
  insert into events(by_user, by_name, entity, entity_id, dress_id, booking_id, action, detail) values (auth.uid(), nm, p_entity, p_id, p_dress, p_booking, p_action, p_detail);
end $$;

create or replace function trg_dress_events() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status then perform log_event('dress', new.id::text, new.id, null, 'Status changed', old.status || ' → ' || new.status); end if;
  if new.location is distinct from old.location then perform log_event('dress', new.id::text, new.id, null, 'Store location changed', coalesce(old.location,'none') || ' → ' || coalesce(new.location,'none')); end if;
  return new;
end $$;
drop trigger if exists t_dress_events on dresses;
create trigger t_dress_events after update of status, location on dresses for each row execute function trg_dress_events();

create or replace function trg_alteration_events() returns trigger language plpgsql security definer set search_path=public as $$
declare kind text := case when new.source = 'damage' then 'Repair' else 'Alteration' end;
begin
  if tg_op = 'INSERT' then perform log_event('alteration', new.id::text, new.dress_id, new.booking_id, kind || ' added', left(new.requirements, 200));
  elsif new.status is distinct from old.status then perform log_event('alteration', new.id::text, new.dress_id, new.booking_id, kind || ' status changed', old.status || ' → ' || new.status || coalesce(' · ' || nullif(left(new.notes, 200), ''), ''));
  end if;
  return new;
end $$;
drop trigger if exists t_alteration_events on alteration_jobs;
create trigger t_alteration_events after insert or update of status on alteration_jobs for each row execute function trg_alteration_events();

create or replace function trg_cleaning_events() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then perform log_event('cleaning', new.id::text, new.dress_id, new.booking_id, 'Added to cleaning list', left(new.condition_notes, 200));
  elsif new.status is distinct from old.status then perform log_event('cleaning', new.id::text, new.dress_id, new.booking_id, 'Cleaning status changed', old.status || ' → ' || new.status || coalesce(' · ' || nullif(left(coalesce(new.return_notes, new.condition_notes), 200), ''), ''));
  end if;
  return new;
end $$;
drop trigger if exists t_cleaning_events on dry_clean_requests;
create trigger t_cleaning_events after insert or update of status on dry_clean_requests for each row execute function trg_cleaning_events();

revoke execute on function extend_rental(text,date,int,text) from public;
revoke execute on function finish_dry_clean(uuid,date,int,text,text) from public;
revoke execute on function add_handover_photos(text,text[]) from public;
revoke execute on function log_event(text,text,uuid,text,text,text) from public, authenticated;
grant execute on function extend_rental(text,date,int,text) to authenticated;
grant execute on function finish_dry_clean(uuid,date,int,text,text) to authenticated;
grant execute on function add_handover_photos(text,text[]) to authenticated;
