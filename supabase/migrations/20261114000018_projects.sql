-- Community projects: what is needed, where, and who signs up to help.
-- Closed to client roles; the backend applies the rules (as for the other social modules).

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.users (id),
  title            text not null check (length(btrim(title)) between 3 and 120),
  description      text not null default '' check (length(description) <= 2000),
  status           text not null default 'recruiting'
                   check (status in ('recruiting', 'in_progress', 'done', 'cancelled')),
  place            text not null default '' check (length(place) <= 120),
  dimension        text not null default 'overworld' check (dimension in ('overworld', 'nether', 'end')),
  x                integer check (x between -30000000 and 30000000),
  y                integer check (y between -64 and 320),
  z                integer check (z between -30000000 and 30000000),
  cover_media_id   uuid references public.media (id) on delete set null,
  max_supporters   integer check (max_supporters is null or max_supporters between 1 and 500),
  cancel_reason    text check (cancel_reason is null or length(cancel_reason) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  check ((x is null) = (z is null))
);
create index projects_status_idx on public.projects (status, created_at desc);
create index projects_author_idx on public.projects (author_id, created_at desc);

create table public.project_needs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  title           text not null check (length(btrim(title)) between 1 and 80),
  quantity_needed integer check (quantity_needed is null or quantity_needed between 1 and 100000),
  quantity_done   integer not null default 0 check (quantity_done >= 0),
  unit            text not null default '' check (length(unit) <= 20),
  done            boolean not null default false,
  position        integer not null default 0
);
create index project_needs_project_idx on public.project_needs (project_id, position);

create table public.project_supporters (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.users (id),
  need_id    uuid references public.project_needs (id) on delete set null,
  quantity   integer check (quantity is null or quantity between 1 and 100000),
  note       text not null default '' check (length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_supporters_user_idx on public.project_supporters (user_id);

alter table public.projects enable row level security;
alter table public.project_needs enable row level security;
alter table public.project_supporters enable row level security;
revoke all on public.projects, public.project_needs, public.project_supporters from anon, authenticated;
