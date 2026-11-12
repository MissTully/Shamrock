# Shop Studio

The merchandise chair signs in to **Member Hub > Officer desk > Shop Studio**. Create or edit a product, add its price, sizes, description, and image (paste a public image URL or upload one), then choose a status.

Live Krewe Gear items appear on `store.html` with Add to Cart. Shoppers check out in one payment through the shared Zeffy **KOS Shop** Online Store. Paste that campaign URL in `assets/kos-shop-cart.js` (`KOS_SHOP_ZEFFY_URL`) and, after `sql/kos_shop_unified_checkout.sql` is applied, in the `kos_runtime_flags` row `kos_shop_zeffy_url`.

A priced product no longer needs its own Zeffy ticketing campaign. Add the same item to the shared KOS Shop in Zeffy so names and prices match. Per-item Zeffy URLs are kept in the data but are not used as the main Buy now path.

The treasurer sees completed shop sales through the existing `zeffy-webhook` payment ledger. Multi-item payments from the KOS Shop campaign should be classified as store, and the buyer and merch-chair emails should list every line item.
