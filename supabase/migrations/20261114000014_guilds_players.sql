-- Block 8 (E11, E12): guilds with ranks, privacy settings and public read views.
-- Everything is closed to client roles. Rank rules are enforced here, in SECURITY DEFINER
-- functions that read the actor's rank from the table on every call (R-LVL-6).

create table public.guilds (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40),
  name            text not null check (length(btrim(name)) between 3 and 40),
  tag             text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  color           text not null default '#2fbf71' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description     text not null default '' check (length(description) <= 1000),
  max_members     integer not null default 50 check (max_members between 1 and 500),
  status          text not null default 'active' check (status in ('active', 'archived')),
  needs_owner     boolean not null default false,
  created_by      uuid references public.users (id),
  created_at      timestamptz not null default now(),
  archived_at     timestamptz,
  archived_reason text
);
-- the tag of an archived guild stays taken (SC-GLD-01 A2)
create unique index guilds_slug_uq on public.guilds (lower(slug));
create unique index guilds_tag_uq on public.guilds (lower(tag));

create table public.guild_ranks (
  id       uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds (id) on delete cascade,
  level    integer not null check (level between 1 and 6),
  name     text not null check (length(btrim(name)) between 1 and 30),
  unique (guild_id, level) deferrable initially deferred,
  unique (guild_id, id)
);

create table public.guild_members (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null,
  user_id    uuid not null references public.users (id),
  rank_id    uuid not null,
  rank_level integer not null,                      -- copied from the rank by the trigger below
  is_owner   boolean not null default false,        -- idem
  status     text not null default 'active' check (status in ('active', 'left', 'removed', 'ended')),
  joined_at  timestamptz not null default now(),
  ended_at   timestamptz,
  ended_by   uuid references public.users (id),
  end_reason text,
  -- a rank of another guild cannot be assigned
  foreign key (guild_id, rank_id) references public.guild_ranks (guild_id, id)
);
create unique index guild_members_one_active_guild_uq on public.guild_members (user_id) where status = 'active';
create unique index guild_members_one_owner_uq on public.guild_members (guild_id) where is_owner and status = 'active';
create index guild_members_guild_idx on public.guild_members (guild_id, status);

create function public.guild_members_sync_rank() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select r.level into new.rank_level from public.guild_ranks r where r.id = new.rank_id;
  new.is_owner := new.rank_level = 1;
  return new;
end $$;
create trigger guild_members_sync_rank before insert or update of rank_id on public.guild_members
  for each row execute function public.guild_members_sync_rank();

