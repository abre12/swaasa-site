-- Migration v12: structured alteration details (checklist, measurements) and quality-check record.
-- Safe to run more than once.
alter table alteration_jobs add column if not exists checklist jsonb not null default '[]'::jsonb;     -- [{k:'waist',note:'Take in 1 inch'}]
alter table alteration_jobs add column if not exists measurements jsonb not null default '{}'::jsonb;   -- {bust:'36',waist:'30',...} optional
alter table alteration_jobs add column if not exists qc jsonb not null default '{}'::jsonb;             -- {done:true,meets:true,nodamage:true,presentable:true}
alter table alteration_jobs add column if not exists qc_notes text;
