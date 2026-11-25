-- A viewer can follow their own current position with guild-only visibility
-- and no guild. The normal audience rules govern every other viewer.
create function public.map_live_player_audience()
returns table(
  session_id uuid, guild_id uuid, staff boolean, show_coordinates boolean, player_nickname text
)
language sql stable set search_path = '' as $$
  select a.session_id, a.guild_id, a.staff, a.show_coordinates, mi.nickname
  from public.map_live_position_audience() a
  join public.user_sessions s on s.id = a.session_id
  left join public.minecraft_identities mi on mi.user_id = s.user_id
    and mi.binding_status = 'confirmed' and mi.game_identity = 'confirmed'
$$;

revoke all on function public.map_live_player_audience() from public, anon, authenticated;
grant execute on function public.map_live_player_audience() to service_role;
