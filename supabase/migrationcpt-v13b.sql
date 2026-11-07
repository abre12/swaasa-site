-- v13: staff-only booking wizard fields, atomic payment capture and structured alterations.
-- Additive migration. Keep the existing role, booking and payment records intact.

alter table public.bookings
  add column if not exists booking_date date,
  add column if not exists event_type text,
  add column if not exists event_date date;

update public.bookings
set booking_date = coalesce(booking_date, (created_at at time zone 'Asia/Kolkata')::date)
where booking_date is null;

alter table public.bookings alter column booking_date set default public.ist_today();
alter table public.bookings alter column booking_date set not null;
alter table public.payments add column if not exists remarks text;

create or replace function public.staff_create_booking_v2(
  p_dress uuid,
  p_start date,
  p_end date,
  p_booking_date date,
  p_event_type text,
  p_event_date date,
  p_name text,
  p_phone text,
  p_email text,
  p_notes text,
  p_alteration_notes text,
  p_checklist jsonb,
  p_measurements jsonb,
  p_custom integer,
  p_amount_received integer,
  p_mode text,
  p_payment_reference text,
  p_discount integer,
  p_override boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dresses%rowtype;
  n integer;
  v_id text;
  v_gross integer;
  v_rent integer;
  v_custom integer := greatest(0, coalesce(p_custom, 0));
  v_deposit integer;
  v_after_deposit integer;
  v_rent_paid integer;
  v_custom_paid integer;
  v_alt_labels text;
  v_alt_text text;
  v_item jsonb;
begin
  if not public.is_ops() then raise exception 'FORBIDDEN'; end if;
  if coalesce(p_discount, 0) < 0 or (coalesce(p_discount, 0) > 0 and not public.is_owner()) then raise exception 'OWNER_ONLY'; end if;
  if p_start is null or p_end is null or p_start < public.ist_today() or p_end < p_start or p_end - p_start > 30 then raise exception 'BAD_DATES'; end if;
  if p_booking_date is null or p_booking_date > public.ist_today() then raise exception 'BAD_DATES'; end if;
  if p_event_date is null or p_event_date < p_start or p_event_date > p_end then raise exception 'BAD_DATES'; end if;
  if coalesce(p_event_type, '') not in ('Wedding', 'Reception', 'Engagement', 'Bridesmaid event', 'Other') then raise exception 'BAD_DATES'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') !~ '^\d{10,13}$' then raise exception 'BAD_CONTACT'; end if;
  if nullif(trim(coalesce(p_email, '')), '') is not null and p_email !~* '^\S+@\S+\.\S+$' then raise exception 'BAD_CONTACT'; end if;
  if length(coalesce(p_notes, '')) > 2000 or length(coalesce(p_alteration_notes, '')) > 2000 or length(coalesce(p_payment_reference, '')) > 200 then raise exception 'BAD_CONTACT'; end if;
  if jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_checklist, '[]'::jsonb)) > 10 then raise exception 'BAD_ALTERATIONS'; end if;
  if jsonb_typeof(coalesce(p_measurements, '{}'::jsonb)) <> 'object' then raise exception 'BAD_MEASUREMENTS'; end if;
  if exists (select 1 from jsonb_object_keys(coalesce(p_measurements, '{}'::jsonb)) as mk(key_name) where key_name not in ('bust', 'waist', 'hip', 'length', 'other')) then raise exception 'BAD_MEASUREMENTS'; end if;
  if coalesce(p_mode, '') not in ('Cash', 'GPay / UPI', 'Card', 'Bank transfer') then raise exception 'BAD_PAYMENT_MODE'; end if;
  if coalesce(p_amount_received, 0) <= 0 or v_custom < 0 then raise exception 'BAD_PAYMENT'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) loop
    if coalesce(v_item->>'k', '') <> all(array['waist','bust','hem','shoulder','strap','sleeve','blouse','padding','hooks','other']) then raise exception 'BAD_ALTERATIONS'; end if;
    if length(coalesce(v_item->>'note', '')) > 500 then raise exception 'BAD_ALTERATIONS'; end if;
  end loop;

  select * into d from public.dresses where id = p_dress and status = 'available' for update;
  if not found then raise exception 'NOT_AVAILABLE'; end if;
  n := p_end - p_start + 1;
  v_gross := d.price + greatest(0, n - d.included_days) * d.extra_day_fee;
  if coalesce(p_discount, 0) > v_gross then raise exception 'BAD_DISCOUNT'; end if;
  v_rent := greatest(0, v_gross - coalesce(p_discount, 0));
  v_deposit := public.booking_deposit(v_rent);
  if p_amount_received < v_deposit then raise exception 'INSUFFICIENT_DEPOSIT'; end if;
  if p_amount_received > v_deposit + v_rent + v_custom then raise exception 'PAYMENT_TOO_HIGH'; end if;

  select string_agg(case k
    when 'waist' then 'Waist Adjustment' when 'bust' then 'Bust Adjustment' when 'hem' then 'Length / Hem'
    when 'shoulder' then 'Shoulder Adjustment' when 'strap' then 'Strap Adjustment' when 'sleeve' then 'Sleeve Adjustment'
    when 'blouse' then 'Blouse Fitting' when 'padding' then 'Padding Adjustment' when 'hooks' then 'Hooks / Zip Adjustment'
    when 'other' then 'Other Alteration' end, ', ' order by ord)
  into v_alt_labels
  from jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) with ordinality as x(value, ord)
  cross join lateral (select x.value->>'k' as k) keys;
  v_alt_text := nullif(concat_ws(' · ', nullif(v_alt_labels, ''), nullif(trim(coalesce(p_alteration_notes, '')), '')), '');

  insert into public.bookings(
    dress_id, customer_name, phone, email, notes, alteration_notes, start_date, end_date,
    booking_date, event_type, event_date, rent, discount, deposit, custom_charge, charges,
    status, gap_override, taken_by, prep_status, log
  ) values (
    p_dress, trim(p_name), p_phone, nullif(trim(coalesce(p_email, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), v_alt_text, p_start, p_end,
    p_booking_date, p_event_type, p_event_date, v_rent, coalesce(p_discount, 0), v_deposit, v_custom, v_custom,
    'confirmed', coalesce(p_override, false), auth.uid(), case when v_alt_text is null then 'not_started' else 'alterations_pending' end,
    jsonb_build_array(jsonb_build_object('t', now(), 'm', case when coalesce(p_override, false) then 'Created by staff. Cleaning gap checked and approved.' else 'Created by staff.' end))
  ) returning id into v_id;

  -- Migration v11's booking trigger creates the matching alteration job from alteration_notes.
  -- Enrich that same job with the checked requirements and measurements for the alteration module.
  if v_alt_text is not null then
    update public.alteration_jobs
       set checklist = coalesce(p_checklist, '[]'::jsonb),
           measurements = coalesce(p_measurements, '{}'::jsonb),
           notes = nullif(trim(coalesce(p_alteration_notes, '')), ''),
           updated_at = now()
     where booking_id = v_id and source = 'booking' and status = 'pending_dispatch';
  end if;

  -- Record the deposit first, then allocate any remaining amount to rent and customization.
  insert into public.payments(booking_id, amount, kind, purpose, mode, remarks)
    values (v_id, v_deposit, 'deposit', 'deposit', p_mode, nullif(trim(coalesce(p_payment_reference, '')), ''));
  v_after_deposit := p_amount_received - v_deposit;
  v_rent_paid := least(v_after_deposit, v_rent);
  if v_rent_paid > 0 then
    insert into public.payments(booking_id, amount, kind, purpose, mode, remarks)
      values (v_id, v_rent_paid, 'rent', 'advance', p_mode, nullif(trim(coalesce(p_payment_reference, '')), ''));
  end if;
  v_custom_paid := greatest(0, v_after_deposit - v_rent_paid);
  if v_custom_paid > 0 then
    insert into public.payments(booking_id, amount, kind, purpose, mode, remarks)
      values (v_id, v_custom_paid, 'rent', 'customization', p_mode, nullif(trim(coalesce(p_payment_reference, '')), ''));
  end if;

  update public.dresses set popularity = popularity + 1 where id = p_dress;
  return v_id;
exception
  when exclusion_violation then raise exception 'DATES_TAKEN';
end;
$$;

revoke all on function public.staff_create_booking_v2(uuid,date,date,date,text,date,text,text,text,text,text,jsonb,jsonb,integer,integer,text,text,integer,boolean) from public, anon;
grant execute on function public.staff_create_booking_v2(uuid,date,date,date,text,date,text,text,text,text,text,jsonb,jsonb,integer,integer,text,text,integer,boolean) to authenticated;
