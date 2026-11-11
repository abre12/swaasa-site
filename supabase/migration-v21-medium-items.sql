-- Migration v21: medium-priority items. Run after v20. Safe to run more than once. Changes no existing data.
--   1. Alert timing is set in Settings instead of being fixed in the code.
--   2. Alert "read" marks are kept per person in the database (they used to live in one browser).

-- 1. Timing settings (owner edits them under Settings). The defaults equal the values that were fixed in the code until now.
alter table settings add column if not exists alert_horizon_days int not null default 7;  -- how far ahead a pending task can matter
alter table settings add column if not exists alert_idle_days    int not null default 3;  -- days waiting to be sent before it is raised
alter table settings add column if not exists clean_lead_days    int not null default 3;  -- days a dress waiting to be sent needs before delivery
alter table settings add column if not exists alt_soon_days      int not null default 2;  -- "alteration due soon" window
alter table settings drop constraint if exists settings_alert_ranges;
alter table settings add constraint settings_alert_ranges check (
  alert_horizon_days between 1 and 30 and alert_idle_days between 1 and 30 and clean_lead_days between 1 and 14 and alt_soon_days between 1 and 14);

-- 2. Per-person alert read marks. Each person can only see and change their own rows.
create table if not exists alert_reads (
  user_id uuid not null default auth.uid(),
  alert_key text not null,
  rank int not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, alert_key)
);
create index if not exists alert_reads_updated_idx on alert_reads(updated_at);
alter table alert_reads enable row level security;
drop policy if exists alert_reads_own on alert_reads;
create policy alert_reads_own on alert_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
