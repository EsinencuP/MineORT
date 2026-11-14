-- Block 7 (E08, wave P1a): posts, media with polymorphic attachments, reactions, reports.
-- Everything is closed to client roles; the backend (service role) applies the visibility rules.

create table public.posts (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references public.users (id),
  guild_id          uuid,                                   -- reserved for the guild wave (P1b)
  kind              text not null default 'post' check (kind in ('post', 'news')),
  body              text not null check (length(btrim(body)) between 1 and 2000),
  visibility        text not null default 'public' check (visibility in ('public', 'guild', 'private')),
  moderation_status text not null default 'approved' check (moderation_status in ('approved', 'hidden')),
  moderation_reason text,
  pinned            boolean not null default false,
  created_at        timestamptz not null default now(),
  edited_at         timestamptz,
  deleted_at        timestamptz,
  check (kind <> 'news' or visibility = 'public')
);
create index posts_feed_idx on public.posts (visibility, moderation_status, created_at desc) where deleted_at is null;
create index posts_author_idx on public.posts (author_id, created_at desc);

create table public.media (
  id                uuid primary key default gen_random_uuid(),
  uploader_id       uuid not null references public.users (id),
  storage_key       text not null unique,
  mime              text not null default 'image/webp' check (mime = 'image/webp'),
  bytes             integer not null check (bytes > 0 and bytes <= 10485760),
  width             integer not null check (width between 1 and 4096),
  height            integer not null check (height between 1 and 4096),
  visibility        text not null default 'public' check (visibility in ('public', 'guild', 'private')),
  moderation_status text not null default 'approved' check (moderation_status in ('approved', 'hidden')),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  purge_after       timestamptz                             -- physical removal date after a soft delete (OD-40: 30 days)
);
create index media_uploader_idx on public.media (uploader_id, created_at desc);
create index media_purge_idx on public.media (purge_after) where purge_after is not null;

create table public.media_attachments (
  id          uuid primary key default gen_random_uuid(),
  media_id    uuid not null references public.media (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'gallery', 'marker', 'guild', 'event')),
  target_id   uuid not null,
  caption     text not null default '' check (length(caption) <= 200),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (media_id, target_type, target_id)
);
create index media_attachments_target_idx on public.media_attachments (target_type, target_id);

create table public.reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.users (id),
  kind       text not null default 'like' check (kind in ('like')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

create table public.moderation_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.users (id),
  target_type   text not null check (target_type in ('post')),
  target_id     uuid not null,
  reason        text not null check (length(btrim(reason)) between 3 and 500),
  status        text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  decided_by    uuid references public.users (id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index moderation_reports_queue_idx on public.moderation_reports (status, created_at);

alter table public.posts enable row level security;
alter table public.media enable row level security;
alter table public.media_attachments enable row level security;
alter table public.reactions enable row level security;
alter table public.moderation_reports enable row level security;
revoke all on public.posts, public.media, public.media_attachments, public.reactions,
  public.moderation_reports from anon, authenticated;

-- Private bucket: files are only reachable through short-lived signed URLs issued by the backend.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
