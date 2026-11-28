-- Migration v38: editable customer stories and a separate photos-only gallery.
-- Only an owner can add, change, publish, or remove public story content and photos.

begin;

create table if not exists public.site_customer_stories (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null default '' check (char_length(customer_name) <= 120),
  quote text not null default '' check (char_length(quote) <= 4000),
  image_urls text[] not null default array[]::text[],
  image_alts text[] not null default array[]::text[],
  storage_paths text[] not null default array[]::text[],
  sort_order integer not null default 0,
  is_published boolean not null default true,
  show_in_gallery boolean not null default true,
  created_at timestamptz not null default now(),
  constraint site_customer_stories_images_match check (
    cardinality(image_urls) = cardinality(image_alts)
    and cardinality(image_urls) = cardinality(storage_paths)
  ),
  constraint site_customer_stories_nonempty_photo_urls check (array_position(image_urls, '') is null),
  constraint site_customer_stories_has_content check (
    (btrim(customer_name) <> '' and btrim(quote) <> '') or cardinality(image_urls) > 0
  )
);

create index if not exists site_customer_stories_public_order_idx
  on public.site_customer_stories (is_published, sort_order, created_at);

alter table public.site_customer_stories enable row level security;
revoke all on table public.site_customer_stories from public, anon, authenticated;
grant select on table public.site_customer_stories to anon, authenticated;
grant insert, update, delete on table public.site_customer_stories to authenticated;

drop policy if exists site_customer_stories_public_read on public.site_customer_stories;
create policy site_customer_stories_public_read on public.site_customer_stories
  for select to anon, authenticated using (is_published or (select public.is_owner()));

drop policy if exists site_customer_stories_owner_insert on public.site_customer_stories;
create policy site_customer_stories_owner_insert on public.site_customer_stories
  for insert to authenticated with check ((select public.is_owner()));

drop policy if exists site_customer_stories_owner_update on public.site_customer_stories;
create policy site_customer_stories_owner_update on public.site_customer_stories
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists site_customer_stories_owner_delete on public.site_customer_stories;
create policy site_customer_stories_owner_delete on public.site_customer_stories
  for delete to authenticated using ((select public.is_owner()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-story-images', 'customer-story-images', true, 12582912, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists customer_story_images_public_read on storage.objects;
create policy customer_story_images_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'customer-story-images');

drop policy if exists customer_story_images_owner_insert on storage.objects;
create policy customer_story_images_owner_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'customer-story-images' and (select public.is_owner()));

drop policy if exists customer_story_images_owner_update on storage.objects;
create policy customer_story_images_owner_update on storage.objects
  for update to authenticated using (bucket_id = 'customer-story-images' and (select public.is_owner()))
  with check (bucket_id = 'customer-story-images' and (select public.is_owner()));

drop policy if exists customer_story_images_owner_delete on storage.objects;
create policy customer_story_images_owner_delete on storage.objects
  for delete to authenticated using (bucket_id = 'customer-story-images' and (select public.is_owner()));

insert into public.site_customer_stories
  (customer_name, quote, image_urls, image_alts, storage_paths, sort_order, is_published, show_in_gallery)
