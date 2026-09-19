-- ============================================================================
-- Craic Cup: members only on the leaderboards.
--
-- What this changes (also applied to Supabase as migration
-- kos_craic_cup_members_only):
--
-- The Craic Cup is a member program. Prospects — people the event signup
-- flow auto-created because their RSVP email was not in the roster
-- (membership_status = 'prospect') — were showing up at the bottom of the
-- season leaderboard with their +5 RSVP Clovers. Both leaderboard views now
-- exclude prospect records:
--
--   * v_season_leaderboard   — the main Craic Cup standings on members.html
--   * v_volunteer_leaderboard — the "Top Volunteers" podium on members.html
--
-- Every other status stays on the board: active, lapsed, pending-new and
-- pending-renewal are all people who are (or were) actual members. Prospect
-- Clover ledger rows are NOT deleted — if a prospect is approved into
-- membership, their RSVP Clovers surface on the board automatically.
--
-- View bodies are otherwise identical to kos_craic_cup_ikc_and_find.sql;
-- the only change is the prospect filter in each WHERE clause.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_season_leaderboard AS
WITH season AS (
  SELECT public.craic_season_year() AS yr
), aggs AS (
  SELECT c.member_id,
    COALESCE(sum(c.clovers) FILTER (WHERE c.season_year = (SELECT yr FROM season)), 0)::int AS season_clovers,
    COALESCE(sum(c.clovers), 0)::int AS lifetime_clovers
  FROM public.clover_ledger c
  GROUP BY c.member_id
), badges AS (
  SELECT member_id, count(*)::int AS badge_count
  FROM public.member_badges
  GROUP BY member_id
)
SELECT
  row_number() OVER (ORDER BY a.season_clovers DESC, a.lifetime_clovers DESC, m.last_name, m.first_name)::int AS place,
  m.id AS member_id,
  m.first_name,
  m.last_name,
  a.season_clovers,
  a.lifetime_clovers,
  COALESCE(b.badge_count, 0) AS badge_count,
  r.rank_name,
  r.rank_icon
FROM aggs a
JOIN public.members m ON m.id = a.member_id
LEFT JOIN badges b ON b.member_id = m.id
CROSS JOIN LATERAL public.craic_rank(a.lifetime_clovers) r
WHERE m.merged_into IS NULL
  AND m.membership_status IS DISTINCT FROM 'prospect'
  AND a.season_clovers > 0
ORDER BY place;

CREATE OR REPLACE VIEW public.v_volunteer_leaderboard AS
WITH season AS (
  SELECT public.craic_season_year() AS yr
)
SELECT m.id AS member_id,
  m.first_name,
  m.last_name,
  count(*) FILTER (WHERE c.reason IN ('volunteer_bonus','volunteer_priority_bonus'))::int AS volunteer_events,
  COALESCE(sum(c.clovers) FILTER (WHERE c.reason IN ('volunteer_bonus','volunteer_priority_bonus')), 0)::int AS volunteer_clovers
FROM public.clover_ledger c
JOIN public.members m ON m.id = c.member_id
WHERE c.season_year = (SELECT yr FROM season)
  AND m.merged_into IS NULL
  AND m.membership_status IS DISTINCT FROM 'prospect'
GROUP BY m.id, m.first_name, m.last_name
HAVING COALESCE(sum(c.clovers) FILTER (WHERE c.reason IN ('volunteer_bonus','volunteer_priority_bonus')), 0) > 0
ORDER BY volunteer_clovers DESC, volunteer_events DESC;
