# Dues foundation (Phase 1)

Level-based dues for the Member Hub. Phase 1 is this database and the officer functions. Phase 2 is Officer desk → Email & invoices → **Send invoices**, which reads `kos_dues_catalog` and calls `kos_set_membership_level` and `kos_create_level_invoices`. Waiver decisions and treasurer reports are not on that screen.

Rates for a year live in `kos_dues_catalog`. A member's level lives on `members.membership_level`. Do not treat $375 as the only dues amount.

Questions go to the treasurer at **treasurer@kreweofshamrock.com**.

## Apply order (Melissa / Groot)

Do this in the Supabase **SQL Editor** for project `oazwkwflgbthojvnclfc`. The website does not run the file. Do not paste secrets into it.

1. These are already on the live project. Do not re-run them unless that object is missing:
   - `members` and `dues_payments`
   - `sql/kos_volunteer_dues_waiver.sql` (adds payment method `waiver`)
   - `sql/kos_officer_email_and_invoices.sql` (one dues row per member per year)
2. Open `sql/kos_dues_foundation.sql`, paste the whole file, and run it once.
3. It is safe to run again. A second run puts the four **2026** catalog rows back to the locked rates below. It does not mark anyone paid.
4. Stop there. Do **not** call `kos_apply_elected_officer_exemptions` unless the board wants President, Vice President, Secretary, and Treasurer marked waived for that year.

Check the catalog after the run:

```sql
select membership_year, level, amount, zeffy_url, active
  from public.kos_dues_catalog
 order by membership_year, level;
```

You should see four 2026 rows: full 375, associate 450, loa 100, auxiliary 200.

## Locked 2026 rates

| level | amount | Zeffy link |
|---|---:|---|
| full | 375 | https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership |
| associate | 450 | none yet (Patrick still needs to create the campaign) |
| loa | 100 | https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2 |
| auxiliary | 200 | none yet (this level may be retired) |

## What the migration changes

- `members.membership_level` — `full`, `associate`, `loa`, or `auxiliary`. New members default to `full`. Blank rows were set to `full`.
- `dues_payments` keeps one row per member and year. New columns record the level, the catalog rate (`standard_amount`), waiver kind and status, who requested or approved, and the Zeffy URL used (`zeffy_campaign_key`).
- Old dues rows are labeled from the amount charged: 100 → loa, 450 → associate, 200 → auxiliary, and 0, 375, 325, or anything else → full. 325 was the earlier Full rate. `amount`, `paid`, and `payment_method` are not changed. A waiver or a paid $0 row stores the catalog rate in `standard_amount` (375 for full) while `amount` stays 0.
- `kos_dues_catalog` is the rate card.
- `kos_dues_events` is an append-only log. Rows cannot be updated or deleted.

Everyone on the roster starts at **full**, including people whose old dues row was $100, $450, or $200. That old row keeps its own level. Before the next invoices, set the roster level for anyone who is not full:

```sql
select m.first_name, m.last_name, m.membership_level,
       d.membership_year, d.amount, d.membership_level as dues_level
  from public.dues_payments d
  join public.members m on m.id = d.member_id
 where m.merged_into is null
   and d.membership_level is distinct from m.membership_level;
```

Existing Doug and Melissa Tully waiver rows stay paid at $0 with method `waiver`. This file does not fill in `waiver_kind` on those older rows.

## Officer functions

All five require a signed-in officer (`is_krewe_officer()`). Anyone else gets `{"ok": false, "message": "Officers only."}`. Run them from the SQL editor while signed in as an officer, or later from the Hub. They are not anonymous.

| Function | What it does |
|---|---|
| `kos_set_membership_level(member_id, level)` | Sets the roster level. Does not change an invoice already written. Logs `level_set`. The Send invoices screen calls this from each member's level dropdown. |
| `kos_create_level_invoices(member_ids, year, exclude_elected_officers default true)` | Reads each member's level, reads the catalog, and inserts or updates an **unpaid** dues row at that amount. Skips a row that is already paid or has `waiver_status = applied`. Skips President, Vice President, Secretary, and Treasurer when the third argument is true. Logs `invoice_created`. If that year has no catalog row for the level, that member is skipped. Send invoices previews those counts, then calls this. The exclude-elected-officers box is on by default. |
| `kos_request_dues_waiver(member_id, year, kind, reason)` | Sets `waiver_status` to `requested` and stores the kind and note. Does **not** mark the member paid. Kind is `elected_officer`, `service_in_lieu`, or `board_approved_other`. |
| `kos_decide_dues_waiver(member_id, year, approve, apply default true)` | Approve sets `approved`. With `apply` true (the default) it also sets amount 0, `paid` true, method `waiver`, status `applied`, and stores the catalog rate in `standard_amount`. Deny sets `denied` and does not mark anyone paid. An applied waiver is not undone here. |
| `kos_apply_elected_officer_exemptions(year)` | For members whose title is President, Vice President, Secretary, or Treasurer, and who are not merged away: writes an applied `elected_officer` waiver. Board members and committee chairs are not included. Skips someone already paid in money, and skips a different applied waiver (for example service in lieu). Logs one `officer_exemptions_batch` row. |

Titles are matched one segment at a time. `Treasurer · Committee Chair of Finance` counts. `Committee Chair of Finance` alone does not. `Board Member` does not.

Elected-officer exemptions are a separate step from applying this file. Example, only when the board wants it:

```sql
select public.kos_apply_elected_officer_exemptions(2026);
```

## Security

- The five functions are `SECURITY DEFINER` with a fixed `search_path`. Execute is granted to `authenticated` and revoked from `anon` and `public`.
- Each function checks `is_krewe_officer()` and returns a message instead of changing rows when the caller is not an officer.
- `kos_dues_catalog`: row level security is on. Officers can read. There is no client insert, update, or delete policy. Change rates by editing and re-running the SQL file (that resets 2026 to the locked table).
- `kos_dues_events`: officers can read. A trigger rejects update and delete. The log is written only by the functions above.
- Helper functions (`kos_dues_quote` and the others) are not granted to the Hub.
- No card numbers and no API tokens are stored.
- Officers can still edit `dues_payments` directly, the same as before this file. The functions are the path that also writes the event log.
- `zeffy-webhook` / `kos_record_payment`, `v_outstanding_dues`, and parade-ready are unchanged. They still treat `dues_payments.paid = true` as settled, including a waiver at $0. Reminder mail must keep skipping paid rows.

## What this phase does not do

- No waiver queue and no treasurer report in the Hub. `kos_request_dues_waiver`, `kos_decide_dues_waiver`, and `kos_apply_elected_officer_exemptions` stay SQL-only until a later phase.
- Send invoices does not type a single dollar amount. It prices from `kos_dues_catalog`. See OFFICER_EMAIL_INVOICES.md.
- Associate and auxiliary have no Zeffy link yet. Do not invent one. The invoice screen warns, and it will not put a pay button in those emails.
