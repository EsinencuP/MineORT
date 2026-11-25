create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post','event','project','guild')),
  target_id uuid not null,
  author_id uuid not null references public.users(id),
  parent_id uuid references public.community_comments(id),
  body text not null check (length(btrim(body)) between 1 and 1500),
  pinned boolean not null default false,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index community_comments_thread_idx on public.community_comments(target_type, target_id, created_at, id)
  where hidden_at is null;

create table public.community_thread_reads (
  user_id uuid not null references public.users(id),
  target_type text not null,
  target_id uuid not null,
  read_at timestamptz not null default now(),
  primary key(user_id, target_type, target_id)
);

create table public.community_follows (
  user_id uuid not null references public.users(id),
  target_type text not null check (target_type in ('author','guild','project')),
  target_id uuid not null,
  primary key(user_id, target_type, target_id)
);
create index community_follows_target_idx on public.community_follows(target_type, target_id, user_id);

create table public.community_bookmarks (
  user_id uuid not null references public.users(id),
  target_type text not null check (target_type in ('post','media','marker')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(user_id, target_type, target_id)
);

create table public.map_collections (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id),
  title text not null check (length(btrim(title)) between 3 and 80),
  description text not null default '' check (length(description)<=500),
  visibility text not null check (visibility in ('public','private')),
  marker_ids uuid[] not null check (cardinality(marker_ids) between 1 and 24),
  created_at timestamptz not null default now()
);
create index map_collections_recent_idx on public.map_collections(created_at desc);

alter table public.posts
  add column linked_type text check (linked_type in ('marker','event','project','guild','collection')),
  add column linked_id uuid,
  add column cover_media_id uuid references public.media(id) on delete set null,
  add constraint posts_link_check check ((linked_type is null) = (linked_id is null));

alter table public.reactions drop constraint reactions_kind_check;
alter table public.reactions add constraint reactions_kind_check check (kind in ('like','fire','build','wow'));
alter table public.moderation_reports drop constraint moderation_reports_target_type_check;
alter table public.moderation_reports add constraint moderation_reports_target_type_check
  check (target_type in ('post','media','marker','comment','sms'));

create function public.media_soft_delete_everywhere(p_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.media where id=p_id for update;
  if not found then return; end if;
  delete from public.media_attachments where media_id=p_id;
  update public.posts set cover_media_id=null where cover_media_id=p_id;
  update public.projects set cover_media_id=null where cover_media_id=p_id;
  update public.media set deleted_at=now(), purge_after=now()+interval '30 days'
    where id=p_id and deleted_at is null;
end $$;

create function public.media_release_unused(p_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare mid uuid;
begin
  for mid in select id from public.media where id=any(p_ids) and deleted_at is null order by id for update loop
    if not exists(select 1 from public.media_attachments where media_id=mid)
      and not exists(select 1 from public.projects where cover_media_id=mid and status<>'cancelled')
      then update public.media set deleted_at=now(),purge_after=now()+interval '30 days' where id=mid; end if;
  end loop;
end $$;

create function public.media_assert_live_attachment() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.media where id=new.media_id and deleted_at is null for share;
  if not found then raise exception 'media_not_found'; end if;
  return new;
end $$;
create trigger media_attachment_live before insert or update of media_id on public.media_attachments
  for each row execute function public.media_assert_live_attachment();

create table public.sms_preferences (
  user_id uuid primary key references public.users(id),
  receive_mode text not null default 'limited' check (receive_mode in ('all','limited','none'))
);
create table public.sms_contacts (
  owner_id uuid not null references public.users(id),
  contact_id uuid not null references public.users(id),
  relation text not null check (relation in ('block','allow')),
  check (owner_id <> contact_id),
  primary key(owner_id, contact_id, relation)
);
create table public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users(id),
  recipient_id uuid not null references public.users(id),
  operation_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 300),
  gateway text not null check (gateway in ('minecraft','site','telegram')),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  unique(sender_id, operation_id)
);
create index sms_messages_recipient_idx on public.sms_messages(recipient_id, created_at desc);
create index sms_messages_sender_idx on public.sms_messages(sender_id, created_at desc);

create table public.sms_reply_tokens (
  token uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.community_notifications(id) on delete cascade,
  user_id uuid not null references public.users(id),
  prompt_id bigint,
  expires_at timestamptz not null default now() + interval '30 minutes',
  consumed_at timestamptz
);
create unique index sms_reply_prompt_idx on public.sms_reply_tokens(user_id, prompt_id) where prompt_id is not null;

