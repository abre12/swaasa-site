-- Migration v36: editable homepage category cards with owner-managed public image uploads.

begin;

create table if not exists public.site_category_tiles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 60),
  note text not null default '' check (char_length(note) <= 120),
  alt_text text not null default '' check (char_length(alt_text) <= 180),
  image_url text check (image_url is null or (btrim(image_url) <> '' and char_length(image_url) <= 2048)),
  storage_path text check (storage_path is null or char_length(storage_path) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (storage_path is null or image_url is not null)
);

create index if not exists site_category_tiles_order_idx on public.site_category_tiles (sort_order, created_at);

alter table public.site_category_tiles enable row level security;
revoke all on table public.site_category_tiles from public, anon, authenticated;
grant select on table public.site_category_tiles to anon, authenticated;
grant insert, update, delete on table public.site_category_tiles to authenticated;

drop policy if exists site_category_tiles_public_read on public.site_category_tiles;
create policy site_category_tiles_public_read on public.site_category_tiles
  for select to anon, authenticated using (true);

drop policy if exists site_category_tiles_owner_insert on public.site_category_tiles;
create policy site_category_tiles_owner_insert on public.site_category_tiles
  for insert to authenticated with check ((select public.is_owner()));

drop policy if exists site_category_tiles_owner_update on public.site_category_tiles;
create policy site_category_tiles_owner_update on public.site_category_tiles
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists site_category_tiles_owner_delete on public.site_category_tiles;
create policy site_category_tiles_owner_delete on public.site_category_tiles
  for delete to authenticated using ((select public.is_owner()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homepage-category-images', 'homepage-category-images', true, 12582912, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists homepage_category_images_public_read on storage.objects;
create policy homepage_category_images_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'homepage-category-images');

drop policy if exists homepage_category_images_owner_insert on storage.objects;
create policy homepage_category_images_owner_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'homepage-category-images' and (select public.is_owner()));

drop policy if exists homepage_category_images_owner_update on storage.objects;
create policy homepage_category_images_owner_update on storage.objects
  for update to authenticated using (bucket_id = 'homepage-category-images' and (select public.is_owner()))
  with check (bucket_id = 'homepage-category-images' and (select public.is_owner()));

drop policy if exists homepage_category_images_owner_delete on storage.objects;
create policy homepage_category_images_owner_delete on storage.objects
  for delete to authenticated using (bucket_id = 'homepage-category-images' and (select public.is_owner()));

insert into public.site_category_tiles (title, note, alt_text, image_url, sort_order)
select seed.title, seed.note, seed.alt_text, seed.image_url, seed.sort_order
from (values
  ('Bridal Lehengas', 'For the ceremony', 'Model wearing a ruby red and antique gold bridal lehenga', '/category-images/bridal-lehengas.png', 10),
  ('Reception Looks', 'Soft and graceful', 'A woman in a champagne and rose reception lehenga in a warm boutique interior', '/category-images/reception-looks.png', 20),
  ('Sangeet & Mehendi', 'Colour for the celebrations', 'Model wearing a colourful emerald and fuchsia dance lehenga', '/category-images/sangeet-mehendi.png', 30),
  ('Bridesmaids', 'For the people by your side', 'Two friends in sage and lilac festive outfits at a Kerala wedding courtyard', '/category-images/bridesmaids.png', 40),
  ('Other occasions', 'Find a look for what is ahead', 'A woman in a peacock blue silk saree on a traditional Kerala verandah', '/category-images/other-occasions.png', 50)
) as seed(title, note, alt_text, image_url, sort_order)
where not exists (
  select 1 from public.site_category_tiles existing where lower(existing.title) = lower(seed.title)
);

commit;
