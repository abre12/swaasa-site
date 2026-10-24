-- Swaasa v2 migration. Run ONCE in Supabase > SQL Editor, after schema.sql. Safe on a database that already has bookings.
-- Adds: alteration notes, preparation status, preparation-staff role, charge breakdown, return notes, colour tags,
-- acquisition date, refund-aware payment totals, owner-only revenue analytics, colour/availability search.

-- 1. Roles ---------------------------------------------------------------------------------------------------------
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('owner','manager','preparation'));
create or replace function is_ops() returns boolean language sql security definer stable set search_path=public
  as $$ select exists(select 1 from staff where user_id=auth.uid() and role in ('owner','manager')) $$;
create or replace function ist_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- 2. Dresses -------------------------------------------------------------------------------------------------------
alter table dresses add column if not exists colour_tags text[] not null default '{}';
alter table dresses add column if not exists acquired_on date;
update dresses d set colour_tags = array[c.label]
  from (values ('black','Black'),('white','White'),('blue','Blue'),('green','Green'),('yellow','Yellow'),('red','Red'),('brown','Brown'),
    ('orange','Orange'),('pink','Pink'),('gold','Gold'),('silver','Silver'),('purple','Purple'),('beige','Beige / Cream'),('cream','Beige / Cream'),
    ('maroon','Maroon'),('floral','Floral / Multicolour'),('multicolour','Floral / Multicolour'),('multicolor','Floral / Multicolour')) c(k,label)
  where lower(trim(d.colour))=c.k and d.colour_tags='{}';

-- 3. Bookings ------------------------------------------------------------------------------------------------------
alter table bookings add column if not exists alteration_notes text;
alter table bookings add column if not exists alteration_updated_at timestamptz;
alter table bookings add column if not exists alteration_updated_by text;
alter table bookings add column if not exists prep_status text not null default 'not_started';
alter table bookings drop constraint if exists bookings_prep_status_check;
alter table bookings add constraint bookings_prep_status_check check (prep_status in ('not_started','alterations_pending','cleaning_pending','ready','delivered'));
alter table bookings add column if not exists late_fee int not null default 0;
alter table bookings add column if not exists damage_charge int not null default 0;
alter table bookings add column if not exists return_notes text;
update bookings set alteration_notes = notes where alteration_notes is null and coalesce(trim(notes),'')<>'';
update bookings set prep_status='delivered' where status in ('out','returned') and prep_status<>'delivered';

alter table payments drop constraint if exists payments_kind_check;
alter table payments add constraint payments_kind_check check (kind in ('rent','deposit','deposit_refund','charge','rent_refund'));

