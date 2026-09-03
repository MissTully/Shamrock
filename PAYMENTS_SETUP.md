# Payments — Stripe setup for the Krewe of Shamrock (501(c)(3))

The wiring is already live: a `payments` ledger in the database, a
`stripe-webhook` Edge Function that records every successful checkout
automatically, a Payments report in the Officer desk, and store "Buy now"
support. What remains are the account-owner steps below.

## What's built (no action needed)

| Piece | What it does |
|---|---|
| `payments` table | Ledger of every online payment; officers read it in the hub. |
| `kos_record_payment(...)` | Records a payment (idempotent — the same Stripe event never records twice), matches the payer to the roster by email, and **auto-marks dues paid** when the payment is a dues payment. |
| `stripe-webhook` Edge Function | Stripe calls it the instant a checkout completes; it verifies the signature and calls the recorder. URL: `https://oazwkwflgbthojvnclfc.supabase.co/functions/v1/stripe-webhook` |
| Officer desk → Payments card | Live list of recent payments, flagging any payer with no roster match. |
| Store "Buy now" | Any product in `store.html` with a `buy:"https://buy.stripe.com/..."` link shows a Buy now button. |

## Step 1 — Create the Stripe account (an officer, ~15 minutes)

1. [dashboard.stripe.com/register](https://dashboard.stripe.com/register) — register as the krewe (legal name, EIN, treasurer's bank account for payouts).
2. As a 501(c)(3), apply for the **nonprofit rate** (about 2.2% + 30¢ instead of 2.9% + 30¢): search "nonprofit" in Stripe support and submit the form with your determination letter.

## Step 2 — Create products and Payment Links

Dashboard → Product catalog → **Add product** for each item (tees, kilt, tam,
blazer, top hat, event tickets like "Mini Golf — golf only $20" and "Mini Golf
— golf + lunch $40"). For each product: **Create payment link**.

- For apparel, add a **custom field** on the link for size, and allow quantity.
- **Important — metadata** makes the automation smart. On each Payment Link
  (Advanced → metadata) set `kind` to one of: `store`, `event`, `dues`,
  `donation`. Dues links should also set `membership_year` (e.g. `2027`) —
  that's what lets the webhook auto-mark the member's dues row paid.

Paste each link into the site: store items get `buy:"..."` in the `PRODUCTS`
list in `store.html` (see the comment there); event pages get a normal button
link.

## Step 3 — Connect the webhook (one time)

1. Stripe Dashboard → Developers → **Webhooks** → Add endpoint.
   - Endpoint URL: `https://oazwkwflgbthojvnclfc.supabase.co/functions/v1/stripe-webhook`
   - Events: select **checkout.session.completed**.
   - Copy the **signing secret** (`whsec_...`).
2. Supabase Dashboard → **Edge Functions** → `stripe-webhook` → Secrets:
   - `STRIPE_WEBHOOK_SECRET` = the `whsec_...` value
   - `STRIPE_SECRET_KEY` = your Stripe secret key (`sk_live_...`) — optional
     but recommended; it lets receipts show real line-item descriptions.
3. Same screen: turn **OFF "Enforce JWT verification"** for this function —
   Stripe is an outside caller and cannot present a login token; the function
   verifies Stripe's own cryptographic signature instead.

## Step 4 — Test before going live

Stripe has a **test mode** switch. Create a test payment link, pay with card
number `4242 4242 4242 4242` (any future date, any CVC), and check that the
payment appears in the Officer desk → Payments card within seconds. Then flip
to live mode and repeat once with a real card for $1.

## Raffles — read before selling tickets online

Keep raffles on the current model (**reserve online, pay a volunteer in
person**) until the board reviews two constraints:
- Florida Statute 849.0935 lets 501(c)(3) organizations run drawings by
  chance, but with disclosure rules (including no-purchase-necessary
  language).
- Stripe restricts raffle/lottery sales; approval may be needed.

As a (c)(3), also consider [Zeffy](https://zeffy.com) for raffles and event
ticketing — genuinely 0% fees for charities, with raffle tooling built in.
Zeffy payments would not flow into the automatic ledger (it has no webhook
into our database), so weigh free processing against manual reconciliation.

## Where the money data lives

Every recorded payment is in the `payments` table (officers only). A payer
whose email matches the roster is linked automatically; "no roster match" in
the Payments card means someone paid with an email the krewe doesn't have —
worth a follow-up so their history attaches to their record.
