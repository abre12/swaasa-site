-- Migration v18: cancellation policy. Default = NO refund (rent received and the security deposit are kept).
-- Any refund, partial or full, is decided by the owner. Staff can only recommend one.
-- Run after migration-v17. Safe to run more than once. Changes no existing data.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. The cancellation itself, in ONE transaction (booking cancelled + refunds + kept deposit, or nothing)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function _cancel_booking_core(
  p_booking text, p_reason text, p_rent_refund int, p_dep_refund int, p_mode text, p_note text, p_approval uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b bookings; paid_total int; dep_total int; ret_rent int; ret_dep int;
  rr int := greatest(0, coalesce(p_rent_refund,0)); dr int := greatest(0, coalesce(p_dep_refund,0));
  md text := coalesce(nullif(trim(coalesce(p_mode,'')),''),'Cash'); why text := nullif(trim(coalesce(p_reason,'')),'');
  note text := nullif(trim(coalesce(p_note,'')),'');
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  if why is null then raise exception 'REASON_REQUIRED'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('pending','confirmed') then raise exception 'BAD_STATUS'; end if;
  select coalesce(sum(amount) filter (where kind in ('rent','charge')),0) - coalesce(sum(amount) filter (where kind = 'rent_refund'),0),
         coalesce(sum(amount) filter (where kind = 'deposit'),0) - coalesce(sum(amount) filter (where kind in ('deposit_refund','charge')),0)
    into paid_total, dep_total from payments where booking_id = p_booking;
  paid_total := greatest(0, paid_total); dep_total := greatest(0, dep_total);
  if rr > paid_total or dr > dep_total then raise exception 'BAD_AMOUNT'; end if;
  ret_rent := paid_total - rr; ret_dep := dep_total - dr;

  update bookings set status = 'cancelled',
    log = log || jsonb_build_array(jsonb_build_object('t', now(),
      'm', 'Cancelled: ' || why || '. Refunded: rent Rs ' || rr || ', deposit Rs ' || dr
           || '. Kept under cancellation policy: rent Rs ' || ret_rent || ', deposit Rs ' || ret_dep
           || coalesce('. Owner note: ' || note, ''),
      'by', staff_name()))
  where id = p_booking;

  if rr > 0 then
    insert into payments(booking_id, amount, kind, purpose, mode, remarks, approval_id)
      values (p_booking, rr, 'rent_refund', 'advance_refund', md, 'Cancellation refund (owner decision)', p_approval);
  end if;
  if dr > 0 then
    insert into payments(booking_id, amount, kind, purpose, mode, remarks, approval_id)
      values (p_booking, dr, 'deposit_refund', 'deposit_refund', md, 'Cancellation deposit refund (owner decision)', p_approval);
  end if;
  -- A deposit that is kept is recorded as income (same way a deposit applied to dues at return is), so it does not
  -- linger as "deposit held" or "refund pending" on a cancelled booking.
  if ret_dep > 0 then
    insert into payments(booking_id, amount, kind, purpose, mode, remarks, approval_id)
      values (p_booking, ret_dep, 'charge', 'deposit_applied', 'From Security Deposit', 'Cancellation: deposit kept under policy', p_approval);
  end if;
  return jsonb_build_object('rent_refund', rr, 'deposit_refund', dr, 'kept_rent', ret_rent, 'kept_deposit', ret_dep);
end $$;

-- Owner cancels a booking directly.
create or replace function cancel_booking(p_booking text, p_reason text, p_rent_refund int, p_dep_refund int, p_mode text, p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  return _cancel_booking_core(p_booking, p_reason, p_rent_refund, p_dep_refund, p_mode, p_note, null);
end $$;

-- Owner decides a cancellation request raised by staff (approve with the amounts the owner chooses).
create or replace function decide_cancellation(p_approval uuid, p_rent_refund int, p_dep_refund int, p_mode text, p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a approvals; res jsonb;
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  update approvals set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note,'')),'')
    where id = p_approval and status = 'pending' and action_type = 'booking_cancellation' returning * into a;
  if not found then raise exception 'NOT_FOUND'; end if;
  res := _cancel_booking_core(a.booking_id, coalesce(nullif(trim(coalesce(a.reason,'')),''), 'Cancellation approved by owner'), p_rent_refund, p_dep_refund, p_mode, p_note, a.id);
  return res;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Staff recommendations: validated against what was actually received
