begin;

do $$
declare
  walker uuid := gen_random_uuid();
  watcher uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  moderator uuid := gen_random_uuid();
  moderator_session uuid := gen_random_uuid();
  player_uuid uuid := gen_random_uuid();
  game_server uuid;
  trail_guild uuid;
  member_rank uuid;
  sample jsonb;
  history jsonb;
  baseline timestamptz := now();
begin
  insert into public.users(id,display_name,site_role) values
    (walker,'Walker','player'),(watcher,'Watcher','player'),
    (outsider,'Outsider','player'),(moderator,'Moderator','moderator');
  insert into public.access_memberships(user_id,status) values
    (walker,'approved'),(watcher,'approved'),(outsider,'approved');
  insert into public.minecraft_identities(user_id,nickname,mc_uuid,binding_status,game_identity)
    values (walker,'TrailWalker',player_uuid,'confirmed','confirmed');
  insert into public.bridge_servers(name) values ('Trail fixture') returning id into game_server;

  sample := jsonb_build_array(jsonb_build_object(
    'uuid',player_uuid,'dim','overworld','x',0,'y',64,'z',0));
  perform public.map_record_trails(game_server, sample);
  perform public.map_record_trails(game_server, jsonb_set(sample, '{0,x}', '1.9'));
  if (select count(*) from public.map_trail_points where server_id = game_server) <> 1 then
    raise exception 'trail: accepted a sample under two blocks and five seconds';
  end if;
  sample := jsonb_set(sample, '{0,x}', '2');
  perform public.map_record_trails(game_server, sample);
  if (select count(*) from public.map_trail_points where server_id = game_server) <> 2 then
    raise exception 'trail: did not accept movement of exactly two blocks';
  end if;
  update public.map_trail_points set recorded_at = recorded_at - interval '5 seconds'
    where server_id = game_server;
  perform public.map_record_trails(game_server, sample);
  if (select count(*) from public.map_trail_points where server_id = game_server) <> 3 then
    raise exception 'trail: did not accept a stationary point after five seconds';
  end if;
  perform public.map_record_trails(game_server, jsonb_set(sample, '{0,x}', '103'));
  if (select count(distinct segment_at) from public.map_trail_points where server_id = game_server) <> 2 then
    raise exception 'trail: did not start a new segment after a teleport';
  end if;
  perform public.map_record_trails(game_server, jsonb_set(sample, '{0,dim}', '"nether"'));
  if not exists(select 1 from public.map_trail_points where server_id = game_server and dim = 'nether') then
    raise exception 'trail: did not store dimension change';
  end if;

  delete from public.map_trail_points where server_id = game_server;
  insert into public.guilds(slug,name,tag,created_by) values
    ('trail-fixture','Trail guild','TRLS',walker) returning id into trail_guild;
  insert into public.guild_ranks(guild_id,level,name) values
    (trail_guild,2,'Member') returning id into member_rank;
  insert into public.guild_members(guild_id,user_id,rank_id) values
    (trail_guild,walker,member_rank),(trail_guild,watcher,member_rank);
  insert into public.privacy_settings(user_id,map_visibility) values (walker,'guild');
  insert into public.map_trail_points
    (server_id,user_id,recorded_at,segment_at,dim,x,y,z,visibility,guild_id)
    select game_server,walker,baseline-age,baseline-interval '33 minutes','overworld',x,64,0,'guild',trail_guild
    from (values
      (interval '32 minutes 1 second',1),
      (interval '32 minutes',2),
      (interval '30 minutes',3),
      (interval '2 minutes',4),
      (interval '1 minute 59 seconds',5),
      (interval '1 second',6),
      (interval '8 days',7)
    ) as samples(age,x);

  history := public.map_read_trails(watcher,false,'overworld');
  if history #> '{tracks,0,points}' is distinct from '[[2,0],[3,0],[4,0]]'::jsonb then
    raise exception 'trail: peer window mismatch: %', history;
  end if;
  history := public.map_read_trails(walker,false,'overworld');
  if history #> '{tracks,0,points}' is distinct from '[[3,0],[4,0],[5,0],[6,0]]'::jsonb
    or history #>> '{tracks,0,mine}' is distinct from 'true' then
    raise exception 'trail: own window mismatch: %', history;
  end if;
  if public.map_read_trails(outsider,false,'overworld')->'tracks' is distinct from '[]'::jsonb then
    raise exception 'trail: outsiders received restricted guild points';
  end if;
  update public.privacy_settings set map_visibility = 'all' where user_id = walker;
  if public.map_read_trails(outsider,false,'overworld')->'tracks' is distinct from '[]'::jsonb then
    raise exception 'trail: widening visibility revealed points originally captured as guild only';
  end if;
  update public.guild_members set status = 'left', ended_at = now()
    where guild_id = trail_guild and user_id = watcher;
  if public.map_read_trails(watcher,false,'overworld')->'tracks' is distinct from '[]'::jsonb then
    raise exception 'trail: the former guild member still received restricted points';
  end if;
  if public.map_read_trails(moderator,true,'overworld') #> '{tracks,0,points}'
    is distinct from '[[2,0],[3,0],[4,0]]'::jsonb then
    raise exception 'trail: staff window mismatch';
  end if;
  if public.map_read_recent_own_path(walker,'overworld') is distinct from '[[[4,0],[5,0],[6,0]]]'::jsonb
    or public.map_read_recent_own_path(outsider,'overworld') is distinct from '[]'::jsonb
    or public.map_read_recent_own_path(walker,'nether') is distinct from '[]'::jsonb then
    raise exception 'saved paths must include only the player''s points from the last five minutes';
  end if;
  if public.map_purge_trails() <> 1 or
    (select count(*) from public.map_trail_points where server_id = game_server) <> 6 then
    raise exception 'trail: retention cleanup did not remove only expired points';
  end if;

  insert into public.user_sessions(id,user_id,token_hash,is_admin_session,expires_at)
    values (moderator_session,moderator,moderator_session::text,true,now()+interval '10 minutes');
  insert into public.map_live_watches(session_id) values (moderator_session);
  if exists(select 1 from public.map_live_position_audience() where session_id = moderator_session) then
    raise exception 'live audience: moderator without TOTP confirmation gained access';
  end if;
  insert into public.admin_totp(user_id,secret_enc,confirmed_at)
    values (moderator,'fixture',now());
  if not exists(select 1 from public.map_live_position_audience()
    where session_id = moderator_session and staff and not show_coordinates) then
    raise exception 'live audience: verified moderator was excluded';
  end if;
  if exists(select 1 from public.map_live_audience() where session_id = moderator_session and staff) then
    raise exception 'live audience: the previous endpoint would disclose admin coordinates';
  end if;
end
$$;

rollback;
