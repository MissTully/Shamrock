# Officer desk: Email members & Send invoices

For any krewe officer with Officer desk access (board, officer, or captain — not secretary-only).

## Where to find it

Member Hub → **Officer desk** → section **Email & invoices**:

1. **Email members** - choose audience (all active, officers & board, chairs/officers, or pick from roster), write subject and message, preview, confirm, Send.
2. **Send invoices** - filter unpaid dues or pick members, set year/amount/note, create `dues_payments` invoice rows, optionally email a Zeffy pay link. The amount should be that member's catalog rate (`full`, `associate`, `loa`, or `auxiliary`), not always $375. See DUES_FOUNDATION.md.

## How email delivery works

Compose/send queues rows in `outbound_emails`. The Edge Function `process-outbound-emails` sends them through **Resend**.

**Required to actually deliver:** set Supabase Edge Function secrets:

- `RESEND_API_KEY` = your Resend key
- `RESEND_FROM` = e.g. `Krewe of Shamrock <secretary@your-verified-domain>`

Until the key is set, sends still queue safely and show in history; nothing leaves the building.

## Invoices / payments

- Creates or updates unpaid rows on `dues_payments` (no second billing system).
- 2026 rates live in `kos_dues_catalog`: full $375, associate $450, loa $100, auxiliary $200. `members.membership_level` picks the row. Do not treat $375 as the only dues amount.
- This Hub screen can still type an amount, and the older invoice function still defaults to $375 when no amount is passed. Until the screen reads the catalog, look up the level in `kos_dues_catalog` or run `kos_create_level_invoices` so associate, loa, and auxiliary are not invoiced at the full rate by mistake.
- Emails include the Zeffy link for that level when the catalog has one (full and loa today). Associate and auxiliary have no link yet. No card numbers are collected in the Hub.
- When Zeffy webhooks mark dues paid, those members drop off the unpaid list. Applied waivers (`paid` true, method `waiver`) do too.

## SQL / functions

- Current Hub send path: `sql/kos_officer_email_and_invoices.sql` and Edge Function `process-outbound-emails`.
- Level catalog, waivers, and officer functions (no Hub screen yet): `sql/kos_dues_foundation.sql` and DUES_FOUNDATION.md.
