-- US-E00-04: base schema (users, audit_log, security_events), closed by default.
-- Pattern (US-E00-06): client roles (anon, authenticated) get NO table privileges.
-- All reads/writes go through the backend (service_role) or SECURITY DEFINER RPCs/views.

-- Closed by default for every table created later in public.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

create table public.users (
  id             uuid primary key default gen_random_uuid(),
  display_name   text,
  account_status text not null default 'active'
                 check (account_status in ('active', 'suspended', 'banned', 'deleted')),
  site_role      text not null default 'player'
                 check (site_role in ('player', 'moderator', 'admin')),
  banned_until   timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index users_account_status_idx on public.users (account_status);

create table public.security_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users (id),
  type        text not null,
  severity    text not null default 'info'
              check (severity in ('info', 'warning', 'critical')),
  ip          inet,
  details     jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now(),
  exported_at timestamptz
);
create index security_events_type_at_idx on public.security_events (type, at);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users (id),
  scope       text not null default 'global' check (scope in ('global', 'guild')),
  guild_id    uuid,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now(),
  exported_at timestamptz
);
create index audit_log_scope_guild_idx on public.audit_log (scope, guild_id, at);

-- Append-only: only exported_at may change (set when shipped to the external sink); no deletes.
create function public.forbid_log_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append-only table' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'exported_at') is distinct from (to_jsonb(old) - 'exported_at') then
    raise exception 'append-only table: only exported_at may change' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_log_mutation();
create trigger security_events_append_only before update or delete on public.security_events
  for each row execute function public.forbid_log_mutation();

-- RLS on, no policies: closed by default. Explicit revokes cover privileges Supabase granted earlier.
alter table public.users           enable row level security;
alter table public.security_events enable row level security;
alter table public.audit_log       enable row level security;

revoke all on public.users, public.security_events, public.audit_log from anon, authenticated;
