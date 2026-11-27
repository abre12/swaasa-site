-- Migration v35: owner-managed questions and answers for the public website.
-- FAQs are public content, but only an active owner can add, edit or remove them.

begin;

create table if not exists public.site_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(btrim(question)) between 3 and 180),
  answer text not null check (char_length(btrim(answer)) between 1 and 3000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists site_faqs_order_idx on public.site_faqs (sort_order, created_at);

alter table public.site_faqs enable row level security;
revoke all on table public.site_faqs from public, anon, authenticated;
grant select on table public.site_faqs to anon, authenticated;
grant insert, update, delete on table public.site_faqs to authenticated;

drop policy if exists site_faqs_public_read on public.site_faqs;
create policy site_faqs_public_read on public.site_faqs
  for select to anon, authenticated using (true);

drop policy if exists site_faqs_owner_insert on public.site_faqs;
create policy site_faqs_owner_insert on public.site_faqs
  for insert to authenticated with check ((select public.is_owner()));

drop policy if exists site_faqs_owner_update on public.site_faqs;
create policy site_faqs_owner_update on public.site_faqs
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists site_faqs_owner_delete on public.site_faqs;
create policy site_faqs_owner_delete on public.site_faqs
  for delete to authenticated using ((select public.is_owner()));

insert into public.site_faqs (question, answer, sort_order)
select seed.question, seed.answer, seed.sort_order
from (values
  ('Where is Swaasa Wedding Rentals?', 'We are at SWAASA Boutique, 2nd Floor, opposite India Post, Karamana, Thiruvananthapuram (Trivandrum), Kerala 695002. The home page has a Get directions link that opens the exact door in Google Maps.', 10),
  ('What can I rent?', 'Bridal lehengas, gowns and sarees, styles for bridesmaids, and looks for other celebrations. Our collection is shown in person at our studio.', 20),
  ('Can I see the outfits before I decide?', 'Yes. Plan a visit to our studio and we will help you try looks, with personal guidance. Use the form on our home page and we will call you to fix a time, or call or message us on WhatsApp. We keep some looks ready for your visit.', 30),
  ('Do you help with fitting and alterations?', 'Yes. We offer fitting and alteration support, so you can talk through the fit before you decide.', 40),
  ('Can I choose my own rental dates?', 'Rental dates are flexible, so you can plan around your celebration. Tell us your event date when you plan your visit and we will take it from there.', 50),
  ('I have already booked. How do I check my booking?', 'Use Track a booking on the home page. Enter your booking ID and the mobile number you shared with us, and you will see the latest status and key dates for that booking.', 60),
  ('Is my phone number safe with you?', 'We use your number only to arrange your visit or call. The tracking page shows only the progress and dates for the booking that matches both your booking ID and your number.', 70)
) as seed(question, answer, sort_order)
where not exists (
  select 1 from public.site_faqs existing where lower(existing.question) = lower(seed.question)
);

commit;
