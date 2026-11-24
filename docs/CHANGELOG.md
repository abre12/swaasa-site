# Changelog

Release notes, newest first. Until November 2026 each change shipped with its own `README-*.md` at the repository root; they are gathered here unchanged
(headings only moved down a level). Steps in the older entries such as "upload these files" or "delete file X" were done at the time and are kept for the record only.
Database scripts are listed in `supabase/README-migrations.md`; how to release is in `docs/RELEASE.md`.

## Tracker progress, Next.js security upgrade, dead code (24 Nov 2026)

*Source: this change. Apply `supabase/migration-v32-tracker-derived-prep.sql` in the Supabase SQL editor (any time; it replaces one function in place), then deploy the website.*

- **Customer tracker:** it used to read `bookings.prep_status`, which the app stopped maintaining, so customers jumped from "Booking confirmed" to "Rental in progress". Migration v32 now works out the stage from the live alteration, cleaning and repair records (the same rules as `lib/readiness.ts`): Alterations in progress, Final preparation, and Ready. "Ready" only shows within 3 days of delivery (`v_ready_window_days` in the migration). A request that is not confirmed yet never shows a preparation stage. The final "Returned" step is now ticked instead of left as "current". The step logic moved to `lib/tracking.ts` with unit tests (`tests/tracking.test.ts`) and database tests (`supabase/tests/003_tracker.sql`).
- **Next.js 14.2.35 to 15.5.29, React 18 to 19:** clears every Next.js advisory that `npm audit` reported (including the image-optimizer remote code execution, middleware cache poisoning and the Server Function disclosure). A pinned `postcss` override in `package.json` clears the last two build-time findings, so `npm audit --omit=dev` reports 0. Code changes were only the Next 15 asynchronous request APIs: `supaServer()` is now `async` and is awaited (`await supaServer()`), and `params` / `searchParams` on the collection and dress pages are awaited. Next 16 is not needed for these fixes.
- **Removed:** `app/api/book/route.ts` (it called `create_booking`, dropped in v22; it was the one dead route the 18 Nov clean-up missed). The earlier-listed dead components and `/api/tryon`, two `.patch` files, `tsconfig.tsbuildinfo` and the duplicate `migrationcpt-*` files are also gone from the working folder (git already had them removed).
- **Tests:** `tests/mfa.test.ts` now uses `/api/close-day` as its example staff API.

---

## Clean-up and reliability (18 Nov 2026)

*Source: this change.*

- **Reminders:** added `.github/workflows/reminders.yml` (08:05, 10:05, 12:05, 16:05, 17:05 IST). Set the `APP_URL` and `CRON_SECRET` repository secrets, then run the workflow once by hand with "Dry run" ticked.
- **Region:** added `vercel.json` with `regions: ["bom1"]` so server code runs next to the Mumbai database.
- **Removed:** the dead `/api/tryon` and `/api/book` routes (their database objects were dropped in v22) and the unused components TryOn, Booking, Hero, CashCounter, HandoverNotes, Countdown, SettingsForm, ReceiptBar and RevenueReport, with their CSS rules.
- **Login page:** plays `public/hero.mp4` again (`components/LoginVideo.tsx`); `/hero.mp4` is allowed through the login check in `middleware.ts`.
- **Housekeeping:** removed two applied `.patch` files, the committed `tsconfig.tsbuildinfo` and 11 unused reel images; renamed `migrationcpt-v13b/c.sql` to `migration-v13b/c.sql`.
- **Media:** reel videos can be served from Supabase Storage with `NEXT_PUBLIC_REELS_VIDEO_BASE_URL` (see `docs/MEDIA.md`).
- **Checks:** fixed two type errors and one failing test that kept CI red.

---

## Lead capture, local search and self-hosted fonts (18 Nov 2026)

*Source: `README-lead-seo-fonts.md`, added 2026-11-18.*

No database change. Upload the files in this zip over the site, keeping the folders. Nothing needs deleting.

