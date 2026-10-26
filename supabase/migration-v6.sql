-- Swaasa v6 migration. Run ONCE in Supabase > SQL Editor, AFTER migration-v5.sql. Safe to run again.
-- Adds: private site (login required for everything), customization charge, minimum rental before delivery/return with owner approval,
-- owner discount after booking, deleting staff without losing their history, and smaller photo sizes.

-- 1. Staff can be deleted: access ends, history stays ---------------------------------------------------------------------------
alter table staff add column if not exists deleted_at timestamptz;

-- 2. Bookings: customization charge ---------------------------------------------------------------------------------------------
-- custom_charge is collected IN ADDITION to the rental. It is also part of "charges", so every balance in the system includes it.
alter table bookings add column if not exists custom_charge int not null default 0 check (custom_charge >= 0);

-- 3. Smaller photos --------------------------------------------------------------------------------------------------------------
-- images = originals, medium = large photo on the dress page, thumbs = small cards. All three line up by position.
alter table dresses add column if not exists thumbs text[] not null default '{}';
alter table dresses add column if not exists medium text[] not null default '{}';

-- 4. Approvals -------------------------------------------------------------------------------------------------------------------
create table if not exists approvals(
  id uuid primary key default gen_random_uuid(), booking_id text not null references bookings(id) on delete cascade,
  shortfall int not null check (shortfall>0), reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid default auth.uid() references staff(user_id) on delete set null, requested_at timestamptz not null default now(),
  decided_by uuid references staff(user_id) on delete set null, decided_at timestamptz, decision_note text);
create index if not exists approvals_booking on approvals(booking_id);
alter table approvals enable row level security;
drop policy if exists approvals_r on approvals;
create policy approvals_r on approvals for select using (is_ops());          -- changes are made only through the two functions below