create table public.game_stat_batches (
  server_id uuid not null references public.bridge_servers(id),
  event_id uuid not null,
  user_id uuid not null references public.users(id),
  occurred_at timestamptz not null,
  primary key(server_id, event_id)
);
create table public.game_stat_daily (
  user_id uuid not null references public.users(id),
  day date not null,
  metric text not null,
  value bigint not null check (value >= 0),
  primary key(user_id, day, metric)
);
create table public.game_achievements (
  user_id uuid not null references public.users(id),
  code text not null,
  earned_at timestamptz not null default now(),
  primary key(user_id, code)
);
create table public.game_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  metrics text[] not null,
  check (starts_on < ends_on)
);

create table public.game_discovered_regions (
  user_id uuid not null references public.users(id),
  dim text not null check (dim in ('overworld','nether')),
  rx integer not null check (rx between -58594 and 58594),
  rz integer not null check (rz between -58594 and 58594),
  discovered_at timestamptz not null,
  primary key(user_id, dim, rx, rz)
);

alter table public.events add column project_id uuid references public.projects(id) on delete set null;
create table public.event_contributions (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id),
  need_id uuid not null references public.project_needs(id) on delete cascade,
  planned integer not null check (planned between 1 and 100000),
  confirmed integer check (confirmed between 1 and 100000),
  confirmed_at timestamptz,
  primary key(event_id,user_id,need_id)
);

