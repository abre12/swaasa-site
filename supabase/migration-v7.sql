-- Swaasa migration 7: Daily Cash Counter accuracy. Run ONCE in Supabase > SQL Editor, AFTER migration-v6.sql. Safe to run again.
-- Everything here is ADDITIVE: no booking, payment, refund, customer or dress record is changed or removed, and the screens
-- you use today keep working until the new website files are deployed.

create or replace function ist_d(ts timestamptz) returns date language sql immutable as $$ select (ts at time zone 'Asia/Kolkata')::date $$;

-- 1. Opening cash for the very first day (owner sets it once) ----------------------------------------------------------------------
alter table settings add column if not exists cash_opening int check (cash_opening >= 0);
alter table settings add column if not exists cash_opening_date date;

-- 2. Why each payment was taken (so advances, rent, customization and charges are never guessed) ---------------------------------
alter table payments add column if not exists purpose text
  check (purpose in ('advance','rent','customization','damage','cleaning','other_charge','deposit','deposit_refund','advance_refund','rent_refund','deposit_applied'));
-- Existing rows: the first rent payment made when the booking was taken is the advance; later ones are rent.
update payments p set purpose = case
  when p.kind='deposit' then 'deposit' when p.kind='deposit_refund' then 'deposit_refund' when p.kind='charge' then 'deposit_applied'
  when p.kind='rent_refund' then case when exists(select 1 from bookings b where b.id=p.booking_id and b.status='cancelled') then 'advance_refund' else 'rent_refund' end
  when p.kind='rent' then case when p.id = (select p2.id from payments p2 where p2.booking_id=p.booking_id and p2.kind='rent' order by p2.created_at, p2.id limit 1)
       and p.created_at < (select b.created_at from bookings b where b.id=p.booking_id) + interval '30 minutes' then 'advance' else 'rent' end
  end where p.purpose is null;
-- New rows from any screen that does not state a purpose get a sensible one.
create or replace function payments_purpose_default() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.purpose is null then
    new.purpose := case new.kind when 'deposit' then 'deposit' when 'deposit_refund' then 'deposit_refund' when 'charge' then 'deposit_applied'
      when 'rent_refund' then 'rent_refund'
      else case when not exists(select 1 from payments x where x.booking_id=new.booking_id and x.kind='rent')
                 and now() < (select b.created_at from bookings b where b.id=new.booking_id) + interval '30 minutes' then 'advance' else 'rent' end end;
  end if;
  return new; end $$;
drop trigger if exists t_payments_purpose on payments;
create trigger t_payments_purpose before insert on payments for each row execute function payments_purpose_default();

-- 3. Expenses: category, how it was paid, payee, link to a dry-cleaning job, and an owner-only void (nothing is ever deleted) --------
alter table cash_expenses add column if not exists category text not null default 'Petty cash'
  check (category in ('Petty cash','Tea & refreshments','Dry cleaning','Alterations & repairs','Packaging & supplies','Transport & delivery','Other'));
alter table cash_expenses add column if not exists mode text not null default 'Cash' check (mode in ('Cash','GPay / UPI','Card','Bank transfer'));
alter table cash_expenses add column if not exists payee text;
alter table cash_expenses add column if not exists dry_cleaning_id uuid references dry_cleanings(id);
alter table cash_expenses add column if not exists voided_at timestamptz;
alter table cash_expenses add column if not exists voided_by uuid;
alter table cash_expenses add column if not exists void_reason text;
create unique index if not exists cash_expenses_one_per_wash on cash_expenses(dry_cleaning_id) where dry_cleaning_id is not null and voided_at is null;

-- 4. Tally: what was expected, what was counted, the difference, and an audit trail ------------------------------------------------------
alter table cash_tally add column if not exists expected int;
alter table cash_tally add column if not exists difference int;
alter table cash_tally add column if not exists status text not null default 'reconciled' check (status in ('reconciled','discrepancy'));
create table if not exists cash_audit(id bigint generated always as identity primary key, at timestamptz not null default now(), by uuid default auth.uid(),
  action text not null, day date, detail jsonb);
alter table cash_audit enable row level security;
drop policy if exists cash_audit_read on cash_audit; create policy cash_audit_read on cash_audit for select using (is_owner());

