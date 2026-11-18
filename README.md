# Swaasa Wedding Rentals

Next.js 14 (App Router) site and staff app on Supabase, deployed on Vercel. The public side is the customer home page and booking tracker;
everything else is staff-only behind login (two-step for owner and manager).

## Commands

- `npm run dev` runs the site locally (copy `.env.example` to `.env.local` first)
- `npm run check` runs types, lint and unit tests; `npm run build` builds
- `npm run test:db` runs the database rule tests (needs a local Postgres)

## Documentation

- `docs/CHANGELOG.md` what changed and when, including setup notes for older features
- `docs/RELEASE.md` how to release; `docs/SMOKE-TEST.md` what to check afterwards; `docs/STAGING.md` the staging project
- `docs/MEDIA.md` videos and keeping them out of git
- `supabase/README-migrations.md` database scripts and their order; `supabase/BACKUP-AND-RESTORE.md`
- `.env.example` every setting, including the Telegram reminders (`CRON_SECRET`, bot token, chat IDs)
