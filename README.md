# Swaasa Wedding Rentals: website

Next.js + Supabase (database, logins, photo storage). Deploy on Vercel.

## Checks and safe releases (Phase 2, OP-3 / N-8)

Nothing in this section changes how the shop's system behaves. It makes changes safer to release.

| Item | What was added |
| --- | --- |
| Automatic checks | `.github/workflows/ci.yml` runs on every pull request and every change to main: type check, lint, 29 unit tests of the business rules (alerts, late fees, phone numbers, approvals, delivery confidence), a production build, and the database checks below. Run the same locally with `npm run check` (and `npm run build`). |
| Database checks | `bash supabase/tests/run.sh` builds an empty test database and checks: delivery is all-or-nothing, a repeated tap is ignored, a short payment waits for approval, the late fee and refund are worked out correctly, the owner is told about overrides, cleaning-gap approvals work once, browsers cannot add payments or call the old return function, signed-out users cannot call functions, phone numbers and customers, the readiness log, and that the Preparation role cannot read bookings. It also checks that `schema-current.sql` builds the same tables, functions, rules and permissions as running every migration. It never touches the live Supabase. |
| Stricter TypeScript | `strict` is now on (12 small fixes were needed). |
| Repo hygiene | Added `.gitignore` and `.env.example`; the committed `tsconfig.tsbuildinfo` was removed. |
| Staging and releases | `docs/STAGING.md` (a second Supabase project for testing, Vercel Preview pointed at it, Telegram off), `docs/RELEASE.md` (the release steps and what to do if it goes wrong), `docs/SMOKE-TEST.md` (a 25-minute checklist), `supabase/staging-sample-data.sql` (made-up dresses and bookings). |

**Needs your action:** create the staging Supabase project and the Vercel Preview variables (`docs/STAGING.md`), and in GitHub > Settings > Branches require the two checks to pass before a pull request can be merged. These cannot be done from the code.

Lint prints about 30 warnings from older code (image tags, hook lists). They do not fail the check.

## What is new in Phase 2, batch A2 (data load, customers, error screens, delivery confidence)

**Order.** Run `supabase/migration-v27-phase2-customers-nearmiss.sql` (after v26), then deploy this website. v27 is additive and safe. See `supabase/README-migrations.md` for the full run order and `supabase/schema-current.sql` for a new project.

| Item | What changed |
| --- | --- |
| SA-4 / OP-4 | The website loads only open bookings and the last 90 days. A page that needs older ones asks for them: a past month on the Dashboard, Bookings or Calendar loads that month; a Bookings search, a dress's history, Customers and Reports load everything (the first time only, then it stays loaded until the page is reloaded). An older booking opened from a payment or approval is fetched on its own. The Dashboard chart and Team Momentum are now counted in the database. |
| OP-2 | `supabase/README-migrations.md` is the one run-order table (including the misnamed v13b/v13c files and which scripts are superseded). `supabase/schema-current.sql` is the whole current database in one file; it was produced by running every script in order on a test database, and it rebuilds an identical database. |
| N-3 | Phone numbers must be valid (10-digit Indian mobile starting 6 to 9, or + and an international number), in the booking form, the customer page, and in the database. A new `customers` table keeps a person per (phone, name): a family sharing one number are separate customers, and a typo in the name is shown as "already saved for ..." so staff pick the right one. Existing bookings are linked automatically. The owner can merge two records of the same person from the Customers page. Customer notes are still kept per phone number, so people on a shared number share notes. |
| N-4 | Error, loading, not-found and global-error screens. A login with no active staff record gets a clear message instead of a crash. |
| IN-1 | Owner page "Delivery Confidence": the next 7 days as green / amber / red with the cause, who booked it and who is delivering, and "% ready 2 days before". |
| IN-3 | The same page has a near-miss log: deliveries not ready the day before or on the day, with reason codes, how often each happens, and what the outcome was. It is recorded once a day by the scheduled job and, as a back-up, by the first staff login each day. It starts empty and fills in from the day you deploy. |

## What is new in Phase 2, batch A (money and safety)

**Order matters.** 1) Run `supabase/migration-v26-phase2-batchA.sql` in the Supabase SQL editor. 2) Deploy this website. 3) Test as a staff login: Mark delivered (with deposit and rent), Record payment (booking screen, Finance, Cash counter), Process return, and a cleaning-gap request. 4) Only then run `supabase/migration-v26b-lockdown.sql`. (Run v25b first if you have not.)

| Item | What changed |
| --- | --- |
| MR-3 | "Mark delivered" is one database call (`deliver_booking`): deposit, rent and delivery are saved together or not at all. A repeated tap is ignored (a one-time key per tap, and the button logic ignores a second tap while one is running). If the rent is short and the owner has not approved yet, the payment is kept, the request goes to the owner, and delivery waits. Every payment now goes through `record_payment`; after v26b a browser can no longer insert payments directly. |
| MR-4 | The late fee, the refund and what the deposit is kept against are worked out by the database (`return_preview`, `return_booking`). The return screen shows the database's answer and fills in the calculated late fee. A different late fee is allowed, is written to the booking history, and the owner is told. New Setting: free days after the return date before a late fee starts (default 0, so nothing changes until you set it). |
| SA-2 | v26b removes access to every database function from signed-out users (except the few the public collection pages need) and closes new functions to them by default. The settings table was already staff-only (v6). |
| SA-3 | "Deliver anyway" tells the owner (information only): a "For your information" list in the bell, and the owner-only part of the 9 AM Telegram message. Booking inside the cleaning period now needs the owner's approval for staff (new booking screen and Reschedule): staff send a request with a reason, the owner approves it in the bell, and the approval works once, for those dates, for 3 days. The owner can still override directly. |
| SA-4 | Checked: the bookings table has been readable only by owner and manager since migration v2, so the Preparation role cannot read customer contact details. No change was needed (an earlier draft of v26 that masked phone numbers in the view was removed, because it would have blanked them in the Telegram messages). |
| Cleanup | The unused public booking page, `/api/book`, `/api/tryon`, `Booking.tsx` and `TryOn.tsx` are deleted (they would stop working after the lock-down). |

## What is new in Phase 2, batch B (alerts)

No database change. Upload the files and let Vercel build.

| Item | What changed |
| --- | --- |
| DA-5 | "Dress still out" no longer fires just because a delivery is near. It fires only when the return is overdue, or the return day plus the cleaning days (Settings) runs into the next delivery. The day before delivery a quiet "Confirm return" note asks someone to call the customer. |
| CH-1 | Dashboard: Today is the one "needs attention" list. The duplicate "overdue deliveries" button is gone (shortfall approvals stay). |
| CH-2 | Alterations "Delivery Critical" now reads the same alerts as the bell and Today (lib/alerts.ts, Settings days). The bell also now uses the Settings days (it ignored them before). Added the missing rules: quality check pending, repair not complete. |
| CH-3 | The at-risk card says who has the dress now and who is waiting for it. |
| CH-5 | The bell shows separate chips: red = critical issues, amber = approvals waiting (owner), grey = other unread. Every issue counts, not one per dress. |
| DA-4 | Sending a dress to the tailor warns when the return date is later than two days before delivery. If you continue, a note is saved on the job and the alert shows to the owner. |
| DA-8 | Alerts show an event chip (e.g. "Wedding in 2 days"). Within 3 days of the event a High alert becomes Critical; within 7 days alerts rank higher. |
| DA-11 | From 4 PM a delivery still not recorded today raises a Critical alert (no waiting for tomorrow). The 5 PM Telegram message also tells the owner only, "Not delivered today". The 11 AM and 4 PM checks already existed. |
Not done by choice: DA-9 ("Take it" ownership), packed-and-checked, handover photos.

## What is new in v25 (Phase 1 of the audit)

**Do these in this order.** The order matters because the website and the database must change together.