do $$
declare t text;
begin
  foreach t in array array['community_comments','community_thread_reads','community_follows',
    'community_bookmarks','sms_preferences','sms_contacts','sms_messages','sms_reply_tokens',
    'game_stat_batches','game_stat_daily','game_achievements','game_seasons','game_discovered_regions',
    'event_contributions','map_collections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

create function public.community_thread_visible(uid uuid, p_type text, tid uuid)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(case p_type
    when 'post' then exists (select 1 from public.posts p where p.id = tid and p.deleted_at is null
      and p.moderation_status = 'approved' and (
        (p.visibility = 'public' and (uid is not null or p.kind = 'news')) or
        (p.visibility = 'private' and p.author_id = uid and exists (
          select 1 from public.users u where u.id = uid and u.account_status = 'active' and
            (u.site_role in ('admin','moderator') or exists (
              select 1 from public.access_memberships a where a.user_id = uid and a.status = 'approved'))))))
    when 'event' then exists (select 1 from public.events e where e.id = tid and public.event_visible(uid,e))
    when 'project' then uid is not null and exists (select 1 from public.projects p where p.id = tid and p.status <> 'cancelled')
    when 'guild' then exists (select 1 from public.guilds g
      join public.guild_members gm on gm.guild_id = g.id and gm.status = 'active' and gm.user_id = uid
      join public.access_memberships a on a.user_id = uid and a.status = 'approved'
      where g.id = tid and g.status = 'active')
    else false end, false)
$$;

create function public.community_add_comment(p_user uuid, p_type text, p_target uuid, p_body text, p_parent uuid,
  p_mentions text[], p_pinned boolean)
returns uuid language plpgsql set search_path = '' as $$
declare cid uuid;
declare parent_user uuid;
declare recipient uuid;
begin
  perform public.assert_member_or_staff(p_user);
  if not public.community_thread_visible(p_user, p_type, p_target) then raise exception 'thread_not_found'; end if;
  if not public.hit_rate_limit('comment:' || p_user::text, 60, 8) then raise exception 'post_rate_limited'; end if;
  if p_parent is not null then
    select author_id into parent_user from public.community_comments
      where id = p_parent and target_type = p_type and target_id = p_target and hidden_at is null;
    if not found then raise exception 'thread_not_found'; end if;
  end if;
  if p_pinned and (p_type <> 'guild' or not exists (select 1 from public.guild_members
    where guild_id = p_target and user_id = p_user and status = 'active' and rank_level >= 5))
    then raise exception 'forbidden'; end if;
  insert into public.community_comments(target_type,target_id,author_id,parent_id,body,pinned)
    values(p_type,p_target,p_user,p_parent,p_body,p_pinned) returning id into cid;
  for recipient in
    select distinct r.uid from (
      select parent_user as uid
      union all
      select author_id from public.posts where p_type = 'post' and id = p_target
      union all
      select organizer_id from public.events where p_type = 'event' and id = p_target
      union all
      select author_id from public.projects where p_type = 'project' and id = p_target
      union all
      select user_id from public.minecraft_identities where lower(nickname) = any(p_mentions)
        and binding_status = 'confirmed'
    ) r where r.uid <> p_user and public.community_thread_visible(r.uid, p_type, p_target)
  loop
    perform public.queue_community_notification(recipient, 'social', 'comment_reply', 'comment', cid, 'comment:' || cid::text);
  end loop;
  return cid;
end $$;

create function public.community_followed_posts(p_user uuid)
returns setof public.posts language sql stable set search_path = '' as $$
  select p.* from public.posts p where public.community_thread_visible(p_user, 'post', p.id) and exists (
    select 1 from public.community_follows f where f.user_id = p_user
      and ((f.target_type = 'author' and f.target_id = p.author_id)
        or (f.target_type = p.linked_type and f.target_id = p.linked_id)))
  order by p.created_at desc, p.id desc
$$;

create function public.community_react(p_user uuid, p_post uuid, p_kind text)
returns void language plpgsql set search_path = '' as $$
declare owner_id uuid;
begin
  if not public.community_thread_visible(p_user,'post',p_post) then raise exception 'post_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || p_post::text, 0));
  delete from public.reactions where post_id = p_post and user_id = p_user and kind = p_kind;
  if found then return; end if;
  insert into public.reactions(post_id,user_id,kind) values(p_post,p_user,p_kind);
  select author_id into owner_id from public.posts where id = p_post;
  if owner_id <> p_user then
    perform public.queue_community_notification(owner_id,'social','post_reactions','post',p_post,
      concat('reaction:',p_post,':',current_date));
  end if;
end $$;

create function public.sms_allowed(sender uuid, recipient uuid)
returns boolean language sql stable set search_path = '' as $$
  select sender <> recipient
    and (select count(*) from public.minecraft_identities mi
      join public.users u on u.id = mi.user_id and u.account_status = 'active'
      join public.access_memberships a on a.user_id = mi.user_id and a.status = 'approved'
      where mi.user_id in (sender, recipient) and mi.binding_status = 'confirmed'
        and mi.game_identity = 'confirmed') = 2
    and not exists (select 1 from public.sms_contacts c where c.relation = 'block'
      and ((c.owner_id = sender and c.contact_id = recipient) or (c.owner_id = recipient and c.contact_id = sender)))
    and case coalesce((select receive_mode from public.sms_preferences where user_id = recipient), 'limited')
      when 'all' then true
      when 'limited' then exists (select 1 from public.sms_contacts
        where owner_id = recipient and contact_id = sender and relation = 'allow')
        or exists (select 1 from public.guild_members g1 join public.guild_members g2 using (guild_id)
          join public.guilds g on g.id = g1.guild_id and g.status = 'active'
          where g1.user_id = sender and g2.user_id = recipient and g1.status = 'active' and g2.status = 'active')
      else false end
$$;

create function public.sms_send(p_sender uuid,p_to text,p_body text,p_operation uuid,p_source text,
  p_user_limit integer,p_recipient_limit integer,p_pair_limit integer,p_reply uuid default null)
returns uuid language plpgsql set search_path = '' as $$
declare recipient uuid;
declare mid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_sender::text || p_operation::text, 1));
  select id into mid from public.sms_messages where sender_id=p_sender and operation_id=p_operation;
  if found then return mid; end if;
  if p_reply is not null then
    select m.sender_id into recipient from public.sms_reply_tokens r
      join public.community_notifications n on n.id=r.notification_id and n.target_type='sms'
      join public.sms_messages m on m.id=n.target_id and m.recipient_id=r.user_id
      where r.token=p_reply and r.user_id=p_sender and r.consumed_at is null and r.expires_at>now()
      for update of r;
    if not found then raise exception 'sms_reply_expired'; end if;
  else
    select user_id into recipient from public.minecraft_identities where lower(nickname)=lower(p_to)
      and binding_status='confirmed' and game_identity='confirmed';
  end if;
  if recipient is null or not public.sms_allowed(p_sender,recipient) then raise exception 'sms_unavailable'; end if;
  if not public.hit_rate_limit('sms:sender:'||p_sender::text,60,p_user_limit)
    or not public.hit_rate_limit('sms:recipient:'||recipient::text,60,p_recipient_limit)
    or not public.hit_rate_limit('sms:pair:'||p_sender::text||':'||recipient::text,60,p_pair_limit)
    then raise exception 'sms_rate_limited'; end if;
  insert into public.sms_messages(sender_id,recipient_id,operation_id,body,gateway)
    values(p_sender,recipient,p_operation,p_body,p_source) returning id into mid;
  if p_reply is not null then update public.sms_reply_tokens set consumed_at=now() where token=p_reply; end if;
  perform public.queue_community_notification(recipient,'game','sms','sms',mid,'sms:'||mid::text);
  return mid;
