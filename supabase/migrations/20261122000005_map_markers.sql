-- Map markers (R11, R13, R16-R18; KTD9): points players put on the map, labels staff put on it.
-- Paths and routes join this table later through `kind`. Access goes through the server only.

create table public.map_markers (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references public.users (id),
  kind              text not null default 'point' check (kind in ('point', 'label')),
  dim               text not null check (dim in ('overworld', 'nether')),
  x                 integer not null check (abs(x) <= 30000000),
  y                 integer check (y between -64 and 320),
  z                 integer not null check (abs(z) <= 30000000),
  name              text not null check (length(btrim(name)) between 1 and 60),
  description       text not null default '' check (length(description) <= 1000),
  icon              text not null check (icon ~ '^[a-z0-9_]{1,32}$'),
  color             text check (color ~ '^#[0-9a-f]{6}$'),          -- null: the icon's own colours
  visibility        text not null default 'private' check (visibility in ('public', 'guild', 'private')),
  guild_id          uuid references public.guilds (id),             -- the guild a guild marker is shared with
  moderation_status text not null default 'approved' check (moderation_status in ('pending', 'approved', 'hidden')),
  moderation_reason text,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (visibility <> 'guild' or guild_id is not null)
);
create index map_markers_dim_idx on public.map_markers (dim) where deleted_at is null;
create index map_markers_author_idx on public.map_markers (author_id) where deleted_at is null;
create index map_markers_pending_idx on public.map_markers (created_at)
  where moderation_status = 'pending' and deleted_at is null;

alter table public.map_markers enable row level security;
revoke all on public.map_markers from anon, authenticated;

-- complaints about a marker go to the same moderation queue as posts and images
alter table public.moderation_reports drop constraint moderation_reports_target_type_check;
alter table public.moderation_reports
  add constraint moderation_reports_target_type_check check (target_type in ('post', 'media', 'marker'));
