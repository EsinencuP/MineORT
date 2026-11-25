-- A marker row lock keeps the screenshot limit intact even when two uploads finish together.
create function public.map_attach_marker_media(
  p_marker uuid, p_actor uuid, p_admin boolean, p_media uuid[]
)
returns void language plpgsql set search_path = '' as $$
declare
  marker public.map_markers;
  live_count integer;
  next_position integer;
  attached_count integer;
begin
  select * into marker from public.map_markers
    where id = p_marker and deleted_at is null for update;
  if not found then raise exception 'marker_not_found'; end if;
  if (marker.kind = 'label' and not p_admin)
    or (marker.kind <> 'label' and marker.author_id <> p_actor) then
    raise exception 'marker_forbidden';
  end if;

  select count(*) filter (where m.deleted_at is null), coalesce(max(a.position) + 1, 0)
    into live_count, next_position
  from public.media_attachments a join public.media m on m.id = a.media_id
  where a.target_type = 'marker' and a.target_id = p_marker;
  if coalesce(cardinality(p_media), 0) < 1 or live_count + cardinality(p_media) > 5 then
    raise exception 'marker_media_limit';
  end if;

  perform 1 from public.media where id = any(p_media) order by id for update;
  insert into public.media_attachments(media_id, target_type, target_id, position)
  select m.id, 'marker', p_marker, next_position + i.ordinality - 1
  from unnest(p_media) with ordinality as i(id, ordinality)
  join public.media m on m.id = i.id
  where m.uploader_id = p_actor and m.deleted_at is null and m.visibility = 'private'
    and not exists (select 1 from public.media_attachments a where a.media_id = m.id)
  on conflict do nothing;
  get diagnostics attached_count = row_count;
  if attached_count <> cardinality(p_media) then raise exception 'upload_missing'; end if;
end
$$;

create function public.map_release_marker_media()
returns trigger language plpgsql set search_path = '' as $$
declare
  released uuid[];
begin
  if tg_op = 'UPDATE' and (old.deleted_at is not null or new.deleted_at is null) then
    return null;
  end if;

  with removed as (
    delete from public.media_attachments where target_type = 'marker' and target_id = old.id
    returning media_id
  )
  select array_agg(media_id) into released from removed;

  update public.media m set deleted_at = now(), purge_after = now() + interval '30 days'
  where m.id = any(released) and m.deleted_at is null
    and not exists (select 1 from public.media_attachments a where a.media_id = m.id)
    and not exists (select 1 from public.projects p where p.cover_media_id = m.id and p.status <> 'cancelled');
  return null;
end
$$;

create trigger map_marker_media_retention
  after update of deleted_at or delete on public.map_markers
  for each row execute function public.map_release_marker_media();

revoke all on function public.map_attach_marker_media(uuid, uuid, boolean, uuid[]),
  public.map_release_marker_media() from public, anon, authenticated;
grant execute on function public.map_attach_marker_media(uuid, uuid, boolean, uuid[]),
  public.map_release_marker_media() to service_role;
