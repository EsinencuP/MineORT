-- Integration fixtures are rolled back, so this can run on a freshly migrated test database.
begin;

do $$
#variable_conflict use_variable
declare organizer uuid := gen_random_uuid();
declare first_player uuid := gen_random_uuid();
declare next_player uuid := gen_random_uuid();
declare first_game uuid := gen_random_uuid();
declare next_game uuid := gen_random_uuid();
declare guild uuid;
declare guild_rank uuid;
declare event_id uuid;
declare closed_event uuid;
declare post_id uuid;
declare comment_id uuid;
declare sms_id uuid;
declare sms_operation uuid := gen_random_uuid();
declare server uuid;
declare stat_operation uuid := gen_random_uuid();
declare map_session uuid;
declare project uuid;
declare need uuid;
declare raid uuid;
declare fixture_media uuid;
declare start_at timestamptz := now() + interval '2 days';
begin
  insert into public.users(id,display_name) values
    (organizer,'Organizer'),(first_player,'First'),(next_player,'Next');
  insert into public.access_memberships(user_id,status) values
    (organizer,'approved'),(first_player,'approved'),(next_player,'approved');
  insert into public.minecraft_identities(user_id,nickname,mc_uuid,binding_status,game_identity)
    values (first_player,'MineFirst',first_game,'confirmed','confirmed'),
      (next_player,'MineNext',next_game,'confirmed','confirmed');

  event_id := public.create_calendar_event(organizer,'Public raid','Event',start_at,60,'UTC','','build',1,'public',null,null);
  begin
    perform public.event_signup(first_player,event_id,'join',false,900);
    raise exception 'test: a full event accepted a signup';
  exception when raise_exception then
    if sqlerrm <> 'event_full' then raise; end if;
  end;
  perform public.event_signup(first_player,event_id,'waitlist',false,900);
  perform public.event_signup(next_player,event_id,'waitlist',false,900);
  perform public.event_signup(organizer,event_id,'leave',false,900);
  if not exists(select 1 from public.event_waitlist w where w.event_id=event_id and w.user_id=first_player and offered_until>now()) then
    raise exception 'test: first player did not receive the reservation';
  end if;
  update public.event_waitlist w set offered_until=now()-interval '1 second' where w.event_id=event_id and w.user_id=first_player;
  perform public.event_maintain_waitlists(900);
  perform public.event_signup(next_player,event_id,'confirm',false,900);
  if (select attendees from public.event_signup_summary(array[event_id],next_player)) <> 1 then
    raise exception 'test: reservation changed capacity';
  end if;
  update public.events set starts_at=start_at+interval '3 hours' where id=event_id;
  if (select calendar_sequence from public.events where id=event_id) <> 1 or
     (select count(*) from public.community_notifications n where n.user_id=next_player and n.target_id=event_id and n.kind='event_rescheduled') <> 1 then
    raise exception 'test: reschedule did not produce a single calendar revision and notification';
  end if;
  if not exists(select 1 from public.notification_deliveries d join public.community_notifications n on n.id=d.notification_id
    where n.target_id=event_id and n.kind='event_rescheduled' and d.channel='telegram') then
    raise exception 'test: missing Telegram outbox row';
  end if;
  update public.events set cancelled_at=now() where id=event_id;
  if exists(select 1 from public.community_notifications n
    where n.target_id=event_id and n.kind='event_reminder' and n.removed_at is null and n.due_at>now()) then
    raise exception 'test: cancellation left live reminders';
  end if;

  insert into public.guilds(slug,name,tag,created_by) values ('community-fixture','Fixture guild','MORT',organizer) returning id into guild;
  insert into public.guild_ranks(guild_id,level,name) values (guild,2,'Member') returning id into guild_rank;
  insert into public.guild_members(guild_id,user_id,rank_id) values (guild,first_player,guild_rank);
  closed_event := public.create_calendar_event(organizer,'Guild raid','Guild only',start_at,60,'UTC','','build',null,'guild',guild,null);
  perform public.event_signup(first_player,closed_event,'join',false,900);
  if (select count(*) from public.read_events(first_player,false,null,null,closed_event,true)) <> 1 or
     exists(select 1 from public.read_events(null,false,null,null,closed_event,false)) then
    raise exception 'test: incorrect guild event audience';
  end if;
  insert into public.user_sessions(user_id,token_hash,expires_at) values (first_player,'community-fixture-token',now()+interval '1 hour') returning id into map_session;
  insert into public.map_live_watches(session_id) values (map_session);
  if not exists(select 1 from public.map_live_audience() a where a.session_id=map_session and a.guild_id=guild) then
    raise exception 'test: active guild session missing from position audience';
  end if;
  update public.guild_members set status='removed',ended_at=now() where guild_id=guild and user_id=first_player;
  if exists(select 1 from public.read_events(first_player,false,null,null,closed_event,true)) or
     exists(select 1 from public.map_live_audience() a where a.session_id=map_session and a.guild_id is not null) then
    raise exception 'test: guild removal did not revoke calendar and map audience';
  end if;
  update public.user_sessions set revoked_at=now() where id=map_session;
  if exists(select 1 from public.map_live_audience() a where a.session_id=map_session) then
    raise exception 'test: revoked session still receives live positions';
  end if;

  insert into public.posts(author_id,body,visibility) values (first_player,'Private', 'private') returning id into post_id;
  if public.community_thread_visible(next_player,'post',post_id) then raise exception 'test: private discussion leaked'; end if;
  update public.posts set visibility='public' where id=post_id;
  comment_id := public.community_add_comment(next_player,'post',post_id,'Hello @MineFirst',null,array['minefirst'],false);
  if (select count(*) from public.community_notifications where target_id=comment_id and user_id=first_player) <> 1 then
    raise exception 'test: mention and reply created duplicate notifications';
  end if;

  insert into public.sms_preferences(user_id,receive_mode) values (next_player,'all');
  sms_id := public.sms_send(first_player,'MineNext','Hello',sms_operation,'minecraft',8,18,5);
  if public.sms_send(first_player,'MineNext','Hello',sms_operation,'minecraft',8,18,5) <> sms_id or
     (select count(*) from public.sms_messages where operation_id=sms_operation) <> 1 then
    raise exception 'test: SMS retries duplicated the message';
  end if;
  insert into public.sms_contacts(owner_id,contact_id,relation) values (next_player,first_player,'block');
  if public.sms_allowed(first_player,next_player) then raise exception 'test: SMS block did not revoke delivery'; end if;
  insert into public.telegram_identities(user_id,telegram_id) values (next_player,12345);
  insert into public.telegram_bot_links(user_id,code_hash,code_expires_at,code_source)
    values (next_player,'mineort-isolated-code',now()+interval '1 minute','minecraft');
  if public.confirm_game_bot(first_player,'mineort-isolated-code') or
     not public.confirm_game_bot(next_player,'mineort-isolated-code') then
    raise exception 'test: link code not correctly bound to a player';
  end if;
  if public.confirm_game_bot(next_player,'mineort-isolated-code') then raise exception 'test: link code replay succeeded'; end if;

  insert into public.bridge_servers(name) values ('MineOrt local test') returning id into server;
  if not public.game_record_stats(server,stat_operation,first_player,now(),'{"walked_blocks":42}'::jsonb) then
    raise exception 'test: stats batch rejected';
  end if;
  if public.game_record_stats(server,stat_operation,first_player,now(),'{"walked_blocks":42}'::jsonb) or
     (select value from public.game_totals(first_player) where metric='walked_blocks') <> 42 then
    raise exception 'test: stats batch counted twice';
  end if;

  insert into public.projects(author_id,title) values (organizer,'Local build') returning id into project;
  insert into public.project_needs(project_id,title,quantity_needed) values (project,'Stone',5) returning id into need;
  raid := public.create_raid_event(organizer,'Building raid','',start_at,60,'UTC','','build',null,'public',null,null,project);
  perform public.event_signup(first_player,raid,'join',false,900);
  perform public.raid_contribution(first_player,raid,first_player,need,5,false);
  update public.events set starts_at=now()-interval '2 hours' where id=raid;
  perform public.raid_contribution(organizer,raid,first_player,need,5,true);
  perform public.raid_contribution(organizer,raid,first_player,need,5,true);
  if (select quantity_done from public.project_needs where id=need) <> 5 or
     not exists(select 1 from public.game_achievements where user_id=first_player and code='raid_contribution') then
    raise exception 'test: duplicate contribution or missing achievement';
  end if;

  insert into public.media(uploader_id,storage_key,visibility,bytes,width,height)
    values (first_player,'fixture.webp','public',100,80,80) returning id into fixture_media;
  insert into public.media_attachments(media_id,target_type,target_id) values(fixture_media,'post',post_id);
  perform public.media_release_unused(array[fixture_media]);
  if (select deleted_at from public.media where id=fixture_media) is not null then
    raise exception 'test: attached media marked for purge';
  end if;
  perform public.media_soft_delete_everywhere(fixture_media);
  if exists(select 1 from public.media_attachments where media_id=fixture_media) or
     not exists(select 1 from public.media where id=fixture_media and deleted_at is not null and purge_after>now()) then
    raise exception 'test: media visibility was not revoked before purge';
  end if;
end $$;

rollback;