select seed.customer_name, seed.quote, seed.image_urls, seed.image_alts, seed.storage_paths, seed.sort_order, true, true
from (values
  ('Ashli Elizabath Chacko', 'Recently I purchased a grape wine color lehanga for rent from Swaasa Bridal Rental shop, Trivandrum. It was really amazing, and affordable. No words to describe the look when I wear it on my engagement day. Thank you Swaasa for your beautiful outfit, support and really amazing team who helped me and my family for the end to end process. I''m really happy and my family too. ❤️', array['/customer-stories/ashli-elizabath-chacko.jpg']::text[], array['Ashli and her partner celebrating in a wine-coloured lehenga']::text[], array['']::text[], 10),
  ('Littu Mol', 'Rented my reception outfit from @swaasa wedding rentals and I''m SO glad I did... I wore their maroon lehenga with gold embroidery and felt like an absolute queen. The pics came out stunning and it was even prettier in person. So many compliments all night...❤️ The Swaasa team altered it exactly to my measurements. Quality was 10/10. No stains, no loose threads. It was heavy but surprisingly comfy to wear.💃🏻 The girl Sumayya Super sweet and so helpful If you''re a Tvm bride looking for a rental, don''t think twice. Thank you Swaasa Rentals for making me feel so beautiful on our reception night...❤️💯', array['/customer-stories/littu-mol.jpg']::text[], array['Littu celebrating with her partner in a red bridal lehenga']::text[], array['']::text[], 20),
  ('Rohini Devi R', 'A big thanks to Swaasa for providing such amazing service and beautiful rental outfits at truly affordable rates. These days, most of us look for quality alternatives for event wear since we may not use them again and Swaasa made that possible without compromising on my dream look. I’m so glad I chose their outfit for my special day. I wouldn’t have been able to afford such a gorgeous lehenga if I had gone for a custom one, but Swaasa gave me that experience at a fraction of the price. The staff were also incredibly empathetic, helpful, and caring, which made the entire service smooth and pleasant. I also loved that they offer semi-stitched options at very budget-friendly prices. Overall, I had a wonderful experience with the boutique and would highly recommend Swaasa to anyone looking for stunning yet affordable outfits and rentals.', array['/customer-stories/rohini-devi-r.jpg']::text[], array['Rohini and her partner at their wedding celebration']::text[], array['']::text[], 30),
  ('Malavika', 'Unscripted moments ; perfectly captured 💗 The dress that stole the show ;thank you so much @swaasa_rentals 🤍 for this beautiful dress 🌷', array['/customer-stories/malavika.jpg']::text[], array['Malavika in a pale blue celebration gown']::text[], array['']::text[], 40),
  ('Aswathy S Nair', 'Obsessed with ……💜 lehanga @swaasa_rentals', array['/customer-stories/aswathy-s-nair.jpg']::text[], array['Aswathy in a purple embellished lehenga']::text[], array['']::text[], 50),
  ('Varadha A', '😍😍🔥❤️❤️everyone loved the gown ❤️🔥🔥🔥recieved soo many compliments, Thank you swaasa🔥❤️❤️', array['/customer-stories/varadha-a-gown-couple.jpg', '/customer-stories/varadha-a-gown-portrait.jpg']::text[], array['Varadha and her partner celebrating outdoors in a white gown', 'Varadha in her ivory gown outdoors']::text[], array['', '']::text[], 60),
  ('Reshma Gopi', 'My reception look accidentally turned into a North Indian bridal dream — and I’m not complaining 🤍✨', array['/customer-stories/reshma-gopi-couple.jpg', '/customer-stories/reshma-gopi-portrait.jpg']::text[], array['Reshma and her partner celebrating in a red lehenga', 'Reshma in her red reception lehenga']::text[], array['', '']::text[], 70),
  ('Reshma Gopi', 'Clothed in grace and surrounded by His love. This was the day God turned a prayer into a promise, and forever began. 🤍✨', array['/customer-stories/reshma-gopi-wedding-bouquet.jpg', '/customer-stories/reshma-gopi-wedding-portrait.jpg', '/customer-stories/reshma-gopi-wedding-bouquet-close.jpg']::text[], array['Reshma holding a white bouquet in her wedding gown', 'Reshma in her wedding gown outdoors', 'Reshma with a bouquet of white flowers in her wedding gown']::text[], array['', '', '']::text[], 80),
  ('Pratheeksha G P', 'Asianet Television Award 2026✨️Thanku @swaasa_rentals for the costume ✨️✨️', array['/customer-stories/pratheeksha-gp-award-full.jpg', '/customer-stories/pratheeksha-gp-award-close.jpg', '/customer-stories/pratheeksha-gp-award-portrait.jpg']::text[], array['Pratheeksha at Asianet Television Awards in an ivory embroidered outfit', 'Pratheeksha at the event wearing an ivory embroidered outfit', 'Pratheeksha in full-length ivory occasion wear']::text[], array['', '', '']::text[], 90)
) as seed(customer_name, quote, image_urls, image_alts, storage_paths, sort_order)
where not exists (
  select 1 from public.site_customer_stories existing
  where lower(existing.customer_name) = lower(seed.customer_name)
    and existing.quote = seed.quote
);

commit;
