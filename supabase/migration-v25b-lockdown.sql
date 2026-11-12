-- Migration v25b (Phase 1, part 2 of 2): LOCK DOWN. Run it ONLY AFTER the v25 website is deployed and you have tested, as a staff login:
-- Confirm a booking, Mark delivered, Reschedule, record a payment. (The old website would stop working after this, which is why it comes second.)
--
-- After this, a staff browser can no longer write to the bookings table or change or delete a payment directly. Every booking change goes
-- through a database function that checks the rules and writes the history line itself, so the history cannot be rewritten or cleared,
-- a status cannot be set by hand, and the cleaning-gap override flag cannot be flipped. The database functions are not affected
-- (they run with the owner's rights).
revoke insert, update, delete on bookings from authenticated, anon;
revoke update, delete on payments from authenticated, anon;

-- To undo this (only if something unexpected stops working):
--   grant insert, update, delete on bookings to authenticated;
--   grant update, delete on payments to authenticated;
-- Payments can still be ADDED from the browser; the amount rule and the who/when stamp from migration v25 apply to every one.
