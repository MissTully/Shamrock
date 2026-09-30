# Officer desk: Email members & Send invoices

For any krewe officer with Officer desk access (board, officer, or captain — not secretary-only).

## Where to find it

Member Hub → **Officer desk** → section **Email & invoices**:

1. **Email members** - choose audience (all active, officers & board, chairs/officers, or pick from roster), write subject and message, preview, confirm, Send.
2. **Send invoices** - choose the membership year (default 2026), filter unpaid dues, members with no dues row, a level, or a roster search, then create catalog-priced `dues_payments` rows. See DUES_FOUNDATION.md.

## How email delivery works

Compose/send queues rows in `outbound_emails`. The Edge Function `process-outbound-emails` sends them through **Resend**.

**Required to actually deliver:** set Supabase Edge Function secrets:

- `RESEND_API_KEY` = your Resend key
- `RESEND_FROM` = e.g. `Krewe of Shamrock <secretary@your-verified-domain>`

Until the key is set, sends still queue safely and show in history; nothing leaves the building.

## Invoices / payments

- The screen reads `kos_dues_catalog` for the selected year and shows each member's `membership_level` with that year's amount and Zeffy link.
- A level dropdown calls `kos_set_membership_level` before you invoice. That does not rewrite an invoice already on the books.
- **Create invoices** calls `kos_create_level_invoices`. The preview counts creates, updates, and skips (paid, applied waiver, elected officer, no catalog row) before anything is written.
- **Exclude elected officers** is on by default (President, Vice President, Secretary, and Treasurer).
- Optional email uses the same outbound queue and Resend path as Email members. Each notice includes the level, amount, due date, and the catalog Zeffy link. Paid members are not emailed. Associate and auxiliary have no link yet; the screen warns, and those emails do not invent a pay button.
- Creates or updates unpaid rows on `dues_payments` (no second billing system). 2026 rates: full $375, associate $450, loa $100, auxiliary $200.
- When Zeffy webhooks mark dues paid, those members drop off the unpaid list. Applied waivers (`paid` true, method `waiver`) do too.

## SQL / functions

- Send invoices: `kos_dues_catalog`, `kos_set_membership_level`, and `kos_create_level_invoices` in `sql/kos_dues_foundation.sql`. Email notices still queue through `officer_send_member_email` and `process-outbound-emails`.
- Waiver requests and treasurer reports are not on this screen. See DUES_FOUNDATION.md.
