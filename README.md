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
- When a deposit is kept to settle unpaid rent or charges, it is recorded as a non-cash book entry ("Deposit applied to dues").

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
