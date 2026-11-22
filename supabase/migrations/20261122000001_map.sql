-- Map atlas, site side of the world data: explored chunks as the Paper plugin reports them, and the
-- per-region vector layer built from them. Closed to client roles; only service_role (backend) uses these.

create table public.map_chunks (
  server_id  uuid     not null references public.bridge_servers (id),
  dim        text     not null check (dim in ('overworld', 'nether')),
  cx         integer  not null check (cx between -1875000 and 1875000),
  cz         integer  not null check (cz between -1875000 and 1875000),
  -- region 32x32 chunks; arithmetic shift floors negative coordinates correctly
  rx         integer  generated always as (cx >> 5) stored,
  rz         integer  generated always as (cz >> 5) stored,
  codec      smallint not null check (codec >= 1),
  version    bigint   not null check (version >= 0),   -- plugin-side monotonic stamp; newer wins
  data       bytea    not null check (octet_length(data) between 1 and 8192),
  updated_at timestamptz not null default now(),
  primary key (server_id, dim, cx, cz)
);
create index map_chunks_region_idx on public.map_chunks (server_id, dim, rx, rz);

create table public.map_regions (
  server_id     uuid    not null references public.bridge_servers (id),
  dim           text    not null check (dim in ('overworld', 'nether')),
  rx            integer not null,
  rz            integer not null,
  layer         jsonb,                                   -- vector layer, null until first build
  built_version bigint  not null default 0,
  dirty         boolean not null default true,
  dirty_at      timestamptz not null default now(),
  built_at      timestamptz,
  primary key (server_id, dim, rx, rz)
);
create index map_regions_dirty_idx on public.map_regions (dirty_at) where dirty;

alter table public.map_chunks enable row level security;
alter table public.map_regions enable row level security;
revoke all on public.map_chunks, public.map_regions from anon, authenticated;

-- Stores a batch of already validated chunks: a chunk is replaced only by a newer version, and the
-- regions that actually changed are marked dirty. Returns one row per input chunk.
create function public.map_ingest_chunks(p_server_id uuid, p_chunks jsonb)
returns table (out_dim text, out_cx integer, out_cz integer, out_stored boolean)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with incoming as (
    select e ->> 'dim' as dim,
           (e ->> 'cx')::integer as cx,
           (e ->> 'cz')::integer as cz,
           (e ->> 'codec')::smallint as codec,
           (e ->> 'version')::bigint as version,
           decode(e ->> 'data', 'base64') as data
    from jsonb_array_elements(p_chunks) as e
  ),
  upserted as (
    insert into public.map_chunks as c (server_id, dim, cx, cz, codec, version, data)
    select p_server_id, i.dim, i.cx, i.cz, i.codec, i.version, i.data from incoming i
    on conflict (server_id, dim, cx, cz) do update
      set codec = excluded.codec, version = excluded.version, data = excluded.data, updated_at = now()
      where c.version < excluded.version
    returning c.dim, c.cx, c.cz
  ),
  dirtied as (
    insert into public.map_regions (server_id, dim, rx, rz)
    select distinct p_server_id, u.dim, u.cx >> 5, u.cz >> 5 from upserted u
    on conflict (server_id, dim, rx, rz) do update set dirty = true, dirty_at = now()
    returning 1
  )
  select i.dim, i.cx, i.cz,
         exists (select 1 from upserted u where u.dim = i.dim and u.cx = i.cx and u.cz = i.cz)
  from incoming i;
end $$;

revoke execute on function public.map_ingest_chunks(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.map_ingest_chunks(uuid, jsonb) to service_role;
