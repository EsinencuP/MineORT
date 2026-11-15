-- Review fix: take the guild lock first, then read the membership under that lock, so a concurrent
-- owner transfer cannot slip between the "is this the owner?" check and the update (last-owner guard).
create or replace function public.guild_leave(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid; gm public.guild_members;
begin
  select m.guild_id into gid from public.guild_members m where m.user_id = p_user and m.status = 'active';
  if gid is null then raise exception 'guild_member_not_found' using errcode = 'P0001'; end if;
  perform public.guild_lock(gid, true);
  select * into gm from public.guild_members m
   where m.guild_id = gid and m.user_id = p_user and m.status = 'active' for update;
  if not found then raise exception 'guild_member_not_found' using errcode = 'P0001'; end if;
  if gm.is_owner then raise exception 'guild_last_owner' using errcode = 'P0001'; end if;
  update public.guild_members set status = 'left', ended_at = now(), ended_by = p_user where id = gm.id;
  perform public.guild_audit(p_user, gid, 'guild.member_left', '{}'::jsonb);
end $$;
