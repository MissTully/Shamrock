# Event outreach

The **Event outreach** tool is on the Officer desk, in the **Events** section, next to Event Studio. It is one list of people to invite back. It is not a second CRM table, and it does not create member rows.

## Who can see it

The database function `can_view_event_outreach()` allows the list when either of these is true:

- `can_manage_events()` — the same gate as **Reports**. That is board members, officers, captains, committee chairs, and roster titles that match chair, committee, board, treasurer, secretary, captain, or lieutenant. Social / Charity event managers are in this group.
- `can_review_applications()` — the same people who see **Event prospects** under Membership Applications: Membership Chair, President, Secretary, Chair of Technology, and bootstrap site admins.

The desk hides the tool from the shop-only Merchandise desk (Shop Studio only), the same way it hides Reports. Hours-only hosts do not see it. Hiding the card is not the security boundary: `list_event_outreach` and `export_event_outreach` check the gate again.

## What is in the list

One row per email.

| Source | Who |
|---|---|
| Website RSVP | Roster rows with `membership_status = 'prospect'`, plus their `event_signups` |
| Zeffy | `payments.payer_email` where the provider is Zeffy and the product is an event ticket (`product_kind` `event`, a raffle tied to an event, or a still-unclassified Zeffy payload that is ticketing) |
| Legacy | Wild Apricot rows in `legacy_event_registrations` whose email is not on the current roster |

Canceled website signups are skipped. Legacy rows marked Canceled or abandoned are skipped. A Zeffy purchase and a website RSVP for the same event count once.

**Never applied to join** is checked by default. It hides Zeffy buyers whose email already matches a roster row that is not still a prospect (active, pending application, declined, and so on). Uncheck it to see those matched members in the same list, marked with their roster status. It does **not** hide Wild Apricot emails that are not on the roster. Legacy emails that already belong to a member are not added as their own rows. If that email is already on the list as a prospect or a Zeffy payer, the Legacy badge still shows.

**All sources (includes legacy)** is the default. Choosing **Legacy** shows only those Wild Apricot emails. A signed-in officer desk calls `list_event_outreach` on the live database. The example.com names (Niamh Kelly and the rest) are the offline test fixture. They appear only when there is no signed-in session, and the page says so.

An event counts when there is a website RSVP (including the waitlist), a Zeffy ticket, or a legacy registration. The “at least this many events” box is that count.

The on-screen list asks for up to 1,000 people. **Download CSV** uses `export_event_outreach` and includes the full filtered set, capped at 10,000 rows. Re-run this file if an older copy is already applied: that older copy still returns the right totals, but it only sends the first 300 rows to the page.

## Emailing the list

**Email members** (Officer desk → Email & invoices) has an **Event prospects** audience. It uses the same write, preview, confirm, and send flow as the other audiences.

Who can send is narrower than who can open this list. Send stays on `is_krewe_officer()` — board, officer, or captain. A membership chair who can review applications can see the list and download the CSV, and can send only when they also pass `is_krewe_officer()`.

**Event prospects** queues website RSVP prospects and unmatched Zeffy event emails where `applied_to_join` is false. It does not add the active-member list. An active member is mailed only when that same email is already a row on this filtered list. With the default view, active members are not on that set.

**Include legacy Wild Apricot emails** is off by default. When it is on, the send uses audience `prospects_legacy` and also includes legacy emails that are not on the roster. Addresses are deduplicated. If an opt-out table (`email_opt_outs`) or a boolean member column (`email_opt_out`, `do_not_email`, `marketing_opt_out`, `unsubscribed`) exists, those addresses are skipped and the result reports `skipped_opt_out`. None of those exist today, so nothing is skipped until one is added.

Prospect blasts are logged on `officer_outreach_log` with purpose `event_prospect_email`. They are not copied into All Krewe Messages.

## What this does not do

- It does not create an `event_prospects` table.
- It does not create members from Zeffy or Wild Apricot emails. Website prospects already exist from RSVP.
- It does not change Event prospects under Membership Applications.
- It does not change `officer_event_report`.

## Apply the database file

Do this once in the Supabase SQL editor for project `oazwkwflgbthojvnclfc`. The site deploy does not run it.

These files should already be on the project:

1. `sql/kos_payments.sql`
2. `sql/kos_legacy_import_and_reports.sql`
3. `sql/kos_event_studio.sql` (`can_manage_events`)
4. `sql/kos_membership_applications.sql` if application reviewers should see the list. If that function is missing, event managers still can.

Also apply `sql/kos_officer_email_and_invoices.sql` before this file if Email members is not already live. This file replaces `officer_email_audience_counts` and `officer_send_member_email` so the Event prospects audience exists. If the email file is run again later, run this file again so that audience is not wiped.

Then:

1. Open `sql/kos_event_outreach.sql`.
2. Paste it into a new SQL query and run it. Melissa applies this manually; the site deploy does not.
3. Safe to run again. If this file is already on the project, run it again so the list can return up to 1,000 rows and so “Never applied to join” keeps off-roster Wild Apricot emails even if that flag is set another way. The copy already on the project returns the right totals (about 333 legacy emails) and the first 300 rows.

Until that file is applied, the outreach tool tells the officer to apply it, and Email members shows the same note on Event prospects (the counts come back without `prospects`). The Member Hub scripts are `assets/members-desk.js` and `assets/kos-email-invoices.js` (cache-bust queries on `members.html`).
