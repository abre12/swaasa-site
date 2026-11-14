-- Core rules, on the real schema. Every check is an ASSERT: if one is wrong the whole run fails and says which.
\set ON_ERROR_STOP on
set timezone = 'Asia/Kolkata';   -- the shop's days are India days, so current_date must be too wherever the test runs
\set owner   '''00000000-0000-0000-0000-000000000001'''
\set manager '''00000000-0000-0000-0000-000000000002'''
\set prep    '''00000000-0000-0000-0000-000000000003'''

-- ---------- fixtures (triggers off, so old dates and an "out" dress can be set up directly) ----------
insert into auth.users(id, email) values (:owner, 'o@x.test'), (:manager, 'm@x.test'), (:prep, 'p@x.test');
insert into staff(user_id, name, role) values (:owner, 'Owner', 'owner'), (:manager, 'Sruthi', 'manager'), (:prep, 'Prep', 'preparation');
insert into dresses(id, code, name, category, price, status, extra_day_fee) values
  ('00000000-0000-0000-0000-0000000000d1', 'D1', 'Gown one', 'Wedding gown', 1000, 'available', 500),
  ('00000000-0000-0000-0000-0000000000d2', 'D2', 'Gown two', 'Wedding gown', 1000, 'available', 500),
  ('00000000-0000-0000-0000-0000000000d3', 'D3', 'Gown three', 'Wedding gown', 1000, 'available', 500),
  ('00000000-0000-0000-0000-0000000000d4', 'D4', 'Gown four', 'Wedding gown', 1000, 'available', 500);
set session_replication_role = replica;
insert into bookings(id, dress_id, customer_name, phone, start_date, end_date, rent, deposit, status, taken_by) values
  ('B1', '00000000-0000-0000-0000-0000000000d1', 'Ganesh', '9812345601', current_date, current_date + 3, 10000, 5000, 'confirmed', :manager),
  ('B2', '00000000-0000-0000-0000-0000000000d2', 'Short',  '9812345602', current_date, current_date + 3, 10000, 0,    'confirmed', :manager),
  ('B3', '00000000-0000-0000-0000-0000000000d3', 'Late',   '9812345603', current_date - 6, current_date - 3, 10000, 5000, 'out', :manager),
  ('B6', '00000000-0000-0000-0000-0000000000d4', 'Late2',  '9812345604', current_date - 5, current_date - 2, 10000, 5000, 'out', :manager);
insert into payments(booking_id, amount, kind, purpose, mode) values
  ('B3', 10000, 'rent', 'rent', 'Cash'), ('B3', 5000, 'deposit', 'deposit', 'Cash'), ('B6', 10000, 'rent', 'rent', 'Cash'), ('B6', 5000, 'deposit', 'deposit', 'Cash');
set session_replication_role = default;

-- ---------- MR-3: delivery is all-or-nothing ----------
select set_config('request.jwt.claim.sub', :manager, false); set role authenticated;
do $$ declare ok boolean := false; begin
  begin perform deliver_booking('B1', 1000, 10000, 'Cash', '', 'idem-wrong-dep', null, null); exception when others then ok := sqlerrm like '%DEPOSIT_FULL_REQUIRED%'; end;
  assert ok, 'a part deposit must be refused';
  assert (select count(*) from payments where booking_id = 'B1') = 0, 'a refused delivery must leave no payment behind';
end $$;
do $$ declare r text; begin
  r := deliver_booking('B1', 5000, 10000, 'Cash', '', 'idem-good-0001', null, 'Hem still pending, checked by me');
  assert r = 'delivered', 'delivery should succeed, got ' || r;
  assert (select status from bookings where id = 'B1') = 'out', 'booking should be out';
  assert (select coalesce(sum(amount), 0) from payments where booking_id = 'B1') = 15000, 'deposit and rent should both be recorded';
  assert deliver_booking('B1', 5000, 10000, 'Cash', '', 'idem-good-0001', null, null) = 'duplicate', 'the same tap twice must be ignored';
  assert (select count(*) from payments where booking_id = 'B1') = 2, 'no double payment';
end $$;
do $$ declare r text; begin
  r := deliver_booking('B2', 0, 4000, 'Cash', '', 'idem-short-001', 'Customer will pay the balance later', null);
  assert r = 'pending_approval', 'a shortfall without approval must wait, got ' || r;
  assert (select status from bookings where id = 'B2') = 'confirmed', 'it must not be delivered yet';
  assert (select coalesce(sum(amount), 0) from payments where booking_id = 'B2') = 4000, 'the money received is still recorded';
  assert exists (select 1 from approvals where booking_id = 'B2' and action_type = 'shortfall' and status = 'pending'), 'an approval request must exist';
