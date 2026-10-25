-- ============================================================================
-- Data fix: merge the duplicate Douglas Tully prospect record.
--
-- (Also applied to Supabase as migration kos_merge_duplicate_doug_tully_prospect.)
--
-- A Shamrock Book Club Night RSVP submitted under doug@theonefor.ai on
-- 2026-09-14 did not match Doug's real member record (his roster email is
-- the ProtonMail address), so the signup flow auto-created a second
-- "Douglas Tully" as a prospect, with its own signup row and +5 RSVP Clover.
--
-- The real record ALREADY carried the same event signup, the same +5 RSVP
-- Clover for that event, and the doug@theonefor.ai alias in
-- member_email_aliases (all back-filled by kos_zeffy_payment_match_rsvp_fix),
-- so every history row on the duplicate collides and stays attached to the
-- retired record — the same outcome public.merge_members() produces. This
-- runs as a migration because merge_members() requires a signed-in officer
-- (auth.uid()), which a server-side migration does not have.
-- ============================================================================
DO $$
DECLARE
  v_keep uuid := '11fd6285-7ead-4790-b573-db2744742ecd';  -- real Douglas Tully
  v_dup  uuid := '51d643fb-e9c4-4393-9e6f-4af188d4dcc3';  -- prospect duplicate
BEGIN
  IF EXISTS (SELECT 1 FROM public.members
             WHERE id IN (v_keep, v_dup) AND merged_into IS NOT NULL) THEN
    RAISE EXCEPTION 'One of these records was already merged';
  END IF;

  -- Re-point history rows that would NOT collide with the keep record
  -- (none are expected today; kept for safety and self-documentation).
  UPDATE public.event_signups s SET member_id = v_keep
   WHERE s.member_id = v_dup
     AND NOT EXISTS (SELECT 1 FROM public.event_signups k
                     WHERE k.member_id = v_keep AND k.event_id = s.event_id);
  UPDATE public.clover_ledger c SET member_id = v_keep
   WHERE c.member_id = v_dup
     AND NOT EXISTS (SELECT 1 FROM public.clover_ledger k
                     WHERE k.member_id = v_keep
                       AND k.event_id IS NOT DISTINCT FROM c.event_id
                       AND k.reason = c.reason);
  UPDATE public.profiles SET member_id = v_keep WHERE member_id = v_dup;

  -- Retire the duplicate.
  UPDATE public.members
     SET merged_into = v_keep, membership_status = 'merged', updated_at = now()
   WHERE id = v_dup;

  -- Close any open duplicate-queue entry for this pair.
  UPDATE public.possible_duplicates
     SET status = 'merged', decided_at = now()
   WHERE status = 'open'
     AND member_a IN (v_keep, v_dup)
     AND member_b IN (v_keep, v_dup);
END $$;
