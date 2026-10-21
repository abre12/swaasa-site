-- Swaasa Wedding Rentals: run this whole file once in Supabase > SQL Editor.
create extension if not exists btree_gist;

create table staff(user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('owner','manager')), name text);
create function is_staff() returns boolean language sql security definer stable set search_path=public
  as $$ select exists(select 1 from staff where user_id=auth.uid()) $$;
create function is_owner() returns boolean language sql security definer stable set search_path=public
  as $$ select exists(select 1 from staff where user_id=auth.uid() and role='owner') $$;

create table settings(id int primary key default 1 check(id=1),
  buffer_days int not null default 1, advance_pct int not null default 30, tryon_daily_limit int not null default 3);
insert into settings default values;

create table dresses(id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null, category text not null, colour text,
  sizes text[] default '{}', alterations text, price int not null, deposit int not null default 0,
  included_days int not null default 3, extra_day_fee int not null default 0,
  description text, policy text, condition text, notes text,
  status text not null default 'available' check (status in ('available','maintenance','unavailable','retired','archived')),
  images text[] default '{}', try_on_image text, popularity int default 0, created_at timestamptz default now());

create table bookings(
  id text primary key default 'SW'||upper(substr(md5(random()::text||clock_timestamp()::text),1,7)),
  dress_id uuid not null references dresses, customer_name text not null, phone text not null, email text, notes text,
  start_date date not null, end_date date not null check (end_date>=start_date),
  rent int not null, discount int not null default 0, charges int not null default 0, deposit int not null default 0,
  status text not null default 'pending' check (status in ('pending','confirmed','out','returned','cancelled')),
  hold daterange, picked_up_at timestamptz, returned_at timestamptz,
  log jsonb not null default '[]', created_at timestamptz default now(),
  -- THE double-booking guarantee: the database itself rejects overlapping holds on one dress.
  constraint no_double_booking exclude using gist (dress_id with =, hold with &&) where (status<>'cancelled'));

create table blocks(id uuid primary key default gen_random_uuid(), dress_id uuid not null references dresses,
  start_date date not null, end_date date not null check(end_date>=start_date), reason text, created_by uuid default auth.uid());

create table payments(id uuid primary key default gen_random_uuid(), booking_id text not null references bookings,
  amount int not null, kind text not null check (kind in ('rent','deposit','deposit_refund','charge')),
  mode text, created_by uuid default auth.uid(), created_at timestamptz default now());

create table tryon_log(id bigserial primary key, ip_hash text not null, created_at timestamptz default now());
create index on tryon_log(ip_hash, created_at);

create function bookings_before() returns trigger language plpgsql security definer set search_path=public as $$
declare b int; begin
  select buffer_days into b from settings;
  new.hold := daterange(new.start_date, new.end_date + b + 1, '[)');
  if new.status<>'cancelled' and exists(select 1 from blocks k where k.dress_id=new.dress_id
     and daterange(k.start_date,k.end_date+1,'[)') && new.hold) then raise exception 'DATES_TAKEN'; end if;
  if tg_op='UPDATE' and not is_owner() and (new.rent<>old.rent or new.discount<>old.discount or new.deposit<>old.deposit)
     then raise exception 'OWNER_ONLY'; end if;
  return new; end $$;
create trigger t_bookings_before before insert or update on bookings for each row execute function bookings_before();

create function blocks_before() returns trigger language plpgsql security definer set search_path=public as $$
declare b int; begin select buffer_days into b from settings;
  if exists(select 1 from bookings x where x.dress_id=new.dress_id and x.status<>'cancelled'
     and x.hold && daterange(new.start_date,new.end_date+1,'[)')) then raise exception 'BLOCK_CONFLICT'; end if;
  return new; end $$;
create trigger t_blocks_before before insert or update on blocks for each row execute function blocks_before();

create view booking_view with (security_invoker=true) as
  select b.*, d.code dress_code, d.name dress_name, d.category,
    coalesce((select sum(amount) from payments p where p.booking_id=b.id and p.kind='rent'),0)::int paid,
    coalesce((select sum(amount) from payments p where p.booking_id=b.id and p.kind='deposit'),0)::int deposit_held
  from bookings b join dresses d on d.id=b.dress_id;

