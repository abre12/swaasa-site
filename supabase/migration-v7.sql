-- Swaasa v7: accurate cash expense modes/categories and configurable opening cash.
-- Apply once in Supabase SQL Editor after migration-v6.sql. Safe to re-run.

alter table cash_expenses
  add column if not exists category text not null default 'Petty Cash',
  add column if not exists mode text not null default 'Cash';

alter table settings
  add column if not exists cash_opening_balance int not null default 0,
  add column if not exists cash_opening_date date;

alter table cash_expenses drop constraint if exists cash_expenses_category_check;
alter table cash_expenses add constraint cash_expenses_category_check
  check (category in ('Petty Cash','Dry Cleaning','Laundry','Repairs / Alterations','Supplies','Transport / Delivery','Other'));

create or replace function cash_position(p_day date)
returns table(opening int, cash_in int, cash_out int, expenses int, expected int,
  counted int, note text, tallied_by uuid, tallied_at timestamptz, anchor_day date)
language plpgsql security definer stable set search_path=public as $$
declare
  a_day date;
  a_amt int;
  mv int := 0;
  ex_before int := 0;
  i int := 0;
  e int := 0;
  ex_today int := 0;
  opening_base int := 0;
  opening_date date;
  o int := 0;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_day is null or p_day > ist_today() then raise exception 'BAD_DATES'; end if;
  if not is_owner() and p_day < date_trunc('month', ist_today())::date then raise exception 'FORBIDDEN'; end if;

  select coalesce(s.cash_opening_balance,0), s.cash_opening_date
    into opening_base, opening_date from settings s limit 1;

  -- Prefer the most recent counted cash tally. Otherwise use the configured opening balance.
  select t.day, t.counted into a_day, a_amt
    from cash_tally t where t.day < p_day order by t.day desc limit 1;

  if a_day is null then
    a_amt := opening_base;
    a_day := opening_date;
  end if;

  -- Sum actual cash receipts and refunds after the anchor and before the selected date.
  select coalesce(sum(case
      when p.kind in ('rent','deposit') then p.amount
      when p.kind in ('deposit_refund','rent_refund') then -p.amount
      else 0 end),0)
    into mv
    from payments p
    where p.kind in ('rent','deposit','deposit_refund','rent_refund')
      and coalesce(p.mode,'') ilike '%cash%'
      and (p.created_at at time zone 'Asia/Kolkata')::date < p_day
      and (a_day is null or (include_anchor and (p.created_at at time zone 'Asia/Kolkata')::date >= a_day) or (not include_anchor and (p.created_at at time zone 'Asia/Kolkata')::date > a_day));

  select coalesce(sum(x.amount),0) into ex_before
    from cash_expenses x
    where coalesce(x.mode,'Cash') ilike '%cash%'
      and x.spent_on < p_day
      and (a_day is null or (include_anchor and x.spent_on >= a_day) or (not include_anchor and x.spent_on > a_day));

  o := coalesce(a_amt,0) + mv - ex_before;

  select
    coalesce(sum(p.amount) filter (where p.kind in ('rent','deposit')),0),
    coalesce(sum(p.amount) filter (where p.kind in ('deposit_refund','rent_refund')),0)
    into i,e
    from payments p
    where p.kind in ('rent','deposit','deposit_refund','rent_refund')
      and coalesce(p.mode,'') ilike '%cash%'
      and (p.created_at at time zone 'Asia/Kolkata')::date = p_day;

  select coalesce(sum(x.amount),0) into ex_today
    from cash_expenses x
    where coalesce(x.mode,'Cash') ilike '%cash%' and x.spent_on = p_day;

  return query
    select o, i, e, ex_today, o + i - e - ex_today,
      t.counted, t.note, t.tallied_by, t.tallied_at, a_day
    from (select 1) one left join cash_tally t on t.day = p_day;
end $$;

create or replace function set_cash_opening(p_amount int, p_effective_date date)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount < 0 or p_effective_date is null or p_effective_date > ist_today() then
    raise exception 'BAD_AMOUNT_OR_DATE';
  end if;
  update settings set cash_opening_balance = p_amount, cash_opening_date = p_effective_date;
end $$;

revoke execute on function cash_position(date), set_cash_opening(int,date) from public;
grant execute on function cash_position(date), set_cash_opening(int,date) to authenticated;
