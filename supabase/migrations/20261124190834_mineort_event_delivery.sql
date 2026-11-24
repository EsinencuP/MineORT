-- MineOrt V: event audience, reservations and durable delivery.
alter table public.map_markers add column boundary jsonb
  check (boundary is null or (kind = 'label' and jsonb_typeof(boundary) = 'array'
    and jsonb_array_length(boundary) between 3 and 64));

alter table public.events
  add column visibility text not null default 'signed_in'
    check (visibility in ('public', 'signed_in', 'guild', 'private')),
  add column guild_id uuid references public.guilds(id),
  add column marker_id uuid references public.map_markers(id) on delete set null,
  add column calendar_sequence integer not null default 0,
  add column calendar_updated_at timestamptz,
  add constraint events_guild_visibility_check check ((visibility = 'guild') = (guild_id is not null));

create table public.event_calendar_tokens (
  user_id uuid primary key references public.users(id),
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create table public.event_waitlist (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id),
  queued_at timestamptz not null default clock_timestamp(),
  offered_until timestamptz,
  primary key (event_id, user_id)
);
create index event_waitlist_queue_idx on public.event_waitlist(event_id, queued_at, user_id);
create index event_waitlist_user_idx on public.event_waitlist(user_id, event_id);

create table public.event_invitations (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table public.notification_preferences (
  user_id uuid primary key references public.users(id),
  channels jsonb not null default '{}',
  reminder_minutes integer[] not null default '{1440,15}',
  timezone text not null default 'Europe/Chisinau',
  quiet_from time,
  quiet_to time,
  telegram_mode text not null default 'instant' check (telegram_mode in ('instant', 'digest')),
  check ((quiet_from is null) = (quiet_to is null))
);

create table public.notification_mutes (
  user_id uuid not null references public.users(id),
  scope text not null,
  primary key (user_id, scope)
);

create table public.telegram_bot_links (
  user_id uuid primary key references public.users(id),
  chat_id bigint unique,
  code_hash text unique,
  code_expires_at timestamptz,
  code_source text check (code_source in ('site','minecraft')),
  status text not null default 'pending' check (status in ('pending','connected','blocked'))
);

create table public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  kind text not null,
  category text not null,
  target_type text not null,
  target_id uuid not null,
  dedupe_key text not null,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  removed_at timestamptz,
  unique (user_id, dedupe_key)
);
create index community_notifications_inbox_idx on public.community_notifications(user_id, due_at desc)
  where removed_at is null;

create table public.notification_deliveries (
  notification_id uuid not null references public.community_notifications(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'minecraft')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null,
  lease_id uuid,
  delivered_at timestamptz,
  stopped_at timestamptz,
  primary key (notification_id, channel)
);
create index notification_deliveries_due_idx on public.notification_deliveries(channel, next_attempt_at)
  where delivered_at is null and stopped_at is null;

