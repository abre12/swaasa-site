-- Run once in Supabase > SQL Editor (replaces update-busy-function.sql). Adds staff bookings and the staff cleaning-gap override.
alter table bookings add column if not exists gap_override boolean not null default false;
alter table bookings drop constraint if exists no_double_booking;

create or replace function bookings_before() returns trigger language plpgsql security definer set search_path=public as $$
declare b int; chk boolean; begin
  perform pg_advisory_xact_lock(hashtext(new.dress_id::text));   -- one booking at a time per dress
  select buffer_days into b from settings;
  new.hold := daterange(new.start_date, new.end_date + 1, '[)');   -- the real rental dates
  if tg_op='INSERT' then chk := true;
  else chk := (new.start_date<>old.start_date or new.end_date<>old.end_date or new.dress_id<>old.dress_id or old.status='cancelled'); end if;
  if chk and new.status<>'cancelled' then
    if exists(select 1 from blocks k where k.dress_id=new.dress_id and daterange(k.start_date,k.end_date+1,'[)') && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if exists(select 1 from bookings o where o.dress_id=new.dress_id and o.id<>new.id and o.status<>'cancelled' and o.hold && new.hold) then raise exception 'DATES_TAKEN'; end if;
    if not new.gap_override and exists(select 1 from bookings o where o.dress_id=new.dress_id and o.id<>new.id and o.status<>'cancelled'
       and daterange(o.start_date, o.end_date + b + 1, '[)') && daterange(new.start_date, new.end_date + b + 1, '[)')) then raise exception 'GAP_CLASH'; end if;
  end if;
  if tg_op='UPDATE' then
    if not is_owner() and (new.rent<>old.rent or new.discount<>old.discount or new.deposit<>old.deposit) then raise exception 'OWNER_ONLY'; end if;
  end if;
  return new; end $$;

update bookings set hold = daterange(start_date, end_date + 1, '[)');
alter table bookings add constraint no_double_booking exclude using gist (dress_id with =, hold with &&) where (status<>'cancelled');

drop function if exists dress_busy(uuid);
create function dress_busy(p_dress uuid) returns table(start_date date, hold_end date, end_date date)
language sql security definer stable set search_path=public as $$
  select o.start_date, o.end_date + (select buffer_days from settings), o.end_date from bookings o
    where o.dress_id=p_dress and o.status<>'cancelled' and o.end_date + (select buffer_days from settings) >= current_date
  union all select k.start_date, k.end_date, k.end_date from blocks k where k.dress_id=p_dress and k.end_date>=current_date $$;

-- Staff create a confirmed booking (walk-in or phone). Only staff can run this; only they can override the cleaning gap.
create function staff_create_booking(p_dress uuid,p_start date,p_end date,p_name text,p_phone text,p_email text,p_notes text,
  p_advance int,p_mode text,p_discount int,p_override boolean)
returns text language plpgsql security definer set search_path=public as $$
declare d dresses; n int; v_id text; v_rent int; begin
  if not is_staff() then raise exception 'FORBIDDEN'; end if;
  if coalesce(p_discount,0)>0 and not is_owner() then raise exception 'OWNER_ONLY'; end if;
  if p_end<p_start or p_end-p_start>30 then raise exception 'BAD_DATES'; end if;
  if length(trim(coalesce(p_name,'')))<2 or regexp_replace(coalesce(p_phone,''),'\D','','g') !~ '^\d{10,13}$' then raise exception 'BAD_CONTACT'; end if;
  select * into d from dresses where id=p_dress and status='available';
  if not found then raise exception 'NOT_AVAILABLE'; end if;
  n := p_end-p_start+1;
  v_rent := greatest(0, d.price + greatest(0,n-d.included_days)*d.extra_day_fee - coalesce(p_discount,0));
  insert into bookings(dress_id,customer_name,phone,email,notes,start_date,end_date,rent,discount,deposit,status,gap_override,log)
  values(p_dress,trim(p_name),p_phone,p_email,p_notes,p_start,p_end,v_rent,coalesce(p_discount,0),d.deposit,'confirmed',coalesce(p_override,false),
    jsonb_build_array(jsonb_build_object('t',now(),'m',case when coalesce(p_override,false) then 'Created by staff. Cleaning gap override: availability checked and confirmed' else 'Created by staff' end)))
  returning id into v_id;
  if coalesce(p_advance,0)>0 then insert into payments(booking_id,amount,kind,mode) values(v_id,p_advance,'rent',p_mode); end if;
  update dresses set popularity=popularity+1 where id=p_dress;
  return v_id;
exception when exclusion_violation then raise exception 'DATES_TAKEN'; end $$;

revoke execute on function dress_busy(uuid) from public;
grant execute on function dress_busy(uuid) to anon, authenticated;
revoke execute on function staff_create_booking(uuid,date,date,text,text,text,text,int,text,int,boolean) from public;
grant execute on function staff_create_booking(uuid,date,date,text,text,text,text,int,text,int,boolean) to authenticated;
