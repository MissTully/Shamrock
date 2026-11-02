-- Craic Cup: Missed Clovers (one-time-style reconciliation).
-- A member picks MANY past events in one submission and, for each event, the
-- activity (RSVP, attend, volunteer, ...). That becomes ONE claim with line
-- items. Officers see it as one "Missed Clovers" card in Approvals, with each
-- line, its Clovers, and a total; they approve all or approve/deny lines.
-- Approval posts one clover_ledger row per approved line. Lines whose Clovers
-- already exist in the ledger are skipped (idempotent), never double-posted.
-- NOT APPLIED. Apply via execute_sql after Melissa approves.

-- 1) Tables --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clover_recon_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id),
  notes text,
  proof_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','decided')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);
CREATE INDEX IF NOT EXISTS clover_recon_claims_member_idx ON public.clover_recon_claims (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clover_recon_claims_pending_idx ON public.clover_recon_claims (created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.clover_recon_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.clover_recon_claims(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id),
  activity_code text NOT NULL,
  activity_label text NOT NULL,
  clovers int NOT NULL CHECK (clovers > 0),
  guest_count int,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  wa_event_id bigint,
  event_name text,
  event_date date NOT NULL,
  season_year int NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','skipped')),
  decision_note text,
  decided_at timestamptz,
  decided_by uuid,
  ledger_id uuid REFERENCES public.clover_ledger(id)
);
CREATE INDEX IF NOT EXISTS clover_recon_lines_claim_idx ON public.clover_recon_lines (claim_id);
CREATE INDEX IF NOT EXISTS clover_recon_lines_member_idx ON public.clover_recon_lines (member_id, activity_code);

ALTER TABLE public.clover_recon_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clover_recon_lines ENABLE ROW LEVEL SECURITY;
-- No direct policies: all access goes through the SECURITY DEFINER functions below.
REVOKE ALL ON public.clover_recon_claims, public.clover_recon_lines FROM anon, authenticated;

-- 2) Helpers ---------------------------------------------------------------
-- Ledger reasons that already count for an activity.
CREATE OR REPLACE FUNCTION public._missed_clover_reasons(p_code text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_code
    WHEN 'rsvp' THEN ARRAY['rsvp']
    WHEN 'attend_event' THEN ARRAY['attend','attend_event']
    WHEN 'attend_meeting' THEN ARRAY['attend','attend_meeting']
    WHEN 'attend_ikc_event' THEN ARRAY['attend_ikc_event']
    WHEN 'volunteer_event' THEN ARRAY['volunteer_event','volunteer_bonus']
    WHEN 'volunteer_priority' THEN ARRAY['volunteer_priority','volunteer_priority_bonus']
    WHEN 'organize_event' THEN ARRAY['organize_event','organizer_bonus']
    WHEN 'bring_guest' THEN ARRAY['bring_guest','guests']
    WHEN 'dues_on_time' THEN ARRAY['dues_on_time']
    WHEN 'dues_early' THEN ARRAY['dues_early']
    WHEN 'refer_member' THEN ARRAY['refer_member','referral']
    ELSE ARRAY[p_code]
  END;
$$;

-- Validate and price one line. Returns jsonb with ok/message and the resolved
-- fields, plus duplicate=true when the ledger or another live claim has it.
CREATE OR REPLACE FUNCTION public._missed_clover_line(p_member uuid, p_line jsonb, p_skip_claim uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_code text := lower(trim(coalesce(p_line->>'activity_code','')));
  v_event_id uuid := nullif(p_line->>'event_id','')::uuid;
  v_wa bigint := nullif(p_line->>'wa_event_id','')::bigint;
  v_name text := nullif(trim(coalesce(p_line->>'event_name','')),'');
  v_date date := nullif(p_line->>'event_date','')::date;
  v_guests int := nullif(p_line->>'guest_count','')::int;
  v_sugg int := nullif(p_line->>'clovers','')::int;
  v_note text := nullif(trim(coalesce(p_line->>'note','')),'');
  v_label text; v_clovers int; v_year int; v_reasons text[];
  v_dup text;
BEGIN
  IF v_event_id IS NOT NULL THEN
    SELECT e.name, coalesce(v_date, (e.start_time AT TIME ZONE 'America/New_York')::date)
      INTO v_name, v_date FROM public.events e WHERE e.id = v_event_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'message','Event not found'); END IF;
  ELSIF v_wa IS NOT NULL THEN
    SELECT min(l.event_title), coalesce(v_date, (min(l.event_start) AT TIME ZONE 'America/New_York')::date)
      INTO v_name, v_date FROM public.legacy_event_registrations l WHERE l.wa_event_id = v_wa;
    IF v_name IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Old-site event not found'); END IF;
  END IF;

  CASE v_code
    WHEN 'rsvp' THEN v_label := 'RSVP to an event'; v_clovers := 5;
    WHEN 'attend_event' THEN v_label := 'Attend an event (verified)'; v_clovers := 20;
    WHEN 'attend_meeting' THEN v_label := 'Attend a members'' meeting'; v_clovers := 15;
    WHEN 'attend_ikc_event' THEN v_label := 'Attend another IKC krewe''s event'; v_clovers := 20;
    WHEN 'volunteer_event' THEN v_label := 'Volunteer at an event'; v_clovers := 30;
    WHEN 'volunteer_priority' THEN v_label := 'Priority shift bonus (officers flag hard-to-fill spots like security or float duty)'; v_clovers := 60;
    WHEN 'organize_event' THEN v_label := 'Organize an event'; v_clovers := 50;
    WHEN 'bring_guest' THEN
      v_label := 'Bring a guest';
      IF coalesce(v_guests,0) < 1 OR v_guests > 3 THEN RETURN jsonb_build_object('ok',false,'message','Guest count must be 1 to 3'); END IF;
      v_clovers := v_guests * 5;
    WHEN 'dues_on_time' THEN v_label := 'Pay your dues on time'; v_clovers := 25;
    WHEN 'dues_early' THEN v_label := 'Pay your dues early (by St. Paddy''s)'; v_clovers := 15;
    WHEN 'refer_member' THEN v_label := 'Refer a member who joins'; v_clovers := 40;
    WHEN 'other' THEN
      v_label := 'Other (officer review)'; v_clovers := coalesce(v_sugg,0);
      IF v_clovers < 1 OR v_clovers > 60 THEN RETURN jsonb_build_object('ok',false,'message','For Other, suggest 1 to 60 Clovers'); END IF;
      IF v_note IS NULL THEN RETURN jsonb_build_object('ok',false,'message','For Other, add a note explaining it'); END IF;
    ELSE RETURN jsonb_build_object('ok',false,'message','Pick an activity');
  END CASE;

  IF v_date IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Add the date'); END IF;
  IF v_date > (now() AT TIME ZONE 'America/New_York')::date THEN
    RETURN jsonb_build_object('ok',false,'message','Missed Clovers are for things that already happened');
  END IF;
  IF v_name IS NULL AND v_code NOT IN ('dues_on_time','dues_early') THEN
    RETURN jsonb_build_object('ok',false,'message','Pick the event or type its name');
  END IF;

  v_year := public.craic_season_year((v_date::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York');
  v_reasons := public._missed_clover_reasons(v_code);

  IF v_code IN ('dues_on_time','dues_early') THEN
    IF EXISTS (SELECT 1 FROM public.clover_ledger l WHERE l.member_id = p_member
                AND l.reason = ANY(v_reasons) AND l.season_year = v_year) THEN
      v_dup := 'Already in your Clovers for that season';
    END IF;
  ELSIF v_code <> 'other' THEN
    IF EXISTS (SELECT 1 FROM public.clover_ledger l WHERE l.member_id = p_member
                AND l.reason = ANY(v_reasons)
                AND ((v_event_id IS NOT NULL AND l.event_id = v_event_id)
                     OR lower(trim(coalesce(l.event_name,''))) = lower(v_name))) THEN
      v_dup := 'Already in your Clovers for this event';
    END IF;
  END IF;
  IF v_dup IS NULL AND EXISTS (
      SELECT 1 FROM public.clover_recon_lines x
       WHERE x.member_id = p_member AND x.activity_code = v_code
         AND x.status IN ('pending','approved')
         AND (p_skip_claim IS NULL OR x.claim_id <> p_skip_claim)
         AND ( (v_event_id IS NOT NULL AND x.event_id = v_event_id)
            OR (v_wa IS NOT NULL AND x.wa_event_id = v_wa)
            OR (v_name IS NOT NULL AND lower(coalesce(x.event_name,'')) = lower(v_name) AND x.event_date = v_date)
            OR (v_code IN ('dues_on_time','dues_early') AND x.season_year = v_year) )) THEN
    v_dup := 'Already claimed (pending or approved)';
  END IF;
  IF v_dup IS NULL AND v_code = 'attend_ikc_event' AND EXISTS (
      SELECT 1 FROM public.clover_requests r WHERE r.member_id = p_member AND r.activity_code = v_code
         AND r.status IN ('pending','approved') AND lower(coalesce(r.event_name,'')) = lower(v_name)) THEN
    v_dup := 'Already claimed with Claim Clovers';
  END IF;

  RETURN jsonb_build_object('ok', v_dup IS NULL, 'duplicate', v_dup IS NOT NULL, 'message', v_dup,
    'activity_code', v_code, 'activity_label', v_label, 'clovers', v_clovers,
    'guest_count', CASE WHEN v_code='bring_guest' THEN v_guests END,
    'event_id', v_event_id, 'wa_event_id', v_wa, 'event_name', v_name,
    'event_date', v_date, 'season_year', v_year, 'note', v_note);
END;
$$;

-- 3) Past events to pick from (site events plus old Wild Apricot events) ---
CREATE OR REPLACE FUNCTION public.list_missed_clover_events()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY x->>'start_time' DESC) FROM (
      SELECT jsonb_build_object('kind','site','id',e.id,'name',e.name,'start_time',e.start_time,'source',e.source) x
        FROM public.events e
       WHERE e.start_time < now() AND e.start_time > now() - interval '2 years'
         AND coalesce(e.status,'published') NOT IN ('cancelled','draft')
      UNION ALL
      SELECT jsonb_build_object('kind','old_site','wa_event_id',l.wa_event_id,'name',min(l.event_title),'start_time',min(l.event_start),'source','wild_apricot')
        FROM public.legacy_event_registrations l
       WHERE l.event_id IS NULL AND l.wa_event_id IS NOT NULL
         AND l.event_start > now() - interval '2 years'
       GROUP BY l.wa_event_id
    ) s
  ), '[]'::jsonb);
