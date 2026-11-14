-- Block 6 (E07, E03-08): admin TOTP + step-up, account restrictions, account deletion, ban tombstones.

alter table public.users
  add column restriction_reason text,
  add column restricted_at timestamptz;

alter table public.user_sessions add column step_up_until timestamptz;

-- TOTP secret per staff member (encrypted by the backend). Unconfirmed until the first valid code.
create table public.admin_totp (
  user_id      uuid primary key references public.users (id),
  secret_enc   text not null,
  confirmed_at timestamptz,
  last_step    bigint not null default 0, -- last accepted 30 s step: a code works once
  created_at   timestamptz not null default now()
);

-- Left behind when an account is deleted. Only an HMAC of the Telegram ID is kept (never the ID).
create table public.deletion_tombstones (
  pseudonym_id     uuid primary key default gen_random_uuid(),
  telegram_id_hash text not null unique,
  banned           boolean not null default false,
  ban_until        timestamptz, -- null together with banned = permanent ban
  deleted_at       timestamptz not null default now(),
  purge_after      timestamptz  -- null for a permanent ban
);

alter table public.site_settings drop constraint site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check check (key in (
  'server_address', 'minecraft_version', 'client_build_version',
  'client_build_checksum', 'client_build_url', 'support_contact'));

alter table public.admin_totp          enable row level security;
alter table public.deletion_tombstones enable row level security;
revoke all on public.admin_totp, public.deletion_tombstones from anon, authenticated;

