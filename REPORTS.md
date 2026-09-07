# Officer Reports

The **Reports** card lives in the authenticated Member Hub under **Officer
desk**, right below Event Studio. Any member who passes `can_manage_events()`
(board members, officers, captains, and committee chairs — the same
authorization gate Event Studio uses) can run reports. The database re-checks
that authorization inside every report function, so hiding the card is not the
security boundary.

## Running an event report ("who is coming")

1. Open `members.html`, sign in, and open **Officer desk**.
2. In the **Reports** card, pick an event from the dropdown. The list combines
   every website event with every event imported from the old Wild Apricot
   site, newest first, with a sign-up count beside each.
3. Press **☘ Run report**.

The report shows:

- **Expected attendees** — website RSVPs (each person plus their guests) plus
  old-site registrations that are not canceled.
- **Raised** — paid old-site registration fees (including 50/50 raffle add-ons
  bought at checkout) plus Stripe payments recorded against the event on the
  new site. Zeffy ticket sales are reconciled on Zeffy's own dashboard and are
  not included until they are recorded as payments.
- **Still unpaid** — old-site registrations whose invoice is open.
- **Checked in** — the old site's check-in flags (and website sign-ups whose
  status is `attended`).
- A full attendee table (name, email, ticket type or role, guests, amount
  paid, check-in, and whether the sign-up came from the website or the old
  site), downloadable as a CSV spreadsheet for clipboards and door lists.

## Running a fundraising summary ("how much has been raised")

In the same card, optionally set a From/To date range (blank = all time) and
press **☘ Run summary**. You get money actually received, by category
(Events, Membership dues & applications, Store, Manual invoices, and so on)
and by event, with a grand total and a CSV download. It combines the imported
Wild Apricot payment ledger with the new site's Stripe payments ledger.

## Where the data lives

- `public.legacy_event_registrations` and `public.legacy_payments` hold the
  history imported from the 2026-09-03 Wild Apricot export (1,618 event
  registrations and 1,460 payments). The schema is in
  `sql/kos_legacy_import_and_reports.sql`; the data itself was loaded through
  live migrations and is intentionally not in this public repository because
  the rows contain member emails and phone numbers.
- `public.link_legacy_registrations()` matches imported registrations to
  website events by calendar date (it refuses to guess when two events share
  a date). It is safe to re-run after creating events in Event Studio.
- The report functions are `officer_report_options()`,
  `officer_event_report(p_key)`, and `officer_fundraising_report(p_from,
  p_to)` — all `security definer`, all gated by `can_manage_events()`.

## Refreshing the import later

The import is a snapshot. If the old site keeps taking registrations, export
fresh CSVs from Wild Apricot (Events, Payments), delete the legacy rows, and
re-run the import with the new files, then call
`public.link_legacy_registrations()` again.
