-- Swaasa v5 migration. Run ONCE in Supabase > SQL Editor, AFTER migration-v4.sql. Safe to run again.
-- Adds: (1) the refundable deposit worked out per booking, (2) the daily cash book: cash in hand, end-of-day tally and petty cash.

-- 1. Refundable deposit --------------------------------------------------------------------------------------------------------
-- The higher of settings.advance_pct % of the rent (after any discount) or settings.advance_min. (Settings > "Refundable deposit".)
-- Bookings that already exist keep the deposit they were made with. Only new bookings use this rule.
create or replace function booking_deposit(p_rent int) returns int language sql stable security definer set search_path=public as $$
  select greatest(round(coalesce(p_rent,0) * s.advance_pct / 100.0)::int, s.advance_min) from settings s limit 1 $$;

create or replace function create_booking(p_dress uuid,p_start date,p_end date,p_name text,p_phone text,p_email text,p_notes text)
returns text language plpgsql security definer set search_path=public as $$
declare d dresses; n int; v_id text; v_rent int; begin
  if p_start<ist_today() or p_end<p_start or p_end-p_start>30 then raise exception 'BAD_DATES'; end if;
  if length(trim(coalesce(p_name,'')))<2 or regexp_replace(coalesce(p_phone,''),'\D','','g') !~ '^\d{10,13}$' then raise exception 'BAD_CONTACT'; end if;
  select * into d from dresses where id=p_dress and status='available';
  if not found then raise exception 'NOT_AVAILABLE'; end if;
  n := p_end-p_start+1; v_rent := d.price + greatest(0,n-d.included_days)*d.extra_day_fee;
  insert into bookings(dress_id,customer_name,phone,email,alteration_notes,start_date,end_date,rent,deposit,log)
  values(p_dress,trim(p_name),p_phone,p_email,nullif(trim(coalesce(p_notes,'')),''),p_start,p_end,v_rent,booking_deposit(v_rent),
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
  values(p_dress,trim(p_name),p_phone,p_email,nullif(trim(coalesce(p_notes,'')),''),p_start,p_end,v_rent,coalesce(p_discount,0),booking_deposit(v_rent),'confirmed',coalesce(p_override,false),
    jsonb_build_array(jsonb_build_object('t',now(),'m',case when coalesce(p_override,false) then 'Created by staff. Cleaning gap override: availability checked and confirmed' else 'Created by staff' end)))
  returning id into v_id;
  -- p_advance is the part of the money received that counts as rent. The refundable deposit is recorded separately by the website.
  if coalesce(p_advance,0)>0 then insert into payments(booking_id,amount,kind,mode) values(v_id,p_advance,'rent',p_mode); end if;
  update dresses set popularity=popularity+1 where id=p_dress;
  return v_id;
exception when exclusion_violation then raise exception 'DATES_TAKEN'; end $$;

-- 2. Daily cash book -----------------------------------------------------------------------------------------------------------
-- Cash in hand = opening (brought forward) + cash received - cash refunds - petty cash. "Cash" means payments whose mode is Cash.
-- Each evening the cash drawer is counted and tallied. The counted amount becomes the next day's opening balance.
-- Until a day is tallied, its expected figure simply carries forward.
create table if not exists cash_expenses(
  id bigint generated always as identity primary key,
  spent_on date not null default ist_today(),
  amount int not null check (amount > 0),
  remarks text not null check (length(trim(remarks)) > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now());
create table if not exists cash_tally(
  day date primary key,
  counted int not null check (counted >= 0),
  note text,
  tallied_by uuid default auth.uid(),
  tallied_at timestamptz not null default now());
alter table cash_expenses enable row level security;
alter table cash_tally enable row level security;

-- Managers see the current month only. The owner sees everything. Expenses can only be added for today and never edited or deleted.
drop policy if exists cash_exp_read on cash_expenses;
create policy cash_exp_read on cash_expenses for select using (is_owner() or (is_ops() and spent_on >= date_trunc('month', ist_today())::date));
drop policy if exists cash_exp_add on cash_expenses;
create policy cash_exp_add on cash_expenses for insert with check (is_ops() and spent_on = ist_today());
drop policy if exists cash_tally_read on cash_tally;
create policy cash_tally_read on cash_tally for select using (is_owner() or (is_ops() and day >= date_trunc('month', ist_today())::date));

create or replace function cash_tally_day(p_day date, p_counted int, p_note text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_day is null or p_day > ist_today() then raise exception 'BAD_DATES'; end if;
  if not is_owner() and p_day < date_trunc('month', ist_today())::date then raise exception 'FORBIDDEN'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'BAD_AMOUNT'; end if;
  insert into cash_tally(day, counted, note, tallied_by, tallied_at)
  values(p_day, p_counted, nullif(trim(coalesce(p_note,'')),''), auth.uid(), now())
  on conflict (day) do update set counted = excluded.counted, note = excluded.note, tallied_by = auth.uid(), tallied_at = now();
end $$;

create or replace function cash_position(p_day date)
returns table(opening int, cash_in int, cash_out int, expenses int, expected int, counted int, note text, tallied_by uuid, tallied_at timestamptz, anchor_day date)
language plpgsql security definer stable set search_path=public as $$
declare a_day date; a_amt int; mv int; ex int; i int; e int; o int; begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if not is_owner() and p_day < date_trunc('month', ist_today())::date then raise exception 'FORBIDDEN'; end if;
  -- Start from the most recent tallied day before this one (or from the beginning if there is none).
  select t.day, t.counted into a_day, a_amt from cash_tally t where t.day < p_day order by t.day desc limit 1;
  a_amt := coalesce(a_amt, 0);
  select coalesce(sum(case when p.kind in ('rent','deposit') then p.amount else -p.amount end), 0) into mv from payments p
    where p.kind in ('rent','deposit','deposit_refund','rent_refund') and p.mode ilike '%cash%'
      and (p.created_at at time zone 'Asia/Kolkata')::date < p_day and (a_day is null or (p.created_at at time zone 'Asia/Kolkata')::date > a_day);
  select coalesce(sum(x.amount), 0) into ex from cash_expenses x where x.spent_on < p_day and (a_day is null or x.spent_on > a_day);
  o := a_amt + mv - ex;
  select coalesce(sum(p.amount) filter (where p.kind in ('rent','deposit')), 0), coalesce(sum(p.amount) filter (where p.kind in ('deposit_refund','rent_refund')), 0) into i, e from payments p
    where p.kind in ('rent','deposit','deposit_refund','rent_refund') and p.mode ilike '%cash%' and (p.created_at at time zone 'Asia/Kolkata')::date = p_day;
  select coalesce(sum(x.amount), 0) into ex from cash_expenses x where x.spent_on = p_day;
  return query select o, i, e, ex, o + i - e - ex, t.counted, t.note, t.tallied_by, t.tallied_at, a_day
    from (select 1) one left join cash_tally t on t.day = p_day;
end $$;

revoke execute on function booking_deposit(int), cash_tally_day(date,int,text), cash_position(date) from public;
grant execute on function cash_tally_day(date,int,text), cash_position(date) to authenticated;
