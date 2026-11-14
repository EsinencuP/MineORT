-- Security review fixes for migrations 5 and 6.
-- 1) Whitelist state is updated by the action's user_id, never by nickname, and "applied" needs
--    every server's whitelist.add for that user to be finished.
-- 2) A user with an approved or suspended membership cannot re-pick the nickname alone:
--    after admission a nickname change goes through an admin (US-E03-10).

create or replace function public.lease_actions(p_server uuid, p_max integer)
returns setof public.server_actions
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.bridge_servers where id = p_server and status = 'paused') then
    return;
  end if;

  with e as (
    update public.server_actions
       set status = 'expired', finished_at = now()
     where server_id = p_server and status in ('queued', 'failed_retryable')
       and expires_at is not null and expires_at <= now()
    returning id, type, user_id
  )
  update public.whitelist_entries w set applied_state = 'failed', updated_at = now()
    from e where e.type = 'whitelist.add' and e.user_id is not null and w.user_id = e.user_id
      and w.desired = 'on' and w.applied_state <> 'applied';

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
       and not exists (
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

create or replace function public.record_action_result(
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

  if a.type = 'whitelist.add' and a.user_id is not null then
    if new_status = 'succeeded' then
      -- "applied" only when no other server still has an unfinished add for this user
      if not exists (select 1 from public.server_actions o
                      where o.user_id = a.user_id and o.type = 'whitelist.add' and o.id <> a.id
                        and o.status in ('queued', 'leased', 'failed_retryable')) then
        update public.whitelist_entries set applied_state = 'applied', applied_at = now(), updated_at = now()
         where user_id = a.user_id and desired = 'on';
      end if;
    elsif new_status = 'failed' then
      update public.whitelist_entries set applied_state = 'failed', updated_at = now()
       where user_id = a.user_id and desired = 'on';
    end if;
  end if;
  return 'ok';
end $$;

create or replace function public.reserve_nickname(p_user uuid, p_nick text) returns uuid
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
    return own.id;
  end if;
  if had_own and (own.binding_status = 'confirmed' or exists (
       select 1 from public.access_memberships m
        where m.user_id = p_user and m.status in ('approved', 'suspended'))) then
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
