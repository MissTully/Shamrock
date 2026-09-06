-- Roster names alone must not skip the welcome questionnaire.
-- profile_complete requires first/last saved on profiles (via complete_krewe_profile).
-- Already applied on project oazwkwflgbthojvnclfc.
CREATE OR REPLACE FUNCTION public.get_my_krewe_profile()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'profile_complete',   (p.first_name is not null and p.last_name is not null),
    'roster_matched',     (p.member_id is not null)
  )
  from public.profiles p
  left join public.members m on m.id = p.member_id and m.merged_into is null
  where p.id = auth.uid();
$function$;
