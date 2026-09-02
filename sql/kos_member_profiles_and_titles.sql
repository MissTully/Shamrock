-- Krewe of Shamrock — member profiles and officer titles
-- Safe to run more than once.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS officer_title text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS hometown text,
  ADD COLUMN IF NOT EXISTS parade_since integer,
  ADD COLUMN IF NOT EXISTS interests text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS profile_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.members.officer_title IS
  'Display title shown on the profile and directory. Not used for access control.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS photo_url text;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hometown text;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parade_since integer;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests text;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.v_member_profiles AS
SELECT
  m.id AS member_id,
  m.first_name,
  m.last_name,
  m.member_role,
  m.membership_status,
  m.officer_title,
  m.bio,
  m.hometown,
  m.parade_since,
  m.interests,
  m.photo_url,
  m.join_date
FROM public.members m
WHERE COALESCE(m.membership_status, 'active') = 'active'
  AND COALESCE(m.profile_visible, true) = true
  AND COALESCE(m.member_role, 'member') <> 'prospect';

ALTER VIEW public.v_member_profiles SET (security_invoker = false);
GRANT SELECT ON public.v_member_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_member_profile(
  p_first text,
  p_last text,
  p_phone text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_hometown text DEFAULT NULL,
  p_parade_since integer DEFAULT NULL,
  p_interests text DEFAULT NULL,
  p_photo_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid uuid;
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first.';
  END IF;
  mid := public.kos_current_member_id();
  IF mid IS NULL THEN
    RAISE EXCEPTION 'Your login is not linked to a member record yet. Ask an officer to link you.';
  END IF;
  IF p_first IS NULL OR length(trim(p_first)) < 1 OR p_last IS NULL OR length(trim(p_last)) < 1 THEN
    RAISE EXCEPTION 'First and last name are required.';
  END IF;
  UPDATE public.members
  SET
    first_name    = left(trim(p_first), 80),
    last_name     = left(trim(p_last), 80),
    phone         = NULLIF(left(trim(COALESCE(p_phone, '')), 40), ''),
    bio           = NULLIF(left(trim(COALESCE(p_bio, '')), 400), ''),
    hometown      = NULLIF(left(trim(COALESCE(p_hometown, '')), 80), ''),
    parade_since  = CASE
                      WHEN p_parade_since IS NULL THEN parade_since
                      WHEN p_parade_since < 1998 OR p_parade_since > 2100 THEN parade_since
                      ELSE p_parade_since
                    END,
    interests     = NULLIF(left(trim(COALESCE(p_interests, '')), 240), ''),
    photo_url     = NULLIF(left(trim(COALESCE(p_photo_url, '')), 600), ''),
    updated_at    = now()
  WHERE id = mid;
  BEGIN
    PERFORM public.complete_krewe_profile(
      left(trim(p_first), 80),
      left(trim(p_last), 80),
      NULLIF(left(trim(COALESCE(p_phone, '')), 40), ''),
      NULLIF(left(trim(COALESCE(p_bio, '')), 400), '')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN jsonb_build_object('ok', true, 'member_id', mid);
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_member_profile(text, text, text, text, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_member_profile(text, text, text, text, text, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.officer_set_title_and_role(
  p_member_id uuid,
  p_member_role text,
  p_officer_title text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_ok boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_krewe_officer() THEN
    RAISE EXCEPTION 'Only a krewe officer can change roles and titles.';
  END IF;
  role_ok := lower(trim(p_member_role)) IN ('member', 'officer', 'captain', 'board', 'prospect');
  IF NOT role_ok THEN
    RAISE EXCEPTION 'Access role must be member, officer, captain, board, or prospect.';
  END IF;
  UPDATE public.members
  SET
    member_role   = lower(trim(p_member_role)),
    officer_title = NULLIF(left(trim(COALESCE(p_officer_title, '')), 80), ''),
    updated_at    = now()
  WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No member found for that id.';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.officer_set_title_and_role(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.officer_set_title_and_role(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_member_public_card(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in first.';
  END IF;
  SELECT
    m.id, m.first_name, m.last_name, m.member_role, m.officer_title,
    m.bio, m.hometown, m.parade_since, m.interests, m.photo_url,
    m.join_date, m.membership_status
  INTO rec
  FROM public.members m
  WHERE m.id = p_member_id
    AND COALESCE(m.profile_visible, true) = true
    AND COALESCE(m.membership_status, 'active') = 'active';
  IF rec.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'member_id', rec.id,
    'first_name', rec.first_name,
    'last_name', rec.last_name,
    'member_role', rec.member_role,
    'officer_title', rec.officer_title,
    'bio', rec.bio,
    'hometown', rec.hometown,
    'parade_since', rec.parade_since,
    'interests', rec.interests,
    'photo_url', rec.photo_url,
    'join_date', rec.join_date,
    'membership_status', rec.membership_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_public_card(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_public_card(uuid) TO authenticated;