END;
$$;

-- 4) Pre-submit check: per-line warnings, nothing saved ---------------------
CREATE OR REPLACE FUNCTION public.check_missed_clovers(p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_member uuid; v_out jsonb := '[]'::jsonb; v_l jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Please sign in first'); END IF;
  v_member := public._clover_request_member_id();
  IF v_member IS NULL THEN RETURN jsonb_build_object('ok',false,'message','You are not on the krewe roster yet'); END IF;
  FOR v_l IN SELECT * FROM jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) LOOP
    v_out := v_out || jsonb_build_array(public._missed_clover_line(v_member, v_l));
  END LOOP;
  RETURN jsonb_build_object('ok',true,'lines',v_out);
END;
$$;

-- 5) Submit one claim with many lines ---------------------------------------
-- Lines that are invalid or duplicates are refused with per-line messages;
-- nothing is saved unless every line is clean (the form drops flagged lines).
CREATE OR REPLACE FUNCTION public.submit_missed_clovers(p_lines jsonb, p_notes text DEFAULT NULL, p_proof_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_member uuid; v_claim uuid; v_l jsonb; v_r jsonb; v_checked jsonb := '[]'::jsonb;
  v_bad int := 0; v_total int := 0; v_n int; v_proof text := nullif(trim(coalesce(p_proof_url,'')),'');
  v_keys text[] := '{}'; v_key text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Please sign in first'); END IF;
  v_member := public._clover_request_member_id();
  IF v_member IS NULL THEN RETURN jsonb_build_object('ok',false,'message','You are not on the krewe roster yet'); END IF;
  v_n := jsonb_array_length(coalesce(p_lines,'[]'::jsonb));
  IF v_n < 1 THEN RETURN jsonb_build_object('ok',false,'message','Add at least one event'); END IF;
  IF v_n > 60 THEN RETURN jsonb_build_object('ok',false,'message','Up to 60 lines per claim'); END IF;
  IF v_proof IS NOT NULL AND v_proof !~* '^https?://' THEN
    RETURN jsonb_build_object('ok',false,'message','The proof link must start with http:// or https://');
  END IF;

  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_r := public._missed_clover_line(v_member, v_l);
    IF (v_r->>'ok')::boolean THEN
      v_key := concat_ws('|', v_r->>'activity_code', coalesce(v_r->>'event_id', v_r->>'wa_event_id', lower(v_r->>'event_name')), v_r->>'event_date');
      IF v_key = ANY(v_keys) THEN
        v_r := v_r || jsonb_build_object('ok',false,'duplicate',true,'message','Listed twice in this claim');
      ELSE v_keys := v_keys || v_key; END IF;
    END IF;
    IF NOT coalesce((v_r->>'ok')::boolean,false) THEN v_bad := v_bad + 1; END IF;
    v_checked := v_checked || jsonb_build_array(v_r);
  END LOOP;
  IF v_bad > 0 THEN
    RETURN jsonb_build_object('ok',false,'message','Some lines need fixing or are already credited','lines',v_checked);
  END IF;

  INSERT INTO public.clover_recon_claims (member_id, notes, proof_url)
  VALUES (v_member, nullif(trim(coalesce(p_notes,'')),''), v_proof) RETURNING id INTO v_claim;

  FOR v_r IN SELECT * FROM jsonb_array_elements(v_checked) LOOP
    INSERT INTO public.clover_recon_lines (claim_id, member_id, activity_code, activity_label, clovers, guest_count,
      event_id, wa_event_id, event_name, event_date, season_year, note)
    VALUES (v_claim, v_member, v_r->>'activity_code', v_r->>'activity_label', (v_r->>'clovers')::int,
      nullif(v_r->>'guest_count','')::int, nullif(v_r->>'event_id','')::uuid, nullif(v_r->>'wa_event_id','')::bigint,
      v_r->>'event_name', (v_r->>'event_date')::date, (v_r->>'season_year')::int, v_r->>'note');
    v_total := v_total + (v_r->>'clovers')::int;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'id',v_claim,'lines',v_n,'total',v_total);
