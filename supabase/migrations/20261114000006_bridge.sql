-- Block 4 (E04), site side of the Bridge: servers and keys, nonce cache, whitelist, action queue,
-- events, drift. Closed to client roles; only service_role (backend) uses these.

create table public.bridge_servers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  status             text not null default 'offline' check (status in ('online', 'offline', 'paused')),
  paused_reason      text,
  last_heartbeat_at  timestamptz,
  bridge_version     text,
  server_version     text,
  min_bridge_version text not null default '0.0.0',
  journal_epoch      timestamptz,
  last_reconcile_at  timestamptz,
  created_at         timestamptz not null default now()
);

-- HMAC secrets are stored encrypted (AES-256-GCM, key held by the backend), never as plaintext.
create table public.bridge_keys (
  key_id      text primary key,
  server_id   uuid not null references public.bridge_servers (id),
  slot        text not null check (slot in ('A', 'B')),
  secret_enc  text not null,
  status      text not null default 'active' check (status in ('active', 'revoked')),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create unique index bridge_keys_one_active_per_slot on public.bridge_keys (server_id, slot) where status = 'active';

create table public.bridge_nonces (
  key_id  text not null,
  nonce   text not null,
  seen_at timestamptz not null default now(),
  primary key (key_id, nonce)
);
create index bridge_nonces_seen_idx on public.bridge_nonces (seen_at);

create table public.whitelist_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references public.users (id),
  nickname      text not null,
  desired       text not null default 'on' check (desired in ('on', 'off')),
  applied_state text not null default 'pending' check (applied_state in ('pending', 'applied', 'failed', 'drift')),
  applied_at    timestamptz,
  updated_at    timestamptz not null default now()
);