do $$
declare t text;
begin
  foreach t in array array['event_calendar_tokens','event_waitlist','event_invitations','notification_preferences',
    'notification_mutes','telegram_bot_links','community_notifications','notification_deliveries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

create function public.event_visible(p_user uuid, e public.events, p_staff boolean default false)
returns boolean language sql stable set search_path = '' as $$
  select case
    when p_staff then true
    when e.visibility = 'public' then true
    when p_user is null then false
    when e.visibility = 'signed_in' then true
    when e.visibility = 'private' then e.organizer_id = p_user or exists (
      select 1 from public.event_attendees a where a.event_id = e.id and a.user_id = p_user)
      or exists (select 1 from public.event_invitations i where i.event_id=e.id and i.user_id=p_user)
    when e.visibility = 'guild' then exists (
      select 1 from public.guild_members gm
      join public.guilds g on g.id = gm.guild_id and g.status = 'active'
      join public.access_memberships m on m.user_id = gm.user_id and m.status = 'approved'
      where gm.guild_id = e.guild_id and gm.user_id = p_user and gm.status = 'active')
    else false
  end
$$;

create function public.read_events(p_user uuid, p_staff boolean, p_from timestamptz default null,
  p_to timestamptz default null, p_id uuid default null, p_joined boolean default false)
returns setof public.events language sql stable set search_path = '' as $$
  select e.* from public.events e
  where (p_id is null or e.id = p_id)
    and (p_from is null or e.starts_at >= p_from)
    and (p_to is null or e.starts_at < p_to)
    and (not p_joined or exists (
      select 1 from public.event_attendees a where a.event_id = e.id and a.user_id = p_user))
    and public.event_visible(p_user, e, p_staff)
  order by e.starts_at, e.id
$$;

create function public.create_calendar_event(p_user uuid, p_title text, p_description text,
  p_starts_at timestamptz, p_duration integer, p_tz text, p_place text,
  p_category text, p_seats integer, p_visibility text, p_guild uuid, p_marker uuid)
returns uuid language plpgsql set search_path = '' as $$
declare eid uuid;
begin
  perform public.assert_member_or_staff(p_user);
  insert into public.events(organizer_id, title, description, starts_at, duration_minutes,
    organizer_tz, place, category, seats_limit, visibility, guild_id, marker_id)
  values (p_user, p_title, p_description, p_starts_at, p_duration,
    p_tz, p_place, p_category, p_seats, p_visibility, p_guild, p_marker)
  returning id into eid;
  insert into public.event_attendees(event_id, user_id) values(eid, p_user);
  return eid;
end $$;

create function public.event_signup_summary(p_ids uuid[], p_user uuid)
returns table(event_id uuid, attendees integer, joined boolean, reserved integer, waiting boolean, offered_until timestamptz)
language sql stable set search_path = '' as $$
  select e.id,
    (select count(*)::integer from public.event_attendees a where a.event_id = e.id),
    exists (select 1 from public.event_attendees a where a.event_id = e.id and a.user_id = p_user),
    (select count(*)::integer from public.event_waitlist w where w.event_id = e.id and w.offered_until > now()),
    exists (select 1 from public.event_waitlist w where w.event_id = e.id and w.user_id = p_user
      and (w.offered_until is null or w.offered_until > now())),
    (select w.offered_until from public.event_waitlist w where w.event_id = e.id and w.user_id = p_user and w.offered_until > now())
  from public.events e where e.id = any(p_ids)
$$;

create function public.queue_community_notification(p_user uuid, p_category text, p_kind text,
  p_target_type text, p_target_id uuid, p_key text, p_due timestamptz default now())
returns void language plpgsql set search_path = '' as $$
declare nid uuid;
begin
  insert into public.community_notifications(user_id, category, kind, target_type, target_id, dedupe_key, due_at)
    values (p_user, p_category, p_kind, p_target_type, p_target_id, p_key, p_due)
    on conflict (user_id, dedupe_key) do update set removed_at = null
      where community_notifications.removed_at is not null and community_notifications.due_at > now()
    returning id into nid;
  if nid is not null then
    insert into public.notification_deliveries(notification_id, channel, next_attempt_at)
      values (nid, 'telegram', p_due), (nid, 'minecraft', p_due)
      on conflict (notification_id, channel) do nothing;
  end if;
end $$;

create function public.events_version_trigger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.starts_at, new.cancelled_at) is distinct from (old.starts_at, old.cancelled_at) then
    new.calendar_sequence := old.calendar_sequence + 1;
    new.calendar_updated_at := clock_timestamp();
  end if;
  return new;
end $$;