-- Releases the active nickname; with game history it goes into quarantine (nobody else may take it).
create function public.release_nickname(p_user uuid, p_min_until timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  nick text;
begin
  update public.minecraft_identities
     set binding_status = 'released', released_at = now(),
         quarantine_until = case when has_game_history
                                 then greatest(now() + interval '90 days', coalesce(p_min_until, now())) end
   where user_id = p_user and binding_status in ('reserved', 'confirmed')
  returning nickname into nick;
  return nick;
end $$;

-- suspend | ban | unban. Returns the nickname the backend must take off the game servers.
create function public.admin_set_account_status(
  p_actor uuid, p_user uuid, p_action text, p_reason text, p_until timestamptz, p_tg_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.users%rowtype;
  nick text;
  restored boolean := false;
begin
  perform public.assert_active_role(p_actor, array['admin']);
  if p_action not in ('suspend', 'ban', 'unban') then raise exception 'bad_action' using errcode = 'P0001'; end if;
  if p_actor = p_user then raise exception 'cannot_target_self' using errcode = 'P0001'; end if;
  select * into u from public.users where id = p_user for update;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if u.account_status = 'deleted' then raise exception 'user_deleted' using errcode = 'P0001'; end if;

  if p_action in ('suspend', 'ban') then
    if p_reason is null or length(btrim(p_reason)) = 0 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    if p_action = 'suspend' and u.account_status <> 'active' then raise exception 'bad_transition' using errcode = 'P0001'; end if;
    if p_action = 'ban' and u.account_status not in ('active', 'suspended') then raise exception 'bad_transition' using errcode = 'P0001'; end if;

    update public.users
       set account_status = case p_action when 'ban' then 'banned' else 'suspended' end,
           banned_until = case when p_action = 'ban' then p_until end,
           restriction_reason = btrim(p_reason), restricted_at = now(), updated_at = now()
     where id = p_user;
    update public.user_sessions set revoked_at = now() where user_id = p_user and revoked_at is null;
    update public.whitelist_entries set desired = 'off', applied_state = 'pending', updated_at = now() where user_id = p_user;
    update public.access_memberships
       set status = case p_action when 'ban' then 'revoked' else 'suspended' end,
           revoke_reason = case p_action when 'ban' then 'banned' else 'suspended' end
     where user_id = p_user and status in ('pending', 'approved', 'suspended');
    if p_action = 'ban' then
      nick := public.release_nickname(p_user, p_until);
      if p_tg_hash is not null then
        insert into public.deletion_tombstones (telegram_id_hash, banned, ban_until, purge_after)
        values (p_tg_hash, true, p_until, null)
        on conflict (telegram_id_hash) do update set banned = true, ban_until = excluded.ban_until, purge_after = null;
      end if;
    else
      select nickname into nick from public.minecraft_identities
       where user_id = p_user and binding_status in ('reserved', 'confirmed');
    end if;
  else
    if u.account_status not in ('banned', 'suspended') then raise exception 'bad_transition' using errcode = 'P0001'; end if;
    update public.users
       set account_status = 'active', banned_until = null, restriction_reason = null, restricted_at = null, updated_at = now()
     where id = p_user;
    if p_tg_hash is not null then
      update public.deletion_tombstones set banned = false, ban_until = null, purge_after = now() + interval '30 days'
       where telegram_id_hash = p_tg_hash;
    end if;
    -- a suspension is lifted completely; a ban leaves admission revoked (re-admission is a separate decision, OD-48)
    update public.access_memberships set status = 'approved', revoke_reason = null
     where user_id = p_user and status = 'suspended';
    restored := found;
    if restored then
      update public.whitelist_entries set desired = 'on', applied_state = 'pending', updated_at = now() where user_id = p_user;
    end if;
    select nickname into nick from public.minecraft_identities
     where user_id = p_user and binding_status in ('reserved', 'confirmed');
  end if;

  perform public.write_audit(p_actor, 'user.' || case p_action when 'suspend' then 'suspended' when 'ban' then 'banned' else 'unbanned' end,
    jsonb_build_object('user_id', p_user, 'reason', nullif(btrim(coalesce(p_reason, '')), ''), 'until', p_until));
  return jsonb_build_object('nickname', nick, 'restored', restored);
end $$;

-- Deletes an account (the user themself or an admin). Banned or suspended users cannot delete themselves.
create function public.delete_account(p_user uuid, p_actor uuid, p_tg_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.users%rowtype;
  nick text;
  until_ts timestamptz;
begin
  select * into u from public.users where id = p_user for update;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if u.account_status = 'deleted' then return jsonb_build_object('nickname', null, 'already', true); end if;

  if p_actor = p_user then
    if u.account_status in ('banned', 'suspended') then
      raise exception 'delete_forbidden_banned' using errcode = 'P0001'; -- no ban evasion by deleting
    end if;
  else
    perform public.assert_active_role(p_actor, array['admin']);
  end if;

  until_ts := u.banned_until;
  if p_tg_hash is not null then
    insert into public.deletion_tombstones (telegram_id_hash, banned, ban_until, purge_after)
    values (p_tg_hash, u.account_status = 'banned', case when u.account_status = 'banned' then until_ts end,
            case when u.account_status = 'banned' and until_ts is null then null
                 when u.account_status = 'banned' then greatest(until_ts, now() + interval '30 days')
                 else now() + interval '30 days' end)
    on conflict (telegram_id_hash) do update
      set banned = excluded.banned or public.deletion_tombstones.banned,
          ban_until = excluded.ban_until, purge_after = excluded.purge_after, deleted_at = now();
  end if;

  update public.user_sessions set revoked_at = now() where user_id = p_user and revoked_at is null;
  update public.whitelist_entries set desired = 'off', applied_state = 'pending', updated_at = now() where user_id = p_user;
  update public.access_memberships set status = 'revoked', revoke_reason = 'account_deleted'
   where user_id = p_user and status in ('pending', 'approved', 'suspended');
  nick := public.release_nickname(p_user, until_ts);
  delete from public.telegram_identities where user_id = p_user;
  update public.users
     set account_status = 'deleted', deleted_at = now(), display_name = null, updated_at = now()
   where id = p_user;
  perform public.write_audit(p_actor, 'user.deleted', jsonb_build_object('user_id', p_user, 'by_admin', p_actor <> p_user));
  return jsonb_build_object('nickname', nick, 'already', false);
end $$;

-- True when a Telegram identity is blocked from signing in (banned tombstone still in force).
create function public.tombstone_blocks(p_tg_hash text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deletion_tombstones t
     where t.telegram_id_hash = p_tg_hash and t.banned and (t.ban_until is null or t.ban_until > now())
  );
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'release_nickname(uuid, timestamptz)',
    'admin_set_account_status(uuid, uuid, text, text, timestamptz, text)',
    'delete_account(uuid, uuid, text)', 'tombstone_blocks(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
