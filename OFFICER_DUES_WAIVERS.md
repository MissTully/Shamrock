# Officer desk: Dues waivers

For any krewe officer with Officer desk access (the same people who can open Email members and Send invoices).

## Where to find it

Member Hub → **Officer desk** → section **Email & invoices** → **Dues waivers**.

The card sits with Email members and Send invoices. Payments stays on the Money section for the treasurer feed.

## What you can do

The membership year defaults to **2026**. Change the year at the top. That reloads the lists. It does not waive anyone.

1. **Request a waiver** — search the roster, pick one member, choose a kind, and add a note.
   - **Elected officer exemption** — suggested when a title segment is President, Vice President, Secretary, or Treasurer. `Treasurer · Committee Chair of Finance` counts. `Committee Chair of Finance` alone does not.
   - **Service in lieu** and **Other board-approved** need a reason.
   - This calls `kos_request_dues_waiver`. The member stays **unpaid**.
2. **Pending requests** — everyone with `waiver_status = requested` for that year, with who asked and the reason.
   - **Approve** calls `kos_decide_dues_waiver` with approve true and apply true. Amount due becomes $0, paid, method `waiver`, status `applied`. The catalog rate is kept in `standard_amount` (the waived value).
   - **Deny** calls the same function with approve false. The member stays unpaid.
3. **Waiver history** — applied and denied rows for the year. Filter with All, Applied, or Denied. Applied rows show the kind, waived value (`standard_amount`), approver, and date.
4. **Apply bylaws exemptions for season** — asks you to confirm, then calls `kos_apply_elected_officer_exemptions` for the year on the card. President, Vice President, Secretary, and Treasurer only. Committee chairs and board members are not included. Someone already paid in money is skipped. A different applied waiver (for example service in lieu) is skipped. The card shows how many were applied and how many were skipped. **Opening the card does not run this.**

A row already paid in money (cash, check, card, or anything that is not method `waiver`) stays as it is. The request button is off, and approve / deny are not offered for that row.

## Who may use it

The screen uses `is_krewe_officer()`, the same gate as Email members and Send invoices. The five dues functions also check that and refuse anyone else.

The plan prefers the President or Treasurer for discretionary approvals (service in lieu and other board-approved). The Hub's Payments check is Treasurer or board, and the President title is stored as officer, not board, so that check would lock the President out and let other board members in. This card does not use it. Any officer on the desk can request, approve, deny, and run the season batch. Dual control is the history list: it shows who requested and who approved. There is no second database lock.

## What this screen reads

No new SQL is required. Officers already can read:

- `members` (name, email, level, `officer_title`)
- `dues_payments` (waiver columns, amount, paid, method, `standard_amount`, notes)
- `kos_dues_events` (the request reason is in `payload.reason`; notes on the dues row are the fallback)
- `kos_dues_catalog` (the year's rate, so the card can show the catalog amount)

Writes go through the three waiver functions in `sql/kos_dues_foundation.sql`. See DUES_FOUNDATION.md. Do not invent Zeffy links for associate or auxiliary. This card does not show pay links.

## What this screen does not do

- It does not send invoices or email. That stays on Send invoices.
- It does not build a treasurer report.
- It does not change Zeffy webhooks, reminder mail, or parade-ready.
