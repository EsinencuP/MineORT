alter table public.map_markers
  drop constraint map_markers_kind_check,
  add constraint map_markers_kind_check check (kind in ('point', 'label', 'path', 'route')),
  add column geometry jsonb,
  add constraint map_markers_geometry_check check (case
    when kind = 'route' and jsonb_typeof(geometry) = 'array'
      and jsonb_typeof(geometry->0) = 'array' then
      jsonb_array_length(geometry) = 1 and jsonb_array_length(geometry->0) between 2 and 128
    when kind = 'path' and jsonb_typeof(geometry) = 'array' then jsonb_array_length(geometry) >= 1
    when kind in ('point', 'label') then geometry is null
    else false
  end);

-- The site passes the signed-in player's own ID. Paths never take coordinates from the request.
create function public.map_read_recent_own_path(p_user uuid, p_dim text)
returns jsonb language sql stable set search_path = '' as $$
  with recent as materialized (
    select server_id, segment_at, recorded_at, x, z from public.map_trail_points
    where user_id = p_user and dim = p_dim and recorded_at >= now() - interval '5 minutes'
  ), tracks as (
    select min(recorded_at) as first_at,
      jsonb_agg(jsonb_build_array(x, z) order by recorded_at) as points
    from recent
    where server_id = (select server_id from recent order by recorded_at desc limit 1)
    group by segment_at
    having count(*) >= 2
  )
  select coalesce(jsonb_agg(points order by first_at), '[]'::jsonb) from tracks;
$$;

revoke all on function public.map_read_recent_own_path(uuid, text) from public, anon, authenticated;
grant execute on function public.map_read_recent_own_path(uuid, text) to service_role;
