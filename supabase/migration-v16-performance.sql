-- v16: query-efficiency support for the app's data loading. Safe to run more than once; changes no data and no behaviour.
-- Run in the Supabase SQL editor.

-- Open / recent bookings (the polled "live" query) and date-range lookups.
create index if not exists bookings_status_idx      on bookings(status);
create index if not exists bookings_start_date_idx  on bookings(start_date desc);
create index if not exists bookings_end_date_idx    on bookings(end_date);
create index if not exists bookings_returned_at_idx on bookings(returned_at) where returned_at is not null;
create index if not exists bookings_dress_dates_idx on bookings(dress_id, start_date, end_date);

-- Payments: per-booking totals (booking_view joins on this for every booking), the advance lookup and date-range reports.
create index if not exists payments_booking_idx     on payments(booking_id);
create index if not exists payments_created_idx     on payments(created_at desc);
create index if not exists payments_advance_idx     on payments(booking_id) where purpose in ('advance','advance_refund');

-- Open work and approvals read by the live refresh.
create index if not exists approvals_pending_idx    on approvals(requested_at desc) where status = 'pending';
create index if not exists dry_cleanings_open_idx   on dry_cleanings(expected_back) where returned_on is null;
create index if not exists alteration_jobs_updated_idx on alteration_jobs(updated_at desc);
create index if not exists blocks_end_date_idx      on blocks(end_date);

-- The live refresh finds recently changed alteration jobs through updated_at, so make sure every change updates it.
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists alteration_jobs_touch on alteration_jobs;
create trigger alteration_jobs_touch before update on alteration_jobs for each row execute function touch_updated_at();

-- Phone search in the booking form uses ILIKE '%digits%', which a normal index cannot serve. A trigram index can.
create extension if not exists pg_trgm;
create index if not exists bookings_phone_trgm on bookings using gin (phone gin_trgm_ops);

analyze bookings; analyze payments;
