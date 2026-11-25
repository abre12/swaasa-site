# Swaasa Wedding Rentals

Next.js 15 (App Router) site and staff app on Supabase, deployed on Vercel. The public side is the customer home page and booking tracker;
everything else is staff-only behind login (two-step for owner and manager).

## Commands

- `npm run dev` runs the site locally (copy `.env.example` to `.env.local` first)
- `npm run check` runs types, lint (no warnings allowed) and the tests; `npm run build` builds
- `npm run smoke -- <address>` runs the automatic signed-out smoke test against a running site (CI runs it after every build)
- `npm run test:db` runs the database rule tests (needs a local Postgres)

## Documentation

- `docs/CHANGELOG.md` what changed and when, including setup notes for older features
- `docs/ACCOUNT-RECOVERY.md` forgotten passwords, lost phones, and what to do if the owner is locked out
- `docs/RELEASE.md` how to release; `docs/SMOKE-TEST.md` what to check afterwards; `docs/STAGING.md` the staging project
- `docs/MEDIA.md` videos and keeping them out of git
- `supabase/README-migrations.md` database scripts and their order; `supabase/BACKUP-AND-RESTORE.md`
- `.env.example` every setting, including the Telegram reminders (`CRON_SECRET`, bot token, chat IDs)
