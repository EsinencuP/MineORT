-- Must return zero rows: no function in public may be executable by PUBLIC, anon or authenticated
-- unless it is intentionally exposed (add it to the allowlist below with a reason).
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname not in (/* allowlist: */ '')
  and (
    has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute')
    or exists (
      select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    )
  );