-- 5. The cash drawer, one calculation used everywhere --------------------------------------------------------------------------------------
-- Expected closing cash = opening + cash received - cash refunds paid - cash expenses.
--   Only payments whose mode is Cash count. GPay / UPI, Card and non-cash book entries never touch it.
--   Opening = the counted amount of the latest tallied day before this one, else the opening the owner configured, else "not set".
create or replace function cash_book(p_day date)
returns table(opening_known boolean, opening int, cash_in int, cash_refunds int, expenses int, expected int,
  counted int, difference int, status text, note text, tallied_by uuid, tallied_at timestamptz, anchor text)
language plpgsql security definer stable set search_path=public as $$
declare a_day date; a_amt int; o_amt int; o_day date; s_day date; base int; mv int; ex int; ci int; cr int; ce int; op int; known boolean := true; anc text;
begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if not is_owner() and p_day < date_trunc('month', ist_today())::date then raise exception 'FORBIDDEN'; end if;
  select t.day, t.counted into a_day, a_amt from cash_tally t where t.day < p_day order by t.day desc limit 1;
  if found then s_day := a_day + 1; base := a_amt; anc := 'counted cash of ' || a_day::text;
  else
    select s.cash_opening, s.cash_opening_date into o_amt, o_day from settings s;
    if o_amt is null or o_day is null or p_day < o_day then known := false;
    else s_day := o_day; base := o_amt; anc := 'opening cash set for ' || o_day::text; end if;
  end if;
  if known then
    select coalesce(sum(case when p.kind in ('rent','deposit') then p.amount else -p.amount end),0) into mv from payments p
      where p.kind in ('rent','deposit','deposit_refund','rent_refund') and p.mode ilike '%cash%' and ist_d(p.created_at) >= s_day and ist_d(p.created_at) < p_day;
    select coalesce(sum(x.amount),0) into ex from cash_expenses x where x.voided_at is null and x.mode ilike '%cash%' and x.spent_on >= s_day and x.spent_on < p_day;
    op := base + mv - ex;
  end if;
  select coalesce(sum(p.amount) filter (where p.kind in ('rent','deposit')),0), coalesce(sum(p.amount) filter (where p.kind in ('deposit_refund','rent_refund')),0) into ci, cr from payments p
    where p.kind in ('rent','deposit','deposit_refund','rent_refund') and p.mode ilike '%cash%' and ist_d(p.created_at) = p_day;
  select coalesce(sum(x.amount),0) into ce from cash_expenses x where x.voided_at is null and x.mode ilike '%cash%' and x.spent_on = p_day;
  return query select known, op, ci, cr, ce, case when known then op + ci - cr - ce end, t.counted, t.difference, t.status, t.note, t.tallied_by, t.tallied_at, anc
    from (select 1) one left join cash_tally t on t.day = p_day;
end $$;

-- End of day tally. It records what was counted; it never creates a payment, refund or expense.
create or replace function tally_cash(p_day date, p_counted int, p_note text) returns void
language plpgsql security definer set search_path=public as $$
declare cb record; diff int; had boolean; begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_day is null or p_day > ist_today() then raise exception 'BAD_DATES'; end if;
  if not is_owner() and p_day < date_trunc('month', ist_today())::date then raise exception 'FORBIDDEN'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'BAD_AMOUNT'; end if;
  select * into cb from cash_book(p_day);
  if not cb.opening_known then raise exception 'OPENING_REQUIRED'; end if;
  diff := p_counted - cb.expected;
  if diff <> 0 and length(trim(coalesce(p_note,''))) < 3 then raise exception 'REMARK_REQUIRED'; end if;
  select exists(select 1 from cash_tally where day = p_day) into had;
  if had and not is_owner() then raise exception 'ALREADY_TALLIED'; end if;           -- only the owner may change a day that was already tallied
  insert into cash_tally(day, counted, expected, difference, status, note, tallied_by, tallied_at)
  values(p_day, p_counted, cb.expected, diff, case when diff = 0 then 'reconciled' else 'discrepancy' end, nullif(trim(coalesce(p_note,'')),''), auth.uid(), now())
  on conflict (day) do update set counted = excluded.counted, expected = excluded.expected, difference = excluded.difference, status = excluded.status,
    note = excluded.note, tallied_by = auth.uid(), tallied_at = now();
  insert into cash_audit(action, day, detail) values(case when had then 'tally_changed' else 'tally' end, p_day, jsonb_build_object('expected', cb.expected, 'counted', p_counted, 'difference', diff, 'note', p_note));
