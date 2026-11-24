-- Migration v32: the customer booking tracker now works out the preparation stage from the live records.
--
-- Why: v31 returned bookings.prep_status, but the app stopped writing that column long ago (only a trigger sets it, and only to 'delivered').
-- A customer therefore saw "Booking confirmed" and then jumped straight to "Rental in progress", and never saw "Alterations in progress",
-- "Final preparation" or "Ready". The staff screens already derive this from the open work (lib/readiness.ts: bookingReadiness); this does the
-- same for the customer, in the database, so the public route stays a thin read.
--
-- Stage given to the customer (the column keeps its name and the five values the page already understands):
--   status 'confirmed' only (a pending request is never "ready"; out / returned / cancelled keep the stored value, which is 'delivered' once out):
--     alterations_pending  an open alteration job for THIS booking
--     cleaning_pending     the dress is being repaired or is marked damaged, or has open dry cleaning and this is the dress's next upcoming booking
--     not_started          the previous customer still has the dress, or the dress is unavailable, or nothing is under way and delivery is not close
--     ready                nothing under way and delivery is within READY_WINDOW_DAYS (below)
-- READY_WINDOW_DAYS is 3: a booking made months ahead does not say "Ready" for months. Change the number below to widen or narrow it.
-- Additive: the function keeps its name, arguments and result columns, so it is safe to apply before or after the website change.

begin;

create or replace function public.customer_booking_track(
  p_booking_id text,
  p_phone text,
  p_ip_hash text
)
returns table (
  allowed boolean,
  booking_id text,
  booking_status text,
  prep_status text,
  start_date date,
  end_date date,
  event_date date,
  event_type text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_ready_window_days constant integer := 3;   -- READY_WINDOW_DAYS
begin
  if coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'BAD_REQUEST';
  end if;

  insert into public.booking_tracking_rate_limits as lim (ip_hash, window_started_at, attempts, updated_at)
  values (p_ip_hash, now(), 1, now())
  on conflict (ip_hash) do update set
    window_started_at = case
      when lim.window_started_at <= now() - interval '15 minutes' then now()
      else lim.window_started_at
    end,
    attempts = case
      when lim.window_started_at <= now() - interval '15 minutes' then 1
      else lim.attempts + 1
    end,
    updated_at = now()
  returning attempts into v_attempts;

  if v_attempts = 1 then
    delete from public.booking_tracking_rate_limits where updated_at < now() - interval '30 days';
  end if;

  if v_attempts > 20 then
    return query select false, null::text, null::text, null::text, null::date, null::date, null::date, null::text;
    return;
  end if;

  if length(trim(coalesce(p_booking_id, ''))) not between 3 and 32 or length(v_phone) not between 10 and 15 then
    return;
  end if;

  return query
  select true, b.id, b.status,
    case
      when b.status <> 'confirmed' then b.prep_status
      when exists (select 1 from public.alteration_jobs j
                   where j.booking_id = b.id and j.source <> 'damage'
                     and j.status in ('pending_dispatch', 'at_unit', 'quality_check')) then 'alterations_pending'
      when d.status = 'maintenance'
        or exists (select 1 from public.alteration_jobs j
                   where j.dress_id = b.dress_id and j.source = 'damage'
                     and j.status in ('pending_dispatch', 'at_unit', 'quality_check')) then 'cleaning_pending'
      when exists (select 1 from public.dry_clean_requests r
                   where r.dress_id = b.dress_id and r.status in ('to_be_sent', 'sent', 'returned_pending_check'))
        and not exists (select 1 from public.bookings x
                        where x.dress_id = b.dress_id and x.id <> b.id and x.status in ('pending', 'confirmed')
                          and (x.start_date < b.start_date
                               or (x.start_date = b.start_date and coalesce(x.created_at, 'epoch'::timestamptz) < coalesce(b.created_at, 'epoch'::timestamptz))))
        then 'cleaning_pending'
      when exists (select 1 from public.bookings o
                   where o.dress_id = b.dress_id and o.id <> b.id and o.status = 'out' and o.start_date < b.start_date) then 'not_started'
      when d.status in ('unavailable', 'retired', 'archived') then 'not_started'
      when b.start_date <= public.ist_today() + v_ready_window_days then 'ready'
      else 'not_started'
    end,
    b.start_date, b.end_date, b.event_date, b.event_type
  from public.bookings as b
  left join public.dresses as d on d.id = b.dress_id
  where b.id = upper(trim(p_booking_id))
    and right(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), 10) = right(v_phone, 10)
  limit 1;
end;
$$;

revoke all on function public.customer_booking_track(text, text, text) from public, anon, authenticated;
grant execute on function public.customer_booking_track(text, text, text) to service_role;

commit;