-- Public, safe functions (customers never read the bookings table).
create function dress_busy(p_dress uuid) returns table(start_date date, hold_end date)
language sql security definer stable set search_path=public as $$
  select start_date, (upper(hold)-1) from bookings where dress_id=p_dress and status<>'cancelled' and upper(hold)>=current_date
  union all select start_date, end_date from blocks where dress_id=p_dress and end_date>=current_date $$;

create function create_booking(p_dress uuid,p_start date,p_end date,p_name text,p_phone text,p_email text,p_notes text)
returns text language plpgsql security definer set search_path=public as $$
declare d dresses; n int; v_id text; v_rent int; begin
  if p_start<current_date or p_end<p_start or p_end-p_start>30 then raise exception 'BAD_DATES'; end if;
  if length(trim(coalesce(p_name,'')))<2 or regexp_replace(coalesce(p_phone,''),'\D','','g') !~ '^\d{10,13}$' then raise exception 'BAD_CONTACT'; end if;
  select * into d from dresses where id=p_dress and status='available';
  if not found then raise exception 'NOT_AVAILABLE'; end if;
  n := p_end-p_start+1; v_rent := d.price + greatest(0,n-d.included_days)*d.extra_day_fee;
  insert into bookings(dress_id,customer_name,phone,email,notes,start_date,end_date,rent,deposit,log)
  values(p_dress,trim(p_name),p_phone,p_email,p_notes,p_start,p_end,v_rent,d.deposit,
         jsonb_build_array(jsonb_build_object('t',now(),'m','Requested online')))
  returning id into v_id;
  update dresses set popularity=popularity+1 where id=p_dress;
  return v_id;
exception when exclusion_violation then raise exception 'DATES_TAKEN'; end $$;

create function lookup_booking(p_id text,p_phone text)
returns table(id text,dress_name text,start_date date,end_date date,status text,rent int,paid int)
language sql security definer stable set search_path=public as $$
  select v.id,v.dress_name,v.start_date,v.end_date,v.status,v.rent,v.paid from booking_view v
  where v.id=upper(trim(p_id)) and right(regexp_replace(v.phone,'\D','','g'),10)=right(regexp_replace(p_phone,'\D','','g'),10) $$;

create function set_dress_status(p_id uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
begin if not is_staff() then raise exception 'FORBIDDEN'; end if;
  update dresses set status=p_status where id=p_id; end $$;

revoke execute on all functions in schema public from public;
grant execute on function dress_busy, create_booking, lookup_booking to anon, authenticated;
grant execute on function set_dress_status, is_staff, is_owner to authenticated;

-- Row level security
alter table staff enable row level security; alter table settings enable row level security;
alter table dresses enable row level security; alter table bookings enable row level security;
alter table blocks enable row level security; alter table payments enable row level security;
alter table tryon_log enable row level security;
create policy staff_read on staff for select using (user_id=auth.uid() or is_owner());
create policy staff_owner on staff for all using (is_owner()) with check (is_owner());
create policy settings_read on settings for select using (true);
create policy settings_owner on settings for update using (is_owner());
create policy dresses_read on dresses for select using (status<>'archived' or is_staff());
create policy dresses_owner on dresses for all using (is_owner()) with check (is_owner());
create policy bookings_staff_r on bookings for select using (is_staff());
create policy bookings_staff_i on bookings for insert with check (is_staff());
create policy bookings_staff_u on bookings for update using (is_staff());
create policy bookings_owner_d on bookings for delete using (is_owner());
create policy blocks_staff on blocks for all using (is_staff()) with check (is_staff());
create policy pay_r on payments for select using (is_staff());
create policy pay_i on payments for insert with check (is_staff());   -- no update/delete: payment history is permanent
-- tryon_log has no policies: only the server (service role) can use it.

-- Dress photo storage
insert into storage.buckets(id,name,public) values('dress-images','dress-images',true) on conflict do nothing;
create policy img_read on storage.objects for select using (bucket_id='dress-images');
create policy img_write on storage.objects for insert with check (bucket_id='dress-images' and is_owner());
create policy img_del on storage.objects for delete using (bucket_id='dress-images' and is_owner());