end $$;

-- ---------- SA-3: the owner is told when a not-ready dress is delivered ----------
select set_config('request.jwt.claim.sub', :owner, false);
do $$ begin
  assert (select count(*) from owner_notices where kind = 'deliver_anyway' and booking_id = 'B1') = 1, 'the owner must get a notice';
end $$;
select set_config('request.jwt.claim.sub', :manager, false);
do $$ begin assert (select count(*) from owner_notices) = 0, 'staff must not be able to read the owner notices'; end $$;

-- ---------- MR-4: the database works out the late fee, refund and what is kept ----------
do $$ declare c jsonb; r jsonb; begin
  c := return_preview('B3', null, 0);
  assert (c->>'late_days')::int = 3 and (c->>'suggested_late_fee')::int = 1500, 'three late days at 500 is 1500';
  c := return_preview('B3', 1500, 0);
  assert (c->>'refund')::int = 3500 and (c->>'kept')::int = 1500, 'a 1500 late fee leaves 3500 to hand back';
  r := return_booking('B3', 'good', null, '{}', false, 1500, 0, 'Cash');
  assert (r->>'refund')::int = 3500, 'the return reports the refund';
  assert (select coalesce(sum(amount), 0) from payments where booking_id = 'B3' and kind = 'deposit_refund') = 3500, 'refund recorded';
  assert (select status from bookings where id = 'B3') = 'returned', 'booking returned';
  assert (select count(*) from owner_notices where booking_id = 'B3') = 0, 'a calculated late fee needs no notice';
  perform return_booking('B6', 'good', null, '{}', false, 0, 0, 'Cash');
end $$;
select set_config('request.jwt.claim.sub', :owner, false);
do $$ begin assert (select count(*) from owner_notices where kind = 'late_fee_changed' and booking_id = 'B6') = 1, 'a changed late fee must tell the owner'; end $$;

-- ---------- SA-3: staff need the owner to approve a cleaning-gap override ----------
reset role; set session_replication_role = replica;
insert into bookings(id, dress_id, customer_name, phone, start_date, end_date, rent, status) values ('G1', '00000000-0000-0000-0000-0000000000d1', 'Gap', '9812345605', current_date + 10, current_date + 12, 5000, 'confirmed');
set session_replication_role = default;
select set_config('request.jwt.claim.sub', :manager, false);
do $$ declare ok boolean := false; aid uuid; begin
  begin update bookings set gap_override = true, start_date = current_date + 11 where id = 'G1'; exception when others then ok := sqlerrm like '%GAP_APPROVAL_REQUIRED%'; end;
  assert ok, 'staff must not override the cleaning gap alone';
  aid := request_gap_override('00000000-0000-0000-0000-0000000000d1', current_date + 11, current_date + 12, 'G1', 'Customer insists, checked with the tailor');
  assert aid is not null, 'a request can be made';
end $$;
select set_config('request.jwt.claim.sub', :owner, false);
update approvals set status = 'approved', decided_by = auth.uid(), decided_at = now() where action_type = 'gap_override';
select set_config('request.jwt.claim.sub', :manager, false);
do $$ declare ok boolean := false; begin
  update bookings set gap_override = true, start_date = current_date + 11 where id = 'G1';
  assert (select gap_override from bookings where id = 'G1'), 'the approved override works once';
end $$;
select set_config('request.jwt.claim.sub', :owner, false);
update bookings set start_date = current_date + 20, end_date = current_date + 22 where id = 'G1';    -- move it away so only the approval rule can object next
select set_config('request.jwt.claim.sub', :manager, false);
do $$ declare ok boolean := false; begin
  begin insert into bookings(id, dress_id, customer_name, phone, start_date, end_date, gap_override) values ('G2', '00000000-0000-0000-0000-0000000000d1', 'Reuse', '9812345606', current_date + 11, current_date + 12, true);
  exception when others then ok := sqlerrm like '%GAP_APPROVAL_REQUIRED%'; end;
  assert ok, 'the same approval cannot be used twice';
end $$;
select set_config('request.jwt.claim.sub', :owner, false);
update bookings set gap_override = true, start_date = current_date + 12, end_date = current_date + 13 where id = 'G1';

