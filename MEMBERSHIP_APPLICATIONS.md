# Membership Applications

The Membership Chair reviews join-form applications in the Member Hub. The tool is **Membership Applications**, the first section on the Officer desk. Home also shows a count such as **3 new applications** that opens the tool.

The old Pending Applications report (Officer desk, Jump by name, Membership) is still a read-only mix of new applications, renewals, and event prospects. It does not approve or decline anyone.

## Who can see it

- Membership Chair: `member_roles.role = 'committee'` and `committee` matching Membership, or an officer title containing `Chair of Membership`
- President (the title President, not Vice President)
- Secretary
- Chair of Technology
- Site admins: a `member_roles` row with `role = 'officer'` whose roster record is not itself an officer or chair title. That is the bootstrap admin account. Treasurer and Vice President also have an `officer` role grant from roster sync, and they do **not** see this tool.

Other board members and chairs do not see the tool or the home count.

The Membership Chair does not need a new grant. Lisa Sugrue already has the Membership committee role, and that is enough.

## What Approve and Decline do

Pending application means `membership_status = 'pending-new'` (the join form). Renewals (`pending-renewal`) and event RSVP prospects (`prospect`) are separate filters.

- **Approve** sets `membership_status` to `active`. `member_role` becomes `member` when it is blank or `prospect`. An existing officer, board, or captain role is left alone. `join_date` is filled only when it is null. The join form already stamps `join_date` from the column default, so a normal new application keeps the date it was submitted. A welcome email is queued through `enqueue_email` / `outbound_emails` for new applications and prospects. It tells them to open the Member Hub, tap **Create or reset your password**, and use the email on the application. Signing up with that email is what links their login (`handle_new_user` matches the roster by email). Renewals are marked active and are not sent that first-login letter.
- **Decline** sets `membership_status` to `declined`. **Archive** sets `archived`. An optional note is stored with the decision. Members rows are never deleted.

Each decision records the actor auth uid, display name, email, timestamp, from/to status, and note in `membership_application_actions`. Only reviewers can read that table. The browser cannot write it directly.

`declined` and `archived` stay out of the member directory (active only), birthday names (`active`, `pending-renewal`, `pending-new`), `v_secretary_engagement`, `v_report_membership`, and `v_parade_ready`.

## Apply the database file

Do this once in the Supabase SQL editor for project `oazwkwflgbthojvnclfc`. The site deploy does not run it.

1. Open `sql/kos_membership_applications.sql`.
2. Paste it into a new SQL query and run it.
3. Safe to run again.

Until that file is applied, the Hub hides the tool because `can_review_applications()` does not exist yet.

## Notification email

The join form is interest only. `submit_membership_application` emails the Membership Chair and the President. It does not email `secretary@kreweofshamrock.com` or `digital@kreweofshamrock.com`.

Membership Chair is a committee grant for Membership, or a title containing Chair of Membership. If nobody holds that role, the chair copy falls back to `lsugrue99@gmail.com`. President is the title segment President, not Vice President. One address is not mailed twice when the same person holds both.

The letter names the applicant, phone, and mailing address. The Join form does not choose single or couple, so the letter uses the general application-fee line ($50 or $75). It asks them to call, then to choose Move to background check in the Hub. That emails the secure link. It does not include a Social Security number or a driver's license number.

The person who submitted sees: "We received your interest in joining. Someone from the Krewe will call you."

## Pipeline stages

Join-form applications move through these `membership_status` values. Officers do this from Membership Applications. Each change is a row in `membership_application_actions` (who, when, note, from status, to status).

| Stage | Status value | What it means |
|---|---|---|
| New | `pending-new` | Interest submitted on the join form. No Social Security number or driver's license number yet. |
| Background check in progress | `background-check` | Chair clicked Move to background check. That emails the secure full-application link. |
| Dues pending | `dues-pending` | Stage after the check. This is not the application fee. The dues invoice is already emailed when they begin the check. |
| Approved | `active` | Approve. Welcome email for new applicants. |
| Declined | `declined` | Record stays. Off the new list. |
| Archived | `archived` | Record stays. Off the new list. |

Move to background check emails the applicant when prospect email is on. The letter has three parts: a button to finish the full application at `membership-full-application.html`, the background check payment ($50 individual or $75 couple), and each membership level with a short note and then that level's pay link. The link expires in 21 days. Only a hash of the token is stored. The letter does not include a Social Security number or a driver's license number. If the email cannot be queued, the status does not change. There is no separate Send full application button. Older `next_step_sent` and `full_application_sent` history rows still display.