--    request_details = { reason, rent_refund, deposit_refund, justification }   (all refunds default to 0)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function request_action_approval(p_booking text,p_action text,p_details jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare b bookings; aid uuid; amount int; paid_total int; deposit_total int; rr int; dr int;
begin
  if not is_ops() or is_owner() then raise exception 'FORBIDDEN'; end if;
  if p_action not in ('discount','booking_cancellation','refund') then raise exception 'BAD_ACTION'; end if;
  select * into b from bookings where id=p_booking; if not found then raise exception 'NOT_FOUND'; end if;
  select coalesce(sum(amount) filter(where kind in ('rent','charge')),0)-coalesce(sum(amount) filter(where kind='rent_refund'),0),
         coalesce(sum(amount) filter(where kind='deposit'),0)-coalesce(sum(amount) filter(where kind in ('deposit_refund','charge')),0)
    into paid_total,deposit_total from payments where booking_id=p_booking;
  amount:=coalesce((p_details->>'amount')::int,0);
  rr:=coalesce((p_details->>'rent_refund')::int,(p_details->>'refund_amount')::int,0); dr:=coalesce((p_details->>'deposit_refund')::int,0);
  if p_action='discount' and (amount<=0 or amount>b.rent) then raise exception 'BAD_AMOUNT'; end if;
  if p_action='booking_cancellation' and (b.status not in ('pending','confirmed') or rr<0 or dr<0 or rr>greatest(0,paid_total) or dr>greatest(0,deposit_total)) then raise exception 'BAD_REQUEST'; end if;
  if p_action='booking_cancellation' and length(trim(coalesce(p_details->>'reason','')))=0 then raise exception 'REASON_REQUIRED'; end if;
  if p_action='refund' and amount<=0 then raise exception 'BAD_AMOUNT'; end if;
  if p_action='refund' and coalesce(p_details->>'kind','') not in ('deposit_refund','rent_refund') then raise exception 'BAD_REFUND_TYPE'; end if;
  if p_action='refund' and p_details->>'kind'='deposit_refund' and amount>deposit_total then raise exception 'BAD_AMOUNT'; end if;
  if p_action='refund' and p_details->>'kind'='rent_refund' and amount>paid_total then raise exception 'BAD_AMOUNT'; end if;
  if exists(select 1 from approvals where booking_id=p_booking and action_type=p_action and status='pending') then raise exception 'PENDING_EXISTS'; end if;
  insert into approvals(booking_id,shortfall,action_type,request_details,reason,status,requested_by)
  values(p_booking,null,p_action,coalesce(p_details,'{}'::jsonb),nullif(trim(coalesce(p_details->>'reason','')),''),'pending',auth.uid()) returning id into aid;
  return aid;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. decide_approval can still REJECT a cancellation, but can no longer approve one: approval goes through
--    decide_cancellation so the owner always chooses the refund amounts (the old path refunded the whole deposit automatically).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function decide_approval(p_id uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare a approvals; b bookings; amt int; md text; k_kind text; k_purpose text; deposit_total int;
begin
  if not is_owner() then raise exception 'FORBIDDEN'; end if;
  update approvals set status=case when p_approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),'')
  where id=p_id and status='pending' returning * into a;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into b from bookings where id=a.booking_id;
  select coalesce(sum(amount) filter(where kind='deposit'),0)-coalesce(sum(amount) filter(where kind in ('deposit_refund','charge')),0)
    into deposit_total from payments where booking_id=a.booking_id;
  if p_approve then
    if a.action_type='discount' then
      amt:=coalesce((a.request_details->>'amount')::int,0); if amt<=0 or amt>b.rent then raise exception 'BAD_AMOUNT'; end if;
      update bookings set rent=rent-amt,discount=discount+amt,log=log||jsonb_build_array(jsonb_build_object('t',now(),'m','Discount of Rs '||amt||' approved'||case when length(trim(coalesce(a.reason,'')))>0 then ': '||a.reason else '' end,'by',staff_name())) where id=a.booking_id;
    elsif a.action_type='booking_cancellation' then
      raise exception 'USE_DECIDE_CANCELLATION';
    elsif a.action_type='refund' then
      amt:=coalesce((a.request_details->>'amount')::int,0); k_kind:=coalesce(a.request_details->>'kind','rent_refund'); k_purpose:=coalesce(a.request_details->>'purpose','rent_refund'); md:=coalesce(a.request_details->>'mode','Cash');
      if amt<=0 then raise exception 'BAD_AMOUNT'; end if;
      insert into payments(booking_id,amount,kind,purpose,mode,remarks,approval_id) values(a.booking_id,amt,k_kind,k_purpose,md,coalesce(a.request_details->>'remarks','Owner-approved refund'),a.id);
    end if;
  end if;
  update bookings set log=log||jsonb_build_array(jsonb_build_object('t',now(),'m',case when p_approve then 'Approval: '||replace(a.action_type,'_',' ')||' approved' else 'Approval: '||replace(a.action_type,'_',' ')||' rejected' end||case when length(trim(coalesce(p_note,'')))>0 then ': '||trim(p_note) else '' end,'by',staff_name())) where id=a.booking_id;
end $$;

revoke execute on function _cancel_booking_core(text,text,int,int,text,text,uuid) from public, authenticated;
revoke execute on function cancel_booking(text,text,int,int,text,text) from public;
revoke execute on function decide_cancellation(uuid,int,int,text,text) from public;
grant execute on function cancel_booking(text,text,int,int,text,text) to authenticated;
grant execute on function decide_cancellation(uuid,int,int,text,text) to authenticated;