-- ---------- lock-down: no direct payments, no direct return, nothing for signed-out users ----------
select set_config('request.jwt.claim.sub', :manager, false); set role authenticated;
do $$ declare ok boolean := false; begin
  begin insert into payments(booking_id, amount, kind, mode) values ('G1', 100, 'rent', 'Cash'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'a browser must not insert payments directly';
  assert record_payment('G1', '[{"amount":100,"kind":"rent","purpose":"rent","mode":"Cash"}]'::jsonb) = 1, 'record_payment is the way in';
  ok := false;
  begin perform record_payment('G1', '[{"amount":-5,"kind":"rent","mode":"Cash"}]'::jsonb); exception when others then ok := sqlerrm like '%BAD_AMOUNT%'; end;
  assert ok, 'a negative amount must be refused';
  ok := false;
  begin perform return_dress('G1', 'good', null, '{}', false, 0, 0, 999999, 'Cash', '[]'::jsonb); exception when insufficient_privilege then ok := true; end;
  assert ok, 'return_dress must not be callable with a typed-in refund';
end $$;
reset role; set role anon;
do $$ declare ok boolean := false; begin
  begin perform deliver_booking('B1', 0, 0, 'Cash', '', 'idem-anon-0001', null, null); exception when insufficient_privilege then ok := true; end;
  assert ok, 'signed-out users must not be able to call database functions';
end $$;
reset role;

-- ---------- N-3: phone numbers and customers ----------
select set_config('request.jwt.claim.sub', :manager, false);
do $$ declare ok boolean := false; begin
  assert phone_key('+91 98765 43210') = '9876543210' and phone_key('+44 7700 900123') = '+447700900123', 'phone keys';
  assert not phone_valid('12345') and phone_valid('9876543210'), 'phone checks';
  insert into bookings(id, dress_id, customer_name, phone, start_date, end_date, rent, status) values
    ('T1', '00000000-0000-0000-0000-0000000000d1', 'Ganesh',  '+91 98765 43210', current_date + 30, current_date + 32, 1000, 'confirmed'),
    ('T2', '00000000-0000-0000-0000-0000000000d1', 'ganesh ', '09876543210',     current_date + 40, current_date + 42, 1000, 'confirmed'),
    ('T3', '00000000-0000-0000-0000-0000000000d1', 'Priya',   '9876543210',      current_date + 50, current_date + 52, 1000, 'confirmed');
  assert (select count(*) from customers where phone_key = '9876543210') = 2, 'the same person is one record and a family on one number is two';
  assert (select count(distinct customer_id) from bookings where id in ('T1', 'T2')) = 1, 'T1 and T2 are the same person';
  begin insert into bookings(id, dress_id, customer_name, phone, start_date, end_date, rent, status) values ('T5', '00000000-0000-0000-0000-0000000000d1', 'Bad', '12345', current_date + 70, current_date + 72, 1000, 'confirmed');
  exception when others then ok := sqlerrm like '%BAD_PHONE%'; end;
  assert ok, 'an invalid phone number must be refused';
  ok := false;
  begin perform add_customer('X', '9812300000', null); exception when others then ok := sqlerrm like '%FORBIDDEN%'; end;
  assert ok, 'only the owner can add a customer by hand';
end $$;
select set_config('request.jwt.claim.sub', :owner, false);
do $$ begin
  assert add_customer('Zed', '9812300000', null) is not null, 'owner can add a customer';
  assert merge_customers((select id from customers where name = 'Zed'), (select id from customers where name = 'Ganesh')) = 0, 'merge works';
  assert not exists (select 1 from customers where name = 'Zed'), 'the merged record is gone';
end $$;

-- ---------- IN-1 / IN-3: the readiness log only accepts the true stage ----------
reset role; set session_replication_role = replica;
insert into bookings(id, dress_id, customer_name, phone, start_date, end_date, rent, status) values ('R1', '00000000-0000-0000-0000-0000000000d2', 'Asha', '9812345607', current_date + 2, current_date + 4, 1000, 'confirmed');
set session_replication_role = default;
select set_config('request.jwt.claim.sub', :manager, false);
do $$ begin
  assert log_readiness('[{"booking_id":"R1","stage":"D-2","ready":false,"reason_codes":["alteration"],"reasons":"Alteration pending"},{"booking_id":"R1","stage":"D-0","ready":true}]'::jsonb) = 1, 'only the true stage is kept';
  assert log_readiness('[{"booking_id":"R1","stage":"D-2","ready":true}]'::jsonb) = 0, 'the first record of the day is kept';
  assert (select ready from readiness_log where booking_id = 'R1' and stage = 'D-2') = false, 'and not overwritten';
end $$;

-- ---------- SA-4: the Preparation role cannot read bookings ----------
select set_config('request.jwt.claim.sub', :prep, false);
do $$ begin
  assert not is_ops(), 'preparation is not ops';
  assert not exists (select 1 from pg_policies where tablename = 'bookings' and cmd in ('SELECT', 'ALL') and qual not like '%is_ops%' and qual not like '%is_owner%'), 'every bookings read rule is limited to owner and manager';
end $$;
reset all;
\echo 'core rules: all checks passed'