END;
$$;

-- 6) Claim JSON (shared by member and officer views) ------------------------
CREATE OR REPLACE FUNCTION public._missed_clover_claim_json(p_claim uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'member_id', c.member_id,
    'member_name', trim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
    'member_email', m.email, 'notes', c.notes, 'proof_url', c.proof_url,
    'status', c.status, 'created_at', c.created_at, 'decided_at', c.decided_at,
    'total', (SELECT coalesce(sum(l.clovers),0) FROM public.clover_recon_lines l WHERE l.claim_id = c.id),
    'approved_total', (SELECT coalesce(sum(l.clovers),0) FROM public.clover_recon_lines l WHERE l.claim_id = c.id AND l.status = 'approved'),
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'activity_code', l.activity_code, 'activity_label', l.activity_label,
        'clovers', l.clovers, 'guest_count', l.guest_count, 'event_id', l.event_id,
        'wa_event_id', l.wa_event_id, 'event_name', l.event_name, 'event_date', l.event_date,
        'season_year', l.season_year, 'note', l.note, 'status', l.status, 'decision_note', l.decision_note
      ) ORDER BY l.event_date, l.event_name) FROM public.clover_recon_lines l WHERE l.claim_id = c.id), '[]'::jsonb))
  FROM public.clover_recon_claims c JOIN public.members m ON m.id = c.member_id
  WHERE c.id = p_claim;
