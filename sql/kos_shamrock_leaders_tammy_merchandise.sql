-- Melissa 2026-09-16 (restored): Tammy Miller and Deb Rutkowski are both
-- Chair of Merchandise (co-chairs). member_role stays member so Shop Studio
-- remains shopOnly. Does not change Tim (President) or Patrick (Treasurer).
-- Applied to oazwkwflgbthojvnclfc as shamrock_leaders_merchandise_cochairs.

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
   AND lower(email) IN (lower('tammymillerkos@gmail.com'), lower('debrski1@gmail.com'));

SELECT public.kos_sync_roster_role_grants(id)
  FROM public.members
 WHERE merged_into IS NULL
   AND lower(email) IN (lower('tammymillerkos@gmail.com'), lower('debrski1@gmail.com'));
