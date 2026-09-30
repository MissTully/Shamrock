# Officer desk: Email members & Send invoices

For any krewe officer with Officer desk access (board, officer, or captain — not secretary-only).

## Where to find it

Member Hub → **Officer desk** → section **Email & invoices**:

1. **Email members** - choose audience (all active, officers & board, chairs/officers, pick from roster, or **Event prospects**), write subject and message, preview, confirm, Send.
2. **Send invoices** - choose the membership year (default 2026), filter unpaid dues, members with no dues row, a level, or a roster search, then create catalog-priced `dues_payments` rows. See DUES_FOUNDATION.md.
3. **Dues waivers** - request a waiver, approve or deny the queue, and apply President / Vice President / Secretary / Treasurer exemptions for the season after a confirm step. See OFFICER_DUES_WAIVERS.md.

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
- Optional email uses the same outbound queue and Resend path as Email members. Each notice includes the level, amount, due date, and the catalog Zeffy link. Paid members are not emailed. If a level has no catalog link, the screen warns, and that email does not invent a pay button.
- Creates or updates unpaid rows on `dues_payments` (no second billing system). 2026 rates: full $375, associate $450, loa $100, auxiliary $200.
- When Zeffy webhooks mark dues paid, those members drop off the unpaid list. Applied waivers (`paid` true, method `waiver`) do too.

## Event prospects

The **Event prospects** pill uses the cross-event outreach list (website RSVP prospects and unmatched Zeffy event emails). **Include legacy Wild Apricot emails** is optional and off by default.

Sending still requires `is_krewe_officer()` — the same gate as the other Email members audiences. Seeing the Event outreach list (`can_view_event_outreach`) is not enough to send.

The blast does not add active members. An address is included only when it is already on that filtered outreach list, and each email is queued once. Opt-out rows or boolean member columns, if they exist later, are skipped. See EVENT_OUTREACH.md.

The counts and send path land when `sql/kos_event_outreach.sql` is applied in the Supabase SQL editor. Apply it after `sql/kos_officer_email_and_invoices.sql`. The website deploy does not run SQL. If the email SQL file is applied again later, re-apply `sql/kos_event_outreach.sql` so Event prospects stays on the send function.

## SQL / functions

- Send invoices: `kos_dues_catalog`, `kos_set_membership_level`, and `kos_create_level_invoices` in `sql/kos_dues_foundation.sql`. Email notices still queue through `officer_send_member_email` and `process-outbound-emails`.
- Dues waivers: `kos_request_dues_waiver`, `kos_decide_dues_waiver`, and `kos_apply_elected_officer_exemptions` in the same SQL file. The screen is the **Dues waivers** card, not Send invoices. See OFFICER_DUES_WAIVERS.md.
- Treasurer reports are not on this screen.
