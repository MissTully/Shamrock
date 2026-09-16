-- Melissa 2026-09-16: Tammy Miller alone is Chair of Merchandise.
-- Deb Rutkowski is not Merchandise chair — clear that title if present.
-- Does not delete Deb’s member row. Does not change Tim or Patrick.
-- Applied to oazwkwflgbthojvnclfc as shamrock_leaders_tammy_merchandise
-- and shamrock_leaders_deb_not_merchandise_chair.

UPDATE public.members
   SET officer_title = 'Chair of Merchandise',
       member_role   = 'member',
       membership_status = CASE
         WHEN membership_status IN ('merged') THEN membership_status
         ELSE 'active'
       END,
       profile_visible = true,
       updated_at = now()
 WHERE merged_into IS NULL
   AND lower(email) = lower('tammymillerkos@gmail.com');

UPDATE public.members
   SET officer_title = NULL,
       updated_at    = now()
 WHERE merged_into IS NULL
   AND lower(email) = lower('debrski1@gmail.com')
   AND coalesce(officer_title, '') ~* 'merchandise';

DELETE FROM public.member_roles r
 USING public.profiles p
 JOIN public.members m ON m.id = p.member_id
 WHERE r.user_id = p.id
   AND lower(m.email) = lower('debrski1@gmail.com')
   AND r.role = 'committee'
   AND coalesce(r.committee, '') ILIKE 'Merchandise';

SELECT public.kos_sync_roster_role_grants(id)
  FROM public.members
 WHERE merged_into IS NULL
   AND lower(email) IN (lower('tammymillerkos@gmail.com'), lower('debrski1@gmail.com'));
