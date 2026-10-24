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
