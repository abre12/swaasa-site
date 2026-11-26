# Fixes of 25 Nov 2026: enquiries, reviews, monitoring, reminders, speed, security, search

Seven items from your list, applied on top of your latest upload (the one with the bundled fonts). Nothing from that upload was changed except where both touched the same file (`package.json`, `app/globals.css`, `.github/workflows/ci.yml`, `docs/CHANGELOG.md`, `DELETE-THESE-FILES.txt`), which I merged by hand. This page says what to do (in order), then what changed and why, then what I could not check.

## What to do, in order

**1. Database (Supabase > SQL Editor).** Run these two, in this order. Both are additive and safe to run before the new site is live.
- `supabase/migration-v33-leads.sql` (enquiries table, limiter, status)
- `supabase/migration-v34-reminder-runs.sql` (reminder log)

**2. Upload the files** in this package over the repository (same as usual). Then delete `lib/reviews-manual.ts` (it is in `DELETE-THESE-FILES.txt`).

**3. Add these in Vercel > Settings > Environment Variables** (Production), then redeploy. Everything is optional: each feature switches on when its value appears and the site keeps working without it.

| Variable | What it switches on |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Bot check on the enquiry form (item 1) |
| `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for readable file names) | Error monitoring (item 3) |
| `HEARTBEAT_URL` | Outside alert when a reminder does not run (item 4) |
| `REVIEWS_CACHE_SECONDS` | How long Google's answer is reused (item 2); default one hour |
| `AUTH_FAST_CHECK=1` | Faster staff sign-in check (item 5). Read the trade-off first |

`CRON_SECRET` already exists (the reminders use it). Vercel Cron will use the same one.

**4. Switch things on outside the code** (all free):
- **Turnstile:** Cloudflare dashboard > Turnstile > Add widget, hostname = your site. Copy the two keys into Vercel.
- **Sentry:** make a free account and a Next.js project, copy its DSN.
- **Analytics:** Vercel > your project > Analytics > Enable, and Speed Insights > Enable.
- **Heartbeat:** make a free healthchecks.io account. Set `HEARTBEAT_URL` to `https://hc-ping.com/YOUR-PING-KEY/swaasa-{slot}?create=1`. After the first run of each reminder it appears as a check; set each one to expect a ping once a day with about 90 minutes' grace, and add your email or Telegram as the alert.

**5. After the deploy, check:** send yourself a test enquiry (see it under **Enquiries** in the staff menu and on Telegram); open the home page and see the new headline; open `/faq` and `/bridal-lehenga-rental-trivandrum`; in Vercel > Cron Jobs you should see one job (`/api/cron/watchdog`).

`package.json` gained one package (`@sentry/nextjs`). Vercel installs it on its own. The lock file (`package-lock.json`) is not updated because I could not reach the package registry from here; CI now falls back to `npm install` so it still runs. When convenient, run `npm install` once on any computer and commit the new lock file.

---

## 1. Enquiries are saved, limited properly, and bot-checked

**Before:** an enquiry existed only as a Telegram message. Limits sat in the server's memory (reset on every cold start, not shared between server copies), and a global 40-an-hour cap let one spammer block real customers.

**Now**
- Every enquiry is saved first in a new `leads` table, with a **status**: New, Contacted, Visit booked, Became a booking, Not interested, Spam. Telegram is sent after, so a Telegram outage can no longer lose a customer (the message is marked sent or failed on the row).
- New **Enquiries** page in the staff menu (owner and manager): call or WhatsApp links, status dropdown, a note. Only the status and the note can be changed from the app; the customer's details are read-only and nothing can be deleted there.
- Limits now live in the database, in the same style as the booking tracker: one visitor 4 an hour (stored as a keyed hash, never the IP), one phone number 3 a day, an identical repeat within 10 minutes is ignored.
- **The global cap is gone.** Every enquiry that passes the bot check is saved. Only the *Telegram message* is throttled: after 20 an hour the team gets one "many enquiries, open the app" message and the rest wait quietly in the app. A flood can no longer hide or block a real lead.
- Cloudflare Turnstile: invisible unless Cloudflare needs the visitor to do something. If the widget cannot load (ad blocker), the button unlocks after 8 seconds and the server decides; a person who is refused is told to call or WhatsApp. If Cloudflare itself is down, the customer is let through (the database limits still apply). **Until `TURNSTILE_SECRET_KEY` is set the check is skipped.**
- Spam and "not interested" enquiries are deleted after six months by the daily watchdog (item 4). Other enquiries are kept until you decide otherwise; that retention period is your call.

## 2. Reviews

**What I found.** Please read this as research, not legal advice.

