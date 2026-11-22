-- Stores a rebuilt region layer only if no chunk dirtied the region after the build read it
-- (dirty_at is unchanged), so a chunk that arrives during a build keeps the region dirty.
create function public.map_store_layer(
  p_server_id uuid, p_dim text, p_rx integer, p_rz integer,
  p_dirty_at timestamptz, p_layer jsonb, p_version bigint
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.map_regions
     set layer = p_layer, built_version = p_version, dirty = false, built_at = now()
   where server_id = p_server_id and dim = p_dim and rx = p_rx and rz = p_rz
     and dirty_at = p_dirty_at;
  return found;
end $$;

revoke execute on function public.map_store_layer(uuid, text, integer, integer, timestamptz, jsonb, bigint)
  from public, anon, authenticated;
grant execute on function public.map_store_layer(uuid, text, integer, integer, timestamptz, jsonb, bigint)
  to service_role;
