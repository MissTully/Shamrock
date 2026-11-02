-- Rename the 60 Clover priority shift in Clover requests.
-- Only the label text changes; the code (volunteer_priority) and the 60 Clovers stay the same.
-- Existing requests keep the label they were filed with.
-- Recreated from the live definition on 2026-11-02.

CREATE OR REPLACE FUNCTION public.submit_clover_request(p_activity_code text, p_guest_count integer DEFAULT NULL::integer, p_event_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_member uuid;
  v_code text := lower(trim(coalesce(p_activity_code, '')));
  v_label text;
  v_clovers int;
  v_guests int;
  v_id uuid;
  v_year int := public.craic_season_year();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Not signed in');
  END IF;

  v_member := public._clover_request_member_id();
  IF v_member IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'You are not on the krewe roster yet');
  END IF;

  CASE v_code
    WHEN 'attend_event' THEN v_label := 'Attend an event (verified)'; v_clovers := 20;
    WHEN 'attend_meeting' THEN v_label := 'Attend a members'' meeting'; v_clovers := 15;
    WHEN 'attend_ikc_event' THEN v_label := 'Attend another IKC krewe''s event'; v_clovers := 25;
    WHEN 'volunteer_event' THEN v_label := 'Volunteer at an event'; v_clovers := 30;
    WHEN 'volunteer_priority' THEN v_label := 'Priority shift bonus (officers flag hard-to-fill spots like security or float duty)'; v_clovers := 60;
    WHEN 'organize_event' THEN v_label := 'Organize an event'; v_clovers := 50;
    WHEN 'bring_guest' THEN
      v_label := 'Bring a guest';
      v_guests := coalesce(p_guest_count, 0);
      IF v_guests < 1 OR v_guests > 3 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Guest count must be 1 to 3');
      END IF;
      v_clovers := v_guests * 5;
    WHEN 'dues_on_time' THEN v_label := 'Pay your dues on time'; v_clovers := 25;
    WHEN 'dues_early' THEN v_label := 'Pay your dues early (by St. Paddy''s)'; v_clovers := 15;
    WHEN 'refer_member' THEN v_label := 'Refer a member who joins'; v_clovers := 40;
    ELSE
      RETURN jsonb_build_object('ok', false, 'message', 'Unknown activity');
  END CASE;

  INSERT INTO public.clover_requests (
    member_id, activity_code, activity_label, clovers, guest_count,
    event_name, notes, season_year
  ) VALUES (
    v_member, v_code, v_label, v_clovers,
    CASE WHEN v_code = 'bring_guest' THEN v_guests ELSE NULL END,
    nullif(trim(coalesce(p_event_name, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_year
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