- **Hand-copying Google reviews into code (`reviews-manual.ts`) is the weakest part.** Google's Places API policy says Places content may not be pre-fetched, cached or stored (only the place ID is exempt), and that Google content must be kept visually distinct from other content and shown with attribution. A hand-copied list is stored Google content, mixed in with live reviews, and it stays on the page after a reviewer edits or deletes theirs.
- **Only 5-star reviews of 11+ words under "Loved by our brides" is selective.** India's Consumer Protection Act 2019 treats advertising that gives a false or misleading impression as misleading, and the Bureau of Indian Standards' online-reviews standard (IS 19000:2022) covers anyone who publishes consumer reviews; it was voluntary when issued, and the government proposed making it mandatory in 2024 (I could not confirm the current status). The US FTC's 2024 reviews rule bans presenting a reviews section as representative while hiding reviews because of their rating. That is not your jurisdiction, but it shows where rules are heading.
- Google also ignores review stars you publish about your own business in your page's structured data, so I did not add any.

**What changed**
- Reviews are **live only**; `lib/reviews-manual.ts` is deleted.
- **No filter by stars or length.** Each review shows its own stars; the average and the count come from Google and cover *every* review.
- Newest first; reviewer name linked to their Google profile, their photo, "Reviews and rating from Google Maps" shown, a sentence saying this is a selection and the average covers all reviews. Heading changed from "Loved by our brides" to "Google reviews".
- **"All recent reviews" is not possible with the Places API:** it returns at most five, chosen by Google. Getting all of them needs the Google Business Profile API (owner login and an access application), which I did not build. "See all reviews on Google" still links to your listing.
- **Caching:** the page reuses Google's answer for an hour (`REVIEWS_CACHE_SECONDS`). A strict reading of Google's terms says no caching at all; `0` asks Google on every page view (slower home page, more billable calls). The alternative with no doubt at all is Google's own embeddable reviews widget; say if you want that.
- **Please check:** Google publishes style rules for its text attribution (font, size, colour) that I could not look up from here, and an official Google logo can be used instead. Worth one look at their attribution page.
- If you want some customers' words on the site as testimonials (a different thing from Google reviews), get their written permission, label them "Customer testimonial", and keep them out of the Google block.

## 3. Analytics and error monitoring

- **Analytics:** Vercel Web Analytics and Speed Insights: no cookies, no personal data, so no cookie banner. Only public pages include it (staff screens and staff visits never count). Visitor numbers need the Vercel switch in step 4. As far as I know, custom events (an "enquiry sent" event) need a paid Vercel plan, so I also send one but it is ignored on the free plan. **Form conversion is therefore: visitors (Analytics) versus rows in the `leads` table.**
- **Errors:** Sentry for the browser, the server and the sign-in middleware. `error.tsx`, the staff error page and the top-level error page now report to it. Reports go through your own address (`/monitoring`) so ad blockers do not hide them. **Personal data is stripped before anything leaves:** no form contents, cookies, query strings, IP addresses or users, and long digit runs (phone numbers) in messages are replaced. Session replay is deliberately off, because staff screens show customers and payments.
- Server failures in the enquiry form and the reminders are also reported.

## 4. Reminders: log, heartbeat and watchdog

GitHub Actions stays the thing that sends the five reminders. Vercel Cron cannot replace it on the free plan (one run a day, at any time within the hour), and I did not want to put five frequent crons in `vercel.json` in case your plan would refuse to deploy. Instead:
- Every real run is logged in `reminder_runs` and, on success, pings `HEARTBEAT_URL`. If the ping does not arrive, your outside monitor alerts you within minutes, even if the site is down.
- A **daily watchdog** (`/api/cron/watchdog`, started by Vercel Cron at about 7 pm India time) checks the log and tells the **owner on Telegram** which of the day's reminders never ran, and reports it to Sentry. It also tidies old spam enquiries. Because it runs on Vercel, not GitHub, one platform failing does not hide the other.
- If you are on Vercel Pro you can move the five reminders to Vercel Cron later: add five entries like `{ "path": "/api/cron/digest?slot=morning", "schedule": "35 2 * * *" }` (UTC times; they are the same minutes as in `.github/workflows/reminders.yml`, minus 5:30).
- Note: GitHub switches off scheduled workflows in a public repository after 60 days without any activity. The watchdog would tell you if that ever happened.

## 5. Speed

