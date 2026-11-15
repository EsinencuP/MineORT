-- Guilds must be usable before the game server and the in-game nickname confirmation exist:
-- a player with admission and a reserved or confirmed nickname is a member of the community.
-- Also: leaders edit the guild description, admins edit name, colour, description and size.

create or replace view public.public_profiles as
select mi.nickname,
       case when coalesce(ps.show_first_join, true) then mi.created_at end as since,
       coalesce(ps.bio, '') as bio,
       coalesce(ps.show_stats, false) as show_stats
  from public.minecraft_identities mi
  join public.users u on u.id = mi.user_id and u.account_status = 'active'
  join public.access_memberships am on am.user_id = u.id and am.status = 'approved'
  left join public.privacy_settings ps on ps.user_id = u.id
 where mi.binding_status in ('reserved', 'confirmed');

create or replace view public.public_members as
select mi.nickname,
       case when coalesce(ps.show_first_join, true) then mi.created_at end as since,
       case when coalesce(ps.show_guild, true) then g.slug end as guild_slug,
       case when coalesce(ps.show_guild, true) then g.name end as guild_name,
       case when coalesce(ps.show_guild, true) then g.tag end as guild_tag,
       case when coalesce(ps.show_guild, true) then g.color end as guild_color,
       case when coalesce(ps.show_guild, true) then gr.name end as rank_name,
       case when coalesce(ps.show_guild, true) then gm.rank_level end as rank_level
  from public.minecraft_identities mi
  join public.users u on u.id = mi.user_id and u.account_status = 'active'
  join public.access_memberships am on am.user_id = u.id and am.status = 'approved'
  left join public.privacy_settings ps on ps.user_id = u.id
  left join public.guild_members gm on gm.user_id = u.id and gm.status = 'active'
  left join public.guilds g on g.id = gm.guild_id and g.status = 'active'
  left join public.guild_ranks gr on gr.id = gm.rank_id
 where mi.binding_status in ('reserved', 'confirmed');

create or replace function public.create_guild(p_actor uuid, p_name text, p_slug text, p_tag text, p_color text,
                                               p_description text, p_owner uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid; names text[] := array['Глава', 'Заместитель', 'Офицер I', 'Офицер II', 'Офицер III', 'Участник']; i integer;
begin
  perform public.assert_active_role(p_actor, array['admin']);
  perform public.guild_candidate_ok(p_owner);
  if not exists (select 1 from public.minecraft_identities mi
                  where mi.user_id = p_owner and mi.binding_status in ('reserved', 'confirmed')) then
    raise exception 'guild_owner_not_eligible' using errcode = 'P0001';
  end if;
  insert into public.guilds (slug, name, tag, color, description, created_by)
  values (lower(btrim(p_slug)), btrim(p_name), upper(btrim(p_tag)), p_color, coalesce(p_description, ''), p_actor)
  returning id into gid;
  for i in 1..6 loop
    insert into public.guild_ranks (guild_id, level, name) values (gid, i, names[i]);
  end loop;
  perform public.guild_add_member(gid, p_owner, 1);
  perform public.guild_audit(p_actor, gid, 'guild.created', jsonb_build_object('owner', p_owner, 'tag', upper(btrim(p_tag))));
  return gid;
exception
  when unique_violation then
    if sqlerrm like '%guilds_tag_uq%' then raise exception 'guild_tag_taken' using errcode = 'P0001'; end if;
    if sqlerrm like '%guilds_slug_uq%' then raise exception 'guild_slug_taken' using errcode = 'P0001'; end if;
    raise;
  when check_violation then
    raise exception 'guild_bad_input' using errcode = 'P0001';
end $$;

-- Leaders (rank 1..5) edit the public description of their own guild (guild.edit_profile).
create function public.guild_edit_profile(p_actor uuid, p_guild uuid, p_description text) returns void
language plpgsql security definer set search_path = '' as $$
declare al integer;
begin
  perform public.guild_lock(p_guild);
  al := public.guild_actor_level(p_guild, p_actor);
  if al > 5 then raise exception 'guild_forbidden' using errcode = 'P0001'; end if;
  update public.guilds set description = btrim(coalesce(p_description, '')) where id = p_guild;
  perform public.guild_audit(p_actor, p_guild, 'guild.profile_edited', '{}'::jsonb);
exception when check_violation then
  raise exception 'guild_bad_input' using errcode = 'P0001';
end $$;

-- Admins edit identity (name, colour), description and the member limit; the tag and slug stay put.
create function public.guild_admin_edit(p_actor uuid, p_guild uuid, p_name text, p_color text,
                                        p_description text, p_max_members integer) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.guilds;
begin
  perform public.assert_active_role(p_actor, array['admin']);
  g := public.guild_lock(p_guild);
  if p_max_members < (select count(*) from public.guild_members gm where gm.guild_id = p_guild and gm.status = 'active') then
    raise exception 'guild_bad_input' using errcode = 'P0001';
  end if;
  update public.guilds
     set name = btrim(p_name), color = p_color, description = btrim(coalesce(p_description, '')), max_members = p_max_members
   where id = p_guild;
  perform public.guild_audit(p_actor, p_guild, 'guild.edited',
    jsonb_build_object('name', btrim(p_name), 'color', p_color, 'max_members', p_max_members));
exception when check_violation then
  raise exception 'guild_bad_input' using errcode = 'P0001';
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'guild_edit_profile(uuid, uuid, text)',
    'guild_admin_edit(uuid, uuid, text, text, text, integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
