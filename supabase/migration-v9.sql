-- Swaasa migration 9: finance module. Run ONCE in Supabase > SQL Editor, AFTER migration-v8.sql. Safe to run again.
-- ADDITIVE / RELABELLING ONLY: no amount, date, booking, payment or refund is changed or removed.

-- 1. Expense categories become the ten business heads. Old categories are mapped, never deleted. ---------------------------------------
alter table cash_expenses drop constraint if exists cash_expenses_category_check;
update cash_expenses set category = case category
  when 'Petty cash' then 'Staff Refreshments (Petty Cash)' when 'Tea & refreshments' then 'Staff Refreshments (Petty Cash)'
  when 'Dry cleaning' then 'Dry Cleaning' when 'Alterations & repairs' then 'Store Maintenance' when 'Packaging & supplies' then 'Business Overheads'
  when 'Transport & delivery' then 'Delivery / Transport' when 'Other' then 'Other Expenses' else category end;
alter table cash_expenses alter column category set default 'Other Expenses';
alter table cash_expenses add constraint cash_expenses_category_check check (category in
  ('Store Rent','Utilities','Salaries','Staff Bonus & Incentives','Staff Refreshments (Petty Cash)','Dry Cleaning','Store Maintenance','Delivery / Transport','Business Overheads','Other Expenses'));

-- 2. An expense may optionally belong to a booking (rent and salaries will not). ---------------------------------------------------------
alter table cash_expenses add column if not exists booking_id text references bookings(id);

-- 3. Payments: late return charges get their own purpose so they can be reported by name. ------------------------------------------------
alter table payments drop constraint if exists payments_purpose_check;
alter table payments add constraint payments_purpose_check check (purpose in
  ('advance','rent','customization','damage','cleaning','late_fee','other_charge','deposit','deposit_refund','advance_refund','rent_refund','deposit_applied'));

-- 4. Dry-cleaning payments use the new category name. -----------------------------------------------------------------------------------
create or replace function record_wash_payment(p_wash uuid, p_mode text) returns void language plpgsql security definer set search_path=public as $$
declare w dry_cleanings; d dresses; begin
  if not is_ops() then raise exception 'FORBIDDEN'; end if;
  if p_mode not in ('Cash','GPay / UPI','Card','Bank transfer') then raise exception 'BAD_MODE'; end if;
  select * into w from dry_cleanings where id = p_wash; if not found then raise exception 'NOT_FOUND'; end if;
  if w.charge <= 0 then raise exception 'BAD_AMOUNT'; end if;
  select * into d from dresses where id = w.dress_id;
  insert into cash_expenses(amount, category, mode, remarks, payee, dry_cleaning_id)
  values(w.charge, 'Dry Cleaning', p_mode, 'Dry cleaning ' || d.code || ' (sent ' || w.sent_on || ')', 'Dry cleaner', w.id);
exception when unique_violation then raise exception 'ALREADY_PAID'; end $$;
-- Cash expenses already feed cash_book() by payment mode, whatever their category, so the Cash Counter needs no change.
