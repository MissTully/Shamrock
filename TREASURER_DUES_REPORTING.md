# Treasurer dues reporting

For people who can already open the Payments card. The check is `can_view_payments()`: an active member whose title includes Treasurer, whose `member_role` is board, or who has a `board` or `treasurer` role grant. President and Secretary see this only when that same check passes. It is not opened to every officer.

## Where to find it

Member Hub → **Officer desk** → section **Money** → **Dues & Payments**.

The membership year at the top defaults to **2026**. Changing it reloads the season, the waiver report, and the export dates. It does not invoice anyone and it does not waive anyone.

## Tabs

1. **Cash ledger** — the existing online payments feed (`list_recent_payments`). Payers with no roster match are still flagged. This list is not added into the season cash total.
2. **Dues season** — summary, level breakdown, member detail, and aging.
3. **Waivers** — a report of applied waivers. Request, approve, deny, and the elected-officer batch stay on Officer desk → Email & invoices → **Dues waivers**.
4. **Export** — two CSV downloads built in the browser. No new edge function.

## Season totals

Read from `dues_payments` for the selected year, with names from `members` and catalog rates from `kos_dues_catalog`. Officers already have those reads. No new SQL.

| Card | What it adds up |
|---|---|
| Members invoiced | Count of dues rows for the year |
| Cash collected | Sum of `amount` on rows that are paid and whose method is not `waiver` |
| Outstanding | Sum of `amount` where the row is unpaid |
| Waived value | Sum of `standard_amount` where method is `waiver` or `waiver_status` is `applied`. A blank `standard_amount` uses that level's catalog rate. |
| Collection rate | Cash ÷ (cash + outstanding). Waived dues are left out of the denominator. |

A waiver is not cash. The online ledger is not added on top of a dues row that is already marked paid (that would count the same money twice).

The level table is level, invoiced, paid cash, waived, outstanding, and the catalog rate for that year.

The member table can be filtered by name, email, or status (unpaid, paid, waived). Amount owed is the unpaid balance. Paid and waived rows show $0.00 owed.

## Waiver report

Applied waivers only, in three groups:

- Elected officer exemption (`elected_officer`)
- Service in lieu (`service_in_lieu`)
- Other board-approved (`board_approved_other`)

Each group shows the count, the `standard_amount` total, the member names, and the approver (`waiver_approved_by`) when that was stored. A paid waiver with no kind (older rows) is listed as "Recorded waiver (kind not set)" so it is not dropped into the wrong group and not counted as cash. A requested or denied waiver stays unpaid and is not in this report.

## Aging

Unpaid rows only, by `due_date`: not yet due, 1–30, 31–60, 61–90, over 90 days, and no due date. Due today counts as not yet due.

This screen does not send reminder email. There is no one-click send. Reminders stay on the existing path: **Send invoices**, and the steps in DUES_REMINDER_AUTOMATION.md.

## Export

- **Dues CSV** (`kos-dues-YEAR.csv`) — member name, email, level, amount, standard amount, status (`unpaid`, `paid`, or `waived`), payment method, paid, paid date, due date, waiver kind, waiver status, approver, notes.
- **Payments CSV** — ledger rows whose recorded date falls in the from/to range. The range starts as January 1 through December 31 of the membership year. Columns: when, payer name, email, kind, description, amount (dollars), membership year, matched.

## What this does not change

- Zeffy webhooks and `kos_record_payment`
- Send invoices and `kos_create_level_invoices`
- The Dues waivers queue and the waiver functions
- Associate and auxiliary Zeffy links (this screen does not invent any)
