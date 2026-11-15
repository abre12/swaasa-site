-- Migration v30: keep the dress catalogue private in Storage as well as in the app.
-- Run after deploying the website code that signs dress image URLs.
-- Existing object paths and dress records are preserved.

begin;

update storage.buckets
set public = false
where id = 'dress-images';

drop policy if exists img_read on storage.objects;
create policy img_read on storage.objects
  for select to authenticated
  using (bucket_id = 'dress-images' and is_staff());

drop policy if exists img_write on storage.objects;
create policy img_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dress-images' and is_owner());

drop policy if exists img_del on storage.objects;
create policy img_del on storage.objects
  for delete to authenticated
  using (bucket_id = 'dress-images' and is_owner());

commit;
