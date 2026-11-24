-- Customer tracker (v32): the stage shown to the customer is worked out from the live records, not from the stale bookings.prep_status column.
-- Run as the table owner (the real caller is the service role, which also bypasses the access rules).
\set ON_ERROR_STOP on
set timezone = 'Asia/Kolkata';

insert into dresses(id, code, name, category, price, status) values
  ('00000000-0000-0000-0000-0000000000e1', 'T1', 'Plain',    'Lehenga', 1000, 'available'),
  ('00000000-0000-0000-0000-0000000000e2', 'T2', 'Altered',  'Lehenga', 1000, 'available'),
  ('00000000-0000-0000-0000-0000000000e3', 'T3', 'Cleaning', 'Lehenga', 1000, 'available'),
  ('00000000-0000-0000-0000-0000000000e4', 'T4', 'Repair',   'Lehenga', 1000, 'available'),
  ('00000000-0000-0000-0000-0000000000e5', 'T5', 'Busy',     'Lehenga', 1000, 'available'),
  ('00000000-0000-0000-0000-0000000000e6', 'T6', 'Damaged',  'Lehenga', 1000, 'maintenance'),
  ('00000000-0000-0000-0000-0000000000e7', 'T7', 'Elsewhere', 'Lehenga', 1000, 'available');
set session_replication_role = replica;
insert into bookings(id, dress_id, customer_name, phone, start_date, end_date, rent, status, prep_status, created_at) values
  ('TK-FAR',   '00000000-0000-0000-0000-0000000000e1', 'A', '9800000001', current_date + 20, current_date + 23, 1000, 'confirmed', 'not_started', now() - interval '9 days'),
  ('TK-NEAR',  '00000000-0000-0000-0000-0000000000e1', 'B', '9800000002', current_date + 2,  current_date + 4,  1000, 'confirmed', 'not_started', now() - interval '8 days'),
  ('TK-PEND',  '00000000-0000-0000-0000-0000000000e1', 'C', '9800000003', current_date + 2,  current_date + 4,  1000, 'pending',   'not_started', now() - interval '7 days'),
  ('TK-ALT',   '00000000-0000-0000-0000-0000000000e2', 'D', '9800000004', current_date + 30, current_date + 32, 1000, 'confirmed', 'not_started', now() - interval '6 days'),
  ('TK-CLEAN', '00000000-0000-0000-0000-0000000000e3', 'E', '9800000005', current_date + 30, current_date + 32, 1000, 'confirmed', 'not_started', now() - interval '5 days'),
  ('TK-LATER', '00000000-0000-0000-0000-0000000000e3', 'F', '9800000006', current_date + 40, current_date + 42, 1000, 'confirmed', 'not_started', now() - interval '4 days'),
  ('TK-REPAIR','00000000-0000-0000-0000-0000000000e4', 'G', '9800000007', current_date + 30, current_date + 32, 1000, 'confirmed', 'not_started', now() - interval '3 days'),
  ('TK-PREV',  '00000000-0000-0000-0000-0000000000e5', 'H', '9800000008', current_date - 2,  current_date + 1,  1000, 'out',       'delivered',   now() - interval '10 days'),
  ('TK-WAIT',  '00000000-0000-0000-0000-0000000000e5', 'I', '9800000009', current_date + 2,  current_date + 4,  1000, 'confirmed', 'not_started', now() - interval '2 days'),
  ('TK-DMG',   '00000000-0000-0000-0000-0000000000e6', 'J', '9800000010', current_date + 30, current_date + 32, 1000, 'confirmed', 'not_started', now() - interval '1 day'),
  ('TK-OUT',   '00000000-0000-0000-0000-0000000000e7', 'K', '9800000011', current_date - 20, current_date - 18, 1000, 'out',       'delivered',   now() - interval '30 days'),
  ('TK-CANC',  '00000000-0000-0000-0000-0000000000e7', 'L', '9800000012', current_date + 50, current_date + 52, 1000, 'cancelled', 'not_started', now() - interval '3 days');
insert into alteration_jobs(booking_id, dress_id, status, requirements, source) values
  ('TK-ALT',    '00000000-0000-0000-0000-0000000000e2', 'at_unit',          'Take in waist', 'booking'),
  ('TK-REPAIR', '00000000-0000-0000-0000-0000000000e4', 'pending_dispatch', 'Fix hem',       'damage');
insert into dry_clean_requests(dress_id, booking_id, status) values
  ('00000000-0000-0000-0000-0000000000e3', null, 'sent');
set session_replication_role = default;

create function pg_temp.stage(p_id text, p_phone text) returns text language sql as $$
  select prep_status from customer_booking_track(p_id, p_phone, md5(random()::text) || md5(random()::text))
$$;

do $$ begin
  assert pg_temp.stage('TK-FAR',    '9800000001') = 'not_started',         'confirmed, nothing under way, delivery far off: not "ready" yet';
  assert pg_temp.stage('TK-NEAR',   '9800000002') = 'ready',               'confirmed, nothing under way, delivery within 3 days: ready';
  assert pg_temp.stage('TK-PEND',   '9800000003') = 'not_started',         'an unconfirmed request is never "ready"';
  assert pg_temp.stage('TK-ALT',    '9800000004') = 'alterations_pending', 'an open alteration for this booking';
  assert pg_temp.stage('TK-CLEAN',  '9800000005') = 'cleaning_pending',    'open dry cleaning on the dress, and this is its next booking';
  assert pg_temp.stage('TK-LATER',  '9800000006') = 'not_started',         'dry cleaning belongs to the NEXT booking, not a later one';
  assert pg_temp.stage('TK-REPAIR', '9800000007') = 'cleaning_pending',    'a repair job on the dress shows as final preparation';
  assert pg_temp.stage('TK-WAIT',   '9800000009') = 'not_started',         'the previous customer still has the dress: not ready, not "in preparation"';
  assert pg_temp.stage('TK-DMG',    '9800000010') = 'cleaning_pending',    'a dress marked damaged shows as final preparation';
  assert pg_temp.stage('TK-OUT',    '9800000011') = 'delivered',           'out keeps delivered';
  assert pg_temp.stage('TK-CANC',   '9800000012') = 'not_started',         'cancelled keeps its stored value; the page shows Cancelled from the status';
  -- identity checks are unchanged
  assert pg_temp.stage('TK-NEAR',   '9800099999') is null,                 'wrong phone: nothing returned';
  assert (select booking_status from customer_booking_track('TK-NEAR', '+91 98000 00002', md5('z') || md5('y'))) = 'confirmed', 'phone with +91 and spaces still matches';
end $$;
\echo 'tracker rules: all checks passed'
