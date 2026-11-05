-- Krewe profile phone numbers (NOT applied yet; apply only after Melissa approves).
-- 1) Signed-in members see each other's phone on Krewe profiles.
--    v_member_profiles is security_invoker and granted to authenticated only
--    (no anon grant), so phones stay off the public site. Hidden profiles,
--    prospects, inactive and merged records stay excluded as before.
-- 2) My Krewe shows the phone the member saves. update_my_member_profile writes
--    members.phone, so read members.phone first.

create or replace view public.v_member_profiles
with (security_invoker = true) as
select m.id as member_id, m.first_name, m.last_name, m.member_role, m.membership_status,
       m.officer_title, m.bio, m.hometown, m.parade_since, m.interests, m.hobbies,
       m.favorite_memory, m.fun_fact, m.photo_url, m.join_date,
       case when m.birthday is not null then to_char(m.birthday::timestamptz, 'FMMonth FMDD') end as birthday_md,
       case when m.anniversary is not null then to_char(m.anniversary::timestamptz, 'FMMonth FMDD') end as anniversary_md,
       m.phone
from public.members m
where coalesce(m.membership_status, 'active') = 'active'
  and coalesce(m.profile_visible, true) = true
  and coalesce(m.member_role, 'member') <> 'prospect'
  and m.merged_into is null;

revoke all on public.v_member_profiles from anon;
grant select on public.v_member_profiles to authenticated;

create or replace function public.get_my_krewe_profile()
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'user_id', p.id, 'member_id', p.member_id, 'email', auth.email(),
    'first_name', coalesce(p.first_name, m.first_name),
    'last_name',  coalesce(p.last_name,  m.last_name),
    'display_name', coalesce(
        case when position('@' in coalesce(p.full_name,'')) > 0 then null else p.full_name end,
        nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
        nullif(trim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')), '')),
    'phone', coalesce(m.phone, p.phone),
    'bio', coalesce(m.bio, p.bio), 'hometown', m.hometown, 'parade_since', m.parade_since,
    'interests', m.interests, 'hobbies', m.hobbies, 'favorite_memory', m.favorite_memory,
    'fun_fact', m.fun_fact, 'birthday', m.birthday, 'anniversary', m.anniversary,
    'photo_url', m.photo_url, 'profile_visible', coalesce(m.profile_visible, true),
    'membership_status', m.membership_status, 'member_role', m.member_role,
    'officer_title', m.officer_title,
    'roles', coalesce((select jsonb_agg(r.role) from public.member_roles r where r.user_id = p.id), '[]'::jsonb),
    'pending_role_request', exists (select 1 from public.role_requests q where q.user_id = p.id and q.status = 'pending'),
    'profile_complete', (coalesce(p.first_name, m.first_name) is not null and coalesce(p.last_name, m.last_name) is not null)
  )
  from public.profiles p
  left join public.members m on m.id = p.member_id and m.merged_into is null
  where p.id = auth.uid();
$function$;
