-- NOT APPLIED. Do not run this until sql/kos_shop_backfill.sql has been applied
-- on oazwkwflgbthojvnclfc. Running this INSERTS three store payments and
-- SENDS email (buyer shop_receipt, and one shop_po per order).
--
-- It is idempotent. A second run skips any order already stored under its
-- transaction id or synthetic shop_key and does not send those emails again.
--
-- Source: Zeffy itemized export, Campaign Title = KOS Shop, all succeeded,
-- none present in public.payments. Transaction ids are not in the export
-- except Douglas Tully's. The other two use a stable synthetic id:
--   kos-shop:<UTC minute>:<buyer email>
-- Names match shop_products so the receipt can use the catalog name.
-- Tully's Zeffy merchandise total is $25. The receipt total is $26.25,
-- which includes a $1.25 Zeffy tip, so amount_cents is 2625.
--
-- chair_notice 'each' is the per-order chair email.
-- To send one catch-up note to the merchandise chairs instead, change the
-- second argument below from 'each' to 'summary'. Buyer receipts still go
-- out once either way. Do not pass both in two runs: the second run skips
-- the rows and will not send the other chair notice.

select public.kos_backfill_shop_orders(
  jsonb_build_array(
    jsonb_build_object(
      'shop_key', 'kos-shop:2026-11-13T18:23Z:tabirnley@gmail.com',
      'occurred_at', '2026-11-13T18:23:00Z',
      'buyer_name', 'Tim Birnley',
      'buyer_email', 'tabirnley@gmail.com',
      'campaign', 'KOS Shop',
      'total_cents', 600,
      'items', jsonb_build_array(
        jsonb_build_object('name', 'Krewe of Shamrock Kilt Pin', 'quantity', 2, 'unit_cents', 300)
      )
    ),
    jsonb_build_object(
      'shop_key', 'kos-shop:2026-11-15T17:00Z:tim.dyn@verizon.net',
      'occurred_at', '2026-11-15T17:00:00Z',
      'buyer_name', 'Tim Dyn',
      'buyer_email', 'tim.dyn@verizon.net',
      'campaign', 'KOS Shop',
      'total_cents', 4500,
      'items', jsonb_build_array(
        jsonb_build_object('name', 'Krewe of Shamrock baseball cap', 'quantity', 2, 'unit_cents', 1200),
        jsonb_build_object('name', 'Krewe of Shamrock Pin 2024 Pirate Ship', 'quantity', 2, 'unit_cents', 300),
        jsonb_build_object('name', 'Krewe of Shamrock Pin 2024 Shamrock', 'quantity', 2, 'unit_cents', 300),
        jsonb_build_object('name', 'Krewe of Shamrock Kilt Pin', 'quantity', 1, 'unit_cents', 300),
        jsonb_build_object('name', 'Krewe of Shamrock Medallion', 'quantity', 2, 'unit_cents', 300)
      )
    ),
    jsonb_build_object(
      'transaction_id', '2d88980c-b0f9-474b-a8db-6f86a20b061d',
      'shop_key', 'kos-shop:2026-11-19T21:46Z:melissa@encountive.com',
      'occurred_at', '2026-11-19T21:46:49Z',
      'buyer_name', 'Douglas Tully',
      'buyer_email', 'melissa@encountive.com',
      'campaign', 'KOS Shop',
      'total_cents', 2625,
      'items', jsonb_build_array(
        jsonb_build_object('name', 'Krewe of Shamrock Pin 2026 Unicorn', 'quantity', 1, 'unit_cents', 1000),
        jsonb_build_object('name', 'Krewe of Shamrock Pin 2024 Pirate Ship', 'quantity', 1, 'unit_cents', 300),
        jsonb_build_object('name', 'Krewe of Shamrock Pin 2024 Shamrock', 'quantity', 1, 'unit_cents', 300),
        jsonb_build_object('name', 'Krewe of Shamrock Pin 2023 Leprechaun', 'quantity', 1, 'unit_cents', 300),
        jsonb_build_object('name', 'Krewe of Shamrock Pin 2025 Tampa Bay', 'quantity', 1, 'unit_cents', 300),
        jsonb_build_object('name', 'Krewe of Shamrock Kilt Pin', 'quantity', 1, 'unit_cents', 300),
        jsonb_build_object('name', 'Zeffy tip', 'quantity', 1, 'unit_cents', 125)
      )
    )
  ),
  'each'
);
