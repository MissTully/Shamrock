-- Fall 2026 dates from the 26 August 2026 general meeting summary.
-- Safe to run more than once.

INSERT INTO public.events (name, event_type, start_time, location, is_public, notes)
SELECT
  'Mini Golf and Lunch',
  'social',
  '2026-09-19 10:00:00-04',
  'The Grove Mini-Golf, 6202 Wesley Chapel Blvd, Wesley Chapel, FL',
  true,
  'Golf $20 or golf plus lunch $40. Supports No More Umbrellas and New Life Warehouse. 50/50 raffle.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.events
  WHERE name = 'Mini Golf and Lunch' AND start_time::date = DATE '2026-09-19'
);

INSERT INTO public.events (name, event_type, start_time, location, is_public, notes)
SELECT
  'Tartan Ball Basket-Making Happy Hour',
  'social',
  '2026-10-17 18:00:00-04',
  'TBA',
  true,
  'Prep baskets for the Tartan Ball raffle. Time is a placeholder until Social and Charity confirm the hour.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.events
  WHERE name ILIKE '%Basket-Making%' AND start_time::date = DATE '2026-10-17'
);

INSERT INTO public.events (name, event_type, start_time, location, is_public, notes)
SELECT
  'Tartan Ball',
  'ball',
  '2026-10-24 18:00:00-04',
  'TBA',
  true,
  'Season ball. Venue and exact hour still to be confirmed on the site.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.events
  WHERE name = 'Tartan Ball' AND start_time::date = DATE '2026-10-24'
);

INSERT INTO public.events (name, event_type, start_time, location, is_public, notes)
SELECT
  'King and Queen Breakfast',
  'social',
  NULL,
  'TBA',
  false,
  'Date announced at the August meeting as forthcoming. Keep off the public RSVP list until a date exists.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.events WHERE name = 'King and Queen Breakfast'
);
