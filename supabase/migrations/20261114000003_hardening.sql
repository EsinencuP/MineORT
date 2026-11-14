-- Security review fixes for migration 1.
-- 1) New functions must not be executable by PUBLIC by default (PUBLIC is separate from anon/authenticated).
alter default privileges in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public;
revoke execute on function public.forbid_log_mutation() from public, anon, authenticated;

-- 2) TRUNCATE bypasses row triggers: block it with statement triggers and drop the privilege.
create function public.forbid_log_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'append-only table: truncate is not allowed' using errcode = '42501';
end $$;
revoke execute on function public.forbid_log_truncate() from public, anon, authenticated;

create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.forbid_log_truncate();
create trigger security_events_no_truncate before truncate on public.security_events
  for each statement execute function public.forbid_log_truncate();

revoke truncate on public.audit_log, public.security_events from service_role;
