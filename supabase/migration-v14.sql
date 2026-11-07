-- Migration v14: booking flow overhaul.
--  * Event type and event date are kept on the booking (the dress is needed for the event).
--  * Alterations can be raised at booking time with "measurements to be taken later" flagged on the job.
-- Run after migration-v13.sql. Safe to run more than once.

alter table bookings add column if not exists event_date date;
alter table bookings add column if not exists event_type text;
alter table alteration_jobs add column if not exists measurements_pending boolean not null default false;

-- Saves the event details and general booking notes right after a staff booking is created.
create or replace function set_booking_details(p_id text, p_event_date date, p_event_type text, p_notes text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  update bookings set event_date = p_event_date,
    event_type = nullif(trim(coalesce(p_event_type,'')),''),
    notes = coalesce(nullif(trim(coalesce(p_notes,'')),''), notes)
  where id = p_id;
end $$;