create function public.invite_calendar_player(p_user uuid,p_event uuid,p_nick text)
returns void language plpgsql set search_path = '' as $$
declare e public.events;
declare uid uuid;
begin
  perform public.assert_member_or_staff(p_user);
  select * into e from public.events where id=p_event for update;
  if not found or e.organizer_id<>p_user or e.cancelled_at is not null or e.starts_at<=now()
    then raise exception 'event_forbidden'; end if;
  select mi.user_id into uid from public.minecraft_identities mi
    join public.users u on u.id=mi.user_id and u.account_status='active'
    join public.access_memberships m on m.user_id=mi.user_id and m.status='approved'
    where lower(mi.nickname)=lower(p_nick) and mi.binding_status in ('reserved','confirmed');
  if uid is null or uid=p_user or (e.visibility='guild' and not public.event_visible(uid,e))
    then raise exception 'event_invite_unavailable'; end if;
  if not public.hit_rate_limit('event-invite:'||p_user::text,3600,30) then raise exception 'post_rate_limited'; end if;
  insert into public.event_invitations(event_id,user_id) values(e.id,uid) on conflict do nothing;
  if found then perform public.queue_community_notification(uid,'events','event_invited','event',e.id,'event:'||e.id::text||':invited'); end if;
end $$;
create trigger events_calendar_version before update on public.events
  for each row execute function public.events_version_trigger();

create function public.event_schedule_reminders(e public.events, uid uuid) returns void
language plpgsql set search_path = '' as $$
declare minute_offset integer;
declare offsets integer[];
declare reminder_at timestamptz;
begin
  if e.cancelled_at is not null then return; end if;
  select reminder_minutes into offsets from public.notification_preferences where user_id = uid;
  foreach minute_offset in array coalesce(offsets, '{1440,15}'::integer[]) loop
    reminder_at := e.starts_at - make_interval(mins => minute_offset);
    if reminder_at > now() then
      perform public.queue_community_notification(uid, 'events', 'event_reminder', 'event', e.id,
        concat('event:', e.id, ':reminder:', e.calendar_sequence, ':', minute_offset), reminder_at);
    end if;
  end loop;
end $$;

create function public.event_attendance_trigger() returns trigger
language plpgsql set search_path = '' as $$
declare e public.events;
begin
  if tg_op = 'DELETE' then
    update public.community_notifications set removed_at = now()
      where user_id = old.user_id and target_type = 'event' and target_id = old.event_id
        and kind = 'event_reminder' and due_at > now() and removed_at is null;
    return old;
  end if;
  select * into e from public.events where id = new.event_id;
  perform public.event_schedule_reminders(e, new.user_id);
  if new.user_id <> e.organizer_id then
    perform public.queue_community_notification(new.user_id, 'events', 'event_joined', 'event', e.id,
      concat('event:', e.id, ':joined:', extract(epoch from new.created_at)));
  end if;
  return new;
end $$;
create trigger events_attendance after insert or delete on public.event_attendees
  for each row execute function public.event_attendance_trigger();

create function public.event_change_trigger() returns trigger
language plpgsql set search_path = '' as $$
declare a record;
declare change_kind text;
begin
  if new.calendar_sequence = old.calendar_sequence then return new; end if;
  change_kind := case when new.cancelled_at is null then 'event_rescheduled' else 'event_cancelled' end;
  update public.community_notifications set removed_at = now()
    where target_type = 'event' and target_id = new.id
      and kind = 'event_reminder' and due_at > now() and removed_at is null;
  if new.cancelled_at is not null then
    delete from public.event_waitlist where event_id = new.id;
  end if;
  for a in select user_id from public.event_attendees where event_id = new.id loop
    perform public.queue_community_notification(a.user_id, 'events', change_kind, 'event', new.id,
      concat('event:', new.id, ':', change_kind, ':', new.calendar_sequence));
    perform public.event_schedule_reminders(new, a.user_id);
  end loop;
  return new;
end $$;
create trigger events_calendar_change after update on public.events
  for each row execute function public.event_change_trigger();