$$;

CREATE OR REPLACE FUNCTION public.list_my_missed_clovers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_member uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
  v_member := public._clover_request_member_id();
  IF v_member IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(public._missed_clover_claim_json(c.id) ORDER BY c.created_at DESC)
    FROM public.clover_recon_claims c WHERE c.member_id = v_member), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_pending_missed_clovers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_krewe_officer() THEN RETURN NULL; END IF;
  RETURN coalesce((SELECT jsonb_agg(public._missed_clover_claim_json(c.id) ORDER BY c.created_at)
    FROM public.clover_recon_claims c WHERE c.status = 'pending'), '[]'::jsonb);
END;
$$;

-- 7) Officer decision: approve and/or deny lines. p_approve / p_deny are line
--    ids; pass p_approve_all = true to approve every pending line. Approved
--    lines post one ledger row each; lines already in the ledger are marked
--    'skipped' instead (idempotent). Claim closes when no line is pending.
CREATE OR REPLACE FUNCTION public.decide_missed_clovers(
  p_claim_id uuid, p_approve uuid[] DEFAULT '{}', p_deny uuid[] DEFAULT '{}',
  p_approve_all boolean DEFAULT false, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_claim public.clover_recon_claims%ROWTYPE;
  v_line public.clover_recon_lines%ROWTYPE;
  v_ledger uuid; v_reasons text[];
  v_ok int := 0; v_skip int := 0; v_den int := 0; v_posted int := 0;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
BEGIN
  IF NOT public.is_krewe_officer() THEN RETURN jsonb_build_object('ok',false,'message','Officers only'); END IF;
  SELECT * INTO v_claim FROM public.clover_recon_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'message','Claim not found'); END IF;

  FOR v_line IN SELECT * FROM public.clover_recon_lines
                 WHERE claim_id = p_claim_id AND status = 'pending'
                 ORDER BY event_date FOR UPDATE LOOP
    IF v_line.id = ANY(coalesce(p_deny,'{}')) THEN
      UPDATE public.clover_recon_lines SET status='denied', decision_note=v_note, decided_at=now(), decided_by=auth.uid()
       WHERE id = v_line.id;
      v_den := v_den + 1;
    ELSIF p_approve_all OR v_line.id = ANY(coalesce(p_approve,'{}')) THEN
      v_reasons := public._missed_clover_reasons(v_line.activity_code);
      IF v_line.activity_code <> 'other' AND EXISTS (
          SELECT 1 FROM public.clover_ledger l WHERE l.member_id = v_line.member_id AND l.reason = ANY(v_reasons)
             AND ( (v_line.activity_code IN ('dues_on_time','dues_early') AND l.season_year = v_line.season_year)
                OR (v_line.activity_code NOT IN ('dues_on_time','dues_early')
                    AND ((v_line.event_id IS NOT NULL AND l.event_id = v_line.event_id)
                         OR lower(trim(coalesce(l.event_name,''))) = lower(coalesce(v_line.event_name,'')))) )) THEN
        UPDATE public.clover_recon_lines SET status='skipped', decision_note='Already in the ledger', decided_at=now(), decided_by=auth.uid()
         WHERE id = v_line.id;
        v_skip := v_skip + 1;
      ELSE
        BEGIN
          INSERT INTO public.clover_ledger (member_id, clovers, reason, season_year, event_id, event_name, notes, created_by)
          VALUES (v_line.member_id, v_line.clovers, v_line.activity_code, v_line.season_year, v_line.event_id, v_line.event_name,
            trim(both FROM concat_ws(' · ', 'Missed Clovers', v_line.activity_label,
              CASE WHEN v_line.guest_count IS NOT NULL THEN v_line.guest_count::text || ' guest' || CASE WHEN v_line.guest_count = 1 THEN '' ELSE 's' END END,
              to_char(v_line.event_date,'Mon DD, YYYY'), v_line.note, v_note)),
            auth.uid())
          RETURNING id INTO v_ledger;
          UPDATE public.clover_recon_lines SET status='approved', ledger_id=v_ledger, decision_note=v_note, decided_at=now(), decided_by=auth.uid()
           WHERE id = v_line.id;
          v_ok := v_ok + 1; v_posted := v_posted + v_line.clovers;
        EXCEPTION WHEN unique_violation THEN
          UPDATE public.clover_recon_lines SET status='skipped', decision_note='Already in the ledger', decided_at=now(), decided_by=auth.uid()
           WHERE id = v_line.id;
          v_skip := v_skip + 1;
        END;
      END IF;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.clover_recon_lines WHERE claim_id = p_claim_id AND status = 'pending') THEN
    UPDATE public.clover_recon_claims SET status='decided', decided_at=now(), decided_by=auth.uid() WHERE id = p_claim_id;
  END IF;

  RETURN jsonb_build_object('ok',true,'approved',v_ok,'skipped',v_skip,'denied',v_den,'clovers_posted',v_posted);
END;
$$;

-- 8) Grants -----------------------------------------------------------------
REVOKE ALL ON FUNCTION public._missed_clover_line(uuid,jsonb,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._missed_clover_claim_json(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_missed_clover_events() FROM public, anon;
REVOKE ALL ON FUNCTION public.check_missed_clovers(jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.submit_missed_clovers(jsonb,text,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.list_my_missed_clovers() FROM public, anon;
REVOKE ALL ON FUNCTION public.list_pending_missed_clovers() FROM public, anon;
REVOKE ALL ON FUNCTION public.decide_missed_clovers(uuid,uuid[],uuid[],boolean,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_missed_clover_events(), public.check_missed_clovers(jsonb),
  public.submit_missed_clovers(jsonb,text,text), public.list_my_missed_clovers(),
  public.list_pending_missed_clovers(), public.decide_missed_clovers(uuid,uuid[],uuid[],boolean,text) TO authenticated;
