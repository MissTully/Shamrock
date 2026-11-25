-- NOT APPLIED. Do not run this against the live project from the app,
-- a webhook, or a script. After review, paste this file into the Supabase
-- SQL editor for project oazwkwflgbthojvnclfc (Krewe of Shamrock) and run it.
-- Safe to re-run.
--
-- Optional follow-up for v_parade_ready. The Wristband Pickup List no longer
-- waits on this view: the Member Hub now loads members, dues, waivers,
-- meetings, and volunteer hours in a few batched queries and builds the
-- same ready / missing tables in the browser.
--
-- The live view still uses one correlated subquery per member for dues,
-- waivers, mandatory meetings, and volunteer hours (hours are scanned four
-- times). That is why the old report could take around 18 seconds for an
-- officer. This rewrite keeps the same columns, filters, and season rules
-- (kos_dues_season_year for dues, waivers, and the June-May meeting window;
-- krewe_volunteer_season_year for hours) and computes them with joins
-- instead. Other officer screens that still read v_parade_ready would then
-- get the faster plan too.
--
-- Results should match the current view. Existing payment, waiver, and
-- hours rows are not updated.

create or replace view public.v_parade_ready
with (security_invoker = true) as
with dues_year as (
  select public.kos_dues_season_year() as y
), vol_year as (
  select public.krewe_volunteer_season_year(current_date) as y
), dues as (
  select distinct d.member_id
  from public.dues_payments d
  join dues_year dy on d.membership_year = dy.y
  where d.paid
), signed as (
  select distinct w.member_id
  from public.waivers w
  join dues_year dy on w.season_year = dy.y
), meetings as (
  select distinct s.member_id
  from public.event_signups s
  join public.events e on e.id = s.event_id
  join dues_year dy on true
  where s.status = 'attended'
    and e.event_type = 'meeting'
    and e.is_mandatory
    and (e.start_time at time zone 'America/New_York')::date >= make_date(dy.y, 6, 1)
    and (e.start_time at time zone 'America/New_York')::date < make_date(dy.y + 1, 6, 1)
), hours as (
  select
    v.member_id,
    coalesce(sum(v.hours) filter (where v.approved and coalesce(v.is_demo, false) = false), 0)::numeric as hours_approved,
    coalesce(sum(v.hours) filter (where coalesce(v.is_demo, false) = false), 0)::numeric as hours_logged
  from public.volunteer_hours v
  join vol_year vy on v.season_year = vy.y
  group by v.member_id
)
select
  m.id as member_id,
  m.first_name,
  m.last_name,
  m.membership_status,
  (d.member_id is not null) as dues_paid,
  (w.member_id is not null) as waiver_signed,
  (mt.member_id is not null) as meeting_attended,
  coalesce(h.hours_approved, 0::numeric) as hours_approved,
  coalesce(h.hours_logged, 0::numeric) as hours_logged,
  coalesce(h.hours_approved, 0::numeric) as volunteer_hours_approved,
  coalesce(h.hours_logged, 0::numeric) as volunteer_hours_logged,
  m.membership_level
from public.members m
left join dues d on d.member_id = m.id
left join signed w on w.member_id = m.id
left join meetings mt on mt.member_id = m.id
left join hours h on h.member_id = m.id
where coalesce(m.membership_status, '') <> 'merged'
  and coalesce(m.membership_status, '') <> all (array['declined'::text, 'archived'::text])
  and m.merged_into is null
  and (m.id = public.kos_current_member_id() or public.is_krewe_officer());

alter view public.v_parade_ready set (security_invoker = true);

comment on view public.v_parade_ready is
  'Parade Ready gates for the signed-in member, or the roster when the reader is an officer. membership_level is the dues level used to show the unpaid amount. Computed with joins on the June-May dues season and the volunteer season year.';
