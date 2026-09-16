-- Melissa 2026-09-16: Tammy Miller is Chair of Merchandise (short form,
-- same as Douglas Tully’s Chair of Technology). member_role stays member
-- so Shop Studio remains shopOnly. Deb Rutkowski stays Merchandise co-chair
-- until Melissa says otherwise — this file does not delete or demote Deb.
-- Does not change Tim (President) or Patrick (Treasurer).
-- Applied to oazwkwflgbthojvnclfc as shamrock_leaders_tammy_merchandise.

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

SELECT public.kos_sync_roster_role_grants(id)
  FROM public.members
 WHERE merged_into IS NULL
   AND lower(email) = lower('tammymillerkos@gmail.com');