create or replace function bookings_before() returns trigger language plpgsql security definer set search_path=public as $$
declare b int; chk boolean; begin
  perform pg_advisory_xact_lock(hashtext(new.dress_id::text));
  select buffer_days into b from settings;
  new.hold := daterange(new.start_date, new.end_date + 1, '[)');
  if tg_op='INSERT' then chk := true;
  else chk := (new.start_date<>old.start_date or new.end_date<>old.end_date or new.dress_id<>old.dress_id or old.status='cancelled'); end if;
  if chk and new.status<>'cancelled' then
    if exists(select 1 from blocks k where k.dress_id=new.dress_id and daterange(k.start_date,k.end_date+1,'[)') && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if exists(select 1 from bookings o where o.dress_id=new.dress_id and o.id<>new.id and o.status<>'cancelled' and o.hold && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if not new.gap_override and exists(select 1 from bookings o where o.dress_id=new.dress_id and o.id<>new.id and o.status<>'cancelled'
       and daterange(o.start_date, o.end_date + b + 1, '[)') && daterange(new.start_date, new.end_date + b + 1, '[)')) then raise exception 'GAP_CLASH'; end if;
  end if;
  if new.status='out' then new.prep_status := 'delivered'; end if;                       -- handing over completes preparation
  if new.status in ('pending','confirmed') and new.prep_status='delivered' then raise exception 'BAD_PREP'; end if;
  if tg_op='UPDATE' then
    if not is_owner() and (new.rent<>old.rent or new.discount<>old.discount or new.deposit<>old.deposit) then raise exception 'OWNER_ONLY'; end if;
  end if;
  return new; end $$;

-- 4. Totals that understand refunds -----------------------------------------------------------------------------------
drop view if exists booking_view;
create view booking_view with (security_invoker=true) as
  select b.*, d.code dress_code, d.name dress_name, d.category,
    (coalesce(rp.rent_in,0)-coalesce(rp.rent_out,0))::int paid,
    (coalesce(rp.dep_in,0)-coalesce(rp.dep_out,0))::int deposit_held,
    coalesce(rp.rent_out,0)::int rent_refunded
  from bookings b join dresses d on d.id=b.dress_id
  -- kind 'charge' = part of the deposit kept to settle unpaid rent or charges (a book entry, not cash received).
  left join lateral (select sum(amount) filter (where kind in ('rent','charge')) rent_in, sum(amount) filter (where kind='rent_refund') rent_out,
                            sum(amount) filter (where kind='deposit') dep_in, sum(amount) filter (where kind in ('deposit_refund','charge')) dep_out
                     from payments p where p.booking_id=b.id) rp on true;

-- 5. Who can read what ---------------------------------------------------------------------------------------------------
drop policy if exists bookings_staff_r on bookings; drop policy if exists bookings_staff_i on bookings; drop policy if exists bookings_staff_u on bookings;
drop policy if exists bookings_ops_r on bookings; drop policy if exists bookings_ops_i on bookings; drop policy if exists bookings_ops_u on bookings;
create policy bookings_ops_r on bookings for select using (is_ops());
create policy bookings_ops_i on bookings for insert with check (is_ops());
create policy bookings_ops_u on bookings for update using (is_ops());
drop policy if exists pay_r on payments; drop policy if exists pay_i on payments;
create policy pay_r on payments for select using (is_ops());
create policy pay_i on payments for insert with check (is_ops());

-- 6. Booking creation: notes now go to alteration_notes -----------------------------------------------------------------
create or replace function create_booking(p_dress uuid,p_start date,p_end date,p_name text,p_phone text,p_email text,p_notes text)
returns text language plpgsql security definer set search_path=public as $$
declare d dresses; n int; v_id text; v_rent int; begin
  if p_start<ist_today() or p_end<p_start or p_end-p_start>30 then raise exception 'BAD_DATES'; end if;
  if length(trim(coalesce(p_name,'')))<2 or regexp_replace(coalesce(p_phone,''),'\D','','g') !~ '^\d{10,13}$' then raise exception 'BAD_CONTACT'; end if;
  select * into d from dresses where id=p_dress and status='available';
  if not found then raise exception 'NOT_AVAILABLE'; end if;
  n := p_end-p_start+1; v_rent := d.price + greatest(0,n-d.included_days)*d.extra_day_fee;
  insert into bookings(dress_id,customer_name,phone,email,alteration_notes,start_date,end_date,rent,deposit,log)
  values(p_dress,trim(p_name),p_phone,p_email,nullif(trim(coalesce(p_notes,'')),''),p_start,p_end,v_rent,d.deposit,
         jsonb_build_array(jsonb_build_object('t',now(),'m','Requested online')))
  returning id into v_id;
  update dresses set popularity=popularity+1 where id=p_dress;
  return v_id;
exception when exclusion_violation then raise exception 'DATES_TAKEN'; end $$;

create or replace function staff_create_booking(p_dress uuid,p_start date,p_end date,p_name text,p_phone text,p_email text,p_notes text,
  p_advance int,p_mode text,p_discount int,p_override boolean)
returns text language plpgsql security definer set search_path=public as $$
declare d dresses; n int; v_id text; v_rent int; begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if coalesce(p_discount,0)>0 and not is_owner() then raise exception 'OWNER_ONLY'; end if;
  if p_end<p_start or p_end-p_start>30 then raise exception 'BAD_DATES'; end if;
  if length(trim(coalesce(p_name,'')))<2 or regexp_replace(coalesce(p_phone,''),'\D','','g') !~ '^\d{10,13}$' then raise exception 'BAD_CONTACT'; end if;
  select * into d from dresses where id=p_dress and status='available';
  if not found then raise exception 'NOT_AVAILABLE'; end if;
  n := p_end-p_start+1;
  v_rent := greatest(0, d.price + greatest(0,n-d.included_days)*d.extra_day_fee - coalesce(p_discount,0));
  insert into bookings(dress_id,customer_name,phone,email,alteration_notes,start_date,end_date,rent,discount,deposit,status,gap_override,log)
  values(p_dress,trim(p_name),p_phone,p_email,nullif(trim(coalesce(p_notes,'')),''),p_start,p_end,v_rent,coalesce(p_discount,0),d.deposit,'confirmed',coalesce(p_override,false),
    jsonb_build_array(jsonb_build_object('t',now(),'m',case when coalesce(p_override,false) then 'Created by staff. Cleaning gap override: availability checked and confirmed' else 'Created by staff' end)))
  returning id into v_id;
  if coalesce(p_advance,0)>0 then insert into payments(booking_id,amount,kind,mode) values(v_id,p_advance,'rent',p_mode); end if;
  update dresses set popularity=popularity+1 where id=p_dress;
  return v_id;
exception when exclusion_violation then raise exception 'DATES_TAKEN'; end $$;

-- 7. Alteration notes and preparation (any staff member, including preparation staff) -------------------------------------
create or replace function staff_name() returns text language sql security definer stable set search_path=public
  as $$ select coalesce(nullif(s.name,''), u.email, 'staff') from staff s left join auth.users u on u.id=s.user_id where s.user_id=auth.uid() $$;

create or replace function set_alteration_notes(p_id text, p_notes text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_staff() then raise exception 'FORBIDDEN'; end if;
  update bookings set alteration_notes=nullif(trim(coalesce(p_notes,'')),''), alteration_updated_at=now(), alteration_updated_by=staff_name(),
    log = log || jsonb_build_array(jsonb_build_object('t',now(),'m','Alteration notes updated','by',staff_name()))
  where id=p_id and status<>'cancelled';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function set_prep_status(p_id text, p_status text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('not_started','alterations_pending','cleaning_pending','ready') then raise exception 'BAD_PREP'; end if;
  update bookings set prep_status=p_status,
    log = log || jsonb_build_array(jsonb_build_object('t',now(),'m','Preparation: '||replace(p_status,'_',' '),'by',staff_name()))
  where id=p_id and status in ('pending','confirmed');
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Preparation list: no phone numbers or money, so preparation staff can use it.
create or replace function prep_list(p_days int default 7)
returns table(id text, dress_id uuid, dress_code text, dress_name text, category text, image text, customer_name text, start_date date, end_date date,
  status text, prep_status text, alteration_notes text, alteration_updated_at timestamptz, alteration_updated_by text)
language plpgsql security definer stable set search_path=public as $$
begin
  if not is_staff() then raise exception 'FORBIDDEN'; end if;
  return query select b.id,b.dress_id,d.code,d.name,d.category,d.images[1],b.customer_name,b.start_date,b.end_date,b.status,b.prep_status,
      b.alteration_notes,b.alteration_updated_at,b.alteration_updated_by
    from bookings b join dresses d on d.id=b.dress_id
    where b.status='confirmed' and b.start_date <= ist_today()+p_days order by b.start_date, d.code;
end $$;

-- 8. Owner-only revenue analytics (one definition of revenue, enforced on the server) -------------------------------------------
-- Net rental revenue = rent after discount on COMPLETED (returned) bookings, minus rental refunds.
-- Deposits, advances and unpaid balances are not revenue. Late fees and damage charges are reported separately.
create or replace function dress_performance(p_from date default null, p_to date default null)
returns table(dress_id uuid, code text, name text, category text, colour_tags text[], image text, status text, acquired_on date, added_on date,
  completed int, rental_days int, gross int, discounts int, net_rent int, avg_net int, late_fees int, damage_charges int, other_charges int,
  collected int, first_booking date, last_booking date)
language plpgsql security definer stable set search_path=public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  return query
  select d.id,d.code,d.name,d.category,d.colour_tags,d.images[1],d.status,d.acquired_on,d.created_at::date,
    count(v.id)::int, coalesce(sum(v.end_date-v.start_date+1),0)::int,
    coalesce(sum(v.rent+v.discount),0)::int, coalesce(sum(v.discount),0)::int,
    coalesce(sum(v.rent - v.rent_refunded),0)::int,
    case when count(v.id)>0 then round(sum(v.rent - v.rent_refunded)::numeric/count(v.id))::int else 0 end,
    coalesce(sum(v.late_fee),0)::int, coalesce(sum(v.damage_charge),0)::int, coalesce(sum(greatest(0,v.charges-v.late_fee-v.damage_charge)),0)::int,
    coalesce(sum(v.paid),0)::int, min(v.start_date), max(v.start_date)
  from dresses d
  left join booking_view v on v.dress_id=d.id and v.status='returned'
       and (p_from is null or v.start_date>=p_from) and (p_to is null or v.start_date<=p_to)
  where d.status<>'archived'
  group by d.id;
end $$;

create or replace function dress_history(p_dress uuid, p_from date default null, p_to date default null, p_status text default null)
returns table(id text, customer_name text, created_at timestamptz, start_date date, end_date date, returned_at timestamptz, status text,
  original_price int, discount int, net_rent int, charges int, late_fee int, damage_charge int, paid int, outstanding int, return_notes text)
language plpgsql security definer stable set search_path=public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  return query select v.id,v.customer_name,v.created_at,v.start_date,v.end_date,v.returned_at,v.status,(v.rent+v.discount)::int,v.discount,v.rent,v.charges,v.late_fee,v.damage_charge,
      v.paid,(v.rent+v.charges-v.paid)::int,v.return_notes
    from booking_view v where v.dress_id=p_dress and (p_from is null or v.start_date>=p_from) and (p_to is null or v.start_date<=p_to)
      and (p_status is null or v.status=p_status) order by v.start_date desc;
end $$;

-- 9. Catalogue: dresses NOT free for the whole requested period (cleaning gap and blocked dates included) -----------------------------
create or replace function dresses_unavailable(p_from date, p_to date) returns setof uuid
language sql security definer stable set search_path=public as $$
  select d.id from dresses d where d.status<>'available'
  or exists(select 1 from bookings o where o.dress_id=d.id and o.status<>'cancelled'
      and daterange(o.start_date, o.end_date + (select buffer_days from settings) + 1,'[)') && daterange(p_from, p_to + (select buffer_days from settings) + 1,'[)'))
  or exists(select 1 from blocks k where k.dress_id=d.id and daterange(k.start_date,k.end_date+1,'[)') && daterange(p_from,p_to+1,'[)')) $$;

revoke execute on all functions in schema public from public;
grant execute on function dress_busy, create_booking, lookup_booking, dresses_unavailable to anon, authenticated;
grant execute on function set_dress_status, is_staff, is_owner, is_ops, ist_today, staff_create_booking, set_alteration_notes, set_prep_status, prep_list, dress_performance, dress_history to authenticated;
