begin;

do $$
declare
  fixture_server uuid;
  before_change timestamptz;
  after_change timestamptz;
  shaded_version bigint;
begin
  insert into public.bridge_servers(name) values ('Atlas edge fixture') returning id into fixture_server;
  perform public.map_ingest_chunks(fixture_server, '[
    {"dim":"overworld","cx":0,"cz":-1,"codec":2,"version":1,"data":"YQ=="},
    {"dim":"overworld","cx":0,"cz":0,"codec":2,"version":7,"data":"YQ=="}
  ]'::jsonb);
  select dirty_at into before_change from public.map_regions
    where server_id = fixture_server and rx = 0 and rz = 0;
  if not public.map_store_tile(fixture_server, 'overworld', 0, 0, before_change, 'YQ==', 7) then
    raise exception 'test: initial tile was not stored';
  end if;
  perform public.map_ingest_chunks(fixture_server, '[
    {"dim":"overworld","cx":0,"cz":-1,"codec":2,"version":2,"data":"Yg=="}
  ]'::jsonb);
  select dirty_at into after_change from public.map_regions
    where server_id = fixture_server and rx = 0 and rz = 0 and dirty;
  if after_change is null or before_change = after_change then
    raise exception 'test: changed north edge did not invalidate the south tile';
  end if;
  if public.map_store_tile(fixture_server, 'overworld', 0, 0, before_change, 'YQ==', 7) then
    raise exception 'test: accepted a tile rendered before the edge changed';
  end if;
  if not public.map_store_tile(fixture_server, 'overworld', 0, 0, after_change, 'Yg==', 7) then
    raise exception 'test: refreshed tile was not stored';
  end if;
  select built_version into shaded_version from public.map_regions
    where server_id = fixture_server and rx = 0 and rz = 0;
  if shaded_version <> 8 then
    raise exception 'test: neighbour-only change did not get a new tile version';
  end if;
end
$$;

rollback;
