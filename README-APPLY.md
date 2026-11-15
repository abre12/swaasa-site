# Swaasa customer page and private catalogue overlay

Copy the contents of this ZIP into the root of your existing `swaasa-site` repository and allow the files to replace their matching versions.

## Apply in this order

1. Commit the website changes and let Vercel deploy them. The landing page and the eight promotional Reels will be public; the catalogue and dress pages stay behind staff sign-in.
2. After the new deployment is live, open the Supabase SQL Editor for the Swaasa project and run `supabase/migration-v30-private-dress-images.sql`.
3. In Supabase Storage, purge the CDN cache for the `dress-images` bucket if the dashboard offers that action. Earlier public image URLs may have been cached.
4. Sign in as staff and verify that catalogue images, dress details, editing, and try-on still load. Then check the public landing page on desktop and mobile.

The migration changes the existing bucket to private and restricts reads to staff; it does not move or delete stored images. The website code now creates short-lived signed URLs for staff views and uploads object paths for new photos.

The Reel files are already in the attached site. Their route was being intercepted by the staff sign-in middleware, so the video requests received the login page instead. The overlay allows only the eight named video/poster pairs through. The carousel loads nearby videos as needed and starts a Reel with sound when its poster is tapped.

Web pages cannot reliably prevent screenshots or screen recordings of media that is intentionally shown publicly. The full dress catalogue is kept private; the public page contains only the promotional Reels and no inventory photos, prices, or dress-level details.
