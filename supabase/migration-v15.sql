-- Migration v15: owner approvals in the notification bell.
--  * Keeps the requester's and decision-maker's NAME on every approval (so the audit trail still reads correctly if a staff login is later removed).
--  * Makes decided approvals permanent: once approved or rejected, a request can never be changed again, and only the owner can decide.
--  * Turns on live updates for approvals, so the bell and its count change without refreshing the page.
-- Run after migration-v14.sql. Safe to run more than once.
-- Nothing here adds a way to edit or delete payments: payments stay insert-only, as before.

alter table approvals add column if not exists requested_by_name text;
alter table approvals add column if not exists decided_by_name text;

-- fill in names for requests that already exist (done before the lock below is created)
update approvals a set requested_by_name = s.name from staff s where s.user_id = a.requested_by and a.requested_by_name is null;
update approvals a set decided_by_name   = s.name from staff s where s.user_id = a.decided_by   and a.decided_by_name   is null;

-- new requests record who asked, by name
create or replace function approvals_stamp_request() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.requested_by_name is null then new.requested_by_name := staff_name(); end if;
  return new;
end $$;
drop trigger if exists t_approvals_stamp_request on approvals;
create trigger t_approvals_stamp_request before insert on approvals for each row execute function approvals_stamp_request();

-- a decision records who decided, by name; a decided request is frozen; only the owner may decide
create or replace function approvals_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status <> 'pending' then raise exception 'APPROVAL_LOCKED'; end if;
  if new.booking_id is distinct from old.booking_id or new.action_type is distinct from old.action_type
     or new.request_details is distinct from old.request_details or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at or new.shortfall is distinct from old.shortfall then
    raise exception 'APPROVAL_LOCKED';
  end if;
  if new.status <> 'pending' then
    if not is_owner() then raise exception 'FORBIDDEN'; end if;
    new.decided_by := coalesce(new.decided_by, auth.uid());
    new.decided_at := coalesce(new.decided_at, now());
    new.decided_by_name := staff_name();
  end if;
  return new;
end $$;
drop trigger if exists t_approvals_guard on approvals;
create trigger t_approvals_guard before update on approvals for each row execute function approvals_guard();

-- live updates for the notification bell (the 20-second refresh keeps working if this is not available)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'approvals') then
    alter publication supabase_realtime add table approvals;
  end if;
end $$;
