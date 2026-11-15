-- Migration v31: customer-safe booking progress lookup.
-- Additive change; safe to apply before or after the website code is deployed.

begin;

create table if not exists public.booking_tracking_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists booking_tracking_rate_limits_updated_at_idx
  on public.booking_tracking_rate_limits (updated_at);

alter table public.booking_tracking_rate_limits enable row level security;
revoke all on table public.booking_tracking_rate_limits from public, anon, authenticated, service_role;

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
  select true, b.id, b.status, b.prep_status, b.start_date, b.end_date, b.event_date, b.event_type
  from public.bookings as b
  where b.id = upper(trim(p_booking_id))
    and right(regexp_replace(coalesce(b.phone, ''), '\D', '', 'g'), 10) = right(v_phone, 10)
  limit 1;
end;
$$;

revoke all on function public.customer_booking_track(text, text, text) from public, anon, authenticated;
grant execute on function public.customer_booking_track(text, text, text) to service_role;

commit;
