-- =============================================================
-- Remove the "Tartan Ball raffle" from the raffle studio
-- =============================================================
-- Background: when the Tartan Ball event was saved in Event Studio with
-- "collect raffle tickets" turned on, a 50/50 raffle event named
-- "Tartan Ball raffle" was created automatically (see
-- kos_event_studio_raffle_meal_online.sql). That raffle shows up in the
-- member Raffle Studio, on the public raffle page, and in Officer tools.
--
-- This script removes it completely. It is safe to run because the
-- raffle has no tickets sold and no baskets; the deletes below are
-- written defensively so they also clean up any entries if some exist.
--
-- How to run: paste this whole file into the Supabase SQL editor and run.
-- To re-attach a raffle later, edit the Tartan Ball event in Event
-- Studio and turn raffle tickets back on (a fresh raffle is created).

begin;

-- 1. Detach the raffle from any events that point at it, and turn off
--    raffle collection for those events so the signup form stops
--    offering raffle tickets.
update public.events
   set raffle_event_id = null,
       collect_raffle  = false
 where raffle_event_id in (
   select id from public.raffle_events where name = 'Tartan Ball raffle'
 );

-- 2. Delete any 50/50 pot entries for the raffle (none exist today).
delete from public.raffle_5050_entries
 where event_id in (
   select id from public.raffle_events where name = 'Tartan Ball raffle'
 );

-- 3. Delete any basket donations, basket entries, and baskets for the
--    raffle (none exist today).
delete from public.raffle_basket_donations
 where basket_id in (
   select b.id
     from public.raffle_baskets b
     join public.raffle_events r on r.id = b.raffle_event_id
    where r.name = 'Tartan Ball raffle'
 );

delete from public.raffle_basket_entries
 where basket_id in (
   select b.id
     from public.raffle_baskets b
     join public.raffle_events r on r.id = b.raffle_event_id
    where r.name = 'Tartan Ball raffle'
 );

delete from public.raffle_baskets
 where raffle_event_id in (
   select id from public.raffle_events where name = 'Tartan Ball raffle'
 );

-- 4. Delete the raffle event itself.
delete from public.raffle_events
 where name = 'Tartan Ball raffle';

commit;
