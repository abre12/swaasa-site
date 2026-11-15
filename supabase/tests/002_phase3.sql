-- Phase 3 rules (notes, missed enquiries, dress costs, day close, scorecard, leakage, OP-7). Runs after 001_core.sql on the same database.
\set ON_ERROR_STOP on
set timezone = 'Asia/Kolkata';
\set owner   '''00000000-0000-0000-0000-000000000001'''
\set manager '''00000000-0000-0000-0000-000000000002'''
\set prep    '''00000000-0000-0000-0000-000000000003'''
reset role;

-- ---------- OP-7: the unused notifications table and its triggers are gone ----------
do $$ begin
  assert to_regclass('public.admin_notifications') is null, 'admin_notifications should be dropped';
  assert not exists (select 1 from pg_trigger where tgname in ('t_notify_alteration', 't_notify_cleaning_request', 't_notify_pending_approval')), 'its triggers should be gone';
  assert (select shop_name from settings limit 1) <> '' and (select agreement_terms from settings limit 1) like '1. The dress%', 'BP-3 settings have defaults';
end $$;

-- ---------- N-17: one money symbol ----------
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ~ '(^|[^A-Za-z])Rs '), 'no database message may still say "Rs "';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc like '%' || chr(92) || '1₹%'), 'the replacement left no stray backslash';
  assert (select log::text from bookings where id = 'B1') like '%₹%' and (select log::text from bookings where id = 'B1') not like '%Rs %', 'the delivery log line uses the rupee sign';
end $$;

-- ---------- fixtures for the scorecard (triggers off) ----------
set session_replication_role = replica;
update bookings set discount = 500 where id = 'B1';
insert into cash_tally(day, counted, expected, difference, status) values (current_date - 1, 4800, 5000, -200, 'discrepancy');
insert into alteration_jobs(booking_id, dress_id, status, requirements, sent_on, expected_return, received_at) values
  ('B1', '00000000-0000-0000-0000-0000000000d1', 'ready', 'Hem', current_date - 5, current_date - 2, now() - interval '1 day');
insert into dry_cleanings(dress_id, sent_on, expected_back, returned_on, charge) values ('00000000-0000-0000-0000-0000000000d1', current_date - 4, current_date - 2, current_date - 1, 300);
insert into dresses(id, code, name, category, price, status, acquired_on) values ('00000000-0000-0000-0000-0000000000d9', 'D9', 'Old stock', 'Wedding gown', 1000, 'available', current_date - 200);
set session_replication_role = default;