create table public.server_actions (
  id              uuid primary key,
  server_id       uuid not null references public.bridge_servers (id),
  user_id         uuid references public.users (id),
  type            text not null,
  args            jsonb not null default '{}'::jsonb,
  status          text not null default 'queued'
                  check (status in ('queued', 'leased', 'succeeded', 'failed_retryable', 'failed', 'expired', 'cancelled')),
  attempt         integer not null default 0,
  issued_at       timestamptz not null,
  expires_at      timestamptz,
  signed_payload  text not null,
  signature       text not null,
  sig_kid         text not null,
  lease_until     timestamptz,
  next_attempt_at timestamptz not null default now(),
  error_code      text,
  retry_of        uuid references public.server_actions (id),
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index server_actions_lease_idx on public.server_actions (server_id, status, next_attempt_at);

create table public.server_action_attempts (
  action_id  uuid not null references public.server_actions (id),
  attempt    integer not null,
  at         timestamptz not null default now(),
  status     text not null,
  error_code text,
  detail     text,
  primary key (action_id, attempt)
);

create table public.server_events (
  id          uuid primary key default gen_random_uuid(),
  server_id   uuid not null references public.bridge_servers (id),
  event_id    uuid not null,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (server_id, event_id)
);

create table public.whitelist_drift (
  id         uuid primary key default gen_random_uuid(),
  server_id  uuid not null references public.bridge_servers (id),
  nickname   text not null,
  mc_uuid    uuid,
  resolution text not null default 'open' check (resolution in ('open', 'resolved', 'ignored')),
  created_at timestamptz not null default now()
);
create unique index whitelist_drift_open_uq on public.whitelist_drift (server_id, lower(nickname)) where resolution = 'open';

alter table public.bridge_servers         enable row level security;
alter table public.bridge_keys            enable row level security;
alter table public.bridge_nonces          enable row level security;
alter table public.whitelist_entries      enable row level security;
alter table public.server_actions         enable row level security;
alter table public.server_action_attempts enable row level security;
alter table public.server_events          enable row level security;
alter table public.whitelist_drift        enable row level security;
revoke all on public.bridge_servers, public.bridge_keys, public.bridge_nonces, public.whitelist_entries,
  public.server_actions, public.server_action_attempts, public.server_events, public.whitelist_drift
  from anon, authenticated;

-- Atomic nonce claim, 5-minute memory. false = replay.
create function public.claim_nonce(p_key_id text, p_nonce text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.bridge_nonces where seen_at < now() - interval '5 minutes';
  insert into public.bridge_nonces (key_id, nonce) values (p_key_id, p_nonce) on conflict do nothing;
  return found;
end $$;

create function public.backoff_seconds(p_attempt integer) returns integer
language sql immutable set search_path = '' as $$
  select case p_attempt when 1 then 5 when 2 then 15 when 3 then 45 when 4 then 120 else 300 end;
$$;

-- Revocation-type actions are never given up after 8 attempts.
create function public.is_revocation(p_type text) returns boolean
language sql immutable set search_path = '' as $$
  select p_type in ('whitelist.remove', 'player.kick', 'player.data_archive');
$$;

-- Lease up to p_max due actions for a server (30 s lease). Also expires and re-queues stale ones.
create function public.lease_actions(p_server uuid, p_max integer)
returns setof public.server_actions
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.bridge_servers where id = p_server and status = 'paused') then
    return;
  end if;

  -- actions past their expiry
  with e as (
    update public.server_actions
       set status = 'expired', finished_at = now()
     where server_id = p_server and status in ('queued', 'failed_retryable')
       and expires_at is not null and expires_at <= now()
    returning id, type, args
  )
  update public.whitelist_entries w set applied_state = 'failed', updated_at = now()
    from e where e.type = 'whitelist.add' and lower(w.nickname) = lower(e.args ->> 'nickname');

  -- leases that ran out count as a failed attempt
  update public.server_actions a
     set status = case when a.attempt >= 8 and not public.is_revocation(a.type) then 'failed' else 'failed_retryable' end,
         next_attempt_at = now() + make_interval(secs => public.backoff_seconds(a.attempt)),
         error_code = 'ERR_LEASE_EXPIRED',
         finished_at = case when a.attempt >= 8 and not public.is_revocation(a.type) then now() else null end
   where a.server_id = p_server and a.status = 'leased' and a.lease_until <= now();

  return query
  with due as (
    select a.id from public.server_actions a
     where a.server_id = p_server and a.status in ('queued', 'failed_retryable') and a.next_attempt_at <= now()
       and not exists ( -- one whitelist.* action per nickname at a time; the older intent goes first
         select 1 from public.server_actions o
          where o.server_id = a.server_id and o.id <> a.id and o.type like 'whitelist.%' and a.type like 'whitelist.%'
            and lower(o.args ->> 'nickname') = lower(a.args ->> 'nickname')
            and o.status in ('queued', 'leased', 'failed_retryable') and o.created_at < a.created_at)
     order by a.created_at
     limit greatest(1, least(p_max, 20))
     for update skip locked
  ), upd as (
    update public.server_actions a
       set status = 'leased', attempt = a.attempt + 1, lease_until = now() + interval '30 seconds'
      from due where a.id = due.id
    returning a.*
  ), att as (
    insert into public.server_action_attempts (action_id, attempt, status)
    select upd.id, upd.attempt, 'leased' from upd
  )
  select * from upd;
end $$;

-- Record a Bridge result. Idempotent per (action, attempt). Returns 'ok' or an error code.
create function public.record_action_result(
  p_server uuid, p_action uuid, p_attempt integer, p_status text, p_retryable boolean,
  p_error text, p_detail text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  a public.server_actions%rowtype;
  new_status text;
begin
  if p_status not in ('succeeded', 'failed') then return 'ERR_BAD_REQUEST'; end if;
  select * into a from public.server_actions where id = p_action and server_id = p_server for update;
  if not found then return 'ERR_NOT_FOUND'; end if;
  if p_attempt is distinct from a.attempt then return 'ERR_LEASE_EXPIRED'; end if;
  if a.status = 'succeeded' and p_status = 'succeeded' then return 'ok'; end if;
  if a.status in ('failed', 'expired', 'cancelled', 'succeeded') then return 'ERR_LEASE_EXPIRED'; end if;
  if a.status not in ('leased', 'failed_retryable') then return 'ERR_LEASE_EXPIRED'; end if;

  if p_status = 'succeeded' then
    new_status := 'succeeded';
  elsif p_retryable and not (a.attempt >= 8 and not public.is_revocation(a.type)) then
    new_status := 'failed_retryable';
  else
    new_status := 'failed';
  end if;

  update public.server_actions
     set status = new_status,
         error_code = case when p_status = 'succeeded' then null else p_error end,
         next_attempt_at = case when new_status = 'failed_retryable'
                                then now() + make_interval(secs => public.backoff_seconds(a.attempt)) else next_attempt_at end,
         finished_at = case when new_status in ('succeeded', 'failed') then now() else null end,
         lease_until = null
   where id = a.id;
  update public.server_action_attempts set status = p_status, error_code = p_error, detail = left(p_detail, 500)
   where action_id = a.id and attempt = a.attempt;

  if a.type = 'whitelist.add' then
    if new_status = 'succeeded' then
      update public.whitelist_entries set applied_state = 'applied', applied_at = now(), updated_at = now()
       where lower(nickname) = lower(a.args ->> 'nickname') and desired = 'on';
    elsif new_status = 'failed' then
      update public.whitelist_entries set applied_state = 'failed', updated_at = now()
       where lower(nickname) = lower(a.args ->> 'nickname') and desired = 'on';
    end if;
  end if;
  return 'ok';
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'claim_nonce(text, text)', 'backoff_seconds(integer)', 'is_revocation(text)',
    'lease_actions(uuid, integer)',
    'record_action_result(uuid, uuid, integer, text, boolean, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