-- Every operation changing capacity locks the event first.
create function public.event_promote_waitlist(p_event uuid, p_hold_seconds integer)
returns void language plpgsql set search_path = '' as $$
declare e public.events;
declare available integer;
declare candidate record;
declare deadline timestamptz;
begin
  select * into e from public.events where id = p_event for update;
  if not found or e.cancelled_at is not null or e.starts_at <= now() or e.seats_limit is null then return; end if;
  delete from public.event_waitlist w where w.event_id = e.id and
    (w.offered_until <= now() or not public.event_visible(w.user_id, e)
      or not exists (select 1 from public.users u join public.access_memberships m on m.user_id = u.id
        where u.id = w.user_id and u.account_status = 'active' and m.status = 'approved'));
  available := e.seats_limit - (select count(*) from public.event_attendees where event_id = e.id)
    - (select count(*) from public.event_waitlist where event_id = e.id and offered_until is not null);
  if available <= 0 then return; end if;
  deadline := least(e.starts_at, now() + make_interval(secs => p_hold_seconds));
  for candidate in select user_id, queued_at from public.event_waitlist
    where event_id = e.id and offered_until is null order by queued_at, user_id limit available loop
    update public.event_waitlist set offered_until = deadline where event_id = e.id and user_id = candidate.user_id;
    perform public.queue_community_notification(candidate.user_id, 'events', 'event_seat', 'event', e.id,
      concat('event:', e.id, ':seat:', extract(epoch from candidate.queued_at)));
  end loop;
end $$;

create function public.event_signup(p_user uuid, p_event uuid, p_action text, p_staff boolean, p_hold_seconds integer)
returns void language plpgsql set search_path = '' as $$
declare e public.events;
declare offer timestamptz;
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if p_action in ('leave', 'leave_waitlist') then
    if p_action = 'leave' then
      delete from public.event_attendees where event_id = e.id and user_id = p_user;
    end if;
    delete from public.event_waitlist where event_id = e.id and user_id = p_user;
    perform public.event_promote_waitlist(e.id, p_hold_seconds);
    return;
  end if;
  perform public.assert_member_or_staff(p_user);
  if not public.event_visible(p_user, e, p_staff) then raise exception 'event_not_found'; end if;
  if e.cancelled_at is not null then raise exception 'event_cancelled'; end if;
  if e.starts_at <= now() then raise exception 'event_past'; end if;
  if exists (select 1 from public.event_attendees where event_id = e.id and user_id = p_user) then
    raise exception 'event_already_joined';
  end if;
  perform public.event_promote_waitlist(e.id, p_hold_seconds);
  select offered_until into offer from public.event_waitlist where event_id = e.id and user_id = p_user;
  if p_action = 'confirm' and offer is null then raise exception 'event_offer_expired'; end if;
  if p_action = 'waitlist' then
    insert into public.event_waitlist(event_id, user_id) values (e.id, p_user) on conflict do nothing;
    perform public.event_promote_waitlist(e.id, p_hold_seconds);
    return;
  end if;
  if p_action not in ('join','confirm') then raise exception 'event_invalid'; end if;
  if offer is null and e.seats_limit is not null and
     (select count(*) from public.event_attendees where event_id = e.id) +
     (select count(*) from public.event_waitlist where event_id = e.id and offered_until is not null) >= e.seats_limit then
    raise exception 'event_full';
  end if;
  insert into public.event_attendees(event_id, user_id) values (e.id, p_user);
  delete from public.event_waitlist where event_id = e.id and user_id = p_user;
end $$;

create or replace function public.join_event(p_user uuid, p_event uuid) returns void
language sql security definer set search_path = '' as $$
  select public.event_signup(p_user, p_event, 'join', false, 900);
$$;

create function public.event_maintain_waitlists(p_hold_seconds integer) returns void
language plpgsql set search_path = '' as $$
declare eid uuid;
begin
  for eid in select distinct w.event_id from public.event_waitlist w
    join public.events e on e.id = w.event_id
    where e.cancelled_at is null and e.starts_at > now()
      and (w.offered_until <= now() or w.offered_until is null)
    order by w.event_id limit 100 loop
    perform public.event_promote_waitlist(eid, p_hold_seconds);
  end loop;
end $$;

create function public.event_refresh_reminders(p_user uuid) returns void
language plpgsql set search_path = '' as $$
declare e public.events;
begin
  for e in select ev.* from public.events ev join public.event_attendees a on a.event_id = ev.id
    where a.user_id = p_user and ev.starts_at > now() and ev.cancelled_at is null loop
    delete from public.community_notifications where user_id = p_user and target_type = 'event'
      and target_id = e.id and kind = 'event_reminder' and due_at > now();
    perform public.event_schedule_reminders(e, p_user);
  end loop;
