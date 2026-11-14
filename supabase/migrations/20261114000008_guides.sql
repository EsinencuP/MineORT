-- Block 5 (E06): Guidebook articles and editable site settings (server address, versions, build).
-- Content is public but served by the backend; client roles have no table access.

create table public.guide_articles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  category    text not null check (category in ('install', 'mods', 'plugins', 'map-guilds', 'troubleshooting')),
  title       text not null check (length(btrim(title)) > 0),
  summary     text not null default '',
  body        text not null default '',
  tags        text[] not null default '{}',
  published   boolean not null default false,
  verified_at date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users (id)
);
create index guide_articles_category_idx on public.guide_articles (category, published);

create table public.site_settings (
  key        text primary key check (key in (
               'server_address', 'minecraft_version', 'client_build_version',
               'client_build_checksum', 'client_build_url')),
  value      text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id)
);

alter table public.guide_articles enable row level security;
alter table public.site_settings  enable row level security;
revoke all on public.guide_articles, public.site_settings from anon, authenticated;
