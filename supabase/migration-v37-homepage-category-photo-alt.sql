-- Refresh alt text for the bundled category photos only. Owner-uploaded images and custom copy are untouched.
begin;

update public.site_category_tiles
set alt_text = 'Bride in a ruby red and antique gold lehenga inside a warm bridal boutique'
where lower(btrim(title)) = 'bridal lehengas'
  and image_url = '/category-images/bridal-lehengas.png';

update public.site_category_tiles
set alt_text = 'Dancer in an emerald and fuchsia lehenga at an evening mehendi celebration'
where lower(btrim(title)) = 'sangeet & mehendi'
  and image_url = '/category-images/sangeet-mehendi.png';

update public.site_category_tiles
set alt_text = 'A woman in a dusty rose luxury salwar suit on a heritage verandah'
where lower(btrim(title)) = 'other occasions'
  and image_url = '/category-images/other-occasions.png';

commit;
