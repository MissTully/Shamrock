-- Missed Clovers picker: show past Krewe events, not just IKC.
-- NOT APPLIED. Apply via execute_sql after Melissa approves.
--
-- Why some Krewe events were missing:
-- 1) The picker only read public.events and Wild Apricot registrations.
--    Several Krewe events live only as names in clover_ledger (the Craic Cup
--    kickoff grant, and RSVPs whose event row was later removed), so they had
--    no row to list: Christmas in July Toy Drive, New Life Warehouse Delivery,
--    Family & Friends Picnic, General Meeting (Bahama Breeze), and both
--    Shamrock Book Club Nights.
-- 2) Past site events are 29 IKC and 3 Krewe, sorted newest first, so the
--    Krewe ones were buried under IKC rows. The Hub now has Krewe / IKC / All
--    chips and labels every row.
-- 3) Board Meeting (Nov 2), General Meeting (Nov 11) and Float Workday
--    (Nov 15) have not happened yet. They join the list on their own the day
--    after they happen (the form only takes things that already happened).
--
-- Dates come from real data only:
--  * Craic Cup kickoff rows: the "Event date: YYYY-MM-DD" in clover_ledger.notes.
--  * Shamrock Book Club Night: Sep 17, 2026 (the event's Zeffy ticket link,
--    see sql/kos_unique_zeffy_ticket_url.sql) and Sep 30, 2026 (University
--    Bobo Tea House, see sql/kos_ikc_calendar_curated_events.sql).
-- A history row is hidden when a site or old-site event already covers the
-- same name on the same day (for example Superhero Charity Bowling, which is
-- Wild Apricot event 6731181 on Aug 1).

CREATE OR REPLACE FUNCTION public.list_missed_clover_events()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    WITH site AS (
      SELECT e.id, e.name, e.start_time, coalesce(e.source,'krewe') AS source
        FROM public.events e
       WHERE e.start_time < now() AND e.start_time > now() - interval '2 years'
         AND coalesce(e.status,'published') NOT IN ('cancelled','draft')
    ), old AS (
      SELECT l.wa_event_id, min(l.event_title) AS name, min(l.event_start) AS start_time
        FROM public.legacy_event_registrations l
       WHERE l.wa_event_id IS NOT NULL
         AND l.event_start < now() AND l.event_start > now() - interval '2 years'
       GROUP BY l.wa_event_id
      HAVING bool_and(l.event_id IS NULL)  -- linked to a site event: list that one only
    ), hist_raw AS (
      SELECT DISTINCT trim(c.event_name) AS name,
             (substring(c.notes FROM 'Event date: ([0-9]{4}-[0-9]{2}-[0-9]{2})'))::date AS d
        FROM public.clover_ledger c
       WHERE c.event_id IS NULL AND c.event_name IS NOT NULL
         AND c.notes ~ 'Event date: [0-9]{4}-[0-9]{2}-[0-9]{2}'
      UNION
      SELECT v.name, v.d FROM (VALUES
        ('Shamrock Book Club Night', date '2026-09-17'),
        ('Shamrock Book Club Night', date '2026-09-30')
      ) v(name, d)
    ), hist AS (
      SELECT h.name, h.d FROM hist_raw h
       WHERE h.d < (now() AT TIME ZONE 'America/New_York')::date
         AND h.d > (now() AT TIME ZONE 'America/New_York')::date - 730
         AND NOT EXISTS (
           SELECT 1 FROM (SELECT name, start_time FROM site UNION ALL SELECT name, start_time FROM old) x
            WHERE (x.start_time AT TIME ZONE 'America/New_York')::date = h.d
              AND (position(lower(h.name) IN lower(x.name)) > 0 OR position(lower(x.name) IN lower(h.name)) > 0))
    )
    SELECT jsonb_agg(j ORDER BY j->>'start_time' DESC) FROM (
      SELECT jsonb_build_object('kind','site','id',s.id,'name',s.name,'start_time',s.start_time,'source',s.source) j FROM site s
      UNION ALL
      SELECT jsonb_build_object('kind','old_site','wa_event_id',o.wa_event_id,'name',o.name,'start_time',o.start_time,'source','wild_apricot') FROM old o
      UNION ALL
      -- Noon Eastern so the date never slips a day in the browser.
      SELECT jsonb_build_object('kind','history','name',h.name,'event_date',h.d,
             'start_time',((h.d::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York'),'source','krewe') FROM hist h
    ) q
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_missed_clover_events() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_missed_clover_events() TO authenticated;
