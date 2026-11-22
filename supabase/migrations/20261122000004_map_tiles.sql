-- The map is now drawn on the server, one PNG tile per region, the way the AtlasMap mod draws its tiles.
-- The vector layer is gone. Codec 1 chunks (surface classes) cannot be drawn this way, so they are
-- dropped; the plugin sends codec 2 (height, water depth, vanilla map colour).

delete from public.map_regions;
delete from public.map_chunks where codec < 2;

alter table public.map_regions drop column layer;
alter table public.map_regions add column tile bytea;       -- PNG, null until the first build

drop function public.map_store_layer(uuid, text, integer, integer, timestamptz, jsonb, bigint);

-- Stores a rebuilt tile only if no chunk dirtied the region after the build read it
-- (dirty_at is unchanged), so a chunk that arrives during a build keeps the region dirty.
create function public.map_store_tile(
  p_server_id uuid, p_dim text, p_rx integer, p_rz integer,
  p_dirty_at timestamptz, p_tile text, p_version bigint
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.map_regions
     set tile = decode(p_tile, 'base64'), built_version = p_version, dirty = false, built_at = now()
   where server_id = p_server_id and dim = p_dim and rx = p_rx and rz = p_rz
     and dirty_at = p_dirty_at;
  return found;
end $$;

-- Reads a tile as base64 (half the size of the hex PostgREST gives for bytea).
create function public.map_read_tile(
  p_server_id uuid, p_dim text, p_rx integer, p_rz integer
) returns table (out_tile text, out_version bigint, out_dirty boolean, out_dirty_at timestamptz, out_has_tile boolean)
language sql stable security definer set search_path = '' as $$
  select encode(r.tile, 'base64'), r.built_version, r.dirty, r.dirty_at, r.tile is not null
    from public.map_regions r
   where r.server_id = p_server_id and r.dim = p_dim and r.rx = p_rx and r.rz = p_rz;
$$;

revoke execute on function public.map_store_tile(uuid, text, integer, integer, timestamptz, text, bigint)
  from public, anon, authenticated;
grant execute on function public.map_store_tile(uuid, text, integer, integer, timestamptz, text, bigint)
  to service_role;
revoke execute on function public.map_read_tile(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.map_read_tile(uuid, text, integer, integer) to service_role;
