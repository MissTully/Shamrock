# Vendor Shirts: Build Plan

**Status:** plan only, nothing built yet (drafted 2026-09-30)
**Goal:** show the Krewe's t-shirts, tanks and hoodies from our outside apparel
vendors on the Shop page (`store.html`), with a real photo, a "from" price and a
clear **Order from the vendor** button. Replaces today's confusing "$0.00 means
order from the vendor" rule.
**Related:** `SHOP_STUDIO.md`, `sql/kos_shop_studio.sql`, `assets/kos-shop-studio.js`,
`store.html`, the Merchandise section of the Member Hub FAQ in `members.html`.

---

## 1. What we have today

### 1.1 The two vendors

| | Red's Team Sports (RTS) | Studio 19 |
|---|---|---|
| Krewe store link | https://kreweofshamrock2025.itemorder.com/shop/category/107919/ | https://studio19shop.com/shop/ols/categories/krewe-of-shamrock |
| Store platform | ItemOrder (team store software) | GoDaddy Airo online store |
| Company website | http://www.redsteamsports.com/ | https://studio19shop.com |
| Phone / email | 813-612-5999 · teamstores@redsteamsports.com | (not shown on the store page; add later) |
| Store sections | Women's Apparel, Men's Apparel, Outerwear | One "Krewe of Shamrock" category |
| Price style | Exact price ("$24.99") | Starting price ("From $18.50") |
| Colors | Card shows a count ("2 Colors", "6 Colors") | Chosen on the product page ("More options") |
| Photos | Every product has one | Several products have no photo yet |
| Watch out | The link has **2025** in it, so the store probably changes each season | Placeholder images on many products |

### 1.2 Products seen on the vendor stores (from screenshots, 2026-09-30)

**Red's Team Sports**

