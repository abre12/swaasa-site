-- Migration v11: alteration queue fills itself from bookings.
-- Before this, v10 copied alteration notes into alteration_jobs once. Bookings taken afterwards (staff or online),
-- or notes added/edited later, never reached the queue. A trigger on bookings now keeps the queue in step.
-- Safe to run more than once.

create or replace function sync_alteration_job() returns trigger language plpgsql security definer set search_path=public as $$
declare txt text := nullif(trim(coalesce(new.alteration_notes,'')),''); j alteration_jobs%rowtype;
begin
  select * into j from alteration_jobs where booking_id=new.id and status not in ('ready','cancelled') limit 1;

  -- Cancelled booking: close any open job.
  if new.status='cancelled' then
    if found then update alteration_jobs set status='cancelled', updated_at=now() where id=j.id; end if;
    return new;
  end if;

  if txt is null then
    -- Notes removed: drop a job that has not left the store yet; leave one already at the tailor alone.
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

drop trigger if exists bookings_sync_alteration on bookings;
create trigger bookings_sync_alteration after insert or update of alteration_notes, status on bookings
  for each row execute function sync_alteration_job();

-- Catch up bookings that were taken since v10 and never reached the queue.
insert into alteration_jobs(booking_id,dress_id,status,requirements,created_by)
select b.id,b.dress_id,'pending_dispatch',trim(b.alteration_notes),b.taken_by
from bookings b
where b.status in ('pending','confirmed','out') and nullif(trim(coalesce(b.alteration_notes,'')),'') is not null
  and coalesce(b.prep_status,'') not in ('ready','delivered')
  and not exists(select 1 from alteration_jobs a where a.booking_id=b.id and a.status not in ('ready','cancelled'))
  and not exists(select 1 from alteration_jobs a where a.booking_id=b.id and a.status='ready');
