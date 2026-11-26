-- Website enquiries (v33): saved in the database, limited per visitor and per phone, Telegram throttled, status changed only through lead_update.
-- Run as the table owner (the real caller is the service role, which also bypasses the access rules).
\set ON_ERROR_STOP on

create function pg_temp.hash(n int) returns text language sql as $$ select md5('v' || n) || md5('w' || n) $$;
create function pg_temp.submit(n int, kind text, phone text) returns text language sql as $$
  select outcome from lead_submit(pg_temp.hash(n), kind, 'Test Person', phone, 'Gown', null, null, 'Any time', 'a note')
$$;

do $$ declare r record; first_id bigint; begin
  -- a first enquiry is saved with the starting status and is allowed to message the team
  select * into r from lead_submit(pg_temp.hash(1), 'viewing', 'Test Person', '+919800000001', 'Gown', null, null, 'Morning', null);
  assert r.outcome = 'created' and r.tg_action = 'send' and r.lead_id is not null, 'first enquiry is created and notifies';
  first_id := r.lead_id;
  assert (select status from leads where id = first_id) = 'new' and (select telegram from leads where id = first_id) = 'pending', 'starts as new / pending';

  -- the same request again is a duplicate, returns the first lead, and does not use up the visitor allowance
  select * into r from lead_submit(pg_temp.hash(1), 'viewing', 'Test Person', '+919800000001', 'Gown', null, null, 'Morning', null);
  assert r.outcome = 'duplicate' and r.lead_id = first_id and r.tg_action = 'none', 'a repeat is a duplicate';
  -- the other kind from the same number is a different request
  assert pg_temp.submit(1, 'callback', '+919800000001') = 'created', 'a call-back is separate from a viewing';

  -- one visitor: 4 enquiries an hour (two used above), then refused
  assert pg_temp.submit(1, 'viewing', '+919800000002') = 'created', 'third from one visitor';
  assert pg_temp.submit(1, 'viewing', '+919800000003') = 'created', 'fourth from one visitor';
  assert pg_temp.submit(1, 'viewing', '+919800000004') = 'limited_visitor', 'fifth from one visitor is refused';
  assert (select count(*) from leads where phone = '+919800000004') = 0, 'a refused enquiry is not saved';
  -- another visitor is not affected by the first one's limit (no global cap)
  assert pg_temp.submit(2, 'viewing', '+919800000004') = 'created', 'a different visitor is not blocked';

  -- one phone number: 3 a day, from any visitors
  assert pg_temp.submit(3, 'callback', '+919800000010') = 'created' and pg_temp.submit(4, 'viewing', '+919800000010') = 'created', 'first two for a number';
end $$;

-- the phone-number cap: three different requests are fine, the fourth is refused (kinds alternate only twice, so back-date one to dodge the duplicate rule)
do $$ begin
  update leads set created_at = now() - interval '2 hours' where phone = '+919800000010';
  assert pg_temp.submit(6, 'viewing', '+919800000010') = 'created', 'third for the number within a day';
  assert pg_temp.submit(7, 'viewing', '+919800000010') = 'duplicate', 'same kind within ten minutes is a duplicate';
  update leads set created_at = now() - interval '1 hour' where phone = '+919800000010' and id = (select max(id) from leads where phone = '+919800000010');
  assert pg_temp.submit(8, 'viewing', '+919800000010') = 'limited_phone', 'the fourth in a day for one number is refused';
end $$;

-- mark_telegram only moves a pending lead
do $$ declare v bigint; begin
  select lead_id into v from lead_submit(pg_temp.hash(30), 'callback', 'Mark Me', '+919830000001', null, null, null, null, null);
  perform lead_mark_telegram(v, true);
  assert (select telegram from leads where id = v) = 'sent', 'marked sent';
  perform lead_mark_telegram(v, false);
  assert (select telegram from leads where id = v) = 'sent', 'a sent lead is not changed back';
end $$;

-- Telegram throttle: after 20 messages in an hour the lead is still saved, one summary is sent, the rest are quiet
do $$ declare r record; i int; begin
  for i in 1..20 loop
    insert into leads(kind, name, phone, telegram) values ('viewing', 'Seed Person', '+9198100' || lpad(i::text, 5, '0'), 'sent');
  end loop;
  select * into r from lead_submit(pg_temp.hash(20), 'viewing', 'Real Customer', '+919820000001', null, null, null, null, null);
  assert r.outcome = 'created' and r.tg_action = 'summary', 'the first held-back lead sends one summary';
  assert (select telegram from leads where id = r.lead_id) = 'throttled', 'it is marked throttled';
  select * into r from lead_submit(pg_temp.hash(21), 'viewing', 'Real Customer Two', '+919820000002', null, null, null, null, null);
  assert r.outcome = 'created' and r.tg_action = 'none', 'later held-back leads are saved quietly';
end $$;

-- access: the browser cannot read or write leads directly; the team changes a status only through lead_update
-- staff fixtures (manager ...0002 'Sruthi', preparation ...0003) come from 001_core.sql, which runs first on the same database
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare v bigint; begin
  assert (select count(*) from leads) > 0, 'a manager can read leads';
  v := (select min(id) from leads);
  perform lead_update(v, 'contacted', 'Called, will visit Saturday');
  assert (select status from leads where id = v) = 'contacted' and (select status_changed_by from leads where id = v) = 'Sruthi', 'status and who changed it are saved';
  assert (select staff_note from leads where id = v) = 'Called, will visit Saturday', 'the note is saved';
  begin perform lead_update(v, 'not-a-status', null); assert false, 'a bad status must be refused'; exception when others then assert sqlerrm = 'BAD_STATUS', 'bad status refused'; end;
  begin update leads set name = 'Changed' where id = v; assert false, 'a direct update must be refused'; exception when insufficient_privilege then null; end;
  begin delete from leads where id = v; assert false, 'a direct delete must be refused'; exception when insufficient_privilege then null; end;
  begin perform * from lead_submit(md5('a') || md5('b'), 'viewing', 'X', '+919840000001', null, null, null, null, null); assert false, 'the browser cannot call lead_submit'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin
  assert (select count(*) from leads) = 0, 'preparation staff cannot read leads';
  begin perform lead_update((select 1), 'contacted', null); assert false, 'preparation staff cannot update leads'; exception when others then assert sqlerrm = 'NOT_ALLOWED', 'preparation refused'; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform count(*) from leads; assert false, 'anon cannot read leads'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- housekeeping: old spam goes, a live lead stays
insert into leads(kind, name, phone, status, created_at) values ('viewing', 'Old Spam', '+919850000001', 'spam', now() - interval '200 days'), ('viewing', 'Old Won', '+919850000002', 'converted', now() - interval '200 days');
do $$ begin
  perform leads_housekeeping();
  assert not exists (select 1 from leads where name = 'Old Spam') and exists (select 1 from leads where name = 'Old Won'), 'old spam removed, old customer kept';
end $$;
\echo 'leads rules: all checks passed'
