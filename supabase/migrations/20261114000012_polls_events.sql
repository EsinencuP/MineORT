-- Block 7 (E09, wave P1b): polls with honest votes, and events with seat limits.
-- Client roles have no table access; the backend calls the SECURITY DEFINER functions below.

create table public.polls (
  id                  uuid primary key default gen_random_uuid(),
  author_id           uuid not null references public.users (id),
  guild_id            uuid,                                          -- reserved for the guild wave
  question            text not null check (length(btrim(question)) between 3 and 300),
  multi_choice        boolean not null default false,
  max_choices         integer check (max_choices is null or max_choices >= 1),
  allow_change        boolean not null default false,
  results_after_close boolean not null default false,
  closes_at           timestamptz not null,
  closed_at           timestamptz,                                   -- early close by staff
  closed_by           uuid references public.users (id),
  created_at          timestamptz not null default now()
);
create index polls_open_idx on public.polls (closes_at desc);

create table public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls (id) on delete cascade,
  label    text not null check (length(btrim(label)) between 1 and 100),
  position integer not null,
  unique (poll_id, id),                                              -- target of the composite foreign key
  unique (poll_id, position)
);

create table public.votes (
  id           uuid primary key default gen_random_uuid(),
  poll_id      uuid not null,
  option_id    uuid not null,
  user_id      uuid not null references public.users (id),
  multi_choice boolean not null,                                     -- copied from the poll, so the index below cannot be dodged
  created_at   timestamptz not null default now(),
  -- an option of another poll cannot be voted for; options with votes cannot be deleted
  foreign key (poll_id, option_id) references public.poll_options (poll_id, id) on delete restrict,
  unique (poll_id, option_id, user_id)
);
create unique index votes_single_choice_uq on public.votes (poll_id, user_id) where not multi_choice;
create index votes_option_idx on public.votes (option_id);

-- A poll that already has votes cannot be edited behind the voters' backs (US-E09-07).
create function public.polls_lock_when_voted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.votes v where v.poll_id = old.id) and (
       new.question is distinct from old.question
    or new.multi_choice is distinct from old.multi_choice
    or new.max_choices is distinct from old.max_choices
    or new.allow_change is distinct from old.allow_change
    or new.results_after_close is distinct from old.results_after_close
    or new.author_id is distinct from old.author_id
    or new.closes_at < old.closes_at and new.closed_at is null) then
    raise exception 'poll_has_votes' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger polls_lock_when_voted before update on public.polls
  for each row execute function public.polls_lock_when_voted();

create function public.poll_options_lock_when_voted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid := case when tg_op = 'INSERT' then new.poll_id else old.poll_id end;
begin
  if exists (select 1 from public.votes v where v.poll_id = pid) then
    raise exception 'poll_has_votes' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger poll_options_lock_when_voted before insert or update on public.poll_options
  for each row execute function public.poll_options_lock_when_voted();

create table public.events (
  id               uuid primary key default gen_random_uuid(),
  organizer_id     uuid not null references public.users (id),
  title            text not null check (length(btrim(title)) between 3 and 120),
  description      text not null default '' check (length(description) <= 2000),
  starts_at        timestamptz not null,                             -- always UTC
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 1440),
  organizer_tz     text not null default 'UTC',
  place            text not null default '' check (length(place) <= 120),
  category         text not null default 'other' check (category in ('build', 'meetup', 'contest', 'other')),
  seats_limit      integer check (seats_limit is null or seats_limit between 1 and 500),
  cancelled_at     timestamptz,
  cancel_reason    text,
  rescheduled_from timestamptz,
  created_at       timestamptz not null default now()
);
create index events_start_idx on public.events (starts_at);

create table public.event_attendees (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_attendees_user_idx on public.event_attendees (user_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.votes enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
revoke all on public.polls, public.poll_options, public.votes, public.events,
  public.event_attendees from anon, authenticated;

-- Only members (or staff) vote and sign up.
create function public.assert_member_or_staff(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.users u
     where u.id = p_user and u.account_status = 'active'
       and (u.site_role in ('moderator', 'admin')
            or exists (select 1 from public.access_memberships m where m.user_id = u.id and m.status = 'approved'))
  ) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
end $$;

-- One vote per user (or one per option in a multi-choice poll); the first request wins, the rest are refused.
-- The poll status is decided here by the server clock, not by a background job.
create function public.cast_vote(p_user uuid, p_poll uuid, p_options uuid[], p_change boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.polls;
  n integer := coalesce(array_length(p_options, 1), 0);
  d integer;
begin
  perform public.assert_member_or_staff(p_user);
  select * into p from public.polls where id = p_poll;
  if not found then raise exception 'poll_not_found' using errcode = 'P0001'; end if;
  if p.closed_at is not null or p.closes_at <= now() then
    raise exception 'poll_closed' using errcode = 'P0001';
  end if;

  select count(distinct o) into d from unnest(p_options) o;
  if n = 0 or d <> n then raise exception 'poll_bad_choice' using errcode = 'P0001'; end if;
  if not p.multi_choice and n <> 1 then raise exception 'poll_bad_choice' using errcode = 'P0001'; end if;
  if p.multi_choice and n > coalesce(p.max_choices, 10) then
    raise exception 'poll_bad_choice' using errcode = 'P0001';
  end if;
  if (select count(*) from public.poll_options o where o.poll_id = p_poll and o.id = any (p_options)) <> n then
    raise exception 'poll_option_mismatch' using errcode = 'P0001';
  end if;

  -- serialize this user's votes in this poll, so a double click or a race cannot slip past the checks
  perform pg_advisory_xact_lock(hashtextextended(p_poll::text || p_user::text, 0));
  if exists (select 1 from public.votes v where v.poll_id = p_poll and v.user_id = p_user) then
    if not p_change then raise exception 'poll_already_voted' using errcode = 'P0001'; end if;
    if not p.allow_change then raise exception 'poll_change_not_allowed' using errcode = 'P0001'; end if;
    delete from public.votes v where v.poll_id = p_poll and v.user_id = p_user;
  end if;
  insert into public.votes (poll_id, option_id, user_id, multi_choice)
    select p_poll, o, p_user, p.multi_choice from unnest(p_options) o;
exception when unique_violation then
  raise exception 'poll_already_voted' using errcode = 'P0001';
end $$;

-- Sign-up with the seat limit checked under a row lock: parallel requests cannot exceed it.
create function public.join_event(p_user uuid, p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  perform public.assert_member_or_staff(p_user);
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if e.cancelled_at is not null then raise exception 'event_cancelled' using errcode = 'P0001'; end if;
  if e.starts_at + make_interval(mins => e.duration_minutes) <= now() then
    raise exception 'event_past' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.event_attendees a where a.event_id = p_event and a.user_id = p_user) then
    raise exception 'event_already_joined' using errcode = 'P0001';
  end if;
  if e.seats_limit is not null
     and (select count(*) from public.event_attendees a where a.event_id = p_event) >= e.seats_limit then
    raise exception 'event_full' using errcode = 'P0001';
  end if;
  insert into public.event_attendees (event_id, user_id) values (p_event, p_user);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'polls_lock_when_voted()', 'poll_options_lock_when_voted()', 'assert_member_or_staff(uuid)',
    'cast_vote(uuid, uuid, uuid[], boolean)', 'join_event(uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