end $$;

create function public.save_community_preferences(p_user uuid, p_channels jsonb, p_reminders integer[],
  p_timezone text, p_quiet_from time, p_quiet_to time, p_mode text)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.notification_preferences(user_id, channels, reminder_minutes, timezone,
    quiet_from, quiet_to, telegram_mode)
  values(p_user, p_channels, p_reminders, p_timezone, p_quiet_from, p_quiet_to, p_mode)
  on conflict (user_id) do update set channels = excluded.channels,
    reminder_minutes = excluded.reminder_minutes, timezone = excluded.timezone,
    quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, telegram_mode = excluded.telegram_mode;
  perform public.event_refresh_reminders(p_user);
end $$;

create function public.confirm_community_bot(p_chat bigint, p_hash text)
returns boolean language sql set search_path = '' as $$
  with linked as (
    update public.telegram_bot_links b set chat_id = p_chat, status = 'connected',
      code_hash = null, code_expires_at = null, code_source = null
    from public.telegram_identities t join public.users u on u.id = t.user_id
    where t.user_id = b.user_id and t.telegram_id = p_chat and u.account_status = 'active'
      and b.code_hash = p_hash and b.code_expires_at > now() and b.code_source = 'site'
    returning b.user_id
  )
  select exists(select 1 from linked)
$$;

create function public.confirm_game_bot(p_user uuid, p_hash text)
returns boolean language sql set search_path = '' as $$
  with linked as (
    update public.telegram_bot_links b set chat_id = t.telegram_id, status = 'connected',
      code_hash = null, code_expires_at = null, code_source = null
    from public.telegram_identities t join public.users u on u.id=t.user_id
    where b.user_id=p_user and t.user_id=b.user_id and u.account_status='active'
      and b.code_hash=p_hash and b.code_expires_at>now() and b.code_source='minecraft'
    returning b.user_id
  )
  select exists(select 1 from linked)
$$;

create function public.claim_community_deliveries(p_channel text, p_limit integer)
returns table (notification_id uuid, lease_id uuid, attempts integer)
language sql set search_path = '' as $$
  with due as (
    select d.notification_id from public.notification_deliveries d
    join public.community_notifications n on n.id = d.notification_id
    where d.channel = p_channel and d.next_attempt_at <= now()
      and d.delivered_at is null and d.stopped_at is null and n.removed_at is null
    order by d.next_attempt_at, d.notification_id limit least(p_limit, 50)
    for update of d skip locked
  )
  update public.notification_deliveries d set lease_id = gen_random_uuid(),
    attempts = d.attempts + 1, next_attempt_at = now() + interval '2 minutes'
    from due where d.notification_id = due.notification_id and d.channel = p_channel
  returning d.notification_id, d.lease_id, d.attempts
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'event_visible(uuid,public.events,boolean)', 'read_events(uuid,boolean,timestamptz,timestamptz,uuid,boolean)',
    'create_calendar_event(uuid,text,text,timestamptz,integer,text,text,text,integer,text,uuid,uuid)',
    'event_signup_summary(uuid[],uuid)',
    'queue_community_notification(uuid,text,text,text,uuid,text,timestamptz)', 'events_version_trigger()',
    'invite_calendar_player(uuid,uuid,text)',
    'event_schedule_reminders(public.events,uuid)', 'event_attendance_trigger()', 'event_change_trigger()',
    'event_promote_waitlist(uuid,integer)', 'event_signup(uuid,uuid,text,boolean,integer)',
    'event_maintain_waitlists(integer)', 'event_refresh_reminders(uuid)', 'claim_community_deliveries(text,integer)'
    ,'save_community_preferences(uuid,jsonb,integer[],text,time,time,text)', 'confirm_community_bot(bigint,text)',
    'confirm_game_bot(uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
