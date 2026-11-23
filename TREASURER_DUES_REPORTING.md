# Treasurer dues reporting

For people who can already open the Payments card. The check is `can_view_payments()`: an active member whose title includes Treasurer, whose `member_role` is board, or who has a `board` or `treasurer` role grant. President and Secretary see this only when that same check passes. It is not opened to every officer.

## Where to find it

Member Hub → **Officer desk** → section **Money** → **Dues & Payments**.

The membership year at the top defaults to **2026**. Changing it reloads the season, the waiver report, and the export dates. It does not invoice anyone and it does not waive anyone.

## Tabs

1. **Cash ledger**: `kos_treasurer_ledger` for June 1 through May 31. Zeffy card payments, cash and check receipts, waived rows, and Wild Apricot dues (source `Wild Apricot`). **Deposit total (cash and check)** is non-voided cash plus check, with a per-day breakdown. Wild Apricot is its own card and is not added into that deposit total. A source filter narrows the list and does not change the cards. **Record cash or check** searches active, Delinquent, Pending dues, and Induction pending members and opens the receipt dialog. Void and Adjust show on receipt rows only when `kos_can_record_dues_cash()` is true (Treasurer, President, or Membership Chair). Until that SQL is applied, this tab lists Zeffy payments plus Wild Apricot dues already on the season. It does not repeat cash, check, or waivers.
2. **Dues season**: the same summary, level breakdown, member detail, and aging. When `kos_dues_season_report` is available, the header reads `N invoiced and unpaid + M not invoiced yet = T owing (matches Renewals)`. Clicking a name opens a History drawer (`kos_member_dues_history`).
3. **Waivers**: a report of applied waivers. Request, approve, deny, and the elected-officer batch stay on Officer desk → Email & invoices → **Dues waivers**.
4. **Check Zeffy**: read only. `kos_dues_reconcile` for June 1 through May 31 flags amount mismatches, level mismatches, dues payers with no member, event or other payments that look like dues, card rows with no Zeffy payment, and Zeffy dues payments with no dues row. It does not change a payment and it does not send email.
5. **Export**: CSV downloads built in the browser. No new edge function. Payments CSV defaults to June 1 through May 31 of the selected membership year, and those dates update when the year changes. When the ledger RPC is available, that CSV includes method and check number. **Season report** shows collected, waived, voided, unpaid, and not invoiced, and downloads its own CSV.

## Season totals

Read from `dues_payments` for the selected year, with names from `members` and catalog rates from `kos_dues_catalog`. Officers already have those reads. No new SQL.

| Card | What it adds up |
|---|---|
| Members invoiced | Count of dues rows for the year |
| Cash collected | Sum of `amount` on rows that are paid and whose method is not `waiver`. Wild Apricot rows (`payment_method` `other` with Wild Apricot in the notes) are paid and are included. The Wild Apricot card is that part of Cash collected, not a second total. The All levels row matches these cards. |
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

This screen does not send reminder email. There is no one-click send. Reminders go out from Send invoices.

## Export

- **Dues CSV** (`kos-dues-YEAR.csv`): member name, email, level, amount, standard amount, status (`unpaid`, `paid`, or `waived`), payment method, paid, paid date, due date, waiver kind, waiver status, approver, notes.
- **Payments CSV**: rows whose recorded date falls in the from/to range. The range starts as June 1 of the membership year through May 31 of the next year. With the ledger RPC, columns are when, payer name, source, method, check number, amount, and voided. Before that SQL is applied, the older online-payment columns are used.
- **Season report CSV** (`kos-season-report-YEAR.csv`): collected by method and level, waived, voided, renewal and induction unpaid, not invoiced, owing total, and background check fees.

## SQL

`kos_v7_treasurer_ledger` and `kos_v8_ledger_wild_apricot` are already applied on project oazwkwflgbthojvnclfc. This Hub change does not add a SQL file and does not need a new one. Do not re-run `sql/kos_v7_treasurer_ledger.sql` over the live function. That file has no Wild Apricot lines, so it would replace the ledger that is already live. The website deploy does not run SQL. No new RPC sends email. Owing counts use `kos_renewal_rows`, which calls `kos_is_dues_exempt`.

## What this does not change

- Zeffy webhooks and the live payment function (`kos_record_payment` is not replaced)
- Send invoices and `kos_create_level_invoices`
- The Dues waivers queue and the waiver functions
- Zeffy links for a level that is missing from `kos_dues_catalog` (this screen does not invent any)
