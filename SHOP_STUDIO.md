# Shop Studio

The merchandise chair signs in to **Member Hub > Officer desk > Shop Studio**. Create or edit a product, add its price, sizes, description, and image (paste a public image URL or upload one), then choose a status.

Live Krewe Gear items appear on `store.html` as a catalog: photo, name, and price. An in-stock live card opens the shared Zeffy **KOS Shop** in the same tab. Sold out items stay visible but are not linked. Shoppers pick items, set quantities, and check out once there. Zeffy cannot prefill a cart from a URL, so the site does not keep one.

The shared checkout URL is https://www.zeffy.com/en-US/ticketing/kos-shop. It is the fallback in `assets/kos-shop-catalog.js` (`KOS_SHOP_ZEFFY_URL`). `sql/kos_shop_unified_checkout.sql` (applied in production on Nov 12, 2026) stores the same URL on `kos_runtime_flags.kos_shop_zeffy_url`, and `list_public_shop_checkout()` publishes it to the shop page and to Shop QR codes.

A priced product can be saved as **live** without its own Zeffy link. Add the same item, name, and price to the shared KOS Shop campaign in Zeffy. Per-item `zeffy_url` values stay in the data and are not the buy path or the QR target. Shop QR codes point at the shared KOS Shop URL.

Coming soon items can show on the shop page without a link. Draft and awaiting-Zeffy items stay off the public page. There is no "Mark awaiting Zeffy" action and no per-item campaign automation.

The treasurer sees completed shop sales through `zeffy-webhook`, which classifies the KOS Shop campaign as store and matches members by email. Missed orders can be recorded with `sql/kos_shop_backfill.sql` and the ready-to-run list in `sql/kos_shop_backfill_kos_shop_nov2026.sql`. Do not run those until the steps in the pull request report.

## Matching Zeffy inventory

Zeffy is the source of truth and the hard cap. In the KOS Shop campaign, each item has **Total available** under More options, and items with sizes or colors have **Manage inventory**. Zeffy reduces that count on each sale and marks the item sold out.

The site count is a mirror, not a second cap. In Shop Studio, set **Match Zeffy Total available** to the same number you entered in Zeffy, or to the remaining count if sales already happened. Leave it blank if you are not mirroring that item yet. New paid KOS Shop orders recorded by `zeffy-webhook` then reduce the site count automatically (the same name match as shop order emails, once per payment). If you restock or change the Zeffy count, update the site field to the new remaining amount.

Use the **Sold out** switch to set the site count to 0. That shows Sold out on the public shop and turns off that card's link. To stop sales in Zeffy too, set Total available to the number already sold, or hide the item. Otherwise buyers can still purchase it in the shared KOS Shop.

The documented Zeffy API and payment webhooks do not expose remaining quantity or sold-out state, so the site cannot pull the live Zeffy count on a schedule. Campaign rates include a total capacity field (`seats`), not the remaining amount.

Run `sql/kos_shop_inventory.sql` in the Supabase SQL editor before relying on these counts. Deploying the website does not run it. Do not re-insert historical shop payments after you set counts, or those rows will decrement stock.