1. **Supabase SQL editor: run `supabase/migration-v25-phase1.sql`.** It only adds things, so the current website keeps working.
2. **Upload the v25 files and let Vercel build.** Then **delete the files listed under "Delete these" below.**
3. **Add the settings in Vercel and GitHub** (the "One-time setup" list below), then run the test list.
4. **Only when the test list passes: run `supabase/migration-v25b-lockdown.sql`.** This is the step that stops staff browsers writing to bookings and payments directly. (If you run it before step 2 the old website stops confirming, delivering and rescheduling.)
5. `migration-v22-cleanup.sql` still comes last, after v25b, and only once the old files are deleted.

| Audit item | What changed |
| --- | --- |
| MR-2 payments | Database rule: an amount must be above zero. The database stamps who recorded a payment and when (a browser can no longer back-date it or use another person's name). The "Record payment" box no longer says "recorded" for a zero or negative amount. |
| MR-5, MR-1 booking edits and history | Confirm, Mark delivered and Reschedule now go through database functions that check the rules and **write the history line themselves** (`confirm_booking`, `mark_delivered`, `reschedule_booking`). After v25b the browser cannot write to the bookings table at all, so status, history and the cleaning-gap flag cannot be changed by hand. |
| OP-1 backups (free) | `.github/workflows/db-backup.yml`: a nightly encrypted copy of the database kept for 90 days, plus a current `schema-current.sql`. Setup and the restore test are in `supabase/BACKUP-AND-RESTORE.md`. |
| DA-1 reminders | `.github/workflows/reminders.yml` calls `/api/cron/digest` at 8:00, 9:00, 11:00, 16:00 and 17:00 IST. It uses the same alert rules as the app and posts to Telegram, so people are told even when nobody has the app open. |
| SA-1 sign-in | Owner two-step login (authenticator app): Settings > Two-step login. Staff passwords now need 10 characters. The app signs out after 60 minutes of no activity (`IDLE_MINUTES` in `AdminApp.tsx`). |
| N-1, N-2 | The leftover try-on and public-booking code is removed (list below). |
| DA-2, DA-3 | Settings > "Checkpoints": measurements by D-5, with the tailor by D-4, usual turnaround 3 days (all editable). The bell and Today warn when a step is late or when the tailor will return the dress less than two days before delivery. A booking with too little time for its alterations shows a warning on the Alterations step. |
| DA-6 | (Removed in Phase 2: the packed-and-checked step was dropped. Today still lists tomorrow's deliveries as "Check whether everything is ready to deliver".) |
| DA-7 | The delivery box now has a **time slot** and **who is delivering**. Today shows them with the balance to collect, and sorts by slot. |

### Delete these (they are dead code, and two of them use the server key)
`app/booking/page.tsx`, `app/api/book/route.ts`, `app/api/tryon/route.ts`, `components/Booking.tsx`, `components/TryOn.tsx`, `tsconfig.tsbuildinfo`.
**Keep** `components/admin/PrepBoard.tsx`: the preparation-only role still uses it. Remove the Vercel variables `FASHN_API_KEY` and `TRYON_SALT` if you set them.

### One-time setup
* **Vercel > Settings > Environment Variables:** `CRON_SECRET` (a long random string), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, optionally `TELEGRAM_STAFF_CHAT_ID`. Redeploy after adding them.
* **GitHub > Settings > Secrets and variables > Actions:** `SITE_URL` (`https://swaasa-site.vercel.app`), `CRON_SECRET` (the same value), `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`.
* **Telegram:** in Telegram open @BotFather, send `/newbot`, copy the token. Send any message to your new bot (or add it to a group), then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy the `chat` `id` (a group id starts with a minus sign).
* **Workflow files live in a hidden folder.** If your upload skips `.github`, in GitHub use Add file > Create new file, type `.github/workflows/reminders.yml` as the name, paste the contents, and repeat for `db-backup.yml`.

### Test list (before running v25b)
1. As **staff**: take a booking, **Confirm** it, **Reschedule** it (give a reason), record a payment, and **Mark delivered** a booking that is ready. Open the booking and check the history shows each step with the right name.
2. Try to record a payment of 0 or a negative amount: it must say "Enter an amount above zero".
3. Open Settings as the owner: the new "Checkpoints" fields show and save. Turn on two-step login, sign out, sign in: it asks for the code.
4. See a reminder without waiting: `curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://swaasa-site.vercel.app/api/cron/digest?slot=morning&dry=1"` shows the text; without `&dry=1` it sends it to Telegram. In GitHub > Actions > Reminders > Run workflow also works.
5. Run the "Database backup" workflow once and download the result (see `supabase/BACKUP-AND-RESTORE.md`).
6. Only then run `migration-v25b-lockdown.sql` and repeat test 1.

### Known limits of this step (planned next)
Payments can still be added from the browser (the new rules apply to every one); moving payment recording into one function that also delivers in a single step is MR-3. "Deliver anyway" and the cleaning-gap confirmation still work without owner approval (SA-3). The reminder times can be up to about 15 minutes late because GitHub schedules them on a shared timer.

## 1. Database and logins (Supabase)
1. Create a free project at supabase.com (choose the Mumbai region).
2. SQL Editor > paste all of `supabase/schema.sql` > Run. This creates every table, the double-booking rule, access rules and the photo bucket.
3. Authentication > Users > "Add user" twice (tick "Auto confirm"): one for the **owner**, one for the **store manager**. Use strong passwords.
4. Make them staff. In the SQL Editor run (replace the emails and names):
```sql
insert into staff(user_id, role, name) select id, 'owner',   'Owner Name'   from auth.users where email='owner@example.com';
insert into staff(user_id, role, name) select id, 'manager', 'Manager Name' from auth.users where email='manager@example.com';
```
5. Project Settings > API: copy the URL, the anon key and the service_role key.

## 2. (Removed) Virtual try-on
The virtual try-on feature has been removed. `FASHN_API_KEY` and `TRYON_SALT` are no longer used and can be deleted from Vercel.

## 3. Run on your computer (optional)
```
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

## 4. Put it online (Vercel)
1. Upload this folder to a private GitHub repository (never upload `.env.local`).
2. vercel.com > Add New Project > import the repository.
3. Add every variable from `.env.example` under Environment Variables, then Deploy.
4. Domain: Vercel > Settings > Domains > add your domain and follow the DNS steps at your registrar.

## Who can do what
| | Owner | Manager | Customer |
|---|---|---|---|
| Browse the collection and check dates | yes | yes | yes |
| See bookings and customer details | all | all | only their own, by ID + mobile |
| Confirm, pick up, return, reschedule, cancel, record payments, block dates | yes | yes | no |
| Change rent, discount or deposit on a booking | yes | no (blocked by the database) | no |
| Add or edit dresses, upload photos | yes | status only | no |
| Revenue reports, CSV export, add or remove staff | yes | no | no |
Payment records can never be edited or deleted, only added.

## Backups
Supabase free plan has no automatic backups. Use the Pro plan for daily backups, or run Database > Backups > download regularly.

## Customer photo privacy

## Not built yet
Razorpay online payments (advance is currently recorded by staff after UPI/cash), WhatsApp/SMS/email notifications, customer favourites, and detailed reports. Each is a separate add-on.

---

# Version 2 additions

## Upgrading an existing site (order matters)
1. **Database first.** Supabase > SQL Editor > paste `supabase/migration-v2.sql` > Run. It keeps all existing dresses, bookings, customers and payments. It can be run again safely.
2. **Then the website.** Upload the new project files to GitHub and deploy. (Deploying first would make the home and admin pages ask for columns that do not exist yet.)
3. New installs: run `schema.sql`, then `migration-v2.sql`.

## New staff role: preparation
Create the user in Supabase > Authentication > Users, then run:
```sql
insert into staff(user_id, role, name) select id, 'preparation', 'Their Name' from auth.users where email='prep@example.com';
```
Preparation staff see only the Upcoming Delivery Preparation page: dress photo, item code, customer name, dates and alteration notes. They cannot read bookings, phone numbers, payments or reports. This is enforced by the database, not just by hiding menus.

| | Owner | Manager | Preparation |
|---|---|---|---|
| Overview dashboard, calendar, bookings, deliveries and returns | yes | yes | no |
| Upcoming delivery preparation, alteration notes, preparation status | yes | yes | yes (cannot mark delivered) |
| Daily cash counter, record payments, Excel export | yes | yes | no |
| Add or edit dresses, colour tags, photos | yes | status only | no |
| Dress performance and rental history, reports, settings | yes | no | no |

## How money is counted
- Net rental charge = original price minus discount. An advance is a payment, not a discount.
- The cash counter shows money actually received or paid out on the chosen date (India time), never the full booking price.
- Net rental revenue (Dress Performance page) = rent after discount on returned rentals, minus rental refunds. Cancelled bookings, deposits, advances and unpaid balances are not revenue. Late fees and damage charges are reported separately.
- When a deposit is kept to settle unpaid rent or charges, it is recorded against the real charge (damage, late return, rent or customisation) with the payment mode "From Security Deposit". No money changes hands, so it is not counted as collected and never touches the cash drawer.

## Optional hero video
Set `NEXT_PUBLIC_HERO_VIDEO` in Vercel to the address of a short, silent, looping MP4. The logo animation then plays over it. Without it, the animated logo is shown.

## Customer colour and category filters
The five categories group the inventory categories: Lehenga = LEHENGAS; Wedding gown and Reception gown = GOWNS; Bridal saree = SAREES; Bridesmaid dress = BRIDESMAID; Engagement outfit and Other occasion wear = OTHER OCCASIONS. Colours come from the colour tags saved on each dress. "Suggest colours from photo" only proposes tags; staff confirm them. Dresses with no tags will not appear when a colour is selected, so tag every dress.

---

# Version 3 changes

## Upgrade order
1. Supabase > SQL Editor > run `supabase/migration-v3.sql` (after `migration-v2.sql`). Safe to run again.
2. Then upload the new website files and deploy.

## What changed
- **Dashboard:** six cards (today's bookings, deliveries and returns, overdue, pending delivery for the next 7 days, pending returns). Each opens as a popup. Below them: "Follow up: dress not back yet" (dresses out with a customer that are already booked soon) and "Alterations to complete" (only deliveries that have alteration notes).
- **Navigation:** Overview, Bookings Calendar, All Bookings, Daily Cash Counter, Dress Inventory, Dry Cleaning, Dress Performance, Customers, Reports and Settings. Preparation staff see only "Alterations to Complete".
- **Daily Cash Counter:** "Amount" is the amount of that one transaction. Security deposits are blue (refundable, not income); refunds are red.
- **Booking advance:** the higher of 50% of the rent or ₹1,000 (never more than the rent). Both numbers are in Reports and Settings.
- **Dry cleaning:** record each wash (date sent, expected back, charge). The dress cannot be booked while it is away and it shows on the calendar. Each dress has a standard charge in Dress Inventory. The Dry Cleaning page lists rentals since each dress was last washed.
- **Calendar:** the cleaning day after a return is no longer drawn. It still stops back-to-back bookings. Only dresses sent for dry cleaning (and blocked dates) appear as "away".
- **Dress Performance:** washes, dry-cleaning cost and net after dry cleaning for every dress, with a wash list in each dress's history.
- **Revenue report (owner):** one row per booking with Advance Received, Rent Received, Late Fees, Damages, Advance Refunded and Net Amount. Export to Excel.

---

# Version 4 changes

## Upgrade order
1. Supabase > SQL Editor > run `supabase/migration-v4.sql` (after `migration-v3.sql`). Safe to run again.
2. Then upload the new website files and deploy. `SUPABASE_SERVICE_ROLE_KEY` must already be set in Vercel (it is used only on the server to create staff logins).

## Staff logins and who-did-what
- Sign in as the owner > Reports and Settings > **Staff logins** > "Add a person". Create Salesperson 1, 2 and 3 (role: Salesperson) with their own email and password. The email can be any address you control; no email is sent.
- Each person signs in with their own login. The database records, from the signed-in user, who **took** each booking, who marked it **ready**, who **delivered** it, who processed the **return**, and who entered each **payment**. Customers' online bookings show "Online".
- Rename a person at any time in the Name box. Past records show the new name. "Turn off" removes someone's access immediately without losing their history. "Reset password" sets a new password.
- Salespeople can do everything except the owner-only areas (dress performance, revenue report, settings, staff logins, editing dress details).

## Home page
- The brand mark with "SWAASA RENTALS" sits at the bottom right of the video after the opening logo card.
- The colour filter is one line of small swatches (labels are hidden on phones; touch and hold or tap to select).

---

# Version 5 changes

## Upgrade order
1. Supabase > SQL Editor > run `supabase/migration-v5.sql` (after `migration-v4.sql`). Safe to run again.
2. Then upload the new website files and deploy.
Bookings made before the upgrade keep the deposit they were made with. Only new bookings use the new deposit rule.

## Refundable deposit (replaces the booking advance)
- The refundable deposit is worked out for every booking: the **higher of 50% of the rent (after any discount) or ₹1,000**. Both numbers are in Reports and Settings under "Refundable deposit". The fixed deposit per dress is no longer used and is gone from the dress form.
- "Advance to confirm" is gone. At booking, staff see the refundable deposit, enter the amount received, and the screen splits it: the deposit is filled first and anything above it counts as rent paid. The amount received must be at least the deposit.
- **Mark as delivered** now shows the deposit already paid (and asks for it only if some is still unpaid, for example on an online booking) and asks for **Advance on rent collected now**. It is recorded as a rent payment.
- **Payment record** (new button next to Payment, and a link in the cash counter): Rent Amount, Deposit Paid, Rent Paid and Balance to be Refunded, then every payment with its date, time, mode, amount and who entered it.

## Manager profile
- Overview: the bookings-per-month chart is shown to the owner only.
- Dry Cleaning: managers get a searchable list of dresses (last washed, standard charge, Send for cleaning). The "rentals since last wash" list is owner only.
- Customer Management: managers see only customers with a booking in the current month or next month.
- Daily Cash Counter: managers can open the current month only.

## Cash in hand, tally and petty cash (Daily Cash Counter)
- **Cash in hand** = opening cash (brought forward) + cash received − cash refunds − petty cash. Only payments with the mode Cash count.
- **Tally cash (end of day)**: count the drawer and enter the amount. The counted amount becomes the next day's opening cash, and any difference is shown. Until a day is tallied, the expected figure carries forward.
- **Petty cash expense**: amount and a remark saying what it was for. Added for today only and never edited afterwards.
- The Excel export now includes the cash-in-hand figures.
- The month limit for managers is enforced by the database for cash in hand, petty cash and tallies. The payment list itself is limited on screen only, because the same payment records are needed elsewhere (a booking's payments, the payment record).

---

# Version 6 changes

## Upgrade order
1. Supabase > SQL Editor > run `supabase/migration-v6.sql` (after `migration-v5.sql`). Safe to run again.
2. Supabase > Authentication > Sign In / Providers > switch OFF "Allow new users to sign up". (Staff logins are created by the owner inside the site, which still works.)
3. Upload the new website files and deploy.
4. Sign in as the owner > Dress Inventory > press **Make photos load faster** once. It makes small copies of the photos already uploaded.

## What changed
- **Private site:** every page needs a staff login. Customers can no longer browse or book online; the site is a staff tool. The database also refuses to return anything to a visitor who is not signed in as staff.
- **Customization charge:** added when taking the booking (or later with the Customization button). It is collected in addition to the rental and is part of every balance.
- **Rent before delivery and return:** the refundable deposit is collected first; anything above it counts as rent paid; the rest of the rent is collected at delivery. A booking cannot be delivered or returned until the rental amount (plus customization) has been received. If staff cannot collect all of it, they send a request to the owner (dashboard card "Needs your approval"). The owner approves or declines. The owner can accept a shortfall directly.
- **Discount after booking:** the owner can give a discount on an open booking. It lowers the rent owed; the refundable deposit stays the same.
- **Delete staff:** Reports and Settings > Staff logins > Delete. The person can never sign in again; everything they did stays on record under their name, shown as "(removed)".
- **Speed:** every uploaded photo is stored as thumbnail, medium and original. Catalogue cards and the dress page load the small sizes; the original loads only when a photo is clicked for full screen. The admin stops refreshing while its tab is hidden.
- **Vercel function region:** set Vercel > Settings > Functions > Function Region to the region closest to your Supabase project (Supabase > Project Settings > General shows it, for example Mumbai = bom1). A mismatch (for example Washington DC and Mumbai) makes every page slow.

---

# Version 7 changes (no database change; nothing to run in Supabase)

- **Dress Inventory:** a guided form in five steps (photos, basics, pricing, details, colours) with a search box and category filter above the list. "Save and add another" speeds up entering several dresses. You choose the main photo (shown first) before saving.
- **Colours are automatic:** the colour words you type, the dress name and the description are read first. If they name no colour, the main photo is examined. The colours appear as chips that can be corrected. Dresses that already exist without colours are filled in automatically the first time the owner opens Dress Inventory. The colour filter on the collection page also matches the typed colour words, so it works even for a dress that has no tags.
- **Payment record:** the customization charge is its own purple entry, separate from the rent amount, with a "Total to collect" line.
- **Dress page:** the main photo sits on the page background (no pink bars).
- **Cash tally (checked, unchanged):** only payments marked Cash count toward the physical cash drawer. GPay / UPI and Card are totalled separately and never enter the cash tally. Cash refunds and petty cash expenses are subtracted.

---

# Version 8 changes (no database change)

- **Overview Dashboard:** "Today's Delivery" replaces "Follow up: dress not back yet" (hand-over list with ready status, amount to collect, Mark ready and Mark delivered). Two quick buttons sit above it: **Petty cash entry** and **Send a dress for dry cleaning**.
- **Daily Cash Counter:** the customization charge now shows under the Price of each booking (in purple), as its own summary card, and as its own column in the Excel export.

---

# Version 9: Daily Cash Counter (needs database migration 7)

## Upgrade order
1. Supabase > SQL Editor > run `supabase/migration-v7.sql` (after migration-v6). Safe to run again. It only adds columns and functions, so the current website keeps working until you deploy.
2. Upload the new website files and deploy.
3. Sign in as the owner > Daily Cash Counter > **Set opening cash** (once). Until it is set, the drawer is shown as "not set" instead of assuming zero.

## How each figure is calculated
- **Expected closing cash** = opening cash + cash received - cash refunds paid - cash expenses. Only entries whose payment mode is **Cash** count. GPay / UPI, Card, bank transfers and charges settled from the security deposit (deposit applied to dues) never change it. Voided expenses are ignored.
- **Opening cash** = the counted cash of the last tallied day before this one; for the first day, the opening the owner set.
- **Tally** records expected, counted, difference, status (Reconciled or Discrepancy), remark, who and when. It never creates a payment. A remark is required when there is a difference. Staff can tally a day once; only the owner can change a tallied day. Every tally change is kept in an audit table.
- **Transactions** = number of different dresses that had at least one payment, refund or adjustment that day.
- **Rental value (after discounts)** = the rent after discounts of the bookings that had activity that day (booking value, not money received).
- **Rent received** = advance and rent actually received that day, before refunds (refunds are shown under Refunds paid).
- **Customization charges** = customization charged on those bookings; unpaid = what is still owed (payments settle rent first, then customization).
- **Advance received, pending refund** = advances taken for bookings not yet delivered or cancelled, less advance refunds paid, as at the end of the chosen day. Once a dress is delivered, the advance counts as rent. An advance kept on a cancelled booking is treated as kept.
- **Refundable deposits held** = deposits received - deposits returned - deposits kept against dues, all bookings, end of the chosen day. Never income.
- **Total received** = every customer receipt that day in every mode (rent, advance, customization, charges, deposits). Cash + GPay / UPI + Card (+ other) = Total received.
- **Refunds paid** = refunds actually paid that day in any mode.
- **Cash counter balance** = the same number as Expected closing cash.
- **Outstanding balances** = what customers still owe on the bookings that had activity that day.

## Expenses
Each expense has a category, how it was paid (Cash, GPay / UPI, Card, Bank transfer), who it was paid to, remarks, who entered it and when. A cash expense lowers the drawer straight away; other modes do not. Dry-cleaning payments are recorded from the Dry Cleaning page (Mark back, or Record payment in the history) as a business expense. Expenses cannot be edited; the owner can void one with a reason, and it stays on record.

## Payments & Cash Counter (v10, needs migration 9)
Three tabs: **Transactions** (money received and refunds, by category), **Cash Counter** (physical cash, reconciliation, cash movements) and **Expenses** (ten expense heads, summary chart).
- Expense categories: Store Rent, Utilities, Salaries, Staff Bonus & Incentives, Staff Refreshments (Petty Cash), Dry Cleaning, Store Maintenance, Delivery / Transport, Business Overheads, Other Expenses (remarks required). Expenses may optionally link to a booking.
- A cash expense or cash refund lowers the expected cash automatically; nothing is entered twice.
- Run `supabase/migration-v9.sql` before deploying. It relabels old expense categories (nothing is deleted).

## Version 11: Swaasa Admin Design System and operations updates (needs migration 10)

### Upgrade order
1. Supabase > SQL Editor > run `supabase/migration-v10.sql` after migrations v2 through v9. It adds return inspections, cleaning queue stages, alteration tracking, owner-only customer profiles and role-aware notifications/approvals. Existing cleaning records and booking alteration notes are carried forward.
2. Deploy this project to Vercel from the connected GitHub repository.
3. Confirm the existing Supabase URL and anon key remain configured in Vercel Environment Variables, then redeploy if Vercel did not deploy automatically.

### Included changes
- **Admin Design System v1.0:** responsive cream and burgundy admin styling, grouped navigation, refined cards, tables and form controls. Existing dashboard metrics and icons remain in place.
- **Transactions:** transaction-wise or exact Booking ID grouping, expandable original records, quick date filters and custom inclusive date ranges. Export follows the selected view and range.
- **Payment summaries:** booking details show applicable charges only, with separate totals, amount received, balance due and security deposit details.
- **Return inspection and dress care:** record condition, notes and optional photos when a customer returns a dress. Cleaning-needed dresses wait in **To Be Sent**; only confirmed dispatch marks them with the cleaner. A returned dress remains unavailable until final inspection is approved.
- **Alterations:** pending dispatch, at tailoring unit, quality check and ready stages, with a 2–3 day expected turnaround and delivery date visibility.
- **Calendar:** month, week and day views, with filters for bookings, deliveries, returns, alterations and cleaning.
- **Owner approvals and notifications:** owner decisions for shortfall, discount, refund and cancellation requests; staff cannot edit recorded payment transactions.
- **Customers:** owner-only customer database, search, repeat/outstanding filters, profile drawer, booking history and internal notes.
- **Dress Performance:** primary and supporting KPI groupings, category revenue comparison and top dress ranking; existing revenue calculations are preserved.

Do not deploy the app before applying `migration-v10.sql`; the new admin panels read these added Supabase tables and policies.

## Unified Booking Details popup (no database change)

- Booking links throughout the admin dashboard open the same responsive details popup.
- The popup groups booking identity, customer and rental dates, preparation and alteration information, handler history, payment summary and deposit status.
- Payment values continue to come from the shared existing payment-summary logic. Booking workflows, permissions, database structure and action handlers are unchanged.
- Existing booking actions are shown in the bottom action bar, with the current next workflow action emphasized.

---

## Booking details popup tidy-up (no database change; nothing to run in Supabase)

- **Booking History** now sits directly under **Handled By** in the left column, followed by Return Condition. Payment Summary, Security Deposit, Payment Record and Shortfall Approvals stay in the right column. The two columns are independent stacks, so opening the Payment Record no longer leaves a blank gap on the left.
- **Preparation Status** is no longer a dropdown. It is read automatically from this booking's alteration job in the Alterations module (Pending Dispatch, At Tailoring Unit, Quality Check at Store, Ready, or "No alterations"). Click it to open that alteration.
- **Dry cleaning** is shown in the popup only while the dress is waiting in the queue to be sent ("In queue to be sent"). It is hidden once the dress is with the cleaner or back in the shop. The "Confirm Cleaned Item" button in the header is unchanged.
- Files changed: `components/admin/BookingModal.tsx`, `app/globals.css`.

---

## Admin design unification, Dry Cleaning count, Damaged dresses, cancellation popup (no database change; nothing to run in Supabase)

- **One page header everywhere** (`components/admin/PageHead.tsx`): icon tile, title, one-line description and the page's main buttons on the right. Used by Dashboard, All Bookings, Calendar, Dress Inventory, Alterations, Dry Cleaning, Payments & Cash Counter, Customers, Approvals, Dress Performance, Settings and Alterations to Complete. The old second heading (page title above the module's own title) is gone. On phones the top bar already shows the page name, so the header repeats only the description and buttons.
- **Dry Cleaning count in the menu** = dresses in **To Be Sent** + dresses **Awaiting confirmation** (back from the cleaner, not yet confirmed). Dresses currently with the cleaner are not counted.
- **Dress Inventory:** the Maintenance card, filter and status are now called **Damaged** (the stored value is still `maintenance`, so no database change). The three-dot menu has **Mark as Damaged** (asks what is damaged, optional; the same item becomes **Return to Available**) and **Send Dress for Dry Cleaning** (opens the cleaning list form with that dress selected). A dress marked Damaged cannot be booked or added to the cleaning list.
- **Cancelling a booking is now a rare-case action.** The Cancel button is gone from the quick buttons and the Bookings row menu. It is a small red link, **Cancel booking…**, at the bottom of the booking popup (pending and confirmed bookings only).
- **Cancel popup** (`components/admin/CancelBooking.tsx`) asks: refund any rent? (No refund / Yes, with the amount up to the rent received), the refund payment mode, and the reason. The refundable deposit is returned in full and uses the same mode.
  - **Staff:** the request goes to the owner (Approvals). The booking stays active and nothing is paid until the owner approves. Approvals now shows the rent refund, mode, deposit and reason.
  - **Owner:** applied straight away, in one step (previously the booking was cancelled first and the refund asked afterwards).
- Files changed: `components/AdminApp.tsx`, `app/globals.css`, and in `components/admin/`: PageHead (new), CancelBooking (new), Alterations, Approvals, BookingModal, Bookings, Calendar, Customers, Dashboard, DryCleaning, Finance, Inventory, Performance.

---

## One clear alteration status (no database change; nothing to run in Supabase)

The dress's present status now follows the order the work actually happens, and is the same in the booking popup (Preparation Status), the Alterations queue and the header button:

1. **Measurements Pending** – measurements have not been taken yet (booking was made with "measurements to be taken later"). The header button reads **Add Measurements**.
2. **Pending Dispatch to Tailor** – measurements are done; send the dress to the tailoring unit (was just "Pending Dispatch").
3. **At Tailoring Unit** – with the tailor (shows the expected return date).
4. **Quality Check at Store** – back from the tailor, check the work.
5. **Ready** – alterations complete.

The booking popup also shows a one-line "what to do next" under the status. Measurements Pending goes away once measurements are saved (or marked as taken) in the alteration. Files: `lib/bookingAction.ts`, `components/admin/BookingModal.tsx`, `Alterations.tsx`, `AlterationDrawer.tsx`, `app/globals.css`.

---

## Fix: Dress Inventory page showing a large blank oval (no database change)

- **Cause:** two different styles used the class name `lg`. The login page uses `.lg` as its full-screen layout (fixed, covers the whole window), and the Inventory status badge also carried `lg` for its larger size. When the current stylesheet was deployed, every status badge in the Inventory list became a full-screen rounded panel and covered the page and sidebar.
- **Fix:** the badge now uses its own class `bdg-lg` (`components/admin/Inventory.tsx` and the `.bdg.bdg-lg` rule in `app/globals.css`). The login page is untouched.
- **Also fixed:** the new shared page header used a class name `ph` that the Payments & Cash Counter sub-headings already used. The header classes are now `pghd`, `pghd-ic`, `pghd-t` and `pghd-act`, so the Payments page headings keep their original look.
- Bookings header: search box and **Take Booking** now sit on one row on desktop.
- Checked after the fix: no stray full-screen elements on Inventory, Alterations, Approvals, Bookings, Calendar, Customers, Dry Cleaning or Dress Performance.
- Files: `components/admin/Inventory.tsx`, `components/admin/PageHead.tsx`, `app/globals.css`.

---

## Payments & Cash Counter: category no longer shown twice (no database change)

- In the Transactions list (and the Cash Counter movements) a remark that only repeated the category pill is hidden. For example "Late-return fee" under *Late Return Charges*, "Damage / repair / cleaning charge" under *Damage Charges*, "Unpaid rent" and "Unpaid customization charge".
- If the remark carries extra detail, only the detail is kept, e.g. "Damage / repair / cleaning charge: torn hem" shows "torn hem".
- Other remarks (entered by staff) are unchanged. Stored data is not modified.
- File: `components/admin/Finance.tsx`.

---

## Calendar header restored to the original layout (no database change)

- On request, the Calendar page is back to its original header: title and description on the left, with the month picker, Today, Month/Week/Day, Filters and **Block a Dress** on the same row on the right. The shared icon header is not used on this page.
- File: `components/admin/Calendar.tsx` (identical to the version before the design unification).

---

## Design unification across modules (no database change; nothing to run in Supabase)

One set of sizes now applies to every admin module (the rules are the "DESIGN SYSTEM" block at the end of `app/globals.css`). Reference screens: Payments & Cash Counter, Dashboard and All Bookings.

| Element | Size everywhere |
|---|---|
| Page title / description | 30px serif / 14px |
| Panel title (e.g. Transactions, Alteration Queue) | 24px; smaller panels 17px |
| Summary card | number 32px, label 15px, icon 32px, number first, then label, then note |
| Table | header 12px, text 14px |
| Tabs, controls, badges | 14px / 42px high / 12px |
| Icons | 32 on cards, 18 in controls, 16 inside badges and pills |

- **Calendar:** weekday names, day numbers, pills, legend, rule bar and summary cards were a size smaller; now match. Title 30px (was 32px). Phone sizes unchanged.
- **Dry Cleaning:** summary and badge icons enlarged to the common sizes.
- **Alterations:** text-symbol icons (◇ ♧ ⌕ ▦ ⚑) replaced by the app's icon set; summary cards use Inter and the common card layout; table text 11px to 14px; tabs, search and filters 12px to 14px; status labels no longer clipped.
- **Customers:** symbol icons replaced by the icon set; the four summary cards now fill the row (they were squeezed into about two-thirds of the width); table and controls on the common sizes.
- **Reports & Analytics:** the page no longer shrinks the sidebar (it was forced to 164px with 12px labels and a different page background). The sidebar is 248px on every page. Table, controls, charts' cards and buttons are on the common sizes. The date and filter row now sits under the page header.
- **Dress Inventory:** summary cards show the number first, like the other pages.
- Files: `app/globals.css`, `components/AdminApp.tsx`, and in `components/admin/`: Alterations, Customers, Performance, Inventory.

---

## Action Center (the notification bell) (no database change; nothing to run in Supabase)

The bell is now a small operational command centre. It shows only things staff must act on, and it is calculated live from the real bookings, dresses, alterations and cleaning records (`lib/alerts.ts`), so an alert appears, gets more urgent and disappears by itself. Nothing is stored except which alerts you have read.

**Order in the panel:** 1. Delivery at Risk, 2. Critical, 3. High Priority, 4. Tomorrow's Deliveries. Each group is a compact summary card (e.g. "Critical (3): 1 Delivery risk · 1 Overdue alteration · 1 Overdue return") that opens to show the dresses. Each alert has a short headline, the dress, one or two lines of context, the date, and one button (View Booking / View Details / View Workflow).

**What raises an alert**

| Alert | When | Group |
|---|---|---|
| Overdue return | Dress still out past its return date | Critical |
| Delivery risk | Dress is out and the next confirmed booking is within 3 days | 3 days: Critical, 2 days: Critical (Urgent), tomorrow: Delivery at Risk (Immediate Attention), delivery day: Delivery at Risk |
| Alteration overdue | Tailor is late (expected back date passed), or the alteration is due today (the day before delivery) | Critical |
| Alteration pending on delivery day | Alteration still open on or after the delivery date | Delivery at Risk |
| Delivery preparation risk | Dry cleaning pending (or dress marked Damaged) with not enough time before the next confirmed delivery (to be sent: 3 days, at the cleaner: until it is back, returned and waiting to be checked: 1 day) | Critical; on delivery day: Delivery at Risk |
| Alteration due soon | Alteration must be finished within 1 to 2 days | High |
| Upcoming dry-cleaning requirement | Cleaning pending, delivery within 7 days, enough time left | High |
| Tomorrow's deliveries | One summary from 5:00 PM IST: how many are ready, need alteration, need preparation | Summary |

**Behaviour**
- One card per dress: the most urgent issue is shown and other issues on the same dress are listed under it ("Also: ...").
- Alerts resolve on their own: dress marked Returned, alteration completed, cleaning completed, dress ready.
- Reading is separate from resolving. Reading lowers the bell count only. Critical alerts stay in the panel until the problem is fixed. An alert that becomes more urgent shows as unread again.
- The bell count = unread Delivery at Risk, Critical and High alerts. The tomorrow summary is not counted.
- No alerts for booking creation, payments, payment corrections or approvals. The old Recent list and the Pending Approvals tab are gone from the bell. Owners see a single "N approvals waiting, Open Approvals" line at the bottom of the panel, which is not an alert and not in the count.
- Same panel for owner, manager, salesperson and preparation staff. The panel works on desktop and phone.
- Data refreshes every 20 seconds, and the 5 PM summary and the date roll over appear without reloading.
- Read marks are remembered per person on each device (browser storage).
- Files: `lib/alerts.ts` (new), `components/admin/Notifications.tsx`, `components/AdminApp.tsx`, `app/globals.css`.

- Build fix: `components/AdminApp.tsx` listed `go` twice in the shared `ctx` object, which failed the Vercel type check ("An object literal cannot have multiple properties with the same name"). The duplicate is removed.

- **Phone fix (summary cards):** on phones the summary cards (Dashboard, Dress Inventory, Payments, Alterations, Dress Performance, Customers, Calendar) now use smaller numbers (18 to 24px), 13px labels and 24px icons, and the card rows are two across instead of three, so amounts such as ₹1,32,950 are never cut off. The swipeable card strip on All Bookings is unchanged. File: `app/globals.css`.

---

## Sign-in goes to the dashboard; New Booking button (no database change)

- **Sign-in:** after a successful sign-in staff always land on the admin dashboard (`/admin`); the Back button no longer returns to the login form. Anyone who is already signed in and opens the login page is sent straight to the dashboard. (Preparation-only staff have no dashboard, so they land on their own Alterations to Complete page.) The login page text now says "Sign in to open your dashboard."
- **New Booking** button, shown to everyone who can take bookings (not preparation-only staff):
  - Desktop: at the top of the left menu under the Swaasa logo, in dark burgundy with a gold plus, so it does not look like the selected menu item.
  - Phone: a burgundy **+ New** button in the top bar (always visible) and the same full button at the top of the menu drawer.
  - It opens the dress collection (`/#collection`), the start of a new booking. The All Bookings page button is renamed from "Take Booking" to **New Booking** to match.
- Files: `middleware.ts`, `app/login/page.tsx`, `components/AdminApp.tsx`, `components/admin/Bookings.tsx`, `app/globals.css`.

---

## Sidebar refinement (no database change)

- **Hierarchy:** New Booking stays the standout action (burgundy fill, 46px high, soft shadow, plain plus icon). The open page is the only highlighted menu item, shown with a pale rose background and a slim burgundy marker on the left instead of a filled button.
- **Group labels:** Workspace, Operations and Owner's Corner are small muted uppercase headings with extra space around them, not selectable rows. Cash & Transactions now sits under Operations.
- **Rows:** every menu row has the same height (40px), icon size (20px), spacing and text size (14px), with the count badge always on the right. "Transactions & Cash Counter" is shortened to **Cash & Transactions** (the page itself is still titled Payments & Cash Counter).
- **Interaction:** subtle hover background, visible keyboard focus outline, and `aria-current="page"` on the open page.
- **Account:** the signed-in person (initials, name, role) and a sign-out button are in one row at the bottom of the sidebar.
- **Phone:** the top-bar button now says **New Booking**. On phones up to 430px wide the small logo in the top bar is hidden to leave room for the page name.
- Files: `components/AdminApp.tsx`, `app/globals.css`.

---

## The main link opens the admin dashboard (no database change)

- The site's main address (`swaasa-site.vercel.app`, and the Swaasa logo/brand link) now opens the **admin dashboard**. If you are not signed in you are taken to the login page first, and after signing in to the dashboard.
- The dress collection used for taking a new booking moved from `/` to **`/collection`** (same page, same filters, same booking steps). Every link to it was updated: the **New Booking** buttons (sidebar, phone top bar, phone menu, All Bookings), the Collection link in the public header, and "Take another booking" at the end of a booking.
- Files: `app/page.tsx` (now just redirects to `/admin`), `app/collection/page.tsx` (new, the old home page), `app/layout.tsx`, `components/BookingFlow.tsx`, `components/AdminApp.tsx`, `components/admin/Bookings.tsx`.
- Old bookmarks to `/#collection` now land on the dashboard; the new address of the collection is `/collection`.

---

## Owner approvals in the notification bell (RUN `supabase/migration-v15.sql` in the Supabase SQL Editor)

**Where the bell is:** desktop: top-right corner of the sidebar, beside the Swaasa logo (the panel opens to the right of the sidebar); phone: the top bar. A badge shows the count and disappears at zero.

**Owner panel, three tabs**
- **Pending Approvals (n):** the default tab whenever something is waiting. Each card has an icon by type (percent for discount, return arrow for refund, cancel for cancellation, wallet for short payment), the title (e.g. "Discount Approval Required"), the booking and customer (tap to open the booking), what is being asked (e.g. "Additional discount: ₹1,000"), the reason if given, and "Requested by: Jeena · 42 minutes ago".
- Actions on the card, no page change: **Approve** (filled) and **Reject** (outlined). Reject opens an inline box for an optional reason. Refunds and cancellations (money out, cannot be undone) ask once more ("Confirm approve"); discounts and short payments approve in one tap.
- The card leaves Pending at once; if the database refuses, it is put back with a message. After a decision the bell count, the Recent tab, the booking and the dashboard refresh on their own.
- **Action Center:** the operational alerts (deliveries, returns, alterations, dry cleaning), unchanged.
- **Recent:** the last 15 decisions: type, booking and customer, requester, Approved (green) or Rejected (red), who decided and when, and the rejection reason.
- Badge = pending approvals + unread operational alerts.

**Staff panel:** Action Center and **My Requests** (the status of what they asked the owner to approve: waiting, approved or rejected, with the reason). Staff have no approve or reject controls.

**Rules enforced in the database (not just hidden buttons)**
- Only the owner can decide a request; a staff login is refused.
- Staff can only request a discount, a booking cancellation or a refund (and the existing short-payment approval). There is no request type for editing or deleting a payment, and payments stay insert-only: nobody can edit or delete a recorded transaction.
- Only one pending request per booking and action: a second one is refused ("already waiting for the owner").
- Once decided, a request is locked: its type, booking, details, requester and decision cannot be changed. The requester's and the decider's names are stored on the request, with the time. Nothing is deleted.
- migration-v15 also turns on live updates for approvals, so the bell changes without a refresh (the 20-second refresh still runs).

Files: `supabase/migration-v15.sql` (new), `lib/approvals.ts` (new), `components/admin/Notifications.tsx`, `components/admin/Approvals.tsx`, `components/admin/icons.tsx`, `components/AdminApp.tsx`, `app/globals.css`.

- **Fix (notification panel behind the page):** on desktop the notification panel opened underneath the dashboard cards and title. The sidebar, and the panel that opens from it, are now layered above the page content and below pop-up windows such as the booking window. File: `app/globals.css`.

## Data loading, polling and scale (v16)

- **Full load** (`load()` in `AdminApp.tsx`): every table, fetched with `lib/fetchAll.ts` so nothing is cut at the API's 1,000-row cap. Runs on open, after every action, and every 3 minutes.
- **Live refresh** (every 30 s, only while the tab is visible): open bookings, open alteration/cleaning work, pending approvals and the last few days of history, merged into the screen by `lib/merge.ts`. Unchanged data causes no re-render. If any live query reaches 1,000 rows it falls back to a full load. Failures keep the data on screen and back the polling off (30 s → 4 min).
- Approvals still arrive instantly through realtime, but only the approvals are refreshed.
- Unbounded per-page queries (Bookings advance totals, Customers profiles, Finance date ranges) are paged and refresh on `ctx.fullTick`, not on every poll.
- The Bookings table draws 50 rows at a time (totals still cover every matching booking).
- Run `supabase/migration-v16-performance.sql` once. It adds indexes, an `updated_at` trigger on alteration jobs and a phone-search index. It changes no data.
- If your Supabase "Max rows" API setting is below 1,000, lower the `pageSize` default in `lib/fetchAll.ts` to match.

## Readiness, returns and delivery (v17)

Run `supabase/migration-v17-readiness-return-delivery.sql` once (after v16). Then run its three commented REVIEW queries to see records that need a human decision; the migration itself changes no existing data.

- **One readiness model** (`lib/readiness.ts`). `dressStage()` answers "where is this dress?" and `bookingReadiness()` answers "can this booking be handed over, and if not, why?". Both are derived from live bookings, alteration jobs, the cleaning queue and the dress status. The Dashboard, Calendar, Deliveries, Inventory, booking popup, Preparation list and Mark delivered all use them. The old `bookings.prep_status` is no longer read anywhere (the column stays, because the alteration-sync trigger still uses it).
- **Dress status is no longer overwritten** by unrelated workflows. Only approving a repair can clear Damaged (and only if no other repair is open). Finishing an alteration or a dry clean leaves the status alone. Inventory's "Return to Available" warns if a repair is still open.
- **Store location.** Optional text on each dress (Inventory → Set Store Location), shown under the dress state.
- **Mark delivered** checks readiness on every screen. Not ready: the manager must give a reason (saved in the booking history). Dress still with another customer: blocked outright, and the database enforces it (`DRESS_ALREADY_OUT`).
- **Delivery** (optional): the customer collects from the store unless you choose "deliver", which asks for an address. Set when booking or from the booking popup (Delivery → Edit). The older `delivery_slot` / `delivery_assignee` columns are unused.
- **Returns** are one database call, `return_dress()`. Everything is saved or nothing is. Late fees and damage charges entered at return apply immediately for whoever processes it (no approval step); the deposit settles them first.
- **Booking creation** is one database call, `staff_create_booking_full()`: booking, payments, event and delivery details and alteration job together.
- **Preparation role** now sees the real alteration/repair queue (`prep_jobs()`), read-only. Moving a job forward is done in Alterations.

## Cancellation policy (v18)

Run `supabase/migration-v18-cancellation-policy.sql` once (after v17).

- **Policy: no refund.** On cancellation the rent received and the security deposit are kept. Any refund, partial or full, of rent or deposit is the owner's decision.
- **Staff** pick Cancel, give a reason, and may *recommend* a refund (default ₹0, with a justification). The booking stays active and nothing is paid until the owner decides.
- **Owner** sees the booking, the reason, the staff recommendation, the rent received and the deposit held, then enters the rent refund and deposit refund (default ₹0, or the staff recommendation) and the payment mode. The screen shows what is handed back and what is kept.
- Cancelling is **one database call** (`cancel_booking` / `decide_cancellation`): the booking is cancelled and every refund recorded, or nothing happens. A kept deposit is recorded as income (a `deposit_applied` charge), so it does not show as "deposit held" or "refund pending" on a cancelled booking.
- The old approval path that refunded the whole deposit automatically is closed: `decide_approval` can still reject a cancellation, but approving one always goes through the owner's amount screen.

## Alterations are never done on a dress that is out (v19)

Run `supabase/migration-v19-alteration-gap.sql` once (after v18).

- Alterations can only be added to **Pending or Confirmed** bookings: the "Add alteration" list no longer offers bookings that are out, the notes-to-job rule no longer creates a job for an out booking, and the database rejects it (`BOOKING_NOT_ACTIVE`).
- **Delivering a dress that is not ready** (manager override): if an alteration is still open, the manager chooses what happens to it: keep it open, or close it as *completed (not updated in time)*, *skipped* or *missed (not done)*. Completed closes the job as Ready; skipped and missed close it as Cancelled. The reason is saved on the job and in the booking history.
- A job left open on a booking that is **out** shows an "Alteration still open" warning in the booking popup and a **High** alert (not Critical). Out and returned bookings otherwise show no preparation row.
- The notes-to-job rule no longer depends on the old `prep_status` flag: once a completed alteration exists, editing the notes does not create a second job.

## Stage 1: alerts, Today view, availability warning (v20, no new SQL)

- **Today** (`components/admin/Today.tsx`) is the landing page for owner and manager, and the first item in the phone bottom bar. One list, in order: needs attention first (the bell's delivery-risk and critical items), deliveries today (Mark delivered, or what is holding it back), deliveries missed, returns due and overdue (Process return), alterations and repairs (send, due back, quality check), dry cleaning (send, due back, check), and tomorrow's deliveries that are not ready. Sections with nothing to do are hidden. Rows are derived from live records, so they disappear as soon as the work is recorded. The Dashboard is still there under Workspace.
- **New alert rules** (`lib/alerts.ts`): **Delivery missed** (Delivery at Risk group: a delivery date passed with no delivery recorded); **Cleaner overdue** and **Repair overdue** (High, even with no booking behind them); **Waiting to be sent** and **Damaged dress waiting for repair** (High, after 3 days, `IDLE_DAYS`). One card per dress is kept.
- **5 PM summary** now also lists returns due tomorrow and dresses not yet returned by the previous customer (they are no longer counted as ready), and appears even when tomorrow has returns but no deliveries.
- **Booking form heads-up**: choosing a dress that is currently out (overdue, or due back within 2 days of the new delivery) or in the cleaning workflow (delivery within 7 days) shows a "Check before confirming" note. It never blocks the booking.
- Not in this stage: sending the 5 PM summary outside the app (needs a WhatsApp/SMS provider) and per-person alert read marks.

## Stage 2: controls and evidence (v21)

Run `supabase/migration-v20-controls.sql` once (after v19).

- **Cleaner final check.** "Returned from Cleaner" asks for the dress's condition: *Clean and ready* (closes the record, as before), *Not satisfactory: send to the cleaner again* (back to To Be Sent, the finished round and its cost stay in the history), or *Damaged at the cleaner* (dress marked Damaged, repair added to the Damaged Queue). A note is required unless it is clean and ready. One database call (`finish_dry_clean`).
- **Rental changes.** *Extend rental* for a dress that is out (new return date, extension charge defaulting to the dress's extra-day fee, reason required; the next booking and cleaning blocks are checked by the database). *Reschedule* now needs a reason, and the old and new dates are logged. A booking can no longer start in the past (database rule `PAST_START`).
- **Damage evidence.** A damage return needs a note and at least one photo (screen and database). Optional **handover photos** can be added to a booking before or after delivery.
- **Private photos.** The inspection and handover photo bucket is now private; the app opens photos through short-lived signed links (`lib/photos.ts`, `PrivatePhoto.tsx`). Older photos work the same way.
- **History of changes.** A new append-only `events` table, written by database triggers (who, when, what), records dress status and location changes, alteration and repair status changes and cleaning status changes. Inventory → Rental history shows them under "Changes to this dress".

## Medium items (v22)

Run `supabase/migration-v21-medium-items.sql` once (after v20).

- **Phone navigation.** The bottom bar is now Today, Bookings, Alterations, Dry Cleaning and More (Calendar and Payments are under More). Each shows a count; Today counts deliveries due or missed plus returns due or overdue.
- **Owner view.** The Dashboard opens with a "Needs your attention" line for the owner: approvals waiting, overdue returns, missed deliveries, stuck cleaner or repair work, alterations left open on delivered dresses, dresses marked damaged. The revenue card (Total Received) is owner-only; the task cards stay for the manager.
- **Alert timing is set in Settings** (owner): how far ahead preparation problems are watched (7), time a dress waiting to be sent needs before delivery (3), how long an item may wait to be sent before it is raised (3), and the "alteration due soon" window (2). The fixed rules (delivery risk at 3, 2, 1 days and on the day; 5 PM summary) are unchanged.
- **Alert read marks are per person**, kept in the database (`alert_reads`), with a copy in the browser. Marks older than 30 days are tidied.
- **Cleaner names** are suggested from the vendors already used when sending a dress to the cleaner.
- **Wording.** The return action is "Process Return" everywhere. The booking form says the booking notes are internal and not seen by the tailor. "Advance" and "Security Deposit" are left as they are in the reports, because they are separate accounting amounts.
- The Alterations list shows 15 rows a page instead of 5.
- Not built: an assigned person on alteration, cleaning and delivery tasks. Who sent, received and delivered is already recorded by the database; an extra "assigned to" field adds data entry, so it waits for your decision.


## Clean-up (v23)

Removed because nothing used them: the customer "Find my booking" page (`/booking`), the old public booking form and its `/api/book` route, virtual try-on (component, `/api/tryon`, the Settings limit and the dress form's try-on image), the unused notification list in the admin screen and the cleaning-risk notification written to a table nothing displays (the bell already raises it), and the legacy preparation-status labels. The site now serves only `/` (opens the admin), `/admin`, `/admin/performance`, `/collection` (where New Booking starts), `/dress/[id]`, `/login` and `/api/staff`.

## v24 (11 Nov 2026): Receive at Store check, Delivery Critical card, Cancel in the bookings menu, notification thumbnails (no database change; nothing to run in Supabase)

- **Receive at Store (Alterations).** The popup now lists the alterations that were requested (checklist items with their notes, the booking notes, job notes and any measurements) as a yellow note, so the person receiving the dress checks the work against it. Below it is the quality check (the same four checks as the Review screen). The outcome is chosen from one drop-down (nothing is pre-selected) and confirmed with one button. Three outcomes: **Quality check passed · Mark Ready** (needs every check ticked; records who/when and closes the alteration as Ready), **Received – check later** (as before, goes to Quality Check at Store), or **Not right – send back to tailor** (needs a note; opens the send-back dates screen with that note filled in). Repairs on damaged dresses use the same screen.
- **Delivery Critical card (Alterations).** One red card, first in the row, counts every alteration or repair that could make the dress late on its delivery date: not complete with delivery today/tomorrow/passed; tailor overdue; expected back too close to delivery; measurements not taken with delivery within 3 days; not yet sent with delivery within 2 days; quality check pending with delivery within 2 days. It lists the reasons ("2 alteration not complete near delivery · 1 measurements not taken"). Click it to open the new **Delivery Critical** tab. Every row at risk shows its reason under the delivery date, and at-risk jobs are listed first in all queues.
- **Cancel booking in the 3-dot menu (All Bookings).** The menu now has a red **Cancel booking…** item at the bottom for Upcoming bookings (it opens the existing cancellation popup: reason, refund, owner approval). Bookings that are out show a note instead (return them instead). The menu no longer closes when you scroll inside it, it fits short screens by scrolling or opening upward, and it closes after you pick an action.
- **Notifications show who and what.** Each alert card has a small dress photo with the customer's name and booking number. Click it to open the booking (alerts with no booking behind them, such as a dress waiting for the cleaner, open the workflow).
- **Bell count.** The red number on the bell now always includes every active Delivery at Risk and Critical alert, even after they are marked read. It only goes down when the problem is fixed. For the owner, pending approvals and unread High priority alerts are added to the count.
- Files: `lib/alerts.ts` (bookingId on alerts), `components/admin/Alterations.tsx`, `ReceiveAtStore.tsx` (new), `AlterationDrawer.tsx` (exports only), `Bookings.tsx`, `Notifications.tsx`, `components/AdminApp.tsx` (`sel` option), `app/globals.css`.

Run `supabase/migration-v22-cleanup.sql` only after this version is deployed. It drops the old public-booking, lookup, `set_prep_status`, `prep_list` and `staff_create_booking_v2` functions, the `tryon_log` table and the try-on columns. It is optional.
- **Today is now part of the Dashboard (no separate Today menu item).** The Dashboard opens with the four KPI cards (Bookings This Month, Today's Deliveries, Today's Returns, Overdue Returns), then the full Today list (needs attention first, deliveries and returns today, vendor work, tomorrow's items not ready), then Pending Alterations, the workflow overview and staff booking analytics. The old Dashboard "Today's Deliveries" table was removed because the Today list shows the same deliveries with their action buttons. The mobile bottom bar now starts with Dashboard, and old links to the Today page open the Dashboard.
- **Total Received and Due Pending moved to Reports & Analytics.** They sit in a new "Collections" panel at the top of that page with a month picker (bookings whose delivery date falls in the month, cancelled ones excluded, same rule as before). Clicking Total Received opens Cash & Transactions; clicking Due Pending opens Bookings filtered to bookings that owe money.
- Files in this round: `components/admin/Dashboard.tsx`, `Today.tsx` (new `embedded` mode), `Performance.tsx`, `components/AdminApp.tsx` (menu), `app/globals.css`.
- **Dashboard order (11 Nov).** Top to bottom: the boxed **Today** block (the most critical part, now above the KPI cards), the owner's attention line, the four KPI cards, the workflow overview row, **Pending Alterations (Next 7 Days)** (heading reduced to match the other headings), then the staff booking graphs.
