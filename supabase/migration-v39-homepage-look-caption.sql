-- Migration v39: owner-managed copy below the homepage category cards.
-- The public site can read the caption; only the active owner can change it.

begin;

create table if not exists public.site_home_content (
  id smallint primary key check (id = 1),
  look_caption text not null default 'Wedding lehengas, gowns, luxury salwars, sarees, Anarkalis, cape lehengas and shararas for weddings, sangeet, engagements and parties.'
    check (char_length(look_caption) <= 320),
  updated_at timestamptz not null default now()
);

alter table public.site_home_content enable row level security;
revoke all on table public.site_home_content from public, anon, authenticated;
grant select on table public.site_home_content to anon, authenticated;
grant update on table public.site_home_content to authenticated;

drop policy if exists site_home_content_public_read on public.site_home_content;
create policy site_home_content_public_read on public.site_home_content
  for select to anon, authenticated using (true);

drop policy if exists site_home_content_owner_update on public.site_home_content;
create policy site_home_content_owner_update on public.site_home_content
  for update to authenticated using ((select public.is_owner()))
  with check ((select public.is_owner()));

insert into public.site_home_content (id)
values (1)
on conflict (id) do nothing;

commit;
