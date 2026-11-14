-- Block 3 (E03/E05): rules, nicknames, invitations, applications, memberships.
-- Business rules live in SECURITY DEFINER functions callable only by service_role.
-- Errors are raised as exceptions whose message is a stable code (e.g. 'rules_required').

create table public.rules_versions (
  id            uuid primary key default gen_random_uuid(),
  version_major integer not null check (version_major >= 0),
  version_minor integer not null check (version_minor >= 0),
  body          text not null check (length(btrim(body)) > 0),
  published_at  timestamptz not null default now(),
  published_by  uuid references public.users (id),
  unique (version_major, version_minor)
);

create table public.rules_acceptances (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id),
  rules_version_id uuid not null references public.rules_versions (id),
  accepted_at      timestamptz not null default now(),
  unique (user_id, rules_version_id)
);

create table public.minecraft_identities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id),
  nickname         text not null check (nickname ~ '^[A-Za-z0-9_]{3,16}$'),
  mc_uuid          uuid,
  account_type     text not null default 'unknown' check (account_type in ('premium', 'offline', 'unknown')),
  binding_status   text not null default 'reserved' check (binding_status in ('reserved', 'confirmed', 'released')),
  game_identity    text not null default 'unconfirmed' check (game_identity in ('unconfirmed', 'confirmed')),
  has_game_history boolean not null default false,
  released_at      timestamptz,
  quarantine_until timestamptz,
  created_at       timestamptz not null default now()
);
-- One active owner per nickname, one active nickname per user.
create unique index minecraft_identities_active_nick_uq
  on public.minecraft_identities (lower(nickname)) where binding_status in ('reserved', 'confirmed');
create unique index minecraft_identities_active_user_uq
  on public.minecraft_identities (user_id) where binding_status in ('reserved', 'confirmed');
create index minecraft_identities_nick_idx on public.minecraft_identities (lower(nickname));

create table public.applications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users (id),
  minecraft_identity_id uuid references public.minecraft_identities (id),
  status                text not null default 'pending'
                        check (status in ('draft', 'pending', 'approved', 'rejected', 'withdrawn')),
  text                  text,
  decided_by            uuid references public.users (id),
  decided_at            timestamptz,
  decision_reason       text,
  created_at            timestamptz not null default now()
);
create unique index applications_one_pending_uq on public.applications (user_id) where status = 'pending';
create index applications_status_idx on public.applications (status, created_at);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  issued_by   uuid not null references public.users (id),
  token_hash  text not null unique,
  status      text not null default 'active' check (status in ('active', 'revoked')),
  max_uses    integer not null default 1 check (max_uses > 0),
  used_count  integer not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  check (used_count <= max_uses)
);
create index invitations_status_expires_idx on public.invitations (status, expires_at);

create table public.invitation_redemptions (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id),
  user_id       uuid not null references public.users (id),
  redeemed_at   timestamptz not null default now(),
  unique (invitation_id, user_id)
);

create table public.access_memberships (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users (id),
  status                text not null default 'pending'
                        check (status in ('pending', 'approved', 'suspended', 'revoked')),
  source_application_id uuid references public.applications (id),
  source_redemption_id  uuid references public.invitation_redemptions (id),
  revoke_reason         text,
  decided_at            timestamptz,
  created_at            timestamptz not null default now()
);
create unique index access_memberships_active_uq
  on public.access_memberships (user_id) where status in ('pending', 'approved', 'suspended');

alter table public.rules_versions         enable row level security;
alter table public.rules_acceptances      enable row level security;
alter table public.minecraft_identities   enable row level security;
alter table public.applications           enable row level security;
alter table public.invitations            enable row level security;
alter table public.invitation_redemptions enable row level security;
alter table public.access_memberships     enable row level security;
revoke all on public.rules_versions, public.rules_acceptances, public.minecraft_identities,
  public.applications, public.invitations, public.invitation_redemptions,
  public.access_memberships from anon, authenticated;

-- ---------- helpers (internal) ----------
create function public.assert_active_role(p_user uuid, p_roles text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.users u
    where u.id = p_user and u.account_status = 'active' and u.site_role = any (p_roles)
  ) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
end $$;

create function public.assert_active_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.users u where u.id = p_user and u.account_status = 'active') then
    raise exception 'account_not_active' using errcode = 'P0001';
  end if;
end $$;

