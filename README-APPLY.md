# Swaasa customer page and booking tracker overlay

Copy the contents of this ZIP into the root of your existing `swaasa-site` repository and replace matching files. This package contains source and SQL files only; it does not add or duplicate Reel media.

## Apply

1. Commit and deploy the website files through GitHub and Vercel.
2. If you have not already applied `supabase/migration-v30-private-dress-images.sql`, run it after the signed-image website is deployed, then purge the `dress-images` Storage cache if available.
3. Run `supabase/migration-v31-customer-booking-tracking.sql` in the Supabase SQL Editor. It is additive and can be run before or after deployment. The tracker will show as temporarily unavailable until this migration is applied.

The customer page no longer shows the Questions section. Existing customers can track at the homepage section or `/booking` using their booking ID and the mobile number used when booking. The server returns booking status and dates only, requires a match on the booking ID and last 10 phone digits, and allows up to 20 lookups per IP in 15 minutes. Rate-limit IP values are HMAC-hashed and old records are cleared after 30 days. The service-role key remains server-side and no new environment variable is required.

The full dress catalogue remains staff-only. Public promotional Reels can still be captured by visitors, as with any media shown in a browser.
