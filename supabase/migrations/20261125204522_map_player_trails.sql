create table public.map_trail_points (
  server_id uuid not null references public.bridge_servers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  recorded_at timestamptz not null,
  segment_at timestamptz not null,
  dim text not null check (dim in ('overworld', 'nether')),
  x double precision not null check (abs(x) <= 30000000),
  y integer not null check (abs(y) <= 30000000),
  z double precision not null check (abs(z) <= 30000000),
  visibility text not null check (visibility in ('all', 'guild')),
  guild_id uuid references public.guilds(id) on delete set null,
  primary key (server_id, user_id, recorded_at)
);
create index map_trail_points_dim_time_idx on public.map_trail_points (dim, recorded_at);
create index map_trail_points_retention_idx on public.map_trail_points (recorded_at);
create index map_trail_points_user_time_idx on public.map_trail_points (user_id, recorded_at);
create index map_trail_points_guild_idx on public.map_trail_points (guild_id) where guild_id is not null;

alter table public.map_trail_points enable row level security;
revoke all on public.map_trail_points from public, anon, authenticated;
grant select, insert, delete on public.map_trail_points to service_role;

-- Serialize consecutive batches for one server so the threshold uses the last stored point.
create function public.map_record_trails(p_server uuid, p_positions jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  sampled_at timestamptz;
begin
  perform 1 from public.bridge_servers where id = p_server for no key update;
  sampled_at := clock_timestamp();

  with samples as (
    select mi.user_id, p.dim, p.x, p.y, p.z,
           coalesce(ps.map_visibility, 'all') as visibility, g.id as guild_id
    from jsonb_to_recordset(p_positions) as p(uuid uuid, dim text, x float8, y int, z float8)
    join public.minecraft_identities mi on mi.mc_uuid = p.uuid
      and mi.binding_status = 'confirmed' and mi.game_identity = 'confirmed'
    join public.users u on u.id = mi.user_id and u.account_status = 'active'
    join public.access_memberships a on a.user_id = u.id and a.status = 'approved'
    left join public.privacy_settings ps on ps.user_id = u.id
    left join public.guild_members gm on gm.user_id = u.id and gm.status = 'active'
    left join public.guilds g on g.id = gm.guild_id and g.status = 'active'
  ), measured as (
    select s.*, prev.recorded_at, prev.segment_at,
           (prev.x - s.x) ^ 2 + (prev.y - s.y)::float8 ^ 2 + (prev.z - s.z) ^ 2 as distance_sq,
           prev.dim is distinct from s.dim
             or prev.visibility is distinct from s.visibility
             or prev.guild_id is distinct from s.guild_id as changed
    from samples s
    left join lateral (
      select p.recorded_at, p.segment_at, p.dim, p.x, p.y, p.z, p.visibility, p.guild_id
      from public.map_trail_points p
      where p.server_id = p_server and p.user_id = s.user_id
      order by p.recorded_at desc
      limit 1
    ) prev on true
  )
  insert into public.map_trail_points
    (server_id, user_id, recorded_at, segment_at, dim, x, y, z, visibility, guild_id)
  select p_server, user_id, sampled_at,
         case when changed or distance_sq > 10000 or recorded_at < sampled_at - interval '30 seconds'
              then sampled_at else segment_at end,
         dim, x, y, z, visibility, guild_id
  from measured
  where changed or distance_sq >= 4 or recorded_at <= sampled_at - interval '5 seconds';
end
$$;

-- Peers are filtered by both the audience at capture and today's privacy and guild membership.
-- Return one JSON value so the PostgREST row limit cannot silently truncate a path.
create function public.map_read_trails(p_user uuid, p_staff boolean, p_dim text)
returns jsonb language sql stable set search_path = '' as $$
  with visible as (
    select p.*
    from public.map_trail_points p
    join public.users u on u.id = p.user_id and u.account_status = 'active'
    left join public.privacy_settings ps on ps.user_id = p.user_id
    left join public.guild_members gm on gm.user_id = p.user_id and gm.status = 'active'
    left join public.guilds g on g.id = gm.guild_id and g.status = 'active'
    left join public.guild_members peer on peer.guild_id = g.id
      and peer.user_id = p_user and peer.status = 'active'
    where p.dim = p_dim and p.recorded_at >= now() - interval '32 minutes'
      and (
        (p.user_id = p_user and p.recorded_at >= now() - interval '30 minutes')
        or (p.user_id <> p_user and p.recorded_at <= now() - interval '2 minutes' and (
          p_staff
          or (
            exists (select 1 from public.access_memberships a
              where a.user_id = p.user_id and a.status = 'approved')
            and (p.visibility = 'all' or (peer.user_id is not null and p.guild_id = g.id))
            and (coalesce(ps.map_visibility, 'all') = 'all' or peer.user_id is not null)
          )
        ))
      )
  ), tracks as (
    select user_id = p_user as mine, max(recorded_at) as last_at,
           jsonb_agg(jsonb_build_array(x, z) order by recorded_at) as points
    from visible
    group by server_id, user_id, segment_at
  )
  select jsonb_build_object(
    'nickname', (select nickname from public.minecraft_identities
      where user_id = p_user and binding_status = 'confirmed' and game_identity = 'confirmed'),
    'latest', (select extract(epoch from max(recorded_at)) * 1000 from visible where user_id = p_user),
    'tracks', coalesce((select jsonb_agg(
      jsonb_build_object('mine', mine, 'points', points) order by last_at) from tracks), '[]'::jsonb)
  );
$$;

create function public.map_purge_trails()
returns bigint language sql set search_path = '' as $$
  with removed as (
    delete from public.map_trail_points where recorded_at < now() - interval '7 days'
    returning 1
  )
  select count(*) from removed;
$$;

revoke all on function public.map_record_trails(uuid, jsonb),
  public.map_read_trails(uuid, boolean, text), public.map_purge_trails()
  from public, anon, authenticated;
grant execute on function public.map_record_trails(uuid, jsonb),
  public.map_read_trails(uuid, boolean, text), public.map_purge_trails() to service_role;

-- Privileged live positions are available to both staff roles with the existing session and TOTP gates.
create table if not exists public.map_live_watches (
  session_id uuid primary key references public.user_sessions(id) on delete cascade,
  seen_at timestamptz not null default now()
);
create index if not exists map_live_watches_seen_idx on public.map_live_watches(seen_at);
alter table public.map_live_watches enable row level security;
revoke all on public.map_live_watches from public, anon, authenticated;
grant select, insert, update, delete on public.map_live_watches to service_role;

drop policy if exists "map positions are read by claim" on realtime.messages;
drop policy if exists "map positions are scoped to the site session" on realtime.messages;
create policy "map positions are scoped to the site session"
  on realtime.messages for select to authenticated
  using (extension = 'broadcast' and auth.jwt()->>'mo_map' = '1'
    and realtime.topic() = 'map:pos:session:' || (auth.jwt()->>'mo_map_session'));

create function public.map_live_position_audience()
returns table(session_id uuid, guild_id uuid, staff boolean, show_coordinates boolean)
language sql stable set search_path = '' as $$
  select w.session_id, g.id,
    (u.site_role in ('admin', 'moderator') and s.is_admin_session and t.confirmed_at is not null),
    (u.site_role = 'admin' and s.is_admin_session and t.confirmed_at is not null)
  from public.map_live_watches w
  join public.user_sessions s on s.id = w.session_id and s.revoked_at is null and s.expires_at > now()
  join public.users u on u.id = s.user_id and u.account_status = 'active'
  left join public.admin_totp t on t.user_id = u.id
  left join public.guild_members gm on gm.user_id = u.id and gm.status = 'active'
  left join public.guilds g on g.id = gm.guild_id and g.status = 'active'
  where w.seen_at > now() - interval '60 seconds' and (
    (u.site_role in ('admin', 'moderator') and s.is_admin_session and t.confirmed_at is not null)
    or exists (select 1 from public.access_memberships a where a.user_id = u.id and a.status = 'approved')
  )
  order by w.seen_at desc limit 200;
$$;

-- Keep the previous position endpoint deployable while the site rolls to the new API.
create or replace function public.map_live_audience()
returns table(session_id uuid, guild_id uuid, staff boolean)
language sql stable set search_path = '' as $$
  select session_id, guild_id, show_coordinates from public.map_live_position_audience();
$$;
revoke all on function public.map_live_audience(), public.map_live_position_audience()
  from public, anon, authenticated;
grant execute on function public.map_live_audience(), public.map_live_position_audience()
  to service_role;
