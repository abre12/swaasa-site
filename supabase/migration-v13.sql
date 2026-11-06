-- Migration v13: Damaged Queue in Alterations.
-- A return saved as "Damage / repair required" creates an alteration job linked to the dress and the return inspection.
-- It uses the normal alteration stages (Pending Dispatch -> At Tailoring Unit -> Quality Check -> Ready); no new statuses.
-- Run after migration-v12.sql. Safe to run more than once.

alter table alteration_jobs add column if not exists source text not null default 'booking' check (source in ('booking','damage'));
alter table alteration_jobs add column if not exists inspection_id uuid references return_inspections(id) on delete set null;

-- A booking may have one active booking alteration AND one active damage repair.
drop index if exists alteration_jobs_one_active_per_booking;
create unique index if not exists alteration_jobs_one_active_per_booking on alteration_jobs(booking_id, source) where status not in ('ready','cancelled');
-- One queue item per return inspection.
create unique index if not exists alteration_jobs_one_per_inspection on alteration_jobs(inspection_id) where inspection_id is not null;

-- The booking-notes sync (v11) must only ever touch booking alterations, never damage repairs.
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
  elsif new.status in ('pending','confirmed','out') and coalesce(new.prep_status,'')<>'ready' and coalesce(new.prep_status,'')<>'delivered' then
    insert into alteration_jobs(booking_id,dress_id,status,requirements,created_by)
    values (new.id,new.dress_id,'pending_dispatch',txt,new.taken_by);
  end if;
  return new;
end $$;
