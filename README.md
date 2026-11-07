# Swaasa Wedding Rentals: website

Next.js + Supabase (database, logins, photo storage) + FASHN (AI virtual try-on). Deploy on Vercel.

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

## 2. Try-on (FASHN)
Create an account at fashn.ai, buy credits, copy the API key. Leave `FASHN_API_KEY` empty (or delete it) to keep try-on switched off: the "Try it on" box is then hidden everywhere. Add the key later in Vercel > Settings > Environment Variables and redeploy to switch it on. Each try-on costs credits, and each visitor is limited per day (Settings table, `tryon_daily_limit`, default 3).

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
5. Try-on takes up to ~50 seconds; Vercel's free plan allows 60 seconds per request, which is enough.

## Who can do what
| | Owner | Manager | Customer |
|---|---|---|---|
| Browse, check dates, request a booking, try-on | yes | yes | yes |
| See bookings and customer details | all | all | only their own, by ID + mobile |
| Confirm, pick up, return, reschedule, cancel, record payments, block dates | yes | yes | no |
| Change rent, discount or deposit on a booking | yes | no (blocked by the database) | no |
| Add or edit dresses, upload photos | yes | status only | no |
| Revenue reports, CSV export, add or remove staff | yes | no | no |
Payment records can never be edited or deleted, only added.

## Photos for good try-on results
Upload each dress with a clear, front-facing photo on a mannequin or flat on a plain background as the **first** image. The first photo is used for the try-on.

## Backups
Supabase free plan has no automatic backups. Use the Pro plan for daily backups, or run Database > Backups > download regularly.

## Customer photo privacy
The selfie is shrunk in the browser, sent to FASHN as data and never saved by this app. Keep the consent text on the page and add a privacy policy page before launch (DPDP Act, India).

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