end $$;

create function public.game_record_stats(p_server uuid,p_event uuid,p_user uuid,p_time timestamptz,p_values jsonb,
  p_regions jsonb default '[]')
returns boolean language plpgsql set search_path = '' as $$
declare day_key date := (p_time at time zone 'UTC')::date;
declare explored integer;
begin
  insert into public.game_stat_batches(server_id,event_id,user_id,occurred_at)
    values(p_server,p_event,p_user,p_time) on conflict do nothing;
  if not found then return false; end if;
  insert into public.game_stat_daily(user_id,day,metric,value)
    select p_user,day_key,key,value::bigint from jsonb_each_text(p_values) where key <> 'discovered_regions' order by key
    on conflict(user_id,day,metric) do update set value=game_stat_daily.value+excluded.value;
  insert into public.game_discovered_regions(user_id,dim,rx,rz,discovered_at)
    select p_user,r.dim,r.rx,r.rz,p_time from jsonb_to_recordset(p_regions) as r(dim text,rx integer,rz integer)
    order by r.dim,r.rx,r.rz on conflict do nothing;
  get diagnostics explored = row_count;
  if explored > 0 then
    insert into public.game_stat_daily(user_id,day,metric,value) values(p_user,day_key,'discovered_regions',explored)
      on conflict(user_id,day,metric) do update set value=game_stat_daily.value+excluded.value;
    perform public.game_check_cartographer(p_user);
  end if;
  return true;
end $$;

