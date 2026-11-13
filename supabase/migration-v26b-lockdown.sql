-- Migration v26b (Phase 2, batch A, part 2 of 2): LOCK DOWN. Run it ONLY AFTER the batch A website is deployed and you have tested, as a staff login:
-- Mark delivered (with deposit and rent), Record payment (booking screen, Finance, Cash counter), Process return, and a gap-override request.
--
--   1. Payments can no longer be added straight from a browser. Every payment goes through record_payment(), deliver_booking(), return_booking()
--      or the approval functions (MR-3).
--   2. The old return_dress() can no longer be called straight from a browser with a hand-typed refund (MR-4); return_booking() calls it for you.
--   3. Signed-out users (the anonymous role) lose access to every database function except the few the public collection pages need (SA-2).
--      New functions are also closed to signed-out users by default from now on.
--   The settings table is already readable only by signed-in staff (migration v6, policy settings_read).

revoke insert on payments from authenticated, anon;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname not in ('dress_busy', 'dresses_unavailable', 'is_staff', 'is_ops', 'is_owner', 'staff_name')   -- the public pages and the row-security rules still call these
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname = 'return_dress' then execute format('revoke execute on function %s from authenticated', r.sig);   -- every version; return_booking() calls it
    else execute format('grant execute on function %s to authenticated', r.sig); end if;
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;

-- To undo (only if something unexpected stops working):
--   grant insert on payments to authenticated;
--   grant execute on function return_dress(text, text, text, text[], boolean, int, int, int, text, jsonb) to authenticated;
