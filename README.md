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
