create or replace function public.community_player(p_uuid uuid)
returns table (user_id uuid, nickname text) language sql stable set search_path = '' as $$
  select mi.user_id, mi.nickname from public.minecraft_identities mi
    join public.users u on u.id = mi.user_id
    join public.access_memberships m on m.user_id = mi.user_id and m.status = 'approved'
  where mi.mc_uuid = p_uuid and mi.binding_status = 'confirmed'
    and mi.game_identity = 'confirmed' and u.account_status = 'active'
    and (select count(*) from public.minecraft_identities other where other.mc_uuid = p_uuid
      and other.binding_status = 'confirmed' and other.game_identity = 'confirmed') = 1
$$;

create or replace function public.create_game_marker(p_server uuid,p_event uuid,p_user uuid,p_time timestamptz,
  p_dim text,p_x integer,p_y integer,p_z integer,p_name text)
returns uuid language plpgsql set search_path = '' as $$
declare mid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_server::text || p_event::text, 2));
  select (payload->>'marker_id')::uuid into mid from public.server_events
    where server_id=p_server and event_id=p_event and type='marker.create_requested';
  if found then return mid; end if;
  if not public.hit_rate_limit('game-marker:'||p_user::text,3600,10)
    or (select count(*) from public.map_markers where author_id=p_user and deleted_at is null)>=100
    then raise exception 'marker_rate_limited'; end if;
  insert into public.map_markers(author_id,kind,dim,x,y,z,name,icon,visibility,moderation_status)
    values(p_user,'point',p_dim,p_x,p_y,p_z,p_name,'pin','private','approved') returning id into mid;
  insert into public.server_events(server_id,event_id,type,payload,occurred_at)
    values(p_server,p_event,'marker.create_requested',jsonb_build_object('marker_id',mid),p_time);
  return mid;
end $$;

revoke all on function public.community_player(uuid),
  public.create_game_marker(uuid,uuid,uuid,timestamptz,text,integer,integer,integer,text)
  from public, anon, authenticated;
grant execute on function public.community_player(uuid),
  public.create_game_marker(uuid,uuid,uuid,timestamptz,text,integer,integer,integer,text)
  to service_role;