create table public.guild_invitations (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references public.guilds (id),
  invitee_id uuid not null references public.users (id),
  invited_by uuid not null references public.users (id),
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index guild_invitations_pending_uq on public.guild_invitations (guild_id, invitee_id) where status = 'pending';
create index guild_invitations_invitee_idx on public.guild_invitations (invitee_id, status);

-- Not to be confused with `applications` (admission to the server).
create table public.guild_join_requests (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references public.guilds (id),
  user_id    uuid not null references public.users (id),
  message    text not null default '' check (length(message) <= 280),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_by uuid references public.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index guild_join_requests_pending_uq on public.guild_join_requests (guild_id, user_id) where status = 'pending';

-- Private by default, opt-in to more (OD-29).
create table public.privacy_settings (
  user_id         uuid primary key references public.users (id),
  show_first_join boolean not null default true,
  show_guild      boolean not null default true,
  show_stats      boolean not null default false,
  bio             text not null default '' check (length(bio) <= 300),
  updated_at      timestamptz not null default now()
);

alter table public.guilds enable row level security;
alter table public.guild_ranks enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_invitations enable row level security;
alter table public.guild_join_requests enable row level security;
alter table public.privacy_settings enable row level security;
revoke all on public.guilds, public.guild_ranks, public.guild_members, public.guild_invitations,
  public.guild_join_requests, public.privacy_settings from anon, authenticated;

-- ---------- public read views: only these columns ever reach the pages ----------
create view public.public_profiles as
select mi.nickname,
       case when coalesce(ps.show_first_join, true) then mi.created_at end as since,
       coalesce(ps.bio, '') as bio,
       coalesce(ps.show_stats, false) as show_stats
  from public.minecraft_identities mi
  join public.users u on u.id = mi.user_id and u.account_status = 'active'
  join public.access_memberships am on am.user_id = u.id and am.status = 'approved'
  left join public.privacy_settings ps on ps.user_id = u.id
 where mi.binding_status = 'confirmed' and mi.game_identity = 'confirmed';

create view public.public_members as
select mi.nickname,
       case when coalesce(ps.show_first_join, true) then mi.created_at end as since,
       case when coalesce(ps.show_guild, true) then g.slug end as guild_slug,
       case when coalesce(ps.show_guild, true) then g.name end as guild_name,
       case when coalesce(ps.show_guild, true) then g.tag end as guild_tag,
       case when coalesce(ps.show_guild, true) then g.color end as guild_color,
       case when coalesce(ps.show_guild, true) then gr.name end as rank_name,
       case when coalesce(ps.show_guild, true) then gm.rank_level end as rank_level
  from public.minecraft_identities mi
  join public.users u on u.id = mi.user_id and u.account_status = 'active'
  join public.access_memberships am on am.user_id = u.id and am.status = 'approved'
  left join public.privacy_settings ps on ps.user_id = u.id
  left join public.guild_members gm on gm.user_id = u.id and gm.status = 'active'
  left join public.guilds g on g.id = gm.guild_id and g.status = 'active'
  left join public.guild_ranks gr on gr.id = gm.rank_id
 where mi.binding_status = 'confirmed' and mi.game_identity = 'confirmed';

create view public.public_guilds as
select g.slug, g.name, g.tag, g.color, g.description, g.status,
       (select count(*) from public.guild_members gm
          join public.users u on u.id = gm.user_id and u.account_status = 'active'
         where gm.guild_id = g.id and gm.status = 'active') as member_count
  from public.guilds g;

revoke all on public.public_profiles, public.public_members, public.public_guilds from anon, authenticated;
grant select on public.public_profiles, public.public_members, public.public_guilds to service_role;

-- ---------- helpers ----------
create function public.guild_level_of(p_guild uuid, p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select gm.rank_level from public.guild_members gm
   where gm.guild_id = p_guild and gm.user_id = p_user and gm.status = 'active';
$$;

create function public.guild_audit(p_actor uuid, p_guild uuid, p_action text, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, scope, guild_id, action, details)
  values (p_actor, 'guild', p_guild, p_action, coalesce(p_details, '{}'::jsonb));
$$;

-- A guild member must be able to act: active account (suspended and banned lose rights at once).
create function public.guild_lock(p_guild uuid, p_allow_archived boolean default false) returns public.guilds
language plpgsql security definer set search_path = '' as $$
declare g public.guilds;
begin
  select * into g from public.guilds where id = p_guild for update;
  if not found then raise exception 'guild_not_found' using errcode = 'P0001'; end if;
  if g.status = 'archived' and not p_allow_archived then
    raise exception 'guild_archived' using errcode = 'P0001';
  end if;
  return g;
end $$;

create function public.guild_actor_level(p_guild uuid, p_actor uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare lvl integer;
begin
  perform public.assert_active_user(p_actor);
  lvl := public.guild_level_of(p_guild, p_actor);
  if lvl is null then raise exception 'guild_forbidden' using errcode = 'P0001'; end if;
  return lvl;
end $$;

create function public.guild_close_pending(p_guild uuid, p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.guild_invitations set status = 'revoked', decided_at = now()
   where invitee_id = p_user and status = 'pending' and (p_guild is null or guild_id = p_guild);
  update public.guild_join_requests set status = 'withdrawn', decided_at = now()
   where user_id = p_user and status = 'pending' and (p_guild is null or guild_id = p_guild);
$$;

create function public.guild_add_member(p_guild uuid, p_user uuid, p_level integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.guild_members (guild_id, user_id, rank_id)
  select p_guild, p_user, r.id from public.guild_ranks r where r.guild_id = p_guild and r.level = p_level;
exception when unique_violation then
  raise exception 'guild_already_member' using errcode = 'P0001';
end $$;

create function public.guild_candidate_ok(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.users u
      join public.access_memberships am on am.user_id = u.id and am.status = 'approved'
     where u.id = p_user and u.account_status = 'active'
  ) then raise exception 'guild_candidate_not_approved' using errcode = 'P0001'; end if;
  if exists (select 1 from public.guild_members gm where gm.user_id = p_user and gm.status = 'active') then
    raise exception 'guild_already_member' using errcode = 'P0001';
  end if;
end $$;

create function public.guild_has_room(g public.guilds) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.guild_members gm where gm.guild_id = g.id and gm.status = 'active') < g.max_members;
$$;

-- ---------- admin: create ----------
create function public.create_guild(p_actor uuid, p_name text, p_slug text, p_tag text, p_color text,
                                    p_description text, p_owner uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid; names text[] := array['Глава', 'Заместитель', 'Офицер I', 'Офицер II', 'Офицер III', 'Участник']; i integer;
begin
  perform public.assert_active_role(p_actor, array['admin']);
  perform public.guild_candidate_ok(p_owner);
  if not exists (select 1 from public.minecraft_identities mi
                  where mi.user_id = p_owner and mi.binding_status = 'confirmed' and mi.game_identity = 'confirmed') then
    raise exception 'guild_owner_not_eligible' using errcode = 'P0001';
  end if;
  insert into public.guilds (slug, name, tag, color, description, created_by)
  values (lower(btrim(p_slug)), btrim(p_name), upper(btrim(p_tag)), p_color, coalesce(p_description, ''), p_actor)
  returning id into gid;
  for i in 1..6 loop
    insert into public.guild_ranks (guild_id, level, name) values (gid, i, names[i]);
  end loop;
  perform public.guild_add_member(gid, p_owner, 1);
  perform public.guild_audit(p_actor, gid, 'guild.created', jsonb_build_object('owner', p_owner, 'tag', upper(btrim(p_tag))));
  return gid;
exception
  when unique_violation then
    if sqlerrm like '%guilds_tag_uq%' then raise exception 'guild_tag_taken' using errcode = 'P0001'; end if;
    if sqlerrm like '%guilds_slug_uq%' then raise exception 'guild_slug_taken' using errcode = 'P0001'; end if;
    raise;
  when check_violation then
    raise exception 'guild_bad_input' using errcode = 'P0001';
end $$;

-- ---------- ranks (R-LVL-1 … R-LVL-5) ----------
create function public.guild_assign_rank(p_actor uuid, p_guild uuid, p_target uuid, p_level integer) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.guilds; al integer; tl integer; old_level integer;
begin
  g := public.guild_lock(p_guild);
  al := public.guild_actor_level(p_guild, p_actor);
  if p_level is null or p_level not between 1 and 6 then raise exception 'guild_bad_input' using errcode = 'P0001'; end if;
  if p_actor = p_target then raise exception 'guild_self_assign' using errcode = 'P0001'; end if;
  tl := public.guild_level_of(p_guild, p_target);
  if tl is null then raise exception 'guild_member_not_found' using errcode = 'P0001'; end if;
  if tl = 1 then raise exception 'guild_last_owner' using errcode = 'P0001'; end if;
  if p_level = 1 then raise exception 'guild_owner_conflict' using errcode = 'P0001'; end if;
  if not (al < tl) then raise exception 'guild_rank_too_low' using errcode = 'P0001'; end if;
  if not (p_level > al) then raise exception 'guild_rank_escalation' using errcode = 'P0001'; end if;
  if p_level = 2 and al <> 1 then raise exception 'guild_rank_too_low' using errcode = 'P0001'; end if;
  old_level := tl;
  update public.guild_members gm
     set rank_id = (select r.id from public.guild_ranks r where r.guild_id = p_guild and r.level = p_level)
   where gm.guild_id = p_guild and gm.user_id = p_target and gm.status = 'active';
  perform public.guild_audit(p_actor, p_guild, 'guild.rank_assigned',
    jsonb_build_object('target', p_target, 'from', old_level, 'to', p_level));
end $$;

-- ---------- invitations and requests ----------
create function public.guild_invite(p_actor uuid, p_guild uuid, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.guilds; al integer;
begin
  g := public.guild_lock(p_guild);
  al := public.guild_actor_level(p_guild, p_actor);
  if al > 5 then raise exception 'guild_forbidden' using errcode = 'P0001'; end if;
  perform public.guild_candidate_ok(p_target);
  if not public.guild_has_room(g) then raise exception 'guild_full' using errcode = 'P0001'; end if;
  update public.guild_invitations set status = 'expired', decided_at = now()
   where guild_id = p_guild and invitee_id = p_target and status = 'pending' and expires_at <= now();
  insert into public.guild_invitations (guild_id, invitee_id, invited_by) values (p_guild, p_target, p_actor);
  perform public.guild_audit(p_actor, p_guild, 'guild.invitation_sent', jsonb_build_object('target', p_target));
exception when unique_violation then
  raise exception 'guild_invite_exists' using errcode = 'P0001';
end $$;

create function public.guild_respond_invitation(p_user uuid, p_invitation uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.guild_invitations; g public.guilds;
begin
  perform public.assert_active_user(p_user);
  select * into inv from public.guild_invitations where id = p_invitation for update;
  if not found or inv.invitee_id <> p_user or inv.status <> 'pending' then
    raise exception 'guild_invite_invalid' using errcode = 'P0001';
  end if;
  if inv.expires_at <= now() then raise exception 'guild_invite_expired' using errcode = 'P0001'; end if;
  if not p_accept then
    update public.guild_invitations set status = 'declined', decided_at = now() where id = inv.id;
    return;
  end if;
  g := public.guild_lock(inv.guild_id);
  perform public.guild_candidate_ok(p_user);
  if not public.guild_has_room(g) then raise exception 'guild_full' using errcode = 'P0001'; end if;
  perform public.guild_add_member(inv.guild_id, p_user, 6);
  update public.guild_invitations set status = 'accepted', decided_at = now() where id = inv.id;
  perform public.guild_close_pending(null, p_user);
  perform public.guild_audit(inv.invited_by, inv.guild_id, 'guild.invitation_accepted', jsonb_build_object('user', p_user));
  perform public.guild_audit(p_user, inv.guild_id, 'guild.member_joined', jsonb_build_object('via', 'invitation'));
end $$;

create function public.guild_request_join(p_user uuid, p_guild uuid, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.guild_lock(p_guild);
  perform public.guild_candidate_ok(p_user);
  insert into public.guild_join_requests (guild_id, user_id, message) values (p_guild, p_user, left(coalesce(p_message, ''), 280));
exception when unique_violation then
  raise exception 'guild_request_exists' using errcode = 'P0001';
end $$;

create function public.guild_withdraw_request(p_user uuid, p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.guild_join_requests set status = 'withdrawn', decided_at = now()
   where id = p_request and user_id = p_user and status = 'pending';
  if not found then raise exception 'guild_request_not_found' using errcode = 'P0001'; end if;
end $$;

create function public.guild_decide_request(p_actor uuid, p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.guild_join_requests; g public.guilds; al integer;
begin
  select * into r from public.guild_join_requests where id = p_request for update;
  if not found then raise exception 'guild_request_not_found' using errcode = 'P0001'; end if;
  g := public.guild_lock(r.guild_id);
  al := public.guild_actor_level(r.guild_id, p_actor);
  if al > 5 then raise exception 'guild_forbidden' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'guild_request_not_found' using errcode = 'P0001'; end if;
  if not p_approve then
    update public.guild_join_requests set status = 'rejected', decided_by = p_actor, decided_at = now() where id = r.id;
    perform public.guild_audit(p_actor, r.guild_id, 'guild.join_request_decided', jsonb_build_object('user', r.user_id, 'approved', false));
    return;
  end if;
  perform public.guild_candidate_ok(r.user_id);
  if not public.guild_has_room(g) then raise exception 'guild_full' using errcode = 'P0001'; end if;
  perform public.guild_add_member(r.guild_id, r.user_id, 6);
  update public.guild_join_requests set status = 'approved', decided_by = p_actor, decided_at = now() where id = r.id;
  perform public.guild_close_pending(null, r.user_id);
  perform public.guild_audit(p_actor, r.guild_id, 'guild.join_request_decided', jsonb_build_object('user', r.user_id, 'approved', true));
  perform public.guild_audit(r.user_id, r.guild_id, 'guild.member_joined', jsonb_build_object('via', 'request'));
end $$;

-- ---------- leaving, kicking, last-owner guard ----------
create function public.guild_leave(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gm public.guild_members;
begin
  select * into gm from public.guild_members where user_id = p_user and status = 'active';
  if not found then raise exception 'guild_member_not_found' using errcode = 'P0001'; end if;
  perform public.guild_lock(gm.guild_id, true);
  if gm.is_owner then raise exception 'guild_last_owner' using errcode = 'P0001'; end if;
  update public.guild_members set status = 'left', ended_at = now(), ended_by = p_user where id = gm.id;
  perform public.guild_audit(p_user, gm.guild_id, 'guild.member_left', '{}'::jsonb);
end $$;

create function public.guild_kick(p_actor uuid, p_guild uuid, p_target uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare al integer; tl integer;
begin
  perform public.guild_lock(p_guild);
  al := public.guild_actor_level(p_guild, p_actor);
  if p_actor = p_target then raise exception 'guild_self_assign' using errcode = 'P0001'; end if;
  tl := public.guild_level_of(p_guild, p_target);
  if tl is null then raise exception 'guild_member_not_found' using errcode = 'P0001'; end if;
  if tl = 1 then raise exception 'guild_last_owner' using errcode = 'P0001'; end if;
  if al > 5 or not (al < tl) then raise exception 'guild_rank_too_low' using errcode = 'P0001'; end if;
  update public.guild_members set status = 'removed', ended_at = now(), ended_by = p_actor, end_reason = left(p_reason, 200)
   where guild_id = p_guild and user_id = p_target and status = 'active';
  perform public.guild_close_pending(p_guild, p_target);
  perform public.guild_audit(p_actor, p_guild, 'guild.member_removed', jsonb_build_object('target', p_target, 'reason', left(p_reason, 200)));
end $$;

-- ---------- admin: transfer, archive ----------
create function public.guild_transfer_owner(p_actor uuid, p_guild uuid, p_new_owner uuid, p_keep_vice boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare old_owner uuid; old_active boolean;
begin
  perform public.assert_active_role(p_actor, array['admin']);
  perform public.guild_lock(p_guild);
  if public.guild_level_of(p_guild, p_new_owner) is null then raise exception 'guild_owner_not_eligible' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.users u join public.access_memberships am on am.user_id = u.id and am.status = 'approved'
                  where u.id = p_new_owner and u.account_status = 'active') then
    raise exception 'guild_owner_not_eligible' using errcode = 'P0001';
  end if;
  select gm.user_id into old_owner from public.guild_members gm where gm.guild_id = p_guild and gm.is_owner and gm.status = 'active';
  if old_owner = p_new_owner then raise exception 'guild_bad_input' using errcode = 'P0001'; end if;
  if old_owner is not null then
    select u.account_status = 'active' into old_active from public.users u where u.id = old_owner;
    if old_active then
      update public.guild_members set rank_id = (select r.id from public.guild_ranks r where r.guild_id = p_guild and r.level = case when p_keep_vice then 2 else 6 end)
       where guild_id = p_guild and user_id = old_owner and status = 'active';
    else
      update public.guild_members set status = 'removed', ended_at = now(), ended_by = p_actor, end_reason = 'owner replaced'
       where guild_id = p_guild and user_id = old_owner and status = 'active';
    end if;
  end if;
  update public.guild_members set rank_id = (select r.id from public.guild_ranks r where r.guild_id = p_guild and r.level = 1)
   where guild_id = p_guild and user_id = p_new_owner and status = 'active';
  update public.guilds set needs_owner = false where id = p_guild;
  perform public.guild_audit(p_actor, p_guild, 'guild.owner_transferred', jsonb_build_object('from', old_owner, 'to', p_new_owner));
end $$;

create function public.guild_archive(p_actor uuid, p_guild uuid, p_confirm text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.guilds;
begin
  perform public.assert_active_role(p_actor, array['admin']);
  g := public.guild_lock(p_guild);
  if p_confirm is distinct from g.name then raise exception 'guild_confirm_mismatch' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_too_short' using errcode = 'P0001'; end if;
  update public.guilds set status = 'archived', archived_at = now(), archived_reason = left(p_reason, 300), needs_owner = false where id = p_guild;
  update public.guild_members set status = 'ended', ended_at = now(), ended_by = p_actor where guild_id = p_guild and status = 'active';
  update public.guild_invitations set status = 'revoked', decided_at = now() where guild_id = p_guild and status = 'pending';
  update public.guild_join_requests set status = 'withdrawn', decided_at = now() where guild_id = p_guild and status = 'pending';
  perform public.guild_audit(p_actor, p_guild, 'guild.archived', jsonb_build_object('reason', left(p_reason, 300)));
end $$;

-- A banned, suspended or deleted owner leaves the guild flagged "needs an owner" (SC-GLD-11).
create function public.guild_on_user_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.guilds set needs_owner = true
   where id in (select gm.guild_id from public.guild_members gm where gm.user_id = new.id and gm.is_owner and gm.status = 'active');
  if new.account_status = 'deleted' then
    update public.guild_members set status = 'left', ended_at = now() where user_id = new.id and status = 'active';
    perform public.guild_close_pending(null, new.id);
  end if;
  return null;
end $$;
create trigger guild_on_user_status after update of account_status on public.users
  for each row when (old.account_status = 'active' and new.account_status <> 'active')
  execute function public.guild_on_user_status();

do $$
declare f text;
begin
  foreach f in array array[
    'guild_members_sync_rank()', 'guild_level_of(uuid, uuid)', 'guild_audit(uuid, uuid, text, jsonb)',
    'guild_lock(uuid, boolean)', 'guild_actor_level(uuid, uuid)', 'guild_close_pending(uuid, uuid)',
    'guild_add_member(uuid, uuid, integer)', 'guild_candidate_ok(uuid)', 'guild_has_room(public.guilds)',
    'create_guild(uuid, text, text, text, text, text, uuid)',
    'guild_assign_rank(uuid, uuid, uuid, integer)', 'guild_invite(uuid, uuid, uuid)',
    'guild_respond_invitation(uuid, uuid, boolean)', 'guild_request_join(uuid, uuid, text)',
    'guild_withdraw_request(uuid, uuid)', 'guild_decide_request(uuid, uuid, boolean)',
    'guild_leave(uuid)', 'guild_kick(uuid, uuid, uuid, text)',
    'guild_transfer_owner(uuid, uuid, uuid, boolean)', 'guild_archive(uuid, uuid, text, text)',
    'guild_on_user_status()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
