-- Migration v33: website enquiries ("Request a private viewing" and "Call me back") are saved in the database.
-- Before this, an enquiry lived only in the Telegram chat, so a missed or deleted message meant a lost customer, and the spam limits lived in
-- server memory (they reset on every cold start and were not shared between serverless instances).
--
-- What this adds
--   leads               one row per enquiry, with a status the team moves along: new -> contacted -> visit_booked -> converted
--                       (or not_interested / spam). Only owner and manager can read it; nobody can write it from the browser except
--                       through lead_update(), which can change the status and the team's own note and nothing else.
--   lead_rate_limits    one row per visitor (a keyed hash of the IP address, never the address itself): the same pattern as the booking tracker.
--   lead_submit()       called only by the website's server. In one step it: ignores a repeat of the same request, limits one visitor to
--                       4 enquiries an hour and one phone number to 3 a day, saves the lead, and says whether to message Telegram.
--   lead_mark_telegram()  records whether the Telegram message went out.
--   leads_housekeeping()  tidies old limiter rows and old spam / not-interested leads (the daily watchdog calls it).
--
-- There is deliberately NO global "40 an hour" cap any more. It let one spammer use up everyone's allowance and block real customers.
-- Every enquiry that passes the bot check is saved. Only the Telegram message is throttled (after 20 messages in an hour the team gets one
-- "many enquiries, open the app" message instead), so a flood can never hide or block a real lead.
-- Additive: safe to apply before or after the website code is deployed.

begin;

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('viewing', 'callback')),
  status text not null default 'new' check (status in ('new', 'contacted', 'visit_booked', 'converted', 'not_interested', 'spam')),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null check (char_length(phone) between 8 and 20),
  looking_for text check (looking_for is null or char_length(looking_for) <= 40),
  event_date date,
  visit_date date,
  call_time text check (call_time is null or char_length(call_time) <= 12),
  note text check (note is null or char_length(note) <= 500),
  source text not null default 'website' check (char_length(source) <= 40),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  telegram text not null default 'pending' check (telegram in ('pending', 'sent', 'failed', 'throttled')),
  staff_note text check (staff_note is null or char_length(staff_note) <= 500),
  status_changed_at timestamptz,
  status_changed_by text
);

create index if not exists leads_status_created_idx on public.leads (status, created_at desc);
create index if not exists leads_phone_kind_idx on public.leads (phone, kind, created_at desc);

alter table public.leads enable row level security;
revoke all on table public.leads from public, anon, authenticated;
grant select on table public.leads to authenticated;

drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select to authenticated using (is_ops());

create table if not exists public.lead_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists lead_rate_limits_updated_at_idx on public.lead_rate_limits (updated_at);
alter table public.lead_rate_limits enable row level security;
revoke all on table public.lead_rate_limits from public, anon, authenticated, service_role;