| Product | Price | Colors | Section |
|---|---|---|---|
| Women's Fan Favorite Tee with X-MAS Logo | $15.99 | 1 | Women's |
| Ladies Perfect Tri Crew Tee with Established Logo | $24.99 | 2 | Women's |
| Ladies Perfect Tri Crew Tee with Skeleton Logo | $24.99 | 1 | Women's |
| Ladies Perfect Tri Crew Tee with Family Crest Logo | $24.99 | 6 | Women's |
| Women's Jersey Muscle Tank with Established Logo | $15.99 | 2 | Women's |
| Women's Jersey Muscle Tank with Skeleton Logo | $15.99 | 2 | Women's |
| Women's Jersey Muscle Tank with Family Crest Logo | $15.99 | 2 | Women's |
| (Men's Apparel and Outerwear: not yet captured) | | | |

**Studio 19**

| Product | Price |
|---|---|
| KOS Shenanigator Tee | from $16.50 (no photo) |
| KOS Purveyors – Tri-Blend Wicking Raglan Tee | from $18.50 |
| KOS Krewe Jersey Full-Zip Hoodie | from $30.00 |
| Krewe of Shamrock – Leprechaun / Unicorn Bella + Canvas Tee | from $20.00 (no photo) |
| (More products below these, most with no photo: not yet captured) | |

### 1.3 How our site handles them now

- The **Member Hub FAQ → Merchandise** section (`members.html`, around line 1646)
  lists the two vendor links and says vendor shirts show **$0.00** in the Shop.
- The Shop (`store.html`) only has one kind of product: something the Krewe
  sells itself through a **Zeffy** checkout link. There is no field for
  "vendor" or "vendor link."
- The database rule in `upsert_shop_product` (`sql/kos_shop_studio.sql`) says:
  *a product with a price and no Zeffy link is "awaiting Zeffy."* So if an
  officer typed the real vendor price ($24.99) today, the shirt would be hidden
  behind "Checkout linking…" forever. That is why the $0.00 workaround exists.
- `store.html` only shows products whose status is `live`.

---

## 2. The idea in one paragraph

Add a second kind of product: **vendor-fulfilled** (the vendor takes the money,
prints the shirt and ships it). The Krewe keeps selling pins and other items
through Zeffy exactly as now. Officers enter each vendor **once** (name, store
link, contact, turnaround, shipping note), then add vendor shirts in Shop Studio
by choosing the vendor and pasting the product's link. The Shop shows these
shirts in their own "Order from our apparel vendors" section, with the real
"from" price and an **Order from Red's Team Sports ↗** button that opens the
vendor's page in a new tab. Vendor shirts never go in our cart, and never create
a Zeffy campaign.

### Why this approach (and not something bigger)

| Option | Verdict | Reason |
|---|---|---|
| **A. Link out to vendor (this plan)** | **Recommended** | Small, safe, reuses Shop Studio. The vendor already handles payment, sizes, colors, printing and shipping. |
| B. Automatically copy the vendor catalog ("scraping") | Not now | Vendor pages change without notice, it may break their terms of use, prices drift, and our cloud tools can't even reach those sites. Officers add ~10–20 shirts a season by hand, which is fast. |
| C. Members order on our site, officers send one batch order weekly | Later, maybe | Needs payment through Zeffy, an order table, officer work each week, and money flows the treasurer must track. Only worth it if the vendors ask for it. |

---

## 3. Build steps

Each phase is one small pull request that can ship on its own.

### Phase 1 — Database (one SQL file: `sql/kos_shop_vendors.sql`)

Written "safe to run more than once" like the other files in `sql/`.

1. **New table `shop_vendors`**
   | Column | Type | Example |
   |---|---|---|
   | `id` | uuid, primary key | |
   | `name` | text, required | Red's Team Sports |
   | `short_name` | text | RTS |
   | `store_url` | text, required | https://kreweofshamrock2025.itemorder.com/shop/category/107919/ |
   | `website_url` | text | http://www.redsteamsports.com/ |
   | `contact_email` / `contact_phone` | text | teamstores@redsteamsports.com / 813-612-5999 |
   | `logo_url` | text | uploaded to the existing `shop-products` storage bucket |
   | `showcase_images` | text[] | 4–6 picked product photos for the vendor's collage (see Phase 3) |
   | `fulfillment_note` | text | "Shipped to your home. Orders are processed weekly; allow 2–3 weeks." |
   | `season_label` | text | 2025–26 |
   | `active` | boolean, default true | |
   | `sort_order`, `created_at`, `updated_at` | | |
2. **New columns on `shop_products`**
   | Column | Meaning |
   |---|---|
   | `fulfillment` | `'krewe'` (default, today's behavior) or `'vendor'` |
   | `vendor_id` | which vendor, links to `shop_vendors.id` |
   | `vendor_url` | the product's own page on the vendor store |
   | `price_is_from` | true shows "From $18.50" instead of "$18.50" |
   | `color_count` | optional, shows "6 colors" |
   | `category` | `womens`, `mens`, `unisex`, `outerwear`, `accessories` |
3. **Change the "awaiting Zeffy" rule** inside `upsert_shop_product`: apply it
   only when `fulfillment = 'krewe'`. A vendor product with a price and a vendor
   link can be `live` straight away. Require a vendor and a link (product link
   or the vendor's store link) before a vendor product can go live.
4. **Update `list_public_shop_products`** so each product also carries its
   vendor's name, store link and fulfillment note (only active vendors).
5. **New functions** `upsert_shop_vendor(jsonb)` and `list_public_shop_vendors()`,
   using the existing `can_manage_shop()` permission check, so the same people
   who run Shop Studio today (board, officers, committee chairs, Merchandise
   committee) manage vendors.
6. **Seed** the two vendors above so the officers start with them filled in.
7. Row-level security: public visitors only read through the functions (same
   pattern as today); only shop managers can read or write the tables directly.

### Phase 2 — Shop Studio (officer screen: `assets/kos-shop-studio.js` + `members.html`)

1. A small **Vendors** panel: list, add, edit, mark inactive. Fields match the
   table above.
2. In the product form, a **"Who fulfills this?"** choice:
   - *Krewe sells it (Zeffy)* → the form looks exactly like today.
   - *Vendor* → hide the Zeffy field; show Vendor (drop-down), Vendor product
     link, "Price is a starting price" checkbox, Colors, Category.
3. The Shop Studio list shows a vendor badge ("RTS", "Studio 19") and a
   **Check link** button that opens the vendor link so officers can confirm it
   still works each season.
4. Update `SHOP_STUDIO.md` with the new steps.

### Phase 3 — Public Shop page (`store.html`): a picture-first shopping experience

Members shop with their eyes. Instead of a list of text links, the vendor
section leads with **photo collages** that are themselves the links.

#### 3a. Vendor collage tiles (the main idea)

One large tile per vendor, side by side on a computer and stacked on a phone:

```
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ ┌───────────┐┌───────┐┌───────┐  │   │ ┌───────────┐┌───────┐┌───────┐  │
│ │           ││ tank  ││ tee   │  │   │ │           ││hoodie ││raglan │  │
│ │  big tee  │└───────┘└───────┘  │   │ │ big tee   │└───────┘└───────┘  │
│ │  photo    │┌───────┐┌───────┐  │   │ │ photo     │┌───────┐┌───────┐  │
│ │           ││ tee   ││ +9    │  │   │ │           ││ tee   ││ +4    │  │
│ └───────────┘└───────┘└───────┘  │   │ └───────────┘└───────┘└───────┘  │
│ RED'S TEAM SPORTS                │   │ STUDIO 19                        │
│ Tees, tanks & outerwear          │   │ Tees & hoodies · from $16.50     │
│ [ Shop Red's Team Sports ↗ ]     │   │ [ Shop Studio 19 ↗ ]             │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

- **The whole tile is one link** to the vendor's Krewe store (opens in a new
  tab). Hovering zooms the photos slightly, like the current product cards.
- The collage uses the vendor's `showcase_images` if an officer picked them;
  otherwise the first 4–5 photos of that vendor's live products. The last
  square shows "+9 more" when there are more products than squares.
- Built with CSS Grid (one large square + four small squares). No extra
  library is needed.

#### 3b. Clickable product gallery under each collage

Below the tiles, a row per vendor of product photo cards (the same card style
as today's Shop, but for vendor items):

- **Clicking the photo or the name** opens that exact product on the vendor's
  site (the product's `vendor_url`); if no product link was saved, it falls
  back to the vendor's store link.
- Card text: name, "From $18.50", "6 colors", and a small **Order from
  Studio 19 ↗** button.
- Filter buttons above the gallery: All · Women's · Men's · Unisex · Outerwear.
- No size drop-down and no "Add to Cart": the vendor handles sizes, colors
  and payment.

#### 3c. The rest of the page

1. The page has two sections: **Krewe Gear** (pins and items the Krewe sells,
   unchanged, Buy now / cart) and **Apparel from our vendors** (3a + 3b).
2. A plain-language note per vendor: "Ordered and paid on the vendor's
   website. Shipped to your home. Orders are processed weekly; allow 2–3
   weeks." plus the vendor's contact.
3. The top note and the cart message no longer mention $0.00.
4. Phone layout: one column, the collage keeps its shape, the same bottom
   cart dock as today.

#### 3d. Shop page words (marketing copy)

The Shop is open to everyone, so the words speak to members, families, friends
and parade fans alike. Tone: proud, warm, a little playful, never pushy.

**Page header** (replaces the current sub-heading)

> *Eyebrow:* Wear your green & gold
> **Krewe Shop**
> Wear the crest. Carry the shamrock. Fly the colors all year.

**Pride intro** (a short block above the vendor section)

> ### Wear it proud
> Since 1999, the Krewe of Shamrock has marched Tampa Bay in kilts and green:
> down Bayshore for Gasparilla, through Ybor for the Knight Parade, and into
> every St. Patrick's Day we can find. Every shirt, tank and hoodie here
> carries that story on it: the Family Crest, the Skeleton, the Shenanigator.
>
> Wear it to the parade, to the pub, to the office on a Friday. Carry it to the
> beach and the ballgame. And when someone asks, "What's the Krewe of
> Shamrock?", you'll be the best answer in the room.

**Vendor section title**

> **Apparel from our vendor partners**
> Printed to order and shipped to your door. Tap a photo to shop.

**Collage tile captions**

> **Red's Team Sports:** Tees, tanks and outerwear with the Family Crest,
> Skeleton and Established logos.
> **Studio 19:** The Shenanigator, the Purveyors raglan and the Krewe
> full-zip hoodie.

**Krewe Gear section** (items the Krewe sells itself)

> **Krewe Gear**
> Pins and keepsakes from the Krewe itself, handed out at General Meetings
> and Krewe events.

**Leaving-the-site line** (under the vendor tiles)

> You're heading to our vendor partner's store to choose your size and color
> and check out. Every order shows off the Krewe. Thank you!

**Short lines** for buttons, social posts and the homepage (use any):
"Show your shamrock." · "Kilted since 1999." · "Green on the outside, gold on
the inside." · "Wear the crest, share the craic."

> Before publishing, check the parade route mentions against `parades.html`
> for the current season.

#### 3e. Details that make it work well

| Topic | What we do | Why |
|---|---|---|
| **Where the photos live** | Copy each vendor photo into our own `shop-products` storage bucket (Shop Studio already uploads there) rather than pointing at the vendor's image address | Vendor image addresses can change or block other sites ("hotlinking"), which would leave broken pictures. Our copy stays put. |
| **Photo sizes** | Square crop shown with `object-fit: contain` on the cream background, `loading="lazy"` | Shirts are never cut off, and the page loads fast on phones. |
| **Missing photos** (several Studio 19 items) | Use the existing "Photo coming soon" shamrock placeholder; collages skip products without a photo | No grey broken-image boxes. |
| **Accessibility** (screen readers and keyboards) | Each link has a readable label, e.g. "Shop Red's Team Sports, opens in a new tab"; every photo has alt text from the product name; tiles show a visible focus outline | Members using screen readers or keyboards can shop too. |
| **Safety** | Links pass through the page's existing `url()` helper (only `http`/`https`) and use `rel="noopener noreferrer"` | A mistyped or harmful link can't run code or take over our tab. |
| **Trust** | A small line under the vendor tiles: "You are leaving the Krewe site to order from our vendor partner." | Members know why the page changed to a different website. |

### Phase 4 — Member Hub FAQ (`members.html`)

Change "Log in, then open Shop" to simply "Open Shop" (the Shop is public), and
replace the two hard-coded links and the "$0.00" paragraph with a short list
built from `list_public_shop_vendors()`, and a link to the Shop's vendor
section. When the RTS store moves to a 2026 link, the officer edits it once in
Shop Studio and every page updates.

### Phase 5 — Tests (`tests/specs/shop-vendors.spec.js`)

The existing suite runs offline and fakes the Supabase replies, so tests never
touch the real database. New checks:

- A vendor product renders "From $18.50", the vendor name and an
  **Order from…** link with `target="_blank"` and `rel="noopener noreferrer"`.
- A vendor product never shows "Add to Cart" or a size drop-down.
- Krewe products still show Buy now / Add to Cart (no regression in
  `forms.spec.js`).
- Category filters show and hide the right cards.
- A vendor collage tile renders at most 5 photos, shows "+N more" when there
  are more, and the whole tile links to the vendor store in a new tab.
- Clicking a vendor product photo goes to that product's `vendor_url`, and to
  the vendor store link when the product has none.
- Products without a photo are left out of the collage and show the
  placeholder in the gallery.
- A vendor link that is not `http`/`https` is not rendered as a link
  (the page already has a `url()` safety helper; reuse it).
- Shop Studio: choosing *Vendor* hides the Zeffy field and requires a vendor.

Run with `cd tests && npm test` (static check + Playwright).

---

## 4. Data entry after the build (merchandise chair, about 30 minutes)

1. Member Hub → Officer desk → Shop Studio → **Vendors**: check the two seeded
   vendors; add Studio 19's phone and email.
2. For each shirt on the vendor store: right-click the product photo → *Save
   image as…* → upload it in Shop Studio (this keeps a copy in our own
   storage). For Studio 19's products without photos, ask Studio 19 for images.
3. Copy the product page link into **Vendor product link**.
4. Enter the price, tick **starting price** for Studio 19, pick the category,
   set status **Live**, save.
5. Optional: on each vendor, pick 4–6 favorite photos as the **collage** images.
   Without this, the collage uses the first products automatically.
6. Each new season: update the vendor's store link, click **Check link** on
   each product, archive shirts that are gone.

---

## 5. Questions to settle before building

1. ~~**Photos:** may we reuse the vendors' product photos?~~ **Settled
   2026-09-30:** yes, the vendors' product photos are reused as links to their
   sites. (A short courtesy note to each vendor is still a good idea.)
2. ~~**Who can see it?**~~ **Settled 2026-09-30:** the Shop, vendor apparel
   included, is open to everyone (members, families, friends, parade fans).
   No sign-in. Phase 4 also removes "Log in, then open Shop" from the FAQ.
3. **Commission:** does the Krewe earn anything per vendor sale? If yes, the
   treasurer may want a note or a monthly vendor-report field later
   (not part of this build).
4. **RTS 2026 store:** will Red's Team Sports open a new season store link?
5. **Pins and other items** stay on Zeffy with pickup at General Meetings,
   unchanged — confirm.

---

## 6. Rough size

| Phase | Files | Effort |
|---|---|---|
| 1 Database | `sql/kos_shop_vendors.sql` | small–medium |
| 2 Shop Studio | `assets/kos-shop-studio.js`, `members.html`, `SHOP_STUDIO.md` | medium |
| 3 Shop page (collage + gallery) | `store.html` | medium |
| 4 FAQ | `members.html` | small |
| 5 Tests | `tests/specs/shop-vendors.spec.js`, `tests/README.md` | small–medium |

Recommended order: 1 → 3 → 2 → 4, with tests written alongside each phase.
Doing the Shop page (3) before Shop Studio (2) lets the seeded vendors and a few
products entered by SQL show up for members early, while the officer screen is
finished.
