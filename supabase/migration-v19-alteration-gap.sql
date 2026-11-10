-- Migration v19: alterations are never started on a dress that has already gone out. Run after v18. Safe to run more than once.
-- Changes no existing data.

-- 1. The rule that creates an alteration job from a booking's alteration notes:
--    * only for bookings that are still Pending or Confirmed (it used to include Out);
--    * it no longer relies on the old prep_status flag. It does not create a second job once a completed one exists
--      (so correcting a typo in the notes after quality check does not restart the alteration).
create or replace function sync_alteration_job() returns trigger language plpgsql security definer set search_path=public as $$
declare txt text := nullif(trim(coalesce(new.alteration_notes,'')),''); j alteration_jobs%rowtype;
begin
  select * into j from alteration_jobs where booking_id=new.id and source='booking' and status not in ('ready','cancelled') limit 1;
  if new.status='cancelled' then
    if found then update alteration_jobs set status='cancelled', updated_at=now() where id=j.id; end if;
    return new;
  end if;
  if txt is null then
    if found and j.status='pending_dispatch' then update alteration_jobs set status='cancelled', updated_at=now() where id=j.id; end if;
    return new;
  end if;
  if found then
    if j.requirements is distinct from txt then update alteration_jobs set requirements=txt, updated_at=now() where id=j.id; end if;
  elsif new.status in ('pending','confirmed')
        and not exists (select 1 from alteration_jobs d where d.booking_id=new.id and d.source='booking' and d.status='ready') then
    insert into alteration_jobs(booking_id,dress_id,status,requirements,created_by)
    values (new.id,new.dress_id,'pending_dispatch',txt,new.taken_by);
  end if;
  return new;
end $$;

-- 2. Hard guard: nobody can add a booking alteration to a booking that is out, returned or cancelled.
--    (Repair jobs raised at return are a different kind, source = 'damage', and are not affected.)
create or replace function alteration_job_booking_active() returns trigger language plpgsql security definer set search_path=public as $$
declare st text;
begin
  if new.source = 'booking' and new.status not in ('ready','cancelled') then
    select status into st from bookings where id = new.booking_id;
    if st is not null and st not in ('pending','confirmed') then raise exception 'BOOKING_NOT_ACTIVE'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_alteration_booking_active on alteration_jobs;
create trigger t_alteration_booking_active before insert on alteration_jobs for each row execute function alteration_job_booking_active();

-- REVIEW (read-only): alteration jobs still open on bookings that are already out. Each one shows as an
-- "Alteration still open" alert in the app; open the booking and close it as completed, skipped or missed.
--   select j.id, j.booking_id, j.status, b.status as booking_status, b.start_date
--   from alteration_jobs j join bookings b on b.id = j.booking_id
--   where j.source = 'booking' and j.status in ('pending_dispatch','at_unit','quality_check') and b.status in ('out','returned');