end $$;

create or replace function set_cash_opening(p_amount int, p_date date) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount < 0 or p_date is null or p_date > ist_today() then raise exception 'BAD_AMOUNT'; end if;
  if exists(select 1 from cash_tally where day >= p_date) then raise exception 'ALREADY_TALLIED'; end if;       -- an opening cannot be moved past a tallied day
  update settings set cash_opening = p_amount, cash_opening_date = p_date where id = 1;
  insert into cash_audit(action, day, detail) values('opening_set', p_date, jsonb_build_object('amount', p_amount));
end $$;

-- Money the business is holding for customers, as at the end of the chosen day.
--   advance_pending: advances taken for bookings not yet delivered or cancelled, less advance refunds paid.
--   deposits_held:   refundable deposits received, less deposits returned, less deposits kept against dues.
create or replace function cash_liabilities(p_day date) returns table(advance_pending int, deposits_held int)
language plpgsql security definer stable set search_path=public as $$
declare e timestamptz := ((p_day + 1)::text || ' 00:00:00+05:30')::timestamptz; a int; d int; begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  select coalesce(sum(greatest(0, x.adv - x.refunded)),0) into a from (
    select b.id,
      coalesce(sum(p.amount) filter (where p.purpose = 'advance' and p.created_at < e),0) adv,
      coalesce(sum(p.amount) filter (where p.kind = 'rent_refund' and p.created_at < e),0) refunded
    from bookings b left join payments p on p.booking_id = b.id
    where (b.picked_up_at is null or b.picked_up_at >= e)
      and coalesce((select max((l->>'t')::timestamptz) from jsonb_array_elements(b.log) l where l->>'m' = 'Cancelled'), 'infinity'::timestamptz) >= e
      and not (b.status = 'cancelled' and not exists(select 1 from jsonb_array_elements(b.log) l where l->>'m' = 'Cancelled'))
    group by b.id) x;
  select coalesce(sum(case p.kind when 'deposit' then p.amount when 'deposit_refund' then -p.amount when 'charge' then -p.amount else 0 end),0) into d from payments p where p.created_at < e;
  return query select a, d;
end $$;

-- Expenses -------------------------------------------------------------------------------------------------------------------------------
create or replace function void_expense(p_id bigint, p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare x cash_expenses; begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'REMARK_REQUIRED'; end if;
  update cash_expenses set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id and voided_at is null returning * into x;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into cash_audit(action, day, detail) values('expense_voided', x.spent_on, jsonb_build_object('id', x.id, 'amount', x.amount, 'category', x.category, 'reason', p_reason));
end $$;

-- A dry-cleaning charge paid to the cleaner is a business expense (never customer income). One expense per wash.
create or replace function record_wash_payment(p_wash uuid, p_mode text) returns void language plpgsql security definer set search_path=public as $$
declare w dry_cleanings; d dresses; begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_mode not in ('Cash','GPay / UPI','Card','Bank transfer') then raise exception 'BAD_MODE'; end if;
  select * into w from dry_cleanings where id = p_wash; if not found then raise exception 'NOT_FOUND'; end if;
  if w.charge <= 0 then raise exception 'BAD_AMOUNT'; end if;
  select * into d from dresses where id = w.dress_id;
  insert into cash_expenses(amount, category, mode, remarks, payee, dry_cleaning_id)
  values(w.charge, 'Dry cleaning', p_mode, 'Dry cleaning ' || d.code || ' (sent ' || w.sent_on || ')', 'Dry cleaner', w.id);
exception when unique_violation then raise exception 'ALREADY_PAID'; end $$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on function dress_busy, lookup_booking, dresses_unavailable to authenticated;
grant execute on function set_dress_status, is_staff, is_owner, is_ops, ist_today, ist_d, staff_create_booking, set_alteration_notes, set_prep_status, prep_list, dress_performance, dress_history, dress_washes, revenue_report, request_shortfall, decide_approval, apply_discount, set_custom_charge, cash_tally_day, cash_position, cash_book, tally_cash, set_cash_opening, cash_liabilities, void_expense, record_wash_payment to authenticated;