- **Staff sign-in check.** It made three Supabase calls one after another on every request. Now the "is this person active staff" answer is remembered for 60 seconds in a signed cookie (a switched-off login can open screens for up to a minute longer, but the database itself refuses its data at once), and the two-step level is read locally. That leaves one call to Supabase per request. **`AUTH_FAST_CHECK=1` removes that last call** by checking the sign-in token on the server instead of asking Supabase. The cost: a login that was signed out elsewhere or revoked stays valid until its token expires (up to an hour). It also needs your Supabase project to use asymmetric JWT signing keys, otherwise the library asks Supabase anyway and nothing is gained. I left it **off**; your call.
- **Photo addresses** no longer change. Private dress and inspection photos now load from `/api/media/...`, the same address every time, so browsers keep them for a week (they were re-downloaded on every view), and pages no longer wait for a signing round trip. Access is unchanged: staff only, read as that person so the storage rules still apply, never cached by shared caches. The 45-minute refresh job has nothing left to do.
- **`<img>` to `next/image`: I did not do this blindly, deliberately.** Your lint config already notes why. (a) Dress photos are private; Next's image optimiser caches its output for everyone and is not behind the staff login, so routing private photos through it would expose them. (b) The public images are already small (the logo is 17 KB, reel posters are WebP). Gains would be small and I cannot see the pages here to catch layout shifts. What I did: gave the logos their width and height (stops the page jumping as it loads). If you still want `next/image` for the public images only, tell me which pages and I will do it in a separate change you can look at.
- **Reel videos (26 MB) and `.git` (81 MB).** The code to serve the videos from storage already exists. Steps: upload the eight files to a public Supabase Storage bucket named `reels` (docs/MEDIA.md), set `NEXT_PUBLIC_REELS_VIDEO_BASE_URL`, redeploy and check the reels play, **then** delete `public/reels/*.mp4` in GitHub. I did not delete them myself because that order matters. Shrinking `.git` itself means rewriting history (`git filter-repo`, steps in docs/MEDIA.md) or starting a fresh repository from the cleaned files; it cannot be done from the GitHub upload page. It matters little for the live site, only for cloning.

## 6. Content-Security-Policy (report only)

A full policy is now sent as `Content-Security-Policy-Report-Only`: it blocks nothing, and each thing it would have blocked is logged as one line, `[csp-report]`, in Vercel > Logs. The `frame-ancestors 'none'` rule you already had is still enforced. The policy is built in `csp.js` from what the pages really load (Supabase, Cloudflare Turnstile, Google profile photos). To go live: browse every page as a visitor and as staff (add a dress photo, play a reel, send an enquiry, check a booking), read the `[csp-report]` lines over a week or two, add any real source that appears to `csp.js`, then rename the header in `next.config.js` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. `script-src` includes `'unsafe-inline'` because Next.js writes small inline scripts; removing it needs per-request nonces, which makes every page render on demand. That is a separate, deliberate step.

## 7. Search (SEO)

- **A visible `<h1>`:** a short introduction above the reels: "Bridal lehengas, gowns & sarees to rent in Trivandrum", a line of text and a Request a viewing button. This does change how the home page opens (the reels move down about 200 pixels). If you would rather keep the old opening, the block is one `<section className="ch-intro">` in `app/page.tsx`; tell me and I will find another way.
- **New public pages:** `/bridal-lehenga-rental-trivandrum` (a proper guide to renting a bridal lehenga, with the real process from your site) and `/faq` (seven questions, with FAQ markup). Both are in the sitemap and linked from the home page footer. Honest note: Google now shows FAQ rich results only for a few kinds of site, so expect the benefit to be in ranking and in being quoted, not in extra snippets.
- **`/pricing` does not exist yet, on purpose.** I will not invent your prices. Add rows to `PRICE_GUIDE` in `lib/seo-content.ts` and the page, its sitemap entry and a footer link appear.
- **Opening hours** are set in `lib/site.ts` from what you sent (every day, 10 am to 8 pm). They now show in the Visit our studio block, on the Trivandrum page and in Google's data as "Mon–Sun, 10:00 am – 8:00 pm". **The price range** is still empty for the same reason as prices; add it there when you want it published.
- I deliberately did not make a page per neighbourhood (Pattom, Kowdiar and so on): near-identical pages like that tend to be treated as spam and would be thin.

---

## What I could not check (please read)

I had no internet and no database in my workspace, and the project's packages are not installed there. So:
- The tests I added or changed (`tests/api-viewing.test.ts`, `middleware-gate.test.ts`, `csp.test.ts`, `reviews.test.ts`, `media.test.ts`, `turnstile.test.ts`, `reminders-watchdog.test.ts`, `guide-pages.test.ts`, `staff-gate.test.ts`, and edits to `seo.test.ts`, `home-headings.test.ts`, `api-public.test.ts`) were **not run with Vitest**. I did run the logic of the pure ones and the real enquiry, media and watchdog routes against stand-ins for Supabase and Telegram, and all behaved as the tests expect. Expect CI to be the first full run; if anything is red, the message will point at a single test.
- The database script and its test (`supabase/tests/004_leads.sql`) were written carefully but **not run** (no Postgres). Run `v33` and `v34` once in the SQL editor, and treat a red "database" CI job as a bug in my test or script, not in your data. I added both scripts to the end of `schema-current.sql` by hand so the CI comparison holds; run `supabase/tests/regenerate-schema.sh` when convenient to replace it with a real export.
- `@sentry/nextjs` is declared as `^10.0.0` without having been installed here. If its setup has changed, the build log will say so.
- The screens (Enquiries page, the new intro, the guide pages) were not looked at in a browser.

## Things I need from you

1. The price range symbol (for example ₹₹) if you want one in Google's data. Hours are done.
2. Prices you are happy to publish (to create `/pricing`), and how the refundable deposit should be described.
3. Whether you want the home page introduction as built, and whether to enable the stricter review options above.