create or replace function bookings_before() returns trigger language plpgsql security definer set search_path=public as $$
declare b int; chk boolean; paid_rent int; begin
  perform pg_advisory_xact_lock(hashtext(new.dress_id::text));
  select buffer_days into b from settings;
  new.hold := daterange(new.start_date, new.end_date + 1, '[)');
  if tg_op='INSERT' then chk := true;
  else chk := (new.start_date<>old.start_date or new.end_date<>old.end_date or new.dress_id<>old.dress_id or old.status='cancelled'); end if;
  if chk and new.status<>'cancelled' then
    if exists(select 1 from blocks k where k.dress_id=new.dress_id and daterange(k.start_date,k.end_date+1,'[)') && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if exists(select 1 from dry_cleanings c where c.dress_id=new.dress_id and daterange(c.sent_on, dc_end(c)+1,'[)') && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if exists(select 1 from bookings o where o.dress_id=new.dress_id and o.id<>new.id and o.status<>'cancelled' and o.hold && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if not new.gap_override and exists(select 1 from bookings o where o.dress_id=new.dress_id and o.id<>new.id and o.status<>'cancelled'
       and daterange(o.start_date, o.end_date + b + 1, '[)') && daterange(new.start_date, new.end_date + b + 1, '[)')) then raise exception 'GAP_CLASH'; end if;
  end if;
  if new.status='out' then new.prep_status := 'delivered'; end if;
  if new.status in ('pending','confirmed') and new.prep_status='delivered' then raise exception 'BAD_PREP'; end if;
  -- Who did what: stamped by the database from the signed-in user, so it cannot be typed in or forged.
  if tg_op='INSERT' then
    if is_staff() then new.taken_by := auth.uid(); end if;                       -- online customer bookings stay empty
  else
    if new.prep_status='ready' and old.prep_status<>'ready' then new.prepared_by := auth.uid(); new.prepared_at := now(); end if;
    if old.prep_status='ready' and new.prep_status not in ('ready','delivered') then new.prepared_by := null; new.prepared_at := null; end if;
    if new.status='out' and old.status<>'out' then new.delivered_by := auth.uid(); end if;
    if new.status='returned' and old.status<>'returned' then new.returned_by := auth.uid(); end if;
  end if;
  -- The rental amount (plus any customization charge) must be received before a dress is handed over or marked returned.
  -- A shortfall needs the owner's approval. The owner may proceed without one.
  if tg_op='UPDATE' and old.status<>new.status and new.status in ('out','returned') then
    if not is_owner() then
      select coalesce(sum(amount) filter (where kind='rent'),0) - coalesce(sum(amount) filter (where kind='rent_refund'),0) into paid_rent from payments where booking_id=new.id;
      if paid_rent < new.rent + new.custom_charge and not exists(select 1 from approvals a where a.booking_id=new.id and a.status='approved' and a.shortfall >= new.rent + new.custom_charge - paid_rent) then raise exception 'SHORTFALL'; end if;
    end if;
  end if;
  if tg_op='UPDATE' then
    if not is_owner() and (new.rent<>old.rent or new.discount<>old.discount or new.deposit<>old.deposit) then raise exception 'OWNER_ONLY'; end if;
  end if;
  return new; end $$;

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

drop function if exists staff_create_booking(uuid,date,date,text,text,text,text,int,text,int,boolean);
drop function if exists staff_create_booking(uuid,date,date,text,text,text,text,int,text,int,boolean,int);
create function staff_create_booking(p_dress uuid,p_start date,p_end date,p_name text,p_phone text,p_email text,p_notes text,
  p_advance int,p_mode text,p_discount int,p_override boolean,p_custom int default 0)
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
  insert into bookings(dress_id,customer_name,phone,email,alteration_notes,start_date,end_date,rent,discount,deposit,custom_charge,charges,status,gap_override,log)
  values(p_dress,trim(p_name),p_phone,p_email,nullif(trim(coalesce(p_notes,'')),''),p_start,p_end,v_rent,coalesce(p_discount,0),booking_deposit(v_rent),greatest(0,coalesce(p_custom,0)),greatest(0,coalesce(p_custom,0)),'confirmed',coalesce(p_override,false),
    jsonb_build_array(jsonb_build_object('t',now(),'m',case when coalesce(p_override,false) then 'Created by staff. Cleaning gap override: availability checked and confirmed' else 'Created by staff' end)))
  returning id into v_id;
  -- p_advance is the part of the money received that counts as rent. The refundable deposit is recorded separately by the website.
  if coalesce(p_advance,0)>0 then insert into payments(booking_id,amount,kind,mode) values(v_id,p_advance,'rent',p_mode); end if;
  update dresses set popularity=popularity+1 where id=p_dress;
  return v_id;
exception when exclusion_violation then raise exception 'DATES_TAKEN'; end $$;

-- Staff ask for approval; if the owner asks, it is approved on the spot.
create or replace function request_shortfall(p_booking text, p_reason text) returns text language plpgsql security definer set search_path=public as $$
declare b bookings; paid_rent int; short int; existing approvals; st text; begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  select * into b from bookings where id=p_booking; if not found then raise exception 'NOT_FOUND'; end if;
  select coalesce(sum(amount) filter (where kind='rent'),0) - coalesce(sum(amount) filter (where kind='rent_refund'),0) into paid_rent from payments where booking_id=p_booking;
  short := b.rent + b.custom_charge - paid_rent; if short <= 0 then raise exception 'NO_SHORTFALL'; end if;
  if not is_owner() and length(trim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED'; end if;
  select * into existing from approvals where booking_id=p_booking and status='approved' and shortfall>=short order by decided_at desc limit 1;
  if found then return 'approved'; end if;
  select * into existing from approvals where booking_id=p_booking and status='pending' limit 1;
  if found then return 'pending'; end if;
  st := case when is_owner() then 'approved' else 'pending' end;
  insert into approvals(booking_id,shortfall,reason,status,decided_by,decided_at) values(p_booking,short,nullif(trim(coalesce(p_reason,'')),''),st,case when is_owner() then auth.uid() end,case when is_owner() then now() end);
  update bookings set log = log || jsonb_build_array(jsonb_build_object('t',now(),'m',case when is_owner() then 'Shortfall of Rs '||short||' accepted by owner' else 'Approval requested: rental amount short by Rs '||short end,'by',staff_name())) where id=p_booking;
  return st; end $$;

create or replace function decide_approval(p_id uuid, p_approve boolean, p_note text) returns void language plpgsql security definer set search_path=public as $$
declare a approvals; begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  update approvals set status=case when p_approve then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), decision_note=nullif(trim(coalesce(p_note,'')),'')
    where id=p_id and status='pending' returning * into a;
  if not found then raise exception 'NOT_FOUND'; end if;
  update bookings set log = log || jsonb_build_array(jsonb_build_object('t',now(),'m',case when p_approve then 'Shortfall of Rs '||a.shortfall||' approved' else 'Shortfall of Rs '||a.shortfall||' rejected' end,'by',staff_name())) where id=a.booking_id;
end $$;

-- Owner only: give a discount after the booking is made. Lowers the rent that is owed; the refundable deposit is unchanged.
create or replace function apply_discount(p_id text, p_amount int, p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare b bookings; begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  select * into b from bookings where id=p_id; if not found then raise exception 'NOT_FOUND'; end if;
  if b.status in ('cancelled','returned') then raise exception 'BAD_STATUS'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > b.rent then raise exception 'BAD_AMOUNT'; end if;
  update bookings set rent = rent - p_amount, discount = discount + p_amount,
    log = log || jsonb_build_array(jsonb_build_object('t',now(),'m','Discount of Rs '||p_amount||' given'||case when length(trim(coalesce(p_reason,'')))>0 then ': '||trim(p_reason) else '' end,'by',staff_name()))
  where id=p_id;
end $$;

-- Staff: add or change the customization charge while the booking is still open.
create or replace function set_custom_charge(p_id text, p_amount int) returns void language plpgsql security definer set search_path=public as $$
declare b bookings; begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  select * into b from bookings where id=p_id; if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('pending','confirmed','out') then raise exception 'BAD_STATUS'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'BAD_AMOUNT'; end if;
  update bookings set charges = charges - custom_charge + p_amount, custom_charge = p_amount,
    log = log || jsonb_build_array(jsonb_build_object('t',now(),'m','Customization charge set to Rs '||p_amount,'by',staff_name()))
  where id=p_id;
end $$;

drop function if exists revenue_report(date, date);
drop function if exists revenue_report(date, date);
create or replace function revenue_report(p_from date default null, p_to date default null)
returns table(id text, dress_code text, dress_name text, category text, customer_name text, phone text, start_date date, end_date date,
  advance_received int, rent_received int, late_fee int, damage_charge int, status text, advance_refunded int, net_amount int, rental_amount int)
language plpgsql security definer stable set search_path=public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  return query
  select b.id,d.code,d.name,d.category,b.customer_name,b.phone,b.start_date,b.end_date,
    coalesce(x.adv,0)::int, (coalesce(x.rent_all,0)-coalesce(x.adv,0))::int, b.late_fee, b.damage_charge, b.status, coalesce(x.refunded,0)::int,
    (coalesce(x.rent_all,0) + b.late_fee + b.damage_charge - coalesce(x.refunded,0))::int, b.rent
  from bookings b join dresses d on d.id=b.dress_id
  left join lateral (select (array_agg(p.amount order by p.created_at, p.id) filter (where p.kind='rent'))[1] as adv,
      coalesce(sum(p.amount) filter (where p.kind='rent'),0) as rent_all, coalesce(sum(p.amount) filter (where p.kind='rent_refund'),0) as refunded
      from payments p where p.booking_id=b.id) x on true
  where b.status<>'pending' and (p_from is null or b.start_date>=p_from) and (p_to is null or b.start_date<=p_to)
  order by b.start_date, b.id;
end $$;

-- 5. The whole site is private: nothing is readable without a staff login --------------------------------------------------------
drop policy if exists dresses_read on dresses; create policy dresses_read on dresses for select using (is_staff());
drop policy if exists settings_read on settings; create policy settings_read on settings for select using (is_staff());
create or replace function dress_busy(p_dress uuid) returns table(start_date date, hold_end date, end_date date)
language sql security definer stable set search_path=public as $$
  select o.start_date, o.end_date + (select buffer_days from settings), o.end_date from bookings o
    where is_staff() and o.dress_id=p_dress and o.status<>'cancelled' and o.end_date + (select buffer_days from settings) >= current_date
  union all select k.start_date, k.end_date, k.end_date from blocks k where is_staff() and k.dress_id=p_dress and k.end_date>=current_date
  union all select c.sent_on, dc_end(c), dc_end(c) from dry_cleanings c where is_staff() and c.dress_id=p_dress and dc_end(c)>=current_date $$;
create or replace function dresses_unavailable(p_from date, p_to date) returns setof uuid
language sql security definer stable set search_path=public as $$
  select d.id from dresses d where is_staff() and (d.status<>'available'
  or exists(select 1 from bookings o where o.dress_id=d.id and o.status<>'cancelled'
      and daterange(o.start_date, o.end_date + (select buffer_days from settings) + 1,'[)') && daterange(p_from, p_to + (select buffer_days from settings) + 1,'[)'))
  or exists(select 1 from blocks k where k.dress_id=d.id and daterange(k.start_date,k.end_date+1,'[)') && daterange(p_from,p_to+1,'[)'))
  or exists(select 1 from dry_cleanings c where c.dress_id=d.id and daterange(c.sent_on, dc_end(c)+1,'[)') && daterange(p_from,p_to+1,'[)'))) $$;
create or replace function lookup_booking(p_id text,p_phone text)
returns table(id text,dress_name text,start_date date,end_date date,status text,rent int,paid int)
language sql security definer stable set search_path=public as $$
  select v.id,v.dress_name,v.start_date,v.end_date,v.status,v.rent,v.paid from booking_view v
  where is_staff() and v.id=upper(trim(p_id)) and right(regexp_replace(v.phone,'\D','','g'),10)=right(regexp_replace(p_phone,'\D','','g'),10) $$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on function create_booking(uuid,date,date,text,text,text,text) from authenticated;   -- customer self-booking is closed
grant execute on function dress_busy, lookup_booking, dresses_unavailable to authenticated;       -- create_booking (customer self-booking) is switched off: the site is staff-only
grant execute on function set_dress_status, is_staff, is_owner, is_ops, ist_today, staff_create_booking, set_alteration_notes, set_prep_status, prep_list, dress_performance, dress_history, dress_washes, revenue_report, request_shortfall, decide_approval, apply_discount, set_custom_charge, cash_tally_day, cash_position to authenticated;
