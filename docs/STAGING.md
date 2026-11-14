# Setting up staging (one time, about 30 minutes)

Staging is a second copy of the system with made-up data. Changes are tried there first so mistakes never reach real bookings or real money.

## 1. Create the staging database
1. At supabase.com, create a **new project** named `swaasa-staging` (the free plan is enough). Choose the same region as the live one.
2. Open **SQL Editor**, paste the whole of `supabase/schema-current.sql`, and run it. It builds the complete, locked-down database in one go. (Never do this on the live project.)
3. Under **Storage**, check that the buckets `dress-images` and `return-inspection-photos` exist. Then apply the storage access rules: the `storage.objects` policy lines from `supabase/schema.sql` (dress-images) and `supabase/migration-v10.sql` / `supabase/migration-v20-controls.sql` (return-inspection-photos).
4. Under **Authentication > Users**, add a test owner (any email, a password you will remember) and copy its user id. In the SQL Editor run:
   `insert into public.staff(user_id, name, role) values ('PASTE-USER-ID', 'Test Owner', 'owner');`
5. Add a second user and a third the same way with roles `manager` and `preparation`, so you can test each login.
6. Run `supabase/staging-sample-data.sql` once to add made-up dresses and bookings. Run it again before each full test round.

## 2. Point Vercel Previews at staging
In Vercel > your project > **Settings > Environment Variables**, add these **for the Preview environment only** (untick Production):

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | the staging project's URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the staging project's anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the staging project's service-role key |
| `CRON_SECRET` | a different random string from live |

Leave `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID` and `TELEGRAM_STAFF_CHAT_ID` **empty** for Preview. The live values stay on **Production** only.

## 3. Check it works
Open the Preview link of any pull request, sign in as the test owner, and you should see the sample dresses. If you see real customers, **stop**: the Preview is pointed at the live database. Fix the Vercel variables before testing anything.

## 4. Keeping it current
After a database script is released to live, run it on staging too (staging should always have the same scripts as live, or one more). To rebuild staging from scratch, create a new project and repeat step 1 with the latest `schema-current.sql`.