Prospect email can be paused. The switch is `kos_runtime_flags` key `membership_prospect_emails`. `enabled` false means do not email the prospect. Move to background check still changes the stage. Do not turn that pause on from these files. Background check payment links live on a different key, `background_check_payments`. Dues notes and Zeffy links live on `kos_dues_catalog` (`explainer` and `zeffy_url`).

When a full application is on file, each driver's license and Social Security number on the card stays masked (last 4). A Copy button sits beside that line for reviewers who can already open the number. Copy uses `reveal_membership_application_id` and puts the full value on the clipboard. The card stays masked. The number is not emailed. Each copy is the same audited open as before (last 4 only in the history note).

Renewals (`pending-renewal`) and event prospects (`prospect`) stay in their own lists.

## Fees

Two different fees:

- Application fee (background check): $50 individual, $75 couple. The public Join page does not ask for this choice and does not publish a payment link. When prospect email is on, Move to background check includes both Zeffy links. Do not use the dues links for this fee.
- Membership dues, in the same letter, each with a short note and then the pay link: Full Krewe $375 (voting, all parades, 12/12 volunteer), Associate $450 (one year, two parades, no vote, no 12/12), Auxiliary $200 (non-voting, one major parade; the fee includes the background check and the membership portion), Leave of Absence $100 (social status). Amounts and links come from `kos_dues_catalog`. The separate dues invoice is still emailed when the prospect submits the full application and begins the background check. Those Zeffy links stay off the public Join page. Move to dues pending does not send a second invoice.

The roster column `application_fee_type` is `single` or `dual`.

Officers and board members (`member_role` or `member_roles` / `officer_title` of officer, captain, or board, using the same title map as the Hub) do not see a pay-dues checklist item. Regular members do.

## Background check numbers

The join form does not collect a Social Security number or a driver's license number. After the call, the Membership Chair uses Move to background check. That emails the secure link. The applicant opens the token link and completes the full application. Submitting that form is when they begin the background check, and that is when the membership dues invoice is queued.

The full application asks for the driver's license number above the Social Security number. There is no driver's license state field. A couple ($75, fee type `dual`) enters both numbers for Applicant 1 and both numbers for Applicant 2. The form says: "The board uses SSN and driver's license for the background check. Your information is held confidentially."

Both values are stored in `membership_application_ids`. `id_kind` is `ssn` or `dl`. `person_slot` is `applicant` or `partner`.

- Lists show the last 4 only.
- `reveal_membership_application_id` returns one full value only when `can_review_applications()` is true. The Copy button on the card uses that same check. Each open writes `id_revealed` with the last 4, not the full value. The full value is copied to the clipboard and is not shown on the card and not emailed.
- The ID table and the link table have row level security and no client grants. The browser cannot select them directly.
- Interest mail, the secure-link mail, and the received mail do not include a full Social Security number or a full driver's license number. Free-text notes are redacted before they are emailed or listed.

## Apply the SQL before go-live

The site deploy does not run SQL. Do this in the Supabase SQL editor for project `oazwkwflgbthojvnclfc`.

1. If Membership Applications is not installed yet, run `sql/kos_membership_applications.sql` first.
2. Open `sql/kos_membership_application_pipeline.sql`. Paste it into a new SQL query and run it.
3. Open `sql/kos_membership_application_staged.sql`. Paste it into a new SQL query and run it. This is the Phase 1 file: interest-only join, the secure link, and driver's license plus Social Security number on the token page.
4. Open `sql/kos_membership_background_check_invoice.sql`. Paste it into a new SQL query and run it. This folds the secure link into Move to background check and queues the level-based membership dues invoice when the prospect submits the full application.
5. Open `sql/kos_prospect_background_check_email.sql`. Paste it into a new SQL query and run it. This stores the dues explainers, the dues Zeffy links, and the background check payment links, and it builds the prospect letter. It does not turn prospect email on.
6. Each file is safe to run again.

Run `sql/kos_prospect_background_check_email.sql` last. If you run the pipeline file, the staged file, or the background-check invoice file again after it, run the prospect email file again.

Do not set `membership_prospect_emails` to enabled. Melissa applies the SQL in the Supabase editor. The site deploy does not run it.

Until the staged file is applied, the join page still saves the name and address through the older function. Until the background-check invoice file is applied, Move to background check changes the status and does not email the secure link, and submitting the full application does not queue the dues invoice.
