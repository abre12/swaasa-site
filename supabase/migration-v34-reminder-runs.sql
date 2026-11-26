-- Migration v34: a log of every scheduled reminder, so a silently missing one can be noticed.
-- The reminders are sent by a GitHub Actions schedule. GitHub can start a run late or skip it, and until now nothing told anyone when the
-- morning briefing simply did not arrive. The digest route now writes one row here per real (non-dry) run, and a once-a-day watchdog
-- (app/api/cron/watchdog, started by Vercel Cron) tells the owner on Telegram which of today's reminders never ran.
-- Additive: safe to apply before or after the website code is deployed. Only the website's server key can read or write it.

begin;

create table if not exists public.reminder_runs (
  id bigint generated always as identity primary key,
  slot text not null check (slot in ('morning', 'dminus1', 'noon', 'afternoon', 'evening', 'watchdog')),
  run_date date not null,                          -- the India date the run belongs to
  ran_at timestamptz not null default now(),
  outcome text not null check (outcome in ('sent', 'nothing', 'error')),
  sent integer not null default 0 check (sent >= 0),
  error text check (error is null or char_length(error) <= 300),
  source text check (source is null or char_length(source) <= 20)
);
create index if not exists reminder_runs_date_slot_idx on public.reminder_runs (run_date, slot);
alter table public.reminder_runs enable row level security;
revoke all on table public.reminder_runs from public, anon, authenticated;

commit;
