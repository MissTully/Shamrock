-- ============================================================================
-- Krewe of Shamrock — Rich member profiles and profile photos.
-- Applied to the live "Krewe of Shamrock" Supabase project as migrations:
--   port_member_profiles_and_titles   (the kos_member_profiles_and_titles.sql
--                                      objects, which only existed in the old
--                                      Tribe Test project, with anon revoked
--                                      and merged records excluded)
--   rich_member_profiles_and_avatars  (everything below)
--
-- What members get: birthday, anniversary, about-me, hobbies, interests,
-- favorite krewe memory, fun fact, and a profile picture. The community
-- directory view shows birthday/anniversary as MONTH + DAY ONLY — the year
-- is never exposed to other members. Saving goes through
-- update_my_member_profile(), which can never change role, status, or title.
-- ============================================================================

alter table public.members
  add column if not exists birthday date,
  add column if not exists anniversary date,
  add column if not exists hobbies text,
  add column if not exists favorite_memory text,
  add column if not exists fun_fact text;

drop view if exists public.v_member_profiles;
create view public.v_member_profiles as
select
  m.id as member_id, m.first_name, m.last_name, m.member_role,
  m.membership_status, m.officer_title, m.bio, m.hometown, m.parade_since,
  m.interests, m.hobbies, m.favorite_memory, m.fun_fact, m.photo_url,
  m.join_date,
  case when m.birthday    is not null then to_char(m.birthday,    'FMMonth FMDD') end as birthday_md,
  case when m.anniversary is not null then to_char(m.anniversary, 'FMMonth FMDD') end as anniversary_md
from public.members m
where coalesce(m.membership_status, 'active') = 'active'
  and coalesce(m.profile_visible, true) = true
  and coalesce(m.member_role, 'member') <> 'prospect'
  and m.merged_into is null;
alter view public.v_member_profiles set (security_invoker = false);
revoke all on public.v_member_profiles from anon, public;
grant select on public.v_member_profiles to authenticated;

create or replace view public.member_directory as
select m.first_name, m.last_name, m.member_role
from public.members m
where coalesce(m.membership_status, 'active') = 'active'
  and coalesce(m.profile_visible, true) = true
  and coalesce(m.member_role, 'member') <> 'prospect'
  and m.merged_into is null;
alter view public.member_directory set (security_invoker = false);
revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated;

-- The signed-in member reads their own full profile (full dates included).
create or replace function public.get_my_krewe_profile()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'user_id',            p.id,
    'member_id',          p.member_id,
    'email',              auth.email(),
    'first_name',         coalesce(p.first_name, m.first_name),
    'last_name',          coalesce(p.last_name,  m.last_name),
    'display_name',       coalesce(p.full_name,
                            nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')),
    'phone',              coalesce(p.phone, m.phone),
    'bio',                coalesce(m.bio, p.bio),
    'hometown',           m.hometown,
    'parade_since',       m.parade_since,
    'interests',          m.interests,
    'hobbies',            m.hobbies,
    'favorite_memory',    m.favorite_memory,
    'fun_fact',           m.fun_fact,
    'birthday',           m.birthday,
    'anniversary',        m.anniversary,
    'photo_url',          m.photo_url,
    'profile_visible',    coalesce(m.profile_visible, true),
    'membership_status',  m.membership_status,
    'member_role',        m.member_role,
    'officer_title',      m.officer_title,
    'roles',              coalesce((select jsonb_agg(r.role)
                                    from public.member_roles r where r.user_id = p.id), '[]'::jsonb),
    'pending_role_request', exists (select 1 from public.role_requests q
                                    where q.user_id = p.id and q.status = 'pending'),
    'profile_complete',   (coalesce(p.first_name, m.first_name) is not null
                           and coalesce(p.last_name, m.last_name) is not null)
  )
  from public.profiles p
  left join public.members m on m.id = p.member_id and m.merged_into is null
  where p.id = auth.uid();
$$;
revoke all on function public.get_my_krewe_profile() from anon;

-- The signed-in member saves their own profile (never role/status/title).
drop function if exists public.update_my_member_profile(text, text, text, text, text, integer, text, text);
create or replace function public.update_my_member_profile(
  p_first text, p_last text,
  p_phone text default null, p_bio text default null,
  p_hometown text default null, p_parade_since integer default null,
  p_interests text default null, p_photo_url text default null,
  p_birthday date default null, p_anniversary date default null,
  p_hobbies text default null, p_favorite_memory text default null,
  p_fun_fact text default null, p_profile_visible boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mid uuid;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  mid := public.kos_current_member_id();
  if mid is null then
    raise exception 'Your login is not linked to a member record yet. Ask an officer to link you.';
  end if;
  if coalesce(trim(p_first),'') = '' or coalesce(trim(p_last),'') = '' then
    raise exception 'First and last name are required.';
  end if;
  if p_birthday is not null and (p_birthday > current_date or p_birthday < date '1900-01-01') then
    raise exception 'That birthday does not look right.';
  end if;
  if p_anniversary is not null and (p_anniversary > current_date or p_anniversary < date '1900-01-01') then
    raise exception 'That anniversary does not look right.';
  end if;
  update public.members set
    first_name      = left(trim(p_first), 80),
    last_name       = left(trim(p_last), 80),
    phone           = nullif(left(trim(coalesce(p_phone,'')), 40), ''),
    bio             = nullif(left(trim(coalesce(p_bio,'')), 600), ''),
    hometown        = nullif(left(trim(coalesce(p_hometown,'')), 80), ''),
    parade_since    = case when p_parade_since is null then parade_since
                           when p_parade_since < 1998 or p_parade_since > 2100 then parade_since
                           else p_parade_since end,
    interests       = nullif(left(trim(coalesce(p_interests,'')), 240), ''),
    hobbies         = nullif(left(trim(coalesce(p_hobbies,'')), 240), ''),
    favorite_memory = nullif(left(trim(coalesce(p_favorite_memory,'')), 600), ''),
    fun_fact        = nullif(left(trim(coalesce(p_fun_fact,'')), 240), ''),
    photo_url       = coalesce(nullif(left(trim(coalesce(p_photo_url,'')), 600), ''), photo_url),
    birthday        = coalesce(p_birthday, birthday),
    anniversary     = coalesce(p_anniversary, anniversary),
    profile_visible = coalesce(p_profile_visible, profile_visible),
    updated_at      = now()
  where id = mid;
  begin
    perform public.complete_krewe_profile(
      left(trim(p_first), 80), left(trim(p_last), 80),
      nullif(left(trim(coalesce(p_phone,'')), 40), ''),
      nullif(left(trim(coalesce(p_bio,'')), 600), ''));
  exception when others then null;
  end;
  return public.get_my_krewe_profile();
end $$;
revoke all on function public.update_my_member_profile(text,text,text,text,text,integer,text,text,date,date,text,text,text,boolean) from public, anon;
grant execute on function public.update_my_member_profile(text,text,text,text,text,integer,text,text,date,date,text,text,text,boolean) to authenticated;

-- Profile photo storage: public read, each member writes only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
