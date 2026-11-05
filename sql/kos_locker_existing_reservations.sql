-- Krewe of Shamrock: enter the existing locker holders Patrick asked about at
-- the Nov 2, 2026 board meeting (Tim Fitzpatrick, Doug Tully, Jim Sugrue).
-- Locker numbers come from Tim's Sep 30, 2026 inventory already in public.lockers.
-- Apply only after Melissa approves. Every statement only fills empty links.

begin;

-- Tim Fitzpatrick: RS1 (small) is already linked to his member record and his
-- renewal reservation is assigned and paid. Nothing to change.

-- Jim Sugrue: RS6 (small, paid, holder "Jim & Lisa Sugrue").
update public.lockers
   set member_id = '48a50129-c235-42e0-95ab-e5dd31f61bb9',
       holder_email = coalesce(holder_email, 'jimsugruemtm@gmail.com')
 where id = '6e3b0667-ce46-4282-83da-f3e6fdc21397' and member_id is null;

-- His Sep 14 small reservation is still "queued"; it is the same locker, so
-- point it at RS6 and mark it assigned and paid.
update public.locker_reservations
   set locker_id = '6e3b0667-ce46-4282-83da-f3e6fdc21397',
       status = 'assigned',
       paid_at = coalesce(paid_at, now()),
       notes = trim(coalesce(notes,'') || ' Linked to RS6 from the Sep 30 inventory (board request Nov 2026).'),
       updated_at = now()
 where id = '84b6e93b-2c0b-40e0-9b20-d64b6ffe4811' and locker_id is null and status = 'queued';

-- Doug Tully: RL7 (LARGE, paid, holder "Doug Tully").
update public.lockers
   set member_id = '11fd6285-7ead-4790-b573-db2744742ecd',
       holder_email = coalesce(holder_email, 'dougtully@protonmail.com')
 where id = '80b3b63a-355d-4762-b779-f993934fe382' and member_id is null;

-- Doug's Sep 13 reservation is for a SMALL locker and is still queued. RL7 is
-- large, so it is left alone until Melissa confirms whether Doug wants a second
-- (small) locker or the reservation should be cancelled:
-- update public.locker_reservations set status = 'cancelled', updated_at = now()
--  where id = '3031ec37-455b-4413-a860-aa02919f63cf' and status = 'queued';

commit;
