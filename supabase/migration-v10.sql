-- Swaasa v10: return inspections, cleaning queue, alteration workflow and admin notifications.
-- Run once in Supabase SQL Editor after migration-v9.sql. Additive migration; existing bookings and cleaning history are retained.

create table if not exists return_inspections (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references bookings(id) on delete cascade,
  dress_id uuid not null references dresses(id),
  condition text not null check (condition in ('good','minor_marks','needs_cleaning','damage_repair')),
  notes text,
  photos text[] not null default '{}',
  cleaning_required boolean not null default false,
  inspected_by uuid default auth.uid() references staff(user_id) on delete set null,
  inspected_at timestamptz not null default now()
);
create index if not exists return_inspections_dress on return_inspections(dress_id, inspected_at desc);
alter table return_inspections enable row level security;
drop policy if exists inspections_r on return_inspections;
drop policy if exists inspections_i on return_inspections;
create policy inspections_r on return_inspections for select using (is_ops());
create policy inspections_i on return_inspections for insert with check (is_ops());

create table if not exists dry_clean_requests (
  id uuid primary key default gen_random_uuid(),
  dress_id uuid not null references dresses(id),
  booking_id text references bookings(id) on delete set null,
  inspection_id uuid references return_inspections(id) on delete set null,
  status text not null default 'to_be_sent' check (status in ('to_be_sent','sent','returned_pending_check','complete','cancelled')),
  condition text not null default 'needs_cleaning',
  condition_notes text,
  added_at timestamptz not null default now(),
  added_by uuid default auth.uid() references staff(user_id) on delete set null,
  sent_on date,
  sent_by uuid references staff(user_id) on delete set null,
  expected_back date,
  vendor text,
  estimated_charge int not null default 0 check (estimated_charge >= 0),
  notes text,
  dry_cleaning_id uuid references dry_cleanings(id) on delete set null,
  returned_on date,
  final_charge int,
  returned_condition text,
  return_notes text,
  returned_by uuid references staff(user_id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references staff(user_id) on delete set null,
  check (expected_back is null or sent_on is null or expected_back >= sent_on),
  check (returned_on is null or sent_on is null or returned_on >= sent_on)
);
alter table dry_clean_requests add column if not exists sent_by uuid references staff(user_id) on delete set null;
create index if not exists dry_clean_requests_work on dry_clean_requests(status, added_at desc);
create unique index if not exists dry_clean_requests_one_active_per_dress on dry_clean_requests(dress_id)
  where status in ('to_be_sent','sent','returned_pending_check');
alter table dry_clean_requests enable row level security;
drop policy if exists cleaning_requests_r on dry_clean_requests;
drop policy if exists cleaning_requests_i on dry_clean_requests;
drop policy if exists cleaning_requests_u on dry_clean_requests;
drop policy if exists cleaning_requests_d on dry_clean_requests;
create policy cleaning_requests_r on dry_clean_requests for select using (is_ops());
create policy cleaning_requests_i on dry_clean_requests for insert with check (is_ops());
create policy cleaning_requests_u on dry_clean_requests for update using (is_ops()) with check (is_ops());
create policy cleaning_requests_d on dry_clean_requests for delete using (is_owner());
-- Link all pre-existing cleaner records to the new lifecycle so the history and active cleaner list remain intact.
insert into dry_clean_requests(dress_id,status,condition,condition_notes,added_at,added_by,sent_on,expected_back,estimated_charge,notes,dry_cleaning_id,returned_on,final_charge)
select w.dress_id,case when w.returned_on is null then 'sent' else 'complete' end,'needs_cleaning',w.notes,w.created_at,w.created_by,w.sent_on,w.expected_back,w.charge,w.notes,w.id,w.returned_on,w.charge
from dry_cleanings w where not exists(select 1 from dry_clean_requests r where r.dry_cleaning_id=w.id)
on conflict do nothing;

create table if not exists alteration_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references bookings(id) on delete cascade,
  dress_id uuid not null references dresses(id),
  status text not null default 'pending_dispatch' check (status in ('pending_dispatch','at_unit','quality_check','ready','cancelled')),
  requirements text not null,
  notes text,
  sent_on date,
  expected_return date,
  received_at timestamptz,
  checked_at timestamptz,
  created_by uuid references staff(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alteration_jobs_status on alteration_jobs(status, expected_return, created_at desc);
create unique index if not exists alteration_jobs_one_active_per_booking on alteration_jobs(booking_id)
  where status not in ('ready','cancelled');
alter table alteration_jobs enable row level security;
drop policy if exists alteration_jobs_r on alteration_jobs;
drop policy if exists alteration_jobs_i on alteration_jobs;
drop policy if exists alteration_jobs_u on alteration_jobs;
create policy alteration_jobs_r on alteration_jobs for select using (is_ops());
create policy alteration_jobs_i on alteration_jobs for insert with check (is_ops());
create policy alteration_jobs_u on alteration_jobs for update using (is_ops()) with check (is_ops());
-- Carry forward existing alteration notes into the tracked workflow without changing booking records.
insert into alteration_jobs(booking_id,dress_id,status,requirements,created_by)
select b.id,b.dress_id,'pending_dispatch',b.alteration_notes,b.taken_by
from bookings b
where b.status in ('pending','confirmed','out') and nullif(trim(coalesce(b.alteration_notes,'')),'') is not null
  and coalesce(b.prep_status,'')<>'ready'
  and not exists(select 1 from alteration_jobs a where a.booking_id=b.id and a.status not in ('ready','cancelled'))
on conflict do nothing;

create table if not exists customer_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table customer_profiles enable row level security;
drop policy if exists customer_profiles_owner_r on customer_profiles;
drop policy if exists customer_profiles_owner_i on customer_profiles;
drop policy if exists customer_profiles_owner_u on customer_profiles;
create policy customer_profiles_owner_r on customer_profiles for select using (is_owner());
create policy customer_profiles_owner_i on customer_profiles for insert with check (is_owner());
create policy customer_profiles_owner_u on customer_profiles for update using (is_owner()) with check (is_owner());

create table if not exists admin_notifications (
  id uuid primary key default gen_random_uuid(),
  target_role text not null check (target_role in ('owner','staff','all')),
  kind text not null,
  title text not null,
  body text not null,
  booking_id text references bookings(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references staff(user_id) on delete set null
);
create index if not exists admin_notifications_recent on admin_notifications(target_role, created_at desc);
alter table admin_notifications enable row level security;
drop policy if exists admin_notifications_r on admin_notifications;
drop policy if exists admin_notifications_i on admin_notifications;
drop policy if exists admin_notifications_u on admin_notifications;
create policy admin_notifications_r on admin_notifications for select using (is_ops());
create policy admin_notifications_i on admin_notifications for insert with check (is_ops());
create policy admin_notifications_u on admin_notifications for update using (is_ops()) with check (is_ops());
drop policy if exists admin_notifications_r on admin_notifications;
create policy admin_notifications_r on admin_notifications for select using (
  is_ops() and (target_role='all' or (is_owner() and target_role='owner') or (not is_owner() and target_role='staff'))
);
drop policy if exists admin_notifications_u on admin_notifications;
create policy admin_notifications_u on admin_notifications for update using (
  is_ops() and (target_role='all' or (is_owner() and target_role='owner') or (not is_owner() and target_role='staff'))
) with check (
  is_ops() and (target_role='all' or (is_owner() and target_role='owner') or (not is_owner() and target_role='staff'))
);

-- Approval records cover operational requests only. Payment rows remain append-only and cannot be corrected by staff.
alter table approvals add column if not exists action_type text not null default 'shortfall';
alter table approvals add column if not exists request_details jsonb not null default '{}'::jsonb;
alter table approvals alter column shortfall drop not null;
alter table payments add column if not exists approval_id uuid references approvals(id) on delete set null;
create unique index if not exists payments_one_approval_refund_per_kind on payments(approval_id,kind) where approval_id is not null;
alter table approvals drop constraint if exists approvals_action_type_check;
alter table approvals add constraint approvals_action_type_check check (action_type in ('shortfall','discount','booking_cancellation','refund'));
create unique index if not exists approvals_one_pending_action on approvals(booking_id,action_type) where status='pending';
drop policy if exists approvals_r on approvals;
create policy approvals_r on approvals for select using (is_owner() or requested_by=auth.uid());

create or replace function request_action_approval(p_booking text,p_action text,p_details jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare b bookings; aid uuid; amount int; paid_total int; deposit_total int;
begin
  if not is_ops() or is_owner() then raise exception 'FORBIDDEN'; end if;
  if p_action not in ('discount','booking_cancellation','refund') then raise exception 'BAD_ACTION'; end if;
  select * into b from bookings where id=p_booking; if not found then raise exception 'NOT_FOUND'; end if;
  select coalesce(sum(amount) filter(where kind in ('rent','charge')),0)-coalesce(sum(amount) filter(where kind='rent_refund'),0),
         coalesce(sum(amount) filter(where kind='deposit'),0)-coalesce(sum(amount) filter(where kind in ('deposit_refund','charge')),0)
    into paid_total,deposit_total from payments where booking_id=p_booking;
  amount:=coalesce((p_details->>'amount')::int,0);
  if p_action='discount' and (amount<=0 or amount>b.rent) then raise exception 'BAD_AMOUNT'; end if;
  if p_action='booking_cancellation' and (b.status not in ('pending','confirmed') or coalesce((p_details->>'refund_amount')::int,0)<0 or coalesce((p_details->>'refund_amount')::int,0)>paid_total) then raise exception 'BAD_REQUEST'; end if;
  if p_action='refund' and amount<=0 then raise exception 'BAD_AMOUNT'; end if;
  if p_action='refund' and coalesce(p_details->>'kind','') not in ('deposit_refund','rent_refund') then raise exception 'BAD_REFUND_TYPE'; end if;
  if p_action='refund' and p_details->>'kind'='deposit_refund' and amount>deposit_total then raise exception 'BAD_AMOUNT'; end if;
  if p_action='refund' and p_details->>'kind'='rent_refund' and amount>paid_total then raise exception 'BAD_AMOUNT'; end if;
  if exists(select 1 from approvals where booking_id=p_booking and action_type=p_action and status='pending') then raise exception 'PENDING_EXISTS'; end if;
  insert into approvals(booking_id,shortfall,action_type,request_details,reason,status,requested_by)
  values(p_booking,null,p_action,coalesce(p_details,'{}'::jsonb),nullif(trim(coalesce(p_details->>'reason','')),''),'pending',auth.uid()) returning id into aid;
  return aid;
end $$;

create or replace function decide_approval(p_id uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare a approvals; b bookings; amt int; md text; kind text; purpose text; deposit_total int;
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
      update bookings set status='cancelled',log=log||jsonb_build_array(jsonb_build_object('t',now(),'m','Cancellation approved by owner','by',staff_name())) where id=a.booking_id;
      amt:=coalesce((a.request_details->>'refund_amount')::int,0); md:=coalesce(a.request_details->>'mode','Cash');
      if amt>0 then insert into payments(booking_id,amount,kind,purpose,mode,remarks,approval_id) values(a.booking_id,amt,'rent_refund','advance_refund',md,'Approved cancellation refund',a.id); end if;
      if deposit_total>0 then insert into payments(booking_id,amount,kind,purpose,mode,remarks,approval_id) values(a.booking_id,deposit_total,'deposit_refund','deposit_refund',md,'Approved cancellation deposit refund',a.id); end if;
    elsif a.action_type='refund' then
      amt:=coalesce((a.request_details->>'amount')::int,0); kind:=coalesce(a.request_details->>'kind','rent_refund'); purpose:=coalesce(a.request_details->>'purpose','rent_refund'); md:=coalesce(a.request_details->>'mode','Cash');
      if amt<=0 then raise exception 'BAD_AMOUNT'; end if;
      insert into payments(booking_id,amount,kind,purpose,mode,remarks,approval_id) values(a.booking_id,amt,kind,purpose,md,coalesce(a.request_details->>'remarks','Owner-approved refund'),a.id);
    end if;
  end if;
  update bookings set log=log||jsonb_build_array(jsonb_build_object('t',now(),'m',case when p_approve then 'Approval: '||replace(a.action_type,'_',' ')||' approved' else 'Approval: '||replace(a.action_type,'_',' ')||' rejected' end||case when length(trim(coalesce(p_note,'')))>0 then ': '||trim(p_note) else '' end,'by',staff_name())) where id=a.booking_id;
end $$;

create or replace function enforce_owner_cancellation_approval() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='cancelled' and old.status<>'cancelled' and not is_owner()
     and not exists(select 1 from approvals where booking_id=old.id and action_type='booking_cancellation' and status='approved') then
    raise exception 'OWNER_APPROVAL_REQUIRED';
  end if;
  return new;
end $$;
drop trigger if exists t_owner_cancel_approval on bookings;
create trigger t_owner_cancel_approval before update of status on bookings for each row execute function enforce_owner_cancellation_approval();

create or replace function enforce_owner_refund_approval() returns trigger language plpgsql security definer set search_path=public as $$
declare b bookings; deposit_total int;
begin
  if is_owner() then return new; end if;
  select * into b from bookings where id=new.booking_id;
  select coalesce(sum(amount) filter(where kind='deposit'),0)-coalesce(sum(amount) filter(where kind in ('deposit_refund','charge')),0) into deposit_total from payments where booking_id=new.booking_id;
  if new.kind='rent_refund' and (new.approval_id is null or not exists(select 1 from approvals a where a.id=new.approval_id and a.booking_id=new.booking_id and a.status='approved' and (
      (a.action_type='refund' and a.request_details->>'kind'='rent_refund' and (a.request_details->>'amount')::int>=new.amount)
      or (a.action_type='booking_cancellation' and coalesce((a.request_details->>'refund_amount')::int,0)>=new.amount)))) then
    raise exception 'OWNER_APPROVAL_REQUIRED';
  end if;
  if new.kind='deposit_refund' then
    if new.amount>deposit_total then raise exception 'BAD_AMOUNT'; end if;
    if b.status='cancelled' and (new.approval_id is null or not exists(select 1 from approvals a where a.id=new.approval_id and a.booking_id=new.booking_id and a.action_type='booking_cancellation' and a.status='approved')) then
      raise exception 'OWNER_APPROVAL_REQUIRED';
    end if;
    if b.status not in ('cancelled','returned') then raise exception 'BAD_STATUS'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_owner_refund_approval on payments;
create trigger t_owner_refund_approval before insert on payments for each row execute function enforce_owner_refund_approval();

-- Notifications are generated for new operational requests; payment records remain append-only.
create or replace function notify_pending_approval() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='pending' then
    insert into admin_notifications(target_role,kind,title,body,booking_id,created_by)
    values('owner','approval',case new.action_type when 'shortfall' then 'Shortfall approval required' when 'discount' then 'Discount approval required' when 'refund' then 'Refund approval required' else 'Booking cancellation approval required' end,
      case new.action_type when 'shortfall' then 'Booking '||new.booking_id||' has a shortfall request of ₹'||coalesce(new.shortfall,0)||'.' else 'Booking '||new.booking_id||' · '||replace(new.action_type,'_',' ')||case when coalesce(new.request_details->>'amount','')<>'' then ': ₹'||(new.request_details->>'amount') else '' end||'.' end,
      new.booking_id,new.requested_by);
  end if;
  return new;
end $$;
drop trigger if exists t_notify_pending_approval on approvals;
create trigger t_notify_pending_approval after insert on approvals for each row execute function notify_pending_approval();
create or replace function notify_alteration_change() returns trigger language plpgsql security definer set search_path=public as $$
declare d dresses; begin
  select * into d from dresses where id=new.dress_id;
  if tg_op='INSERT' then
    insert into admin_notifications(target_role,kind,title,body,booking_id,created_by)
    values('staff','alteration','Alteration added',d.code||' is waiting to be sent to the tailoring unit.',new.booking_id,new.created_by);
  elsif new.status is distinct from old.status then
    insert into admin_notifications(target_role,kind,title,body,booking_id,created_by)
    values('all','alteration','Alteration status updated',d.code||' · '||replace(new.status,'_',' ')||'.',new.booking_id,auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists t_notify_alteration on alteration_jobs;
create trigger t_notify_alteration after insert or update of status on alteration_jobs for each row execute function notify_alteration_change();
create or replace function notify_cleaning_request() returns trigger language plpgsql security definer set search_path=public as $$
declare d dresses; begin
  select * into d from dresses where id=new.dress_id;
  insert into admin_notifications(target_role,kind,title,body,booking_id,created_by)
  values('all','dry_cleaning','Dress added to Dry Cleaning List',d.code||' is waiting at the shop and has not been sent to the cleaner.',new.booking_id,new.added_by);
  return new;
end $$;
drop trigger if exists t_notify_cleaning_request on dry_clean_requests;
create trigger t_notify_cleaning_request after insert on dry_clean_requests for each row execute function notify_cleaning_request();

insert into storage.buckets(id,name,public) values('return-inspection-photos','return-inspection-photos',true) on conflict do nothing;
drop policy if exists return_photo_read on storage.objects;
drop policy if exists return_photo_write on storage.objects;
create policy return_photo_read on storage.objects for select using (bucket_id='return-inspection-photos' and is_ops());
create policy return_photo_write on storage.objects for insert with check (bucket_id='return-inspection-photos' and is_ops());
