# Free backups for the Supabase free plan

The free plan has no automatic backups. This project runs its own, for nothing:

* Every night at 2:15 AM IST, GitHub runs `.github/workflows/db-backup.yml`.
* It copies your whole database (bookings, payments, cash records, staff logins, settings), encrypts it, and keeps it for **90 days**.
* If a night's backup fails, GitHub emails the repository owner. It also fails on purpose if the copy looks empty.
* Every run also saves `schema-current.sql`: a readable, always-current copy of the table design, so you do not depend on the old migration files.

**What it does not include:** the dress photos in storage (the originals are on your phones or computer; keep them) and anything older than 90 days (download one backup a month and keep it somewhere safe, e.g. Google Drive).

## One-time setup (about 10 minutes)

1. The GitHub repository must be **private**.
2. In Supabase: open your project, click **Connect**, choose **Session pooler** and copy the connection string (it looks like `postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres`). Put your database password where it says `[YOUR-PASSWORD]`. (Use the Session pooler, not "Direct connection": GitHub cannot reach the direct one.)
3. In GitHub: **Settings > Secrets and variables > Actions > New repository secret**. Add:
   * `SUPABASE_DB_URL` = the string from step 2
   * `BACKUP_PASSPHRASE` = a long passphrase you choose. **Write it down somewhere safe. Without it the backups cannot be opened.**
4. Add the file `.github/workflows/db-backup.yml` to the repository (see the README for how if your upload skips hidden folders).
5. **Run it once now:** GitHub > **Actions** > "Database backup" > **Run workflow**. Wait for the green tick, open the run, and download the artifact at the bottom. If it is red, open the run and read the error (the most common cause is a wrong password in the connection string).

## Test the restore once (do this, it is the part that matters)

Create a throw-away free Supabase project (the old project you no longer use is fine). Then, on a computer with PostgreSQL 17 tools and gpg:

```
gpg --decrypt swaasa-2026-11-12.tar.gpg > swaasa.tar        # asks for BACKUP_PASSPHRASE
tar -xf swaasa.tar                                           # gives swaasa-DATE.dump and auth-DATE.sql
psql "NEW_PROJECT_SESSION_POOLER_URL" -c "create extension if not exists btree_gist;"
psql "NEW_PROJECT_SESSION_POOLER_URL" -f auth-DATE.sql       # staff logins first (the staff table refers to them)
pg_restore --no-owner --no-privileges --dbname "NEW_PROJECT_SESSION_POOLER_URL" swaasa-DATE.dump
```

Then point a copy of the site at that project and check you can sign in and see the bookings. Note: this has not been run end to end by the person who wrote it, which is exactly why one trial restore is needed. If a step fails, keep the error message; it is easy to adjust.

## If you ever need to recover for real

Do the steps above into a **new** project, update the three Supabase values in Vercel (URL, anon key, service key), redeploy, then re-create the Storage buckets (`dress-images`, `return-inspection-photos`) and re-upload photos.
