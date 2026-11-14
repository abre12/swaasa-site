-- A fingerprint of who may do what on every table, view, sequence and function in the public schema.
select md5(coalesce(string_agg(x, ',' order by x), '')) as acl_fingerprint, count(*) as grants from (
  select 'R:' || c.relname || ':' || coalesce(r.rolname, 'public') || ':' || a.privilege_type as x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a left join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'S') and a.grantee <> c.relowner
  union all
  select 'F:' || p.oid::regprocedure::text || ':' || coalesce(r.rolname, 'public') || ':' || a.privilege_type
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a left join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public' and a.grantee <> p.proowner
) t;
