# Shop Studio

The merchandise chair signs in to **Member Hub > Officer desk > Shop Studio**. Create or edit a product, add its price, sizes, description, and image (paste a public image URL or upload one), then choose a status.

Live Krewe Gear items appear on `store.html` as a catalog: photo, name, and price. An in-stock live card opens the shared Zeffy **KOS Shop** in the same tab. Sold out items stay visible but are not linked. Shoppers pick items, set quantities, and check out once there. Zeffy cannot prefill a cart from a URL, so the site does not keep one.

The shared checkout URL is https://www.zeffy.com/en-US/ticketing/kos-shop. It is the fallback in `assets/kos-shop-catalog.js` (`KOS_SHOP_ZEFFY_URL`). `sql/kos_shop_unified_checkout.sql` (applied in production on Nov 12, 2026) stores the same URL on `kos_runtime_flags.kos_shop_zeffy_url`, and `list_public_shop_checkout()` publishes it to the shop page and to Shop QR codes.

A priced product can be saved as **live** without its own Zeffy link. Add the same item, name, and price to the shared KOS Shop campaign in Zeffy. Per-item `zeffy_url` values stay in the data and are not the buy path or the QR target. Shop QR codes point at the shared KOS Shop URL.

Coming soon items can show on the shop page without a link. Draft and awaiting-Zeffy items stay off the public page. There is no "Mark awaiting Zeffy" action and no per-item campaign automation.

The treasurer sees completed shop sales through `zeffy-webhook`, which classifies the KOS Shop campaign as store and matches members by email. Missed orders can be recorded with `sql/kos_shop_backfill.sql` and the ready-to-run list in `sql/kos_shop_backfill_kos_shop_nov2026.sql`. Do not run those until the steps in the pull request report.

## Stock on hand

Officers and the merchandise editor can set a **Stock on hand** count on each product in Shop Studio. Leave it blank if you are not tracking that item. Enter 0 to show **Sold out** on the public shop and to turn off that card's link to Zeffy. When the count is 5 or less, the shop shows "Only N left."

After a paid KOS Shop order is recorded by `zeffy-webhook`, the database decrements stock for each line item whose name matches a tracked product (the same name match as shop order emails). That happens once per payment. A Zeffy tip line is skipped. If a ticket title in Zeffy does not match the product name, campaign name, or slug, adjust the count by hand.

Run `sql/kos_shop_inventory.sql` in the Supabase SQL editor before relying on these counts. Deploying the website does not run it. Do not re-insert historical shop payments after you set counts, or those rows will decrement stock.

The website sold-out state does not stop a purchase inside Zeffy. Zeffy itself does not cap quantity unless that campaign ticket has a limit, so also set a ticket limit or remove a sold out item in Zeffy if you need a hard cap.
