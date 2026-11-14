-- Block 2 (E02): Telegram identity, sessions, one-time login state, rate limits, test-login tokens.
-- All tables are closed to anon/authenticated (default privileges revoked in migration 1).
-- Only the backend (service_role) touches them.

create table public.telegram_identities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.users (id),
  telegram_id bigint not null unique,
  username    text,
  dm_consent  boolean not null default false,
  linked_at   timestamptz not null default now()
);

create table public.user_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id),
  token_hash       text not null unique,
  is_admin_session boolean not null default false,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  ip               inet,
  user_agent       text
);
create index user_sessions_user_revoked_idx on public.user_sessions (user_id, revoked_at);

-- One row per started login. Consumed exactly once (replay protection).
create table public.login_states (
  state_hash    text primary key,
  nonce         text not null,
  code_verifier text not null,
  return_to     text not null default '/dashboard',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz
);

create table public.rate_limit_counters (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);

-- Single-use jti of signed test-login tokens (never used in production).
create table public.test_login_tokens (
  jti     text primary key,
  used_at timestamptz not null default now()
);

alter table public.telegram_identities enable row level security;
alter table public.user_sessions       enable row level security;
alter table public.login_states        enable row level security;
alter table public.rate_limit_counters enable row level security;
alter table public.test_login_tokens   enable row level security;
revoke all on public.telegram_identities, public.user_sessions, public.login_states,
  public.rate_limit_counters, public.test_login_tokens from anon, authenticated;

-- Atomically consume a login state; returns the row only if it was valid and unused.
create function public.consume_login_state(p_state_hash text)
returns table (nonce text, code_verifier text, return_to text)
language sql security definer set search_path = '' as $$
  update public.login_states s
     set consumed_at = now()
   where s.state_hash = p_state_hash and s.consumed_at is null and s.expires_at > now()
  returning s.nonce, s.code_verifier, s.return_to;
$$;

-- Fixed-window counter; returns true when the call is within the limit.
create function public.hit_rate_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c integer;
begin
  insert into public.rate_limit_counters as r (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into c;
  delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  return c <= p_limit;
end $$;

-- Find or create the user for a Telegram ID. Identity is the numeric Telegram ID, never @username.
create function public.upsert_telegram_user(p_telegram_id bigint, p_username text, p_display_name text)
returns table (user_id uuid, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  select ti.user_id into uid from public.telegram_identities ti where ti.telegram_id = p_telegram_id;
  if found then
    update public.telegram_identities set username = p_username where telegram_id = p_telegram_id;
    return query select uid, false;
    return;
  end if;
  insert into public.users (display_name) values (p_display_name) returning id into uid;
  insert into public.telegram_identities (user_id, telegram_id, username)
  values (uid, p_telegram_id, p_username)
  on conflict (telegram_id) do nothing;
  if not found then
    -- lost a race: use the row the other transaction created, drop our orphan user
    delete from public.users where id = uid;
    select ti.user_id into uid from public.telegram_identities ti where ti.telegram_id = p_telegram_id;
    return query select uid, false;
    return;
  end if;
  return query select uid, true;
end $$;

revoke execute on function public.consume_login_state(text) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.upsert_telegram_user(bigint, text, text) from public, anon, authenticated;
grant execute on function public.consume_login_state(text) to service_role;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
grant execute on function public.upsert_telegram_user(bigint, text, text) to service_role;