#### 1. Contact: viewing request form and WhatsApp
- New section **Plan a private viewing** on the home page (between the service strip and the reviews): name, mobile, what they are looking for, event date, preferred visit day, a note. The top-right button now says **Request a viewing**.
- The request is sent to Telegram, to the owner chat and the staff chat (the same two chats the reminders use, so `TELEGRAM_BOT_TOKEN` and the two chat IDs must be set on Vercel). The message includes a WhatsApp link to the customer.
- **Message us on WhatsApp** buttons: one in the form section, one in the Visit our studio card. They use `STORE_PHONE`; if that is a landline, add `STORE_WHATSAPP` (the shop's WhatsApp mobile number) in Vercel. With no usable number the buttons are simply hidden; the form still works.
- Protection: the form refuses posts from other websites, ignores bots that fill a hidden field, limits each visitor to 4 requests an hour (40 an hour for the whole site), and sends one request per phone number every 10 minutes. These limits live in server memory, so they stop floods and repeat taps, not a determined attacker; a Cloudflare Turnstile check is the next step if spam ever appears.
- If Telegram is not set up or is down, the visitor sees "please call or WhatsApp us" rather than a false "sent".

Files: `components/ViewingRequest.tsx`, `app/api/viewing-request/route.ts`, `lib/viewing.ts`, `app/page.tsx`, `middleware.ts` (the form's address is open to the public, like the booking tracker), `app/globals.css`, `.env.example`.

#### 2. Local search
- Map coordinates (8.481036937748145, 76.96942945344524) are now in the structured data, together with a map link. "Get directions" now opens the exact pin instead of searching the address.
- **Opening hours and price range are not published yet**, because they were not supplied. To add them, edit two lines in `lib/site.ts`:
  - `OPENING_HOURS`, for example `[{ days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], opens: '10:00', closes: '19:00' }]`
  - `PRICE_RANGE`, for example `'₹₹₹'`
  Once filled, the hours go into Google's data and are printed in the Visit card.

#### 3. Fonts
- Cormorant Garamond, Inter and Playfair Display are now served from the site itself (`next/font`, `app/fonts.ts`) instead of a render-blocking stylesheet from Google. Same weights as before. Inter also includes the extended set so the rupee sign (₹) stays in Inter.
- The stylesheet now reads the fonts through variables (`--font-inter` and so on); the old font names are gone from it.
- The Next build downloads the fonts once, so the first build needs internet access (Vercel and GitHub both have it).

#### 4. Found while doing this: the contrast fix had been undone
The "favicon fix" commit (e32565b, 17 Nov) put back the old `app/globals.css`, which silently removed the earlier contrast fix: the lighter grey and gold text colours, and 165 places with text under 12 px. The same rules are applied again here (checked: they reproduce the original fix exactly), and every contrast and font-size check in `tests/contrast-and-error.test.ts` is satisfied.
`--card:#fff` was also changed to `--card:#ffffff` (same colour). That test only reads six-digit colours, so with `#fff` it would have stopped with an error.

#### Tests
New: `tests/viewing.test.ts` (form rules, the message, the route's protections), `tests/fonts.test.ts`. Updated: `tests/seo.test.ts` (map pin, hours, WhatsApp, form on the page). Not run on the build machine: this was written without internet, so the first CI run on GitHub is the real check.

---

## Audit item M3: heavy media (swaasa-fix-media)

*Source: `README-media.md`, added 2026-11-17.*

No database change. No code change except lib/reels.ts (poster file names).

#### What changed
- public/reels/reel-1.mp4 to reel-8.mp4 re-encoded: H.264, 360x640 (was 540x960), 24 frames/second, about 240 kbps video,
  and the AUDIO IS KEPT (AAC, mono, 40 kbps, full length; clear for speech). "faststart" lets playback begin before the whole file downloads.
  Same length as before; the sound button still works. Total 43.4 MB -> 11.2 MB:
  reel-1 7.0 -> 1.9 MB, reel-2 5.4 -> 1.5, reel-3 7.3 -> 2.0, reel-4 3.7 -> 1.0, reel-5 3.8 -> 1.0, reel-6 3.7 -> 1.0, reel-7 7.2 -> 1.9, reel-8 3.9 -> 1.0
- public/reels/reel-N-poster.webp: all eight posters are now WebP at 480 px wide (560 KB -> 310 KB in total; reel-7's went 111 KB -> 39 KB).
- lib/reels.ts: the five posters that were .JPG now point to .webp.

#### Upload
Upload the contents of this zip over the site (public/reels/ and lib/reels.ts).

#### Delete from GitHub (these are not used by any page)
- public/reels/reel-2-poster.JPG, reel-3-poster.JPG, reel-4-poster.JPG, reel-7-poster.JPG, reel-8-poster.JPG (replaced by .webp)
- public/reels/reel-1.jpg to reel-6.jpg (old thumbnails, not referenced anywhere)
- public/hero.mp4 (4.7 MB) and components/Hero.tsx (nothing imports it; the login page uses a still image)

Deleting these also takes about 5 MB more out of the repository. Do the upload first, check the site, then delete.

#### Not done
- Trimming each reel to 20 to 25 seconds would bring the longest ones to about 1 MB as well; not done, since it changes what viewers see.
- Hosting the videos outside the repository (Vercel Blob or similar) needs an account decision, so it was left alone.

---

## Reels: better quality version (replaces the earlier swaasa-fix-media.zip)

*Source: `README-media-quality.md`, added 2026-11-17.*

The earlier small version (360 x 640 at 24 frames/second) looked soft, and fine detail on the dresses (sequins, embroidery) was lost.
This version goes back to the original picture size and smoothness, and compresses more cleverly instead.

- public/reels/reel-1.mp4 to reel-8.mp4: H.264, 540 x 960 (same as the originals), 30 frames/second (same as the originals),
  about 520 kbps video. Audio is kept, full length, stereo AAC 56 kbps. "faststart" lets playback begin before the file has fully downloaded.
- Total 43.4 MB -> 26.2 MB (about 40% smaller):
  reel-1 7.0 -> 4.5 MB, reel-2 5.4 -> 3.3, reel-3 7.3 -> 4.5, reel-4 3.7 -> 2.3, reel-5 3.8 -> 2.4, reel-6 3.7 -> 2.3, reel-7 7.2 -> 4.4, reel-8 3.9 -> 2.4
- public/reels/reel-N-poster.webp: WebP posters at up to 540 px wide (a little sharper than the earlier 480 px ones).
- lib/reels.ts: poster names point to the .webp files (same as before).

Upload everything in this zip over the site. If you already uploaded the earlier media zip, these files simply replace it.
The list of unused files to delete (old .JPG posters, reel-N.jpg, hero.mp4, components/Hero.tsx) is the same as in the earlier README.

Trade-off, if you ever want to dial it: smaller files mean softer pictures. The first version I made (480 x 854, 20.5 MB total) sat between the two.
Trimming each reel to 20 to 25 seconds would cut the size without touching the quality; not done, since it changes what viewers see.

---

## Favicon: transparent background

*Source: `README-favicon.md`, added 2026-11-17.*

Replace these two files in public/:
- favicon.ico (16, 32 and 48 px, transparent): this is what the browser tab uses.
- icon-192.png (192 px, transparent): some browsers pick this one for the tab instead.

Both were rebuilt from public/logo-mark.png (the gold mark, already transparent). The mark is cropped tight so it fills the
square. It uses the logo's own gold with only a slight thickening at the small sizes (a first attempt was too dark and bold).

Left alone on purpose: apple-touch-icon.png and icon-512.png keep their dark square. iPhones turn a transparent home-screen
icon black anyway, and Android crops icons into shapes, so a solid background looks better there.

Browsers keep favicons for a long time. After it deploys, hard-refresh (Ctrl+Shift+R) or open the site in a private window to see the change.
No code change, no database change. The existing tests still apply (sizes unchanged).

---

## Audit items M6 (public error page) and M7 (contrast and small text)

*Source: `README-contrast-error.md`, added 2026-11-17.*

No database change. Nothing to run in Supabase.

#### M6. Public error page now written for customers
- app/error.tsx: new wording ("Sorry, something went wrong"), buttons "Try again" and "Back to home page" (goes to /, no longer to the admin login),
  and a line "Need help with a booking? Call us on <number>" (tap to call). The old "tell the owner what you were doing" is gone.
  If no phone number is set, the line becomes "Message us on Instagram".
- app/global-error.tsx (the last-resort page, used if the whole page frame fails): same wording, home link and phone line.
- next.config.js: one new line that hands the existing STORE_PHONE setting to the browser build, because error pages run in the browser.
  No new setting is needed on Vercel. The number is already public on the home page. It is read when the site is built, so after changing
  STORE_PHONE on Vercel, redeploy for the error page to pick it up.
- The staff screens keep their own error page (app/admin/error.tsx, unchanged), which still talks to staff.

#### M7. Contrast and small text (app/globals.css)
- Muted text colour --mut: #857866 -> #6b5f4e (was 4.0:1 on the page background, now 5.8:1).
- Gold --gold: #a8844a -> #7a5c2a (was 3.2:1, now 5.8:1). Both are at least 4.5:1 on the page, white cards and the pale rose chips.
  The dark-mode colours were already above 4.5:1 and are unchanged.
- Every font size below 12px is now 12px: 181 declarations (sizes 8 to 11.5px). Nothing else in the file changed.
- The gold and muted text will look a little darker and richer than before; that is the point.

#### Please check on a phone and on a desktop after it deploys
Raising tiny text to 12px can make tight spots wrap or crowd. Worth a quick look at: the sidebar section headings and badges,
the notification bell and panel cards, calendar chips, Customers stat chips, Reports & Analytics bars, and the small labels above
the reels on the home page. If anything looks cramped, tell me which screen and I will adjust that one place.

#### Safety net
tests/contrast-and-error.test.ts (new) fails if --mut or --gold ever drop below 4.5:1, if any text goes below 12px again,
or if the public error pages get staff wording or an /admin link again. Run with the other tests (npm test).
I could not run the tests or a build here (no internet to install packages), so they have not been run.

---

## Google reviews carousel (customer home page)

*Source: `README-reviews.md`, added 2026-11-16.*

Sits inside the "Wedding looks to rent" card, directly above **VISIT OUR STUDIO**. It shows only **5-star reviews of 11 words or more** and hides itself if there are none (or if Google is not configured).

#### Files
- `lib/reviews.ts` (new): fetches live reviews from Google (cached 24h), adds your hand-picked ones, filters (5-star, 11+ words), removes duplicates, shows at most 12.
- `lib/reviews-manual.ts` (new): the list where YOU paste hand-picked reviews. Works even before the Google key is set up.
- `components/ReviewsCarousel.tsx` (new): the swipeable carousel (arrows, touch swipe, keyboard scroll, Read more).
- `app/page.tsx`, `app/globals.css`, `.env.example` (changed). `tests/reviews.test.ts` (new).

#### One-time setup (about 10 minutes, free at this volume)
1. Google Cloud Console: create/choose a project, enable **Places API (New)**, and create an API key.
2. Restrict the key to **Places API (New)** only (API restrictions). It is used server-side only.
3. Find the **Place ID** of SWAASA Wedding Rentals with Google's "Place ID Finder" (starts with `ChIJ`). The `0x3b05...:0xd363...` value in the Maps link is NOT a Place ID.
4. In Vercel, add `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID` (Production), then redeploy.

#### Good to know
- Google's Places API returns at most **5 reviews per place** (its "most relevant" set), so after filtering you may see 2 to 5 cards, and the set can change over time. To show every qualifying review, switch to the **Google Business Profile API** (owner login via OAuth), which returns all reviews; the filter in `pickReviews` stays the same.
- Reviewer names, photos and the "Google review" label are shown, and "See all reviews on Google" links to your listing, as Google's display terms require. Do not edit review text.

---

## Reels carousel: mobile tap and swipe fix (15 Nov 2026)

*Source: `README-reels-mobile-fix.md`, added 2026-11-16.*

No database change. Replace 1 file (same path) and upload to GitHub:

- app/globals.css

Cause: the small tap-area added around the dot buttons (`.cl-dots button:before`) was also applied to the Previous/Next arrows that appear under the carousel on phones. Those arrows are not positioned, so their invisible area stretched over the whole carousel. Every tap landed on the Next arrow (so it only moved to the next reel and never played) and touches could not start a swipe.

Fix: the rule now applies only to the dots themselves (`.cl-dots>button`). Nothing else changed.

Tested in a phone-sized touch browser: swiping left and right moves between reels, tapping the centred reel plays it with sound and tapping again pauses, tapping the edge of the next reel centres and plays it, dots and the Previous/Next arrows still work, and desktop arrows and clicking still work.

Note: this globals.css also contains the Inventory Edit button styles from swaasa-inventory-edit.zip (harmless if that zip is already applied).

---

## Team Momentum: bookings AND actual deliveries, smaller (15 Nov 2026)

*Source: `README.md`, added 2026-11-15.*

1. Run supabase/migration-v29-staff-deliveries.sql in Supabase > SQL Editor (one new read-only function; safe to run again).
2. Replace these files (same paths) and upload to GitHub:
   - components/admin/BookingsByStaff.tsx
   - components/admin/Dashboard.tsx
   - app/globals.css   (this file also carries the earlier Dashboard changes; it replaces the one in swaasa-changes-dashboard-merge.zip)

What changed
- This Month: each staff member now has two bars side by side, fresh bookings (burgundy) and deliveries (green); the staff summary shows "bookings · deliveries".
- Month on Month: each month has the stacked bookings bar (by staff) with a green deliveries bar next to it.
- A delivery = a dress actually handed over (marked delivered), counted in the month of hand-over, for the staff member who recorded it. Bookings still count by booking date.
- Smaller: shorter chart, smaller heading, no second box inside the folded Team Momentum panel.
- Until the migration is run, deliveries are counted from the last 90 days of bookings the device already holds.

---

## Inventory: visible Edit option (15 Nov 2026), built on swaasa-site.rar (phase3 + latest fixes)

*Source: `README-inventory-edit.md`, added 2026-11-15.*

No database change. Replace these 2 files (same paths) and upload to GitHub:

- components/admin/Inventory.tsx
- app/globals.css (one small block added at the very end)

What changed
- Every dress row in Dress Inventory now has an **Edit** button next to the 3-dot menu (desktop table and phone cards). It opens the same Edit form as "Edit Dress" in the menu (photos, code, name, category, rent, wash charge, sizes, colours, description).
- "Edit Dress" is still in the 3-dot menu.
- The 3-dot menu now stays fully on screen for rows near the bottom of the page.
- Edit is for the owner only, same as Add Dress (the database allows dress changes only for the owner).

---

## Dashboard declutter (15 Nov 2026), built on swaasa-site-phase3

*Source: `README-dashboard-declutter.md`, added 2026-11-15.*

No database change. Replace these 5 files (same paths) and upload to GitHub:

- components/admin/Dashboard.tsx
- components/admin/Countdown.tsx
- components/admin/HandoverNotes.tsx (DayNotes only)
- components/admin/CloseDay.tsx (the bar only)
- app/globals.css (new block "Dashboard declutter (v29)" added at the end)

#### New order, top to bottom
1. Header with a one-line summary: "0 deliveries today · 0 returns due · 1 overdue"
2. Today (needs attention first), now the first block
3. One slim row of 4 numbers (was 3 big cards + 1 orphan): Delivered today, Returns due today, Overdue items, To collect in 7 days (owner)
4. Shortfall approvals bar (only when there are some)
5. Next 3 days: folded into one line ("Next 3 days 1 · 1 still to prepare"), opens to the progress bars. Hidden when nothing is due. Today's deliveries are no longer repeated here.
6. Notes: one line when empty ("Notes for the next days  None  + Add note"), full card when there are notes
7. Workflow row (smaller)
8. End of day: one slim line
9. Team Momentum: folded, opens to the staff chart

---

## Fix: false "still with <customer>" warning (15 Nov 2026)

*Source: `README-booking-warning.md`, added 2026-11-15.*

Replace components/BookingFlow.tsx. No database change.

The warning now appears only when the other rental comes BEFORE the new booking. If the other booking starts after the new one ends, it is not shown.

---

## Fix: bell count (15 Nov 2026)

*Source: `README-bell-count.md`, added 2026-11-15.*

Replace components/admin/Notifications.tsx. No database change.

The bell counted every underlying issue (one dress with 3 problems showed 3) while the panel shows one card per dress. The bell now counts the cards, so both agree.

---

## Swaasa customer home layout and location update

*Source: `README-APPLY.txt`, added 2026-11-15.*

Copy these two files into the root of your current Swaasa GitHub repository, keeping the same folder paths and replacing the existing files:
- app/page.tsx
- app/globals.css

This update removes the opening hero panel, places the booking tracker immediately below the carousel, groups the service highlights inside “Made for your celebration”, and adds the Karamana studio address with a Google Maps directions link. This is code only; no videos or posters are included.

---

## Settings page redesign

*Source: `README-APPLY.md`, added 2026-11-15.*

Copy these files over the same paths in the site (keep the folder structure):

- components/admin/SettingsPage.tsx   NEW: the tabbed Settings page
- components/admin/StaffAdmin.tsx     layout only, same actions
- components/admin/MfaSetup.tsx       layout only, same actions
- components/admin/icons.tsx          adds two icons (lock, store)
- components/AdminApp.tsx             now uses SettingsPage
- app/globals.css                     new .stg-* styles added at the end

Delete components/admin/SettingsForm.tsx (no longer used).
No database change is needed.
- app/login/page.tsx                 authenticator name set to SWAASA Wedding Rentals
- components/admin/Notifications.tsx    compact tap-to-expand alert rows (bell panel)
- lib/alerts.ts                       missed-delivery alert now says when the dress is still out with someone else

---

## Swaasa redesign: Staff Login with hero film, and the new Booking (collection) page

*Source: `README-redesign.md`, added 2026-11-14.*

No database change. No new packages. Upload the files in this zip over the same paths in the repo (GitHub web uploader), then delete `components/Hero.tsx` (no longer used).

#### Files
| File | What changed |
| --- | --- |
| `app/login/page.tsx` | New Staff Login: full-screen hero film with a floating card, icons on the fields, show/hide password, "Forgot Password?" help. Sign-in and two-step code logic are unchanged. |
| `components/LoginVideo.tsx` (new) | The hero film. Muted, looping, play/pause button, respects "reduce motion". Plays 7.5s to 40.5s of `hero.mp4` so the opening logo card is skipped. |
| `app/collection/page.tsx` | New Booking page: header with Book Now, hero, feature strip, Browse by Category (with photos), colour filter, Swaasa in Motion, filters and dress grid. Filters, search, dates, sorting and colour logic are unchanged. |
| `components/ReelsCarousel.tsx` (new) | "Swaasa in Motion" Instagram Reels strip: arrows, dots, swipe. Only on this page, not on a dress page or in the booking flow. |
| `lib/reels.ts` (new) | The list of reels and the Instagram address. |
| `app/globals.css` | Old sign-in styles replaced; new login and booking-page styles added at the end. |
| `middleware.ts` | `login-poster.jpg` added to the files that are open before sign-in (the login page needs it). |
| `public/login-poster.jpg`, `public/collection-hero.jpg`, `public/reels/reel-1..6.jpg` (new) | Stills cut from your brand film. |
| `components/Hero.tsx` | **Delete.** Replaced by the new hero. |

#### Things you may want to change
* **Reels.** The six thumbnails are stills from the brand film, so the section is not empty on day one. To use real Reels: add a vertical picture (about 360 x 640) to `public/reels/`, and optionally a short silent clip, then edit `lib/reels.ts`. Give each reel its own Instagram address in `href`, or it opens the profile. Instagram address: `NEXT_PUBLIC_INSTAGRAM_URL` in Vercel, otherwise https://www.instagram.com/swaasa_rentals/ (the one already in the footer).
* **Login film.** Replace `public/hero.mp4` (keep it under about 8 MB) and change `START` / `END` in `LoginVideo.tsx`.
* **Hero photo.** Replace `public/collection-hero.jpg` with a studio photo of a bride (wide, subject on the right).

#### Decisions
* Categories on the cards are the site's real ones (Lehengas, Gowns, Sarees, Bridesmaid, Other Occasions), so the filters keep working. The reference image's "Reception Wear" and "Bridal Sets" do not exist in the dress data.
* The reference's heart icon (wishlist) is left out: there is no such feature. The person icon opens the staff dashboard; the magnifier jumps to the search box.
* Login uses the work email. The database login has no separate User ID.
* "Forgot Password?" explains that the owner resets it (Staff Admin > Reset password). There is no self-service reset email in the system.
* The dress page and booking flow are untouched, as in the reference ("not in the checkout").
* Fixed along the way: "Clear all filters" used to go to `/#collection`, which now redirects to the dashboard. It goes to `/collection#collection`.

#### After uploading, check
1. Sign out, open `/login`: film plays, play/pause button works, wrong password shows the error, a correct one opens `/admin`. If two-step is on for you, the code step appears in the same card.
2. Open `/collection`: category cards filter, colour swatches filter, Apply works, reels arrows and dots move.
3. Phone: login card sits under the film; categories scroll sideways.
