-- Live positions on the map (U6).
-- Positions are never stored here: the site receives them from the Paper plugin and broadcasts
-- them to private Realtime channels. This migration holds what the routing needs:
--   * the player's choice of who sees them (default: every registered user),
--   * who has the map open (so the plugin can slow down when nobody looks),
--   * the policy that lets a browser join a channel, driven by claims in a token the site signs.

alter table public.privacy_settings
  add column map_visibility text not null default 'all' check (map_visibility in ('all', 'guild'));

create table public.map_viewers (
  user_id uuid primary key references public.users (id) on delete cascade,
  seen_at timestamptz not null default now()
);
create index map_viewers_seen_idx on public.map_viewers (seen_at);
alter table public.map_viewers enable row level security;
revoke all on public.map_viewers from anon, authenticated;

-- Who stands where in terms of the site: one round trip for a whole batch of players.
-- Only a confirmed, active member counts as registered; everyone else is shown to staff only.
create function public.map_resolve_players(p_uuids uuid[])
returns table (out_mc_uuid uuid, out_nickname text, out_visibility text, out_guild_id uuid)
language sql stable security definer set search_path = '' as $$
  select mi.mc_uuid,
         mi.nickname,
         coalesce(ps.map_visibility, 'all'),
         g.id
    from public.minecraft_identities mi
    join public.users u on u.id = mi.user_id and u.account_status = 'active'
    join public.access_memberships am on am.user_id = u.id and am.status = 'approved'
    left join public.privacy_settings ps on ps.user_id = u.id
    left join public.guild_members gm on gm.user_id = u.id and gm.status = 'active'
    left join public.guilds g on g.id = gm.guild_id and g.status = 'active'
   where mi.mc_uuid = any (p_uuids)
     and mi.binding_status = 'confirmed' and mi.game_identity = 'confirmed';
$$;
revoke all on function public.map_resolve_players(uuid[]) from public, anon, authenticated;
grant execute on function public.map_resolve_players(uuid[]) to service_role;

-- A browser may only listen. The token is signed by the site and carries:
--   mo_map = '1'        a registered, active user
--   mo_guild = <uuid>   the user's active guild, when there is one
--   mo_staff = '1'      an administrator with a staff session and confirmed TOTP
-- The claims are fixed until the token expires (10 minutes), so a change of guild reaches the
-- channel at the next token.
create policy "map positions are read by claim"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      (realtime.topic() = 'map:pos:all' and (auth.jwt() ->> 'mo_map') = '1')
      or (realtime.topic() = 'map:pos:guild:' || (auth.jwt() ->> 'mo_guild'))
      or (realtime.topic() = 'map:pos:admin' and (auth.jwt() ->> 'mo_staff') = '1')
    )
  );
