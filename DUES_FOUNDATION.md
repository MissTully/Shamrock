# Dues foundation (Phase 1)

Level-based dues for the Member Hub. Phase 1 is this database and the officer functions. Phase 2 is Officer desk → Email & invoices → **Send invoices**, which reads `kos_dues_catalog` and calls `kos_set_membership_level` and `kos_create_level_invoices`. Phase 3 is Officer desk → Email & invoices → **Dues waivers**, which calls the three waiver functions below. See OFFICER_DUES_WAIVERS.md. Treasurer reports are still not a Hub screen.

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
4. Stop there. Do **not** call `kos_apply_elected_officer_exemptions` from the SQL editor unless the board wants President, Vice President, Secretary, and Treasurer marked waived for that year. The Dues waivers card can run that function later, and only after an officer confirms. Opening the card does not run it.

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
| associate | 450 | https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-associate-membership |
| auxiliary | 200 | https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-auxiliary-membership |
| loa | 100 | https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2 |

Each row also has an `explainer`. The Move to background check letter prints that note, then the pay link.

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

All five require a signed-in officer (`is_krewe_officer()`). Anyone else gets `{"ok": false, "message": "Officers only."}`. Send invoices calls the level and invoice functions. Dues waivers calls the three waiver functions. They are not anonymous.

| Function | What it does |
|---|---|
| `kos_set_membership_level(member_id, level)` | Sets the roster level. Does not change an invoice already written. Logs `level_set`. The Send invoices screen calls this from each member's level dropdown. |
| `kos_create_level_invoices(member_ids, year, exclude_elected_officers default true)` | Reads each member's level, reads the catalog, and inserts or updates an **unpaid** dues row at that amount. Skips a row that is already paid or has `waiver_status = applied`. Skips President, Vice President, Secretary, and Treasurer when the third argument is true. Logs `invoice_created`. If that year has no catalog row for the level, that member is skipped. Send invoices previews those counts, then calls this. The exclude-elected-officers box is on by default. |
| `kos_request_dues_waiver(member_id, year, kind, reason)` | Sets `waiver_status` to `requested` and stores the kind and note. Does **not** mark the member paid. Kind is `elected_officer`, `service_in_lieu`, or `board_approved_other`. The Dues waivers card calls this. |
| `kos_decide_dues_waiver(member_id, year, approve, apply default true)` | Approve sets `approved`. With `apply` true (the default) it also sets amount 0, `paid` true, method `waiver`, status `applied`, and stores the catalog rate in `standard_amount`. Deny sets `denied` and does not mark anyone paid. An applied waiver is not undone here. Approve on the card passes apply true. Deny passes approve false. |
| `kos_apply_elected_officer_exemptions(year)` | For members whose title is President, Vice President, Secretary, or Treasurer, and who are not merged away: writes an applied `elected_officer` waiver. Board members and committee chairs are not included. Skips someone already paid in money, and skips a different applied waiver (for example service in lieu). Logs one `officer_exemptions_batch` row. The card runs this only from **Apply bylaws exemptions for season** after confirm. |

Titles are matched one segment at a time. `Treasurer · Committee Chair of Finance` counts. `Committee Chair of Finance` alone does not. `Board Member` does not.

Elected-officer exemptions are a separate step from applying this file. On the Hub, an officer uses **Apply bylaws exemptions for season** on the Dues waivers card. From the SQL editor, only when the board wants it:

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

- The waiver queue is on the Hub: Officer desk → Email & invoices → **Dues waivers**. See OFFICER_DUES_WAIVERS.md. It reads `dues_payments`, `members`, and `kos_dues_events` with the officer policies already on the project. No new SQL is required for that screen.
- There is still no treasurer report in the Hub.
- Send invoices does not type a single dollar amount. It prices from `kos_dues_catalog`. See OFFICER_EMAIL_INVOICES.md.
- 2026 associate and auxiliary campaigns are on the catalog rows above. The invoice screen still warns, and it still skips a pay button, when a level has no `zeffy_url`. The waiver card does not show pay links.
