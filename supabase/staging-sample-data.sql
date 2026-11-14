-- Sample data for the STAGING project only (never run this on the live database).
-- A few dresses and future bookings so every step in docs/SMOKE-TEST.md can be tried. All names and numbers are made up.
-- Dates are worked out from today (India time), so it can be run again on any day; run it once per test round.

insert into dresses (code, name, category, price, extra_day_fee, included_days, deposit, status) values
  ('ST-001', 'Staging ivory bridal gown',   'Wedding gown',      6000, 1000, 3, 3000, 'available'),
  ('ST-002', 'Staging maroon lehenga',      'Lehenga',           8000, 1500, 3, 4000, 'available'),
  ('ST-003', 'Staging blush reception gown','Reception gown',    4000,  800, 3, 2000, 'available'),
  ('ST-004', 'Staging gold bridal saree',   'Bridal saree',      5000, 1000, 3, 2500, 'available'),
  ('ST-005', 'Staging navy engagement set', 'Engagement outfit', 3000,  600, 3, 1500, 'available')
on conflict (code) do nothing;

with today as (select (now() at time zone 'Asia/Kolkata')::date as d)
insert into bookings (id, dress_id, customer_name, phone, start_date, end_date, rent, deposit, status, event_type, event_date)
select v.id, (select id from dresses where code = v.code), v.name, v.phone,
       (select d from today) + v.s, (select d from today) + v.e, v.rent, v.dep, 'confirmed', v.ev, (select d from today) + v.s + 1
from (values
  -- a delivery tomorrow with the full deposit and rent to collect (try: Mark delivered)
  ('SWSTAGE01', 'ST-001', 'Asha Test',   '9810000001', 1, 3, 6000, 3000, 'Wedding'),
  -- a delivery tomorrow where the rent will not be paid in full (try: shortfall approval)
  ('SWSTAGE02', 'ST-002', 'Bina Test',   '9810000002', 1, 3, 8000, 4000, 'Wedding'),
  -- two people sharing one phone number (try: the number is already saved for ...)
  ('SWSTAGE03', 'ST-003', 'Chitra Test', '9810000003', 5, 7, 4000, 2000, 'Reception'),
  ('SWSTAGE04', 'ST-004', 'Deepa Test',  '9810000003', 12, 14, 5000, 2500, 'Engagement'),
  -- one booking on ST-005: make a second booking on it that starts the day after this one ends (try: booking inside the cleaning period needs the owner's approval)
  ('SWSTAGE05', 'ST-005', 'Esha Test',   '9810000005', 20, 22, 3000, 1500, 'Engagement')
) as v(id, code, name, phone, s, e, rent, dep, ev)
on conflict (id) do nothing;
