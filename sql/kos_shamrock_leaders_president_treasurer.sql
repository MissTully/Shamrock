-- Authoritative officer split (Melissa / Shamrock Leaders):
--   Tim Fitzpatrick  = President (NOT Treasurer). member_role officer.
--   Patrick Pustay   = Treasurer · Committee Chair of Finance. member_role officer.
-- Does not reintroduce Mandy Franklin or Dayna Olmsted.
-- Safe to run more than once.
-- Applied to oazwkwflgbthojvnclfc as shamrock_leaders_president_treasurer.

CREATE OR REPLACE FUNCTION public.kos_sync_roster_role_grants(p_member uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  t text;
  v_committee text;
BEGIN
  IF p_member IS NULL THEN
    RETURN;
  END IF;

  SELECT m.member_role, m.officer_title, m.membership_status
    INTO rec
  FROM public.members m
  WHERE m.id = p_member AND m.merged_into IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF coalesce(rec.membership_status, 'active') NOT IN ('active', 'pending-renewal') THEN
    RETURN;
  END IF;

  IF rec.member_role IN ('officer', 'captain') THEN
    INSERT INTO public.member_roles (user_id, role)
    SELECT p.id, rec.member_role
    FROM public.profiles p
    WHERE p.member_id = p_member
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF rec.member_role = 'board' THEN
    INSERT INTO public.member_roles (user_id, role)
    SELECT p.id, 'board'
    FROM public.profiles p
    WHERE p.member_id = p_member
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  FOREACH t IN ARRAY regexp_split_to_array(coalesce(rec.officer_title, ''), '\s*·\s*')
  LOOP
    t := btrim(t);
    IF t = '' THEN
      CONTINUE;
    ELSIF t ILIKE 'President' OR t ILIKE 'Vice President' THEN
      INSERT INTO public.member_roles (user_id, role)
      SELECT p.id, 'officer' FROM public.profiles p WHERE p.member_id = p_member
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSIF t ILIKE 'Treasurer' THEN
      INSERT INTO public.member_roles (user_id, role)
      SELECT p.id, r FROM public.profiles p
      CROSS JOIN (VALUES ('treasurer'), ('officer')) AS x(r)
      WHERE p.member_id = p_member
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSIF t ILIKE 'Secretary' THEN
      INSERT INTO public.member_roles (user_id, role)
      SELECT p.id, r FROM public.profiles p
      CROSS JOIN (VALUES ('secretary'), ('officer')) AS x(r)
      WHERE p.member_id = p_member
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSIF t ILIKE 'Board Member' THEN
      INSERT INTO public.member_roles (user_id, role)
      SELECT p.id, 'board' FROM public.profiles p WHERE p.member_id = p_member
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSIF t ~* '^Committee Chair of ' THEN
      v_committee := btrim(substring(t from '(?i)^Committee Chair of\s+(.*)$'));
      IF v_committee <> '' THEN
        INSERT INTO public.member_roles (user_id, role, committee)
        SELECT p.id, 'committee', v_committee
        FROM public.profiles p
        WHERE p.member_id = p_member
        ON CONFLICT (user_id, role) DO UPDATE
          SET committee = coalesce(excluded.committee, public.member_roles.committee),
              granted_at = now();
      END IF;
    END IF;
  END LOOP;

  IF coalesce(rec.officer_title, '') !~* 'treasurer' THEN
    DELETE FROM public.member_roles r
     USING public.profiles p
     WHERE r.user_id = p.id
       AND p.member_id = p_member
       AND r.role = 'treasurer';
  END IF;
  IF coalesce(rec.officer_title, '') !~* 'secretary' THEN
    DELETE FROM public.member_roles r
     USING public.profiles p
     WHERE r.user_id = p.id
       AND p.member_id = p_member
       AND r.role = 'secretary';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.kos_sync_roster_role_grants(uuid) FROM PUBLIC, anon, authenticated;

UPDATE public.members
   SET first_name        = 'Tim',
       last_name         = 'Fitzpatrick',
       member_role       = 'officer',
       officer_title     = 'President',
       membership_status = 'active',
       profile_visible   = true,
       updated_at        = now()
 WHERE merged_into IS NULL
   AND lower(email) = 'tim.fitzpatrick@lumen.com';

UPDATE public.members
   SET first_name        = 'Patrick',
       last_name         = 'Pustay',
       member_role       = 'officer',
       officer_title     = 'Treasurer · Committee Chair of Finance',
       membership_status = 'active',
       profile_visible   = true,
       updated_at        = now()
 WHERE merged_into IS NULL
   AND lower(email) = 'ppustay1@gmail.com';

SELECT public.kos_sync_roster_role_grants(id)
  FROM public.members
 WHERE merged_into IS NULL
   AND lower(email) IN ('tim.fitzpatrick@lumen.com', 'ppustay1@gmail.com');