create or replace function public.lead_submit(
  p_ip_hash text,
  p_kind text,
  p_name text,
  p_phone text,
  p_looking_for text,
  p_event_date date,
  p_visit_date date,
  p_call_time text,
  p_note text
)
returns table (outcome text, lead_id bigint, tg_action text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
  v_id bigint;
  v_busy integer;
  v_throttled integer;
  v_telegram text := 'pending';
  v_action text := 'send';
begin
  if coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$' or p_kind not in ('viewing', 'callback') then
    raise exception 'BAD_REQUEST';
  end if;

  -- 1. The same request again within ten minutes (a double tap): hand back the first one. This does not use up the visitor's allowance.
  select l.id into v_id from public.leads l
   where l.kind = p_kind and l.phone = p_phone and l.created_at > now() - interval '10 minutes'
   order by l.id desc limit 1;
  if v_id is not null then
    return query select 'duplicate'::text, v_id, 'none'::text;
    return;
  end if;

  -- 2. One visitor: at most 4 enquiries in an hour (same shape as the booking tracker's limiter).
  insert into public.lead_rate_limits as lim (ip_hash, window_started_at, attempts, updated_at)
  values (p_ip_hash, now(), 1, now())
  on conflict (ip_hash) do update set
    window_started_at = case when lim.window_started_at <= now() - interval '1 hour' then now() else lim.window_started_at end,
    attempts = case when lim.window_started_at <= now() - interval '1 hour' then 1 else lim.attempts + 1 end,
    updated_at = now()
  returning attempts into v_attempts;
  if v_attempts = 1 then
    delete from public.lead_rate_limits where updated_at < now() - interval '2 days';
  end if;
  if v_attempts > 4 then
    return query select 'limited_visitor'::text, null::bigint, 'none'::text;
    return;
  end if;

  -- 3. One phone number: at most 3 enquiries in a day, so typing someone else's number over and over cannot flood them.
  if (select count(*) from public.leads l where l.phone = p_phone and l.created_at > now() - interval '24 hours') >= 3 then
    return query select 'limited_phone'::text, null::bigint, 'none'::text;
    return;
  end if;

  -- 4. Should the team be messaged? Normally yes. After 20 messages in the last hour the lead is still saved, but only the first one that
  --    is held back sends a single "many enquiries" message; the rest wait quietly in the app.
  select count(*) into v_busy from public.leads l where l.telegram in ('sent', 'pending') and l.created_at > now() - interval '1 hour';
  if v_busy >= 20 then
    select count(*) into v_throttled from public.leads l where l.telegram = 'throttled' and l.created_at > now() - interval '1 hour';
    v_telegram := 'throttled';
    v_action := case when v_throttled = 0 then 'summary' else 'none' end;
  end if;

  insert into public.leads (kind, name, phone, looking_for, event_date, visit_date, call_time, note, ip_hash, telegram)
  values (p_kind, p_name, p_phone, nullif(p_looking_for, ''), p_event_date, p_visit_date, nullif(p_call_time, ''), nullif(p_note, ''), p_ip_hash, v_telegram)
  returning id into v_id;

  return query select 'created'::text, v_id, v_action;
end;
$$;

create or replace function public.lead_mark_telegram(p_id bigint, p_ok boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.leads set telegram = case when p_ok then 'sent' else 'failed' end where id = p_id and telegram = 'pending';
$$;

-- The team's side: change the status and the team's own note. Nothing else about a lead can be edited, and a lead cannot be deleted from the app.
create or replace function public.lead_update(p_id bigint, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if not is_ops() then raise exception 'NOT_ALLOWED'; end if;
  if p_status not in ('new', 'contacted', 'visit_booked', 'converted', 'not_interested', 'spam') then raise exception 'BAD_STATUS'; end if;
  select s.name into v_name from public.staff s where s.user_id = auth.uid();
  update public.leads l set
    status = p_status,
    staff_note = nullif(left(coalesce(p_note, ''), 500), ''),
    status_changed_at = case when l.status is distinct from p_status then now() else l.status_changed_at end,
    status_changed_by = case when l.status is distinct from p_status then coalesce(v_name, 'Staff') else l.status_changed_by end
  where l.id = p_id;
end;
$$;

create or replace function public.leads_housekeeping()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old integer;
begin
  delete from public.lead_rate_limits where updated_at < now() - interval '2 days';
  delete from public.leads where status in ('spam', 'not_interested') and created_at < now() - interval '180 days';
  get diagnostics v_old = row_count;
  return v_old;
end;
$$;

revoke all on function public.lead_submit(text, text, text, text, text, date, date, text, text) from public, anon, authenticated;
grant execute on function public.lead_submit(text, text, text, text, text, date, date, text, text) to service_role;
revoke all on function public.lead_mark_telegram(bigint, boolean) from public, anon, authenticated;
grant execute on function public.lead_mark_telegram(bigint, boolean) to service_role;
revoke all on function public.leads_housekeeping() from public, anon, authenticated;
grant execute on function public.leads_housekeeping() to service_role;
revoke all on function public.lead_update(bigint, text, text) from public, anon;
grant execute on function public.lead_update(bigint, text, text) to authenticated;

commit;
