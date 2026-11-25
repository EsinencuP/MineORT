begin;

do $$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  marker_id uuid;
  images uuid[];
begin
  insert into public.users(id, display_name) values (owner_id,'Owner'), (other_id,'Other');
  insert into public.map_markers(author_id, dim, x, z, name, icon)
    values (owner_id, 'overworld', 8, 13, 'With screenshots', 'pin') returning id into marker_id;
  with uploaded as (
    insert into public.media(uploader_id, storage_key, bytes, width, height, visibility)
      select owner_id, 'marker-fixture/' || n || '.webp', 100, 64, 64, 'private'
      from generate_series(1, 6) n
    returning id
  )
  select array_agg(id) into images from uploaded;

  begin
    perform public.map_attach_marker_media(marker_id, other_id, false, images[1:1]);
    raise exception 'test: another player added an image';
  exception when raise_exception then
    if sqlerrm <> 'marker_forbidden' then raise; end if;
  end;
  perform public.map_attach_marker_media(marker_id, owner_id, false, images[1:5]);
  begin
    perform public.map_attach_marker_media(marker_id, owner_id, false, images[6:6]);
    raise exception 'test: attached a sixth screenshot';
  exception when raise_exception then
    if sqlerrm <> 'marker_media_limit' then raise; end if;
  end;
  if (select array_agg(media_id order by position) from public.media_attachments
    where target_id = marker_id and target_type = 'marker') is distinct from images[1:5] then
    raise exception 'test: attachment order was not saved';
  end if;
  update public.map_markers set deleted_at = now() where id = marker_id;
  if exists(select 1 from public.media_attachments where target_id = marker_id and target_type = 'marker')
    or (select count(*) from public.media where id = any(images[1:5])
      and deleted_at = now() and purge_after = now() + interval '30 days') <> 5
    or (select purge_after from public.media where id = images[6]) is not null then
    raise exception 'test: deletion did not schedule the correct screenshots for retention';
  end if;
end
$$;

rollback;