create function public.write_audit(p_actor uuid, p_action text, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, details) values (p_actor, p_action, coalesce(p_details, '{}'::jsonb));
$$;

-- True when the user accepted a version with the same major as the current one.
create function public.rules_accepted(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with cur as (
    select version_major from public.rules_versions order by version_major desc, version_minor desc limit 1
  )
  select exists (
    select 1 from public.rules_acceptances a
    join public.rules_versions v on v.id = a.rules_version_id
    join cur on cur.version_major = v.version_major
    where a.user_id = p_user
  );
$$;

-- ---------- rules ----------
create function public.publish_rules_version(p_actor uuid, p_major integer, p_minor integer, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  vid uuid;
  latest record;
begin
  perform public.assert_active_role(p_actor, array['admin']);
  select version_major, version_minor into latest
    from public.rules_versions order by version_major desc, version_minor desc limit 1;
  if found and (p_major, p_minor) <= (latest.version_major, latest.version_minor) then
    raise exception 'version_not_newer' using errcode = 'P0001';
  end if;
  insert into public.rules_versions (version_major, version_minor, body, published_by)
  values (p_major, p_minor, p_body, p_actor) returning id into vid;
  perform public.write_audit(p_actor, 'rules.published',
    jsonb_build_object('rules_version_id', vid, 'version', p_major || '.' || p_minor));
  return vid;
end $$;

create function public.accept_rules(p_user uuid, p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cur uuid;
begin
  perform public.assert_active_user(p_user);
  select id into cur from public.rules_versions order by version_major desc, version_minor desc limit 1;
  if cur is null or cur <> p_version then
    raise exception 'rules_version_outdated' using errcode = 'P0001';
  end if;
  insert into public.rules_acceptances (user_id, rules_version_id) values (p_user, p_version)
  on conflict (user_id, rules_version_id) do nothing;
end $$;

-- ---------- nickname ----------
create function public.reserve_nickname(p_user uuid, p_nick text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  own record;
  had_own boolean;
  nid uuid;
begin
  perform public.assert_active_user(p_user);
  if p_nick is null or p_nick !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'nick_invalid_format' using errcode = 'P0001';
  end if;

  select * into own from public.minecraft_identities
   where user_id = p_user and binding_status in ('reserved', 'confirmed');
  had_own := found;
  if had_own and lower(own.nickname) = lower(p_nick) then
    return own.id; -- idempotent
  end if;
  if had_own and own.binding_status = 'confirmed' then
    raise exception 'nick_locked' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.minecraft_identities
              where lower(nickname) = lower(p_nick) and user_id <> p_user
                and binding_status in ('reserved', 'confirmed')) then
    raise exception 'nick_taken' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.minecraft_identities
              where lower(nickname) = lower(p_nick) and user_id <> p_user
                and binding_status = 'released' and has_game_history
                and quarantine_until is not null and quarantine_until > now()) then
    raise exception 'nick_quarantined' using errcode = 'P0001';
  end if;

  if had_own then
    -- a reservation without game history is freed immediately
    update public.minecraft_identities set binding_status = 'released', released_at = now()
     where id = own.id;
  end if;
  begin
    insert into public.minecraft_identities (user_id, nickname) values (p_user, p_nick) returning id into nid;
  exception when unique_violation then
    raise exception 'nick_taken' using errcode = 'P0001';
  end;
  return nid;
end $$;

-- ---------- invitations ----------
create function public.create_invitation(p_actor uuid, p_token_hash text, p_max_uses integer default 1)
returns uuid language plpgsql security definer set search_path = '' as $$
declare iid uuid;
begin
  perform public.assert_active_role(p_actor, array['admin']);
  insert into public.invitations (issued_by, token_hash, max_uses, expires_at)
  values (p_actor, p_token_hash, p_max_uses, now() + interval '7 days') returning id into iid;
  perform public.write_audit(p_actor, 'invitation.created', jsonb_build_object('invitation_id', iid, 'max_uses', p_max_uses));
  return iid;
end $$;

create function public.revoke_invitation(p_actor uuid, p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_active_role(p_actor, array['admin']);
  update public.invitations set status = 'revoked' where id = p_invitation and status = 'active';
  if not found then
    raise exception 'invitation_not_active' using errcode = 'P0001';
  end if;
  perform public.write_audit(p_actor, 'invitation.revoked', jsonb_build_object('invitation_id', p_invitation));
end $$;

create function public.redeem_invitation(p_user uuid, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations%rowtype;
  rid uuid;
  mid uuid;
begin
  perform public.assert_active_user(p_user);
  if not public.rules_accepted(p_user) then
    raise exception 'rules_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.access_memberships
              where user_id = p_user and status in ('pending', 'approved', 'suspended')) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  select * into inv from public.invitations where token_hash = p_token_hash for update;
  if not found then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  if inv.status = 'revoked' then raise exception 'invitation_revoked' using errcode = 'P0001'; end if;
  if inv.expires_at <= now() then raise exception 'invitation_expired' using errcode = 'P0001'; end if;
  if inv.used_count >= inv.max_uses then raise exception 'invitation_exhausted' using errcode = 'P0001'; end if;

  insert into public.invitation_redemptions (invitation_id, user_id) values (inv.id, p_user) returning id into rid;
  update public.invitations set used_count = used_count + 1 where id = inv.id;
  insert into public.access_memberships (user_id, status, source_redemption_id, decided_at)
  values (p_user, 'approved', rid, now()) returning id into mid;
  perform public.write_audit(p_user, 'invitation.redeemed',
    jsonb_build_object('invitation_id', inv.id, 'membership_id', mid));
  return mid;
end $$;

-- ---------- applications ----------
create function public.submit_application(p_user uuid, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ident uuid;
  aid uuid;
  last_rejected timestamptz;
begin
  perform public.assert_active_user(p_user);
  if not public.rules_accepted(p_user) then
    raise exception 'rules_required' using errcode = 'P0001';
  end if;
  select id into ident from public.minecraft_identities
   where user_id = p_user and binding_status in ('reserved', 'confirmed');
  if ident is null then raise exception 'nick_required' using errcode = 'P0001'; end if;
  if exists (select 1 from public.access_memberships
              where user_id = p_user and status in ('pending', 'approved', 'suspended')) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.applications where user_id = p_user and status = 'pending') then
    raise exception 'application_pending' using errcode = 'P0001';
  end if;
  select max(decided_at) into last_rejected from public.applications where user_id = p_user and status = 'rejected';
  if last_rejected is not null and last_rejected > now() - interval '7 days' then
    raise exception 'retry_too_soon' using errcode = 'P0001';
  end if;
  insert into public.applications (user_id, minecraft_identity_id, text) values (p_user, ident, p_text)
  returning id into aid;
  return aid;
end $$;

create function public.withdraw_application(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.applications set status = 'withdrawn' where user_id = p_user and status = 'pending';
  if not found then raise exception 'no_pending_application' using errcode = 'P0001'; end if;
end $$;

create function public.decide_application(p_actor uuid, p_application uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  app public.applications%rowtype;
begin
  perform public.assert_active_role(p_actor, array['moderator', 'admin']);
  if p_decision not in ('approve', 'reject') then
    raise exception 'bad_decision' using errcode = 'P0001';
  end if;
  if p_decision = 'reject' and (p_reason is null or length(btrim(p_reason)) = 0) then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into app from public.applications where id = p_application for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0001'; end if;
  if app.status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;

  update public.applications
     set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
         decided_by = p_actor, decided_at = now(), decision_reason = nullif(btrim(p_reason), '')
   where id = app.id;
  if p_decision = 'approve' then
    insert into public.access_memberships (user_id, status, source_application_id, decided_at)
    values (app.user_id, 'approved', app.id, now())
    on conflict do nothing;
  end if;
  perform public.write_audit(p_actor,
    'application.' || case p_decision when 'approve' then 'approved' else 'rejected' end,
    jsonb_build_object('application_id', app.id, 'user_id', app.user_id, 'reason', nullif(btrim(p_reason), '')));
end $$;

-- ---------- grants: service_role only ----------
do $$
declare f text;
begin
  foreach f in array array[
    'assert_active_role(uuid, text[])', 'assert_active_user(uuid)', 'write_audit(uuid, text, jsonb)',
    'rules_accepted(uuid)', 'publish_rules_version(uuid, integer, integer, text)', 'accept_rules(uuid, uuid)',
    'reserve_nickname(uuid, text)', 'create_invitation(uuid, text, integer)', 'revoke_invitation(uuid, uuid)',
    'redeem_invitation(uuid, text)', 'submit_application(uuid, text)', 'withdraw_application(uuid)',
    'decide_application(uuid, uuid, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
