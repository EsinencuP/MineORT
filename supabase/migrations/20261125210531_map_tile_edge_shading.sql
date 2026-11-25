-- A tile uses the north and west chunk heights. An updated edge also dirties the
-- existing tile immediately south or east of it.
create or replace function public.map_ingest_chunks(p_server_id uuid, p_chunks jsonb)
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
  ), upserted as (
    insert into public.map_chunks as c (server_id, dim, cx, cz, codec, version, data)
    select p_server_id, i.dim, i.cx, i.cz, i.codec, i.version, i.data from incoming i
    order by i.dim, i.cx, i.cz
    on conflict (server_id, dim, cx, cz) do update
      set codec = excluded.codec, version = excluded.version, data = excluded.data, updated_at = now()
      where c.version < excluded.version
    returning c.dim, c.cx, c.cz, c.rx, c.rz
  ), borders as (
    select u.dim, u.rx + 1 as rx, u.rz from upserted u where (u.cx & 31) = 31
    union
    select u.dim, u.rx, u.rz + 1 as rz from upserted u where (u.cz & 31) = 31
  ), affected as (
    select u.dim, u.rx, u.rz from upserted u
    union
    select r.dim, r.rx, r.rz from borders b
      join public.map_regions r on r.server_id = p_server_id and r.dim = b.dim
        and r.rx = b.rx and r.rz = b.rz
  ), dirtied as (
    insert into public.map_regions (server_id, dim, rx, rz)
    select p_server_id, a.dim, a.rx, a.rz from affected a order by a.dim, a.rx, a.rz
    on conflict (server_id, dim, rx, rz) do update set dirty = true, dirty_at = clock_timestamp()
    returning 1
  )
  select i.dim, i.cx, i.cz,
         exists (select 1 from upserted u where u.dim = i.dim and u.cx = i.cx and u.cz = i.cz)
  from incoming i;
end
$$;

-- A rebuilt image must get a new cache key, even if only a neighbour changed and
-- the newest codec timestamp in the region stayed the same.
create or replace function public.map_store_tile(
  p_server_id uuid, p_dim text, p_rx integer, p_rz integer,
  p_dirty_at timestamptz, p_tile text, p_version bigint
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.map_regions
    set tile = decode(p_tile, 'base64'),
        built_version = greatest(p_version, built_version + 1),
        dirty = false,
        built_at = now()
    where server_id = p_server_id and dim = p_dim and rx = p_rx and rz = p_rz
      and dirty and dirty_at = p_dirty_at;
  return found;
end
$$;

-- Refresh the cache gradually as viewers request regions.
update public.map_regions set dirty = true, dirty_at = clock_timestamp() where tile is not null;
