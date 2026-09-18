-- Tartan Ball table pricing from Jeff Carney (2026-09-17), confirmed by
-- Melissa and forwarded to digital@kreweofshamrock.com.
-- A table of 8 is $1,040. Do not invent a per-seat price here.
-- Applied to the Krewe of Shamrock project (oazwkwflgbthojvnclfc).
-- Safe to run more than once: only fills empty ticket fields on the 2026 ball.

UPDATE public.events
SET ticket_label = 'Table of 8',
    ticket_price_cents = 104000
WHERE name = 'Tartan Ball'
  AND start_time::date = DATE '2026-10-24'
  AND ticket_label IS NULL
  AND ticket_price_cents IS NULL;
