# Shop Studio

The merchandise chair signs in to **Member Hub > Officer desk > Shop Studio**. Create or edit a product, add its price, sizes, description, and image (paste a public image URL or upload one), then choose a status.

Live Krewe Gear items appear on `store.html` as a catalog: photo, name, and price. The whole card opens the shared Zeffy **KOS Shop** in the same tab. Shoppers pick items, set quantities, and check out once there. Zeffy cannot prefill a cart from a URL, so the site does not keep one.

The shared checkout URL is https://www.zeffy.com/en-US/ticketing/kos-shop. It is the fallback in `assets/kos-shop-catalog.js` (`KOS_SHOP_ZEFFY_URL`). `sql/kos_shop_unified_checkout.sql` (applied in production on Nov 12, 2026) stores the same URL on `kos_runtime_flags.kos_shop_zeffy_url`, and `list_public_shop_checkout()` publishes it to the shop page and to Shop QR codes.

A priced product can be saved as **live** without its own Zeffy link. Add the same item, name, and price to the shared KOS Shop campaign in Zeffy. Per-item `zeffy_url` values stay in the data and are not the buy path or the QR target. Shop QR codes point at the shared KOS Shop URL.

Coming soon items can show on the shop page without a link. Draft and awaiting-Zeffy items stay off the public page. There is no "Mark awaiting Zeffy" action and no per-item campaign automation.

The treasurer sees completed shop sales through `zeffy-webhook`, which classifies the KOS Shop campaign as store and matches members by email. Missed orders can be recorded with `sql/kos_shop_backfill.sql` and the ready-to-run list in `sql/kos_shop_backfill_kos_shop_nov2026.sql`. Do not run those until the steps in the pull request report.