create function public.game_award(p_user uuid,p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  insert into public.game_achievements(user_id,code) values(p_user,p_code) on conflict do nothing;
  if found then
    perform public.queue_community_notification(p_user,'progress','achievement','progress',p_user,'achievement:'||p_code);
  end if;
end $$;

create function public.game_check_cartographer(p_user uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.map_markers m join public.game_discovered_regions r
    on r.user_id=m.author_id and r.dim=m.dim and r.rx=floor(m.x::numeric/512) and r.rz=floor(m.z::numeric/512)
    where m.author_id=p_user and m.visibility='public' and m.moderation_status='approved' and m.deleted_at is null)
    then perform public.game_award(p_user,'cartographer'); end if;
end $$;

create function public.raid_contribution(p_user uuid,p_event uuid,p_player uuid,p_need uuid,p_quantity integer,p_confirm boolean)
returns void language plpgsql set search_path = '' as $$
declare e public.events;
declare n public.project_needs;
declare c public.event_contributions;
begin
  perform public.assert_member_or_staff(p_user);
  select * into e from public.events where id=p_event for update;
  if not found or e.cancelled_at is not null or e.project_id is null or not public.event_visible(p_user,e)
    then raise exception 'event_not_found'; end if;
  if not exists (select 1 from public.event_attendees where event_id=e.id and user_id=p_player)
    then raise exception 'event_forbidden'; end if;
  select * into n from public.project_needs where id=p_need and project_id=e.project_id for update;
  if not found then raise exception 'event_invalid'; end if;
  if p_confirm then
    if e.organizer_id<>p_user or e.starts_at>now() then raise exception 'event_forbidden'; end if;
    select * into c from public.event_contributions
      where event_id=e.id and user_id=p_player and need_id=p_need for update;
    if not found then raise exception 'event_invalid'; end if;
    if c.confirmed_at is not null then return; end if;
    update public.event_contributions set confirmed=p_quantity, confirmed_at=now()
      where event_id=e.id and user_id=p_player and need_id=p_need;
    update public.project_needs set quantity_done=quantity_done+p_quantity,
      done=done or (quantity_needed is not null and quantity_done+p_quantity>=quantity_needed)
      where id=p_need;
    perform public.game_award(p_player,'raid_contribution');
    perform public.queue_community_notification(p_player,'guilds','raid_contribution','event',e.id,
      concat('event:',e.id,':contribution:',p_need));
  elsif p_player=p_user and e.starts_at>now() then
    insert into public.event_contributions(event_id,user_id,need_id,planned)
      values(e.id,p_user,p_need,p_quantity)
      on conflict(event_id,user_id,need_id) do update set planned=excluded.planned
      where event_contributions.confirmed_at is null;
  else raise exception 'event_forbidden';
  end if;
end $$;

create function public.create_raid_event(p_user uuid,p_title text,p_description text,p_starts_at timestamptz,
  p_duration integer,p_tz text,p_place text,p_category text,p_seats integer,p_visibility text,
  p_guild uuid,p_marker uuid,p_project uuid)
returns uuid language plpgsql set search_path = '' as $$
declare eid uuid;
begin
  if not exists (select 1 from public.projects where id=p_project and author_id=p_user
    and status in ('recruiting','in_progress')) then raise exception 'event_project_forbidden'; end if;
  eid := public.create_calendar_event(p_user,p_title,p_description,p_starts_at,p_duration,p_tz,
    p_place,p_category,p_seats,p_visibility,p_guild,p_marker);
  update public.events set project_id=p_project where id=eid;
  return eid;
end $$;

create function public.game_totals(p_user uuid)
returns table(metric text, value bigint) language sql stable set search_path = '' as $$
  select d.metric, sum(d.value)::bigint from public.game_stat_daily d
    where d.user_id = p_user group by d.metric
$$;

create function public.game_season_ranks(p_season uuid)
returns table(metric text, user_id uuid, value bigint, place bigint)
language sql stable set search_path = '' as $$
  with totals as (
    select d.metric, d.user_id, sum(d.value)::bigint as value
    from public.game_stat_daily d join public.game_seasons s on s.id = p_season
    join public.users u on u.id = d.user_id and u.account_status = 'active'
    where d.day >= s.starts_on and d.day < s.ends_on and d.metric = any(s.metrics)
    group by d.metric,d.user_id
  ), ranks as (
    select t.*, row_number() over(partition by t.metric order by t.value desc,t.user_id) as place from totals t
  )
  select r.metric,r.user_id,r.value,r.place from ranks r where r.place <= 5
  order by r.metric,r.place
$$;

create function public.claim_game_deliveries(p_user uuid)
returns table(notification_id uuid, lease_id uuid, item jsonb)
language sql set search_path = '' as $$
  with due as (
    select d.notification_id from public.notification_deliveries d
    join public.community_notifications n on n.id = d.notification_id
    where d.channel = 'minecraft' and d.next_attempt_at <= now() and n.user_id = p_user
      and d.delivered_at is null and d.stopped_at is null and n.removed_at is null
    order by d.next_attempt_at, d.notification_id limit 20 for update of d skip locked
  ), leased as (
    update public.notification_deliveries d set lease_id = gen_random_uuid(),
      attempts = d.attempts + 1, next_attempt_at = now() + interval '30 seconds'
    from due where d.notification_id = due.notification_id and d.channel = 'minecraft'
    returning d.notification_id,d.lease_id
  )
  select l.notification_id,l.lease_id,to_jsonb(n)
    from public.community_notifications n join leased l on l.notification_id = n.id
$$;

create function public.finish_game_delivery(p_user uuid,p_notification uuid,p_lease uuid,p_delivered boolean)
returns void language sql set search_path = '' as $$
  update public.notification_deliveries d set delivered_at = case when p_delivered then now() else null end,
    stopped_at = case when p_delivered then null else now() end, lease_id = null
  from public.community_notifications n
  where n.id=d.notification_id and n.user_id=p_user and n.id=p_notification
    and d.lease_id=p_lease and d.channel='minecraft' and d.delivered_at is null and d.stopped_at is null
$$;

do $$
declare f text;
begin
  foreach f in array array['community_thread_visible(uuid,text,uuid)',
    'media_soft_delete_everywhere(uuid)','media_release_unused(uuid[])','media_assert_live_attachment()',
    'community_add_comment(uuid,text,uuid,text,uuid,text[],boolean)','community_followed_posts(uuid)',
    'community_react(uuid,uuid,text)','sms_allowed(uuid,uuid)','sms_send(uuid,text,text,uuid,text,integer,integer,integer,uuid)',
    'game_record_stats(uuid,uuid,uuid,timestamptz,jsonb,jsonb)','game_award(uuid,text)','game_check_cartographer(uuid)',
    'raid_contribution(uuid,uuid,uuid,uuid,integer,boolean)','game_totals(uuid)',
    'create_raid_event(uuid,text,text,timestamptz,integer,text,text,text,integer,text,uuid,uuid,uuid)',
    'game_season_ranks(uuid)','claim_game_deliveries(uuid)','finish_game_delivery(uuid,uuid,uuid,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