-- ---------- N-11 handover notes ----------
select set_config('request.jwt.claim.sub', :manager, false); set role authenticated;
do $$ declare n uuid; ok boolean := false; begin
  n := add_handover_note('B2', null, 'Customer collecting at 5');
  assert (select note_date from handover_notes where id = n) = (select start_date from bookings where id = 'B2'), 'a booking note defaults to the delivery day';
  perform add_handover_note(null, current_date, 'Tailor visiting at noon');
  assert (select count(*) from handover_notes) = 2, 'staff can read the notes';
  perform set_handover_note_done(n, true);
  assert (select done_by_name from handover_notes where id = n) = 'Sruthi', 'who finished it is recorded';
  begin perform add_handover_note(null, current_date, '   '); exception when others then ok := sqlerrm like '%NOTE_REQUIRED%'; end;
  assert ok, 'an empty note is refused';
  ok := false;
  begin insert into handover_notes(note_date, note) values (current_date, 'x'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'notes cannot be written directly';
end $$;
reset role; select set_config('request.jwt.claim.sub', :prep, false); set role authenticated;
do $$ begin assert (select count(*) from handover_notes) = 0, 'the preparation role sees no notes'; end $$;
reset role;

-- ---------- N-13 missed enquiries: staff can log, only the owner can read ----------
select set_config('request.jwt.claim.sub', :manager, false); set role authenticated;
do $$ declare ok boolean := false; begin
  perform log_lost_demand('00000000-0000-0000-0000-0000000000d1', null, current_date + 30, current_date + 32, 'dates_taken', 'Walk-in', null, 'wanted it for a wedding');
  assert (select count(*) from lost_demand) = 0, 'staff cannot read the log';
  begin perform log_lost_demand(null, 'Lehenga', null, null, 'nonsense', null, null, null); exception when others then ok := sqlerrm like '%BAD_REASON%'; end;
  assert ok, 'an unknown reason is refused';
end $$;
reset role; select set_config('request.jwt.claim.sub', :owner, false); set role authenticated;
do $$ begin assert (select count(*) from lost_demand) = 1 and (select category from lost_demand) = 'Wedding gown', 'the owner sees it, with the dress category filled in'; end $$;
reset role;

-- ---------- N-12 dress cost, payback, utilisation, dead stock ----------
select set_config('request.jwt.claim.sub', :manager, false); set role authenticated;
do $$ declare ok boolean := false; begin
  begin perform set_dress_cost('00000000-0000-0000-0000-0000000000d1', 20000, null); exception when others then ok := sqlerrm like '%FORBIDDEN%'; end;
  assert ok, 'only the owner can set a cost';
  ok := false;
  begin perform stock_performance(); exception when others then ok := sqlerrm like '%FORBIDDEN%'; end;
  assert ok, 'only the owner can read stock performance';
end $$;
reset role; select set_config('request.jwt.claim.sub', :owner, false); set role authenticated;
do $$ declare r record; begin
  perform set_dress_cost('00000000-0000-0000-0000-0000000000d1', 20000, current_date - 100);
  select * into r from stock_performance() where code = 'D1';
  assert r.purchase_cost = 20000, 'cost is shown';
  assert r.rentals >= 1 and r.earned = 10000 - 500 - 300, 'earned is rent after the 500 discount, minus 300 dry cleaning (got ' || r.earned || ')';
  assert r.payback_pct = round((10000 - 500 - 300) * 100.0 / 20000), 'payback is earned over cost';
  assert (select dead_stock from stock_performance() where code = 'D9'), 'a dress with no rentals for 90 days is dead stock';
  assert not (select dead_stock from stock_performance() where code = 'D1'), 'a dress rented recently is not';
  assert (select utilisation_pct from stock_performance() where code = 'D9') = 0, 'no rentals means 0% used';
end $$;
reset role;

-- ---------- N-10 day close ----------
select set_config('request.jwt.claim.sub', :manager, false); set role authenticated;
do $$ declare r jsonb; ok boolean := false; begin
  r := close_day(current_date, 1, true, 0, 'All good');
  assert (r->>'cash_tallied')::boolean = false, 'no cash tally yet, so it says so';
  assert (r->>'tomorrow_deliveries')::int >= 0 and (r->>'closed_by_name') = 'Sruthi', 'who closed it';
  begin perform close_day(current_date - 5, 0, true, 0, null); exception when others then ok := sqlerrm like '%BAD_DATES%'; end;
  assert ok, 'only today or yesterday can be closed';
end $$;
reset role;
insert into cash_tally(day, counted, expected, difference, status) values (current_date, 5000, 5000, 0, 'reconciled');
select set_config('request.jwt.claim.sub', :manager, false); set role authenticated;
do $$ declare r jsonb; begin
  r := close_day(current_date, 0, true, 0, 'Re-closed');
  assert (r->>'cash_tallied')::boolean = true and (r->>'cash_difference')::int = 0, 'once the cash is tallied the close shows it';
  assert (select count(*) from day_closes where day = current_date) = 1, 'closing twice keeps one row';
  assert (select note from day_closes where day = current_date) = 'Re-closed', 'the latest close wins';
end $$;
reset role;

-- ---------- IN-2 scorecard and N-15 leakage ----------
select set_config('request.jwt.claim.sub', :manager, false); set role authenticated;
do $$ declare ok boolean := false; begin
  begin perform scorecard(current_date - 10, current_date); exception when others then ok := sqlerrm like '%FORBIDDEN%'; end;
  assert ok, 'only the owner can open the scorecard';
end $$;
reset role; select set_config('request.jwt.claim.sub', :owner, false); set role authenticated;
do $$ declare s jsonb; m record; begin
  s := scorecard(current_date - 10, current_date);
  assert (s->'deliveries'->>'on_time')::int >= 1, 'a dress that went out on its day is on time';
  assert (s->'returns'->>'late')::int = 2 and (s->'returns'->>'avg_days_late')::numeric = 2.5, 'two late returns, 3 and 2 days: ' || (s->'returns')::text;
  assert (s->'tailor'->>'jobs')::int = 1 and (s->'tailor'->>'avg_promised_days')::numeric = 3 and (s->'tailor'->>'avg_actual_days')::numeric = 4 and (s->'tailor'->>'late')::int = 1, 'tailor: promised 3 days, took 4: ' || (s->'tailor')::text;
  assert (s->'cleaner'->>'jobs')::int = 1 and (s->'cleaner'->>'avg_promised_days')::numeric = 2 and (s->'cleaner'->>'avg_actual_days')::numeric = 3 and (s->'cleaner'->>'late')::int = 1, 'cleaner: promised 2 days, took 3: ' || (s->'cleaner')::text;
  assert (s->'discounts'->>'total')::int = 500 and (s->'discounts'->'by_staff'->0->>'name') = 'Sruthi', 'discount of 500 by Sruthi: ' || (s->'discounts')::text;
  assert (s->'money'->>'deposits_kept')::int = 1500, 'deposit kept 1500: ' || (s->'money')::text;
  assert (s->'recovered'->>'late_fees')::int = 1500, 'late fee recovered 1500: ' || (s->'recovered')::text;
  assert (s->'cash'->>'discrepancy_days')::int = 1 and (s->'cash'->>'net_difference')::int = -200, 'one cash discrepancy of -200: ' || (s->'cash')::text;
  assert (select count(*) from leakage_by_month(3)) = 3, 'three months of trend';
  select * into m from leakage_by_month(1);
  assert m.discounts = 500 and m.deposits_kept = 1500 and m.late_fees = 1500, 'this month shows the same numbers';
end $$;
reset role; reset all;
\echo 'phase 3 rules: all checks passed'
