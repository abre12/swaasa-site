-- Migration v22: remove database objects that nothing uses any more. Run AFTER the v23 website is deployed (older website versions still
-- call some of these). It is not needed for the app to work; it only tidies up. Nothing here is dropped with CASCADE, so if anything still
-- depends on an object the statement fails and leaves it in place.
--
--   Public self-booking and "find my booking" (the site is staff-only now):
drop function if exists create_booking(uuid, date, date, text, text, text, text);
drop function if exists lookup_booking(text, text);
--   The old per-booking preparation flag helpers (readiness now comes from alteration jobs and the cleaning queue):
drop function if exists set_prep_status(text, text);
drop function if exists prep_list(integer);
--   An unused alternative booking function that no screen calls:
drop function if exists staff_create_booking_v2(uuid,date,date,date,text,date,text,text,text,text,text,jsonb,jsonb,integer,integer,text,text,integer,boolean);
--   Virtual try-on (removed):
drop table if exists tryon_log;
alter table settings drop column if exists tryon_daily_limit;
alter table dresses  drop column if exists try_on_image;
--
-- Deliberately KEPT: the bookings.prep_status column (a database rule and the booking view still use it), the admin_notifications table
-- (database triggers still write to it; nothing displays it), and the 'pending' booking status (old online bookings may still exist).
