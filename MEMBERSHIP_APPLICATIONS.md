# Membership Applications

The Membership Chair reviews join-form applications in the Member Hub. The tool is **Membership Applications**, the first section on the Officer desk. Home also shows a count such as **3 new applications** that opens the tool.

The live journey is:

1. Join. The public form is Single or Couple. `parades.html` can open it with `?level=associate`. Without that parameter, nothing about level is shown and the interest is Full membership.
2. Interest email. `submit_membership_application` emails the Membership Chair and the President. An Associate interest adds "Interested in: Associate membership".
3. Called, send background check email. That letter has the full-application link and the background check fee ($50 individual or $75 couple). It does not include a dues pay link. Auxiliary applicants are told their $200 dues include the background check, and that letter does not also show the $50 or $75 pay buttons.
4. Fee paid (the Zeffy alert moves the row to Background check fee paid), or **Auxiliary: fee included** for an Auxiliary row still waiting on that fee. The Auxiliary button sends no email.
5. Start background check and Copy IDs. The button stays off, with "Waiting for the full application", until the applicant's Social Security number and driver's license are on file. A couple also needs both numbers for the partner. Copy puts a number on the clipboard. The card stays masked. No email is sent.
6. Proceed with induction, send dues link. One dues block per person. A couple with the same Zeffy link is told to add one ticket per person.
7. Approve membership. Approval is subject to final ratification by the Board of Directors. Only a dues-pending approval sends the welcome letter, including the training video.

Returning members are not approved here. Dues payment moves a lapsed or pending dues member back to active. See docs/membership-process.md.

Decline and Archive keep the record on file.

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

Pending application means `membership_status = 'pending-new'` (the join form). Event RSVP prospects (`prospect`) are a separate filter. `pending-renewal` is pending dues for a returning member. Those people do not appear in Membership Applications, and approve of that status changes nothing.

- **Approve membership (subject to Board ratification)** is the induction-stage button (`dues-pending`). It sets `membership_status` to `active`. `member_role` becomes `member` when it is blank or `prospect`. An existing officer, board, or captain role is left alone. `join_date` is filled only when it is null. The join form already stamps `join_date` from the column default, so a normal new application keeps the date it was submitted. That approval queues the welcome email through `enqueue_email` / `outbound_emails`. It tells them to open the Member Hub, tap **Create or reset your password**, and use the email on the application. Signing up with that email is what links their login (`handle_new_user` matches the roster by email). The letter includes the training video `https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR`. The letter says approval is subject to final ratification by the Board of Directors. If dues are still unpaid for the applicant or the linked partner, the confirm dialog says so and does not block approval.
- Approving a `pending-renewal` row returns: "Renewals are automatic when dues are paid. For cash or check, use Officer desk, Renewals, Mark renewed." Decline and archive of an old pending-renewal row still work.
- **Decline** sets `membership_status` to `declined`. **Archive** sets `archived`. An optional note is stored with the decision. Members rows are never deleted.

Each decision records the actor auth uid, display name, email, timestamp, from/to status, and note in `membership_application_actions`. Only reviewers can read that table. The browser cannot write it directly.

**Note for the record** is that same history table, with `action = 'note'`. **Save note** writes the row and leaves `membership_status` where it is. It does not send the joining packet. `from_status` and `to_status` are both the current stage, including `prospect` for an event RSVP. `members.notes` stays the applicant's own words, shown as **Their note**. The latest `note` row comes back on the card as **Record note**. Older note rows stay in Recent decisions.

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

The letter names the applicant, phone, and mailing address, and whether they are applying as Single or Couple. An Associate interest adds "Interested in: Associate membership". It asks the chair to call, then to choose **Called, send background check email** in the Hub. It does not include a Social Security number or a driver's license number.

The person who submitted sees: "We received your interest in joining. Someone from the Krewe will call you."

## Pipeline stages

Join-form applications move through these `membership_status` values. Officers do this from Membership Applications. Each change is a row in `membership_application_actions` (who, when, note, from status, to status).

| Stage | Status value | What it means |
|---|---|---|
| New interest | `pending-new` | Interest submitted on the join form. No Social Security number or driver's license number yet. |
| Background check fee pending | `background-check` | Chair clicked **Called, send background check email**. The fee link and the full application are in that letter. |
| Background check fee paid | `bg_paid` | Zeffy marked the fee paid, or the chair used **Auxiliary: fee included**. **Start background check** stays off until the full application IDs are in. |
| Background check in process | `bg_in_process` | Chair clicked **Start background check** and can Copy IDs. |
| Induction pending | `dues-pending` | Chair clicked **Proceed with induction, send dues link**. The dues link and the meeting invitation are out. |
| Member | `active` | **Approve membership (subject to Board ratification)**. The welcome letter goes out from this step only. Approval is subject to final ratification by the Board of Directors. |
| Declined | `declined` | Record stays. Off the new list. |
| Archived | `archived` | Record stays. Off the new list. |

**Called, send background check email** emails the applicant when prospect email is on. The letter has the finish-application button at `membership-full-application.html` and the background check payment ($50 individual or $75 couple). It does not include a dues pay link. The link expires in 21 days. Only a hash of the token is stored. The letter does not include a Social Security number or a driver's license number. If the email cannot be queued, the status does not change. There is no separate Send full application button. Older `next_step_sent` and `full_application_sent` history rows still display.

From New interest through Background check in process, the card has a **Membership level** select: Full Krewe $375, Associate $450, Auxiliary $200, Leave of absence $100. It is hidden from Induction pending onward. The induction preview uses the chosen level, one dues block per person.

Reviewers can change the joining packet wording from Membership Applications. The button is **Edit joining packet email**. It shows the current subject, greeting, and explanatory paragraphs. **Preview as** is Standard or Auxiliary. Standard shows the fee intro and the $50 and $75 pay buttons. Auxiliary shows "You chose Auxiliary membership. Your $200 Auxiliary dues include the background check, so you do not pay this fee." and does not show that fee intro or those pay buttons. Preview uses the sample name Nia and a placeholder token, and it does not send email. **Save draft template** writes one row, id `draft`, in `kos_joining_packet_template`. The background check email reads that draft for the subject and those paragraphs. The finish-application button (a new 21-day token) and the background check pay buttons (`background_check_payments`) are not free-text fields. Payment web addresses are rejected if someone pastes them into the letter. `preview_joining_packet_email` reads `membership_level` before the template check strips it, then passes it to the real email builder.

Prospect email can be paused. The switch is `kos_runtime_flags` key `membership_prospect_emails`. `enabled` false means do not email the prospect. **Called, send background check email** still changes the stage. Do not turn that pause on from these files. Background check payment links live on a different key, `background_check_payments`. Dues notes and Zeffy links live on `kos_dues_catalog` (`explainer` and `zeffy_url`). The dues link is sent at induction, not in this letter.

When a full application is on file, each driver's license and Social Security number on the card stays masked (last 4). A Copy button sits beside that line for reviewers who can already open the number. Copy uses `reveal_membership_application_id` and puts the full value on the clipboard. The card stays masked. The number is not emailed. Each copy is the same audited open as before (last 4 only in the history note).

Event prospects (`prospect`) stay in their own list. Pending dues (`pending-renewal`) is not a Membership Applications list.

## Fees

Two different fees:

- Application fee (background check): $50 individual, $75 couple. The public Join page does not ask for this choice and does not publish a payment link. When prospect email is on, **Called, send background check email** includes both Zeffy links. Do not use the dues links for this fee. Auxiliary membership is the exception: **Auxiliary: fee included** moves an Auxiliary row from Background check fee pending to Background check fee paid without a fee payment and without an email. The fee chip then reads **Included with Auxiliary**.
- Membership dues go out in the induction email, for the level on the application: Full Krewe $375, Associate $450, Auxiliary $200, Leave of absence $100. Amounts and links come from `kos_dues_catalog`. The Auxiliary explainer there stays as it is. Those Zeffy links stay off the public Join page. Submitting the full application does not queue a dues invoice.

The roster column `application_fee_type` is `single` or `dual`. `membership_level` is `full`, `associate`, `auxiliary`, or `loa`.

Elected officers (President, Vice President, Secretary, Treasurer) are exempt from dues under the bylaws. Board, captains, and committee chairs see the normal Renew card.

## Background check numbers

The join form does not collect a Social Security number or a driver's license number. After the call, the Membership Chair uses **Called, send background check email**. That emails the secure link. The applicant opens the token link and completes the full application. The chair starts the check with **Start background check** after the fee is paid, or after **Auxiliary: fee included**, and only after the full application is in. A single applicant needs `has_ssn` and `has_dl`. A couple (`application_fee_type` dual, or a partner name on the row) also needs `has_partner_ssn` and `has_partner_dl`. The database checks `membership_application_ids` for the same slots. If any are missing, the action returns "The full application is not in yet. Start the background check after they submit it." and changes nothing. A linked partner moves only when that partner row passes the same check. The dues link is the later induction email, not this step.

The full application asks for the driver's license number above the Social Security number, with date of birth beside those fields. There is no driver's license state field. Applicant 1 date of birth is always required. Applicant 2 date of birth is required only when a partner is being entered (fee type `dual`). A couple enters the license, the Social Security number, and the date of birth for each person. The form says: "The board uses date of birth, SSN, and driver's license for the background check. Your information is held confidentially."

Applicant 1 date of birth is saved on `members.birthday`. The partner date of birth is `membership_application_ids.dob`, on the same table as the partner license and Social Security number, with the same row level security and no client grants. Reviewers read both dates from `list_membership_applications`. The chair card shows each date as MM/DD/YYYY with a Copy button beside the license and SSN Copy buttons. Copy puts MM/DD/YYYY on the clipboard. The date is not emailed.

The license and Social Security number are stored in `membership_application_ids`. `id_kind` is `ssn` or `dl`. `person_slot` is `applicant` or `partner`.

- Lists show the last 4 of each license and Social Security number only. Dates of birth are shown in full as MM/DD/YYYY.
- `reveal_membership_application_id` returns one full license or Social Security number only when `can_review_applications()` is true. The Copy button on those lines uses that same check. The date of birth Copy button copies the MM/DD/YYYY already shown on the card. Each ID open writes `id_revealed` with the last 4, not the full value. The full ID is copied to the clipboard and is not shown on the card and not emailed.
- The ID table and the link table have row level security and no client grants. The browser cannot select them directly. The partner date of birth lives on that same ID table.
- Interest mail, the secure-link mail, and the received mail do not include a date of birth, a full Social Security number, or a full driver's license number. Free-text notes are redacted before they are emailed or listed.

## Apply the SQL before go-live

The site deploy does not run SQL. Do this in the Supabase SQL editor for project `oazwkwflgbthojvnclfc`.

1. If Membership Applications is not installed yet, run `sql/kos_membership_applications.sql` first.
2. Open `sql/kos_membership_application_pipeline.sql`. Paste it into a new SQL query and run it.
3. Open `sql/kos_membership_application_staged.sql`. Paste it into a new SQL query and run it. This is the staged interest file: interest-only join, the secure link, and driver's license plus Social Security number on the token page.
4. Open `sql/kos_membership_background_check_invoice.sql`. Paste it into a new SQL query and run it. This is an earlier pipeline file. The live dues link is sent at induction, not when the full application is saved.
5. Open `sql/kos_prospect_background_check_email.sql`. Paste it into a new SQL query and run it. This stores the dues explainers, the dues Zeffy links, and the background check payment links, and it builds the prospect letter. It does not turn prospect email on.
6. Open `sql/kos_joining_packet_email_template.sql`. Paste it into a new SQL query and run it. This stores the editable joining packet draft and points Send joining packet at that draft. It does not turn prospect email on. Running it again does not overwrite a draft you already saved.
7. Open `sql/kos_membership_application_record_note.sql`. Paste it into a new SQL query and run it. This lets **Save note** write a `note` row without moving the stage or sending the joining packet. Running it again is safe. It does not change the joining packet draft.
8. Open `sql/kos_application_dob.sql`. Paste it into a new SQL query and run it. This stores Applicant 1 date of birth on `members.birthday` and the partner date of birth on `membership_application_ids.dob`. Running it again is safe. It does not turn prospect email on.
9. Each file is safe to run again.

Run `sql/kos_application_dob.sql` last. If you run the staged file again after it, run the record-note file again, then the date-of-birth file. The staged file replaces the action check and the application list, and that drops `note` until the record-note file is applied. If you run the pipeline file, the background-check invoice file, the prospect email file, or the joining-packet template file again, run the template file, then the record-note file, then `sql/kos_application_dob.sql`. The invoice file replaces the full-application save, and the record-note file replaces the chair list. The date-of-birth file puts both back with the date fields.

Do not set `membership_prospect_emails` to enabled. Melissa applies the SQL in the Supabase editor. The site deploy does not run it.

Until the staged file is applied, the join page still saves the name and address through the older function.

Applied in production (Nov 2026). These four files are already on the live project. Each is safe to run again. None of them sends email by being applied.

1. `sql/kos_renewal_approve_no_welcome.sql` replaced `_apply_membership_application_decision`. Only a dues-pending approval queues the welcome letter. `sql/kos_v6_renewal_lapse.sql` replaces that function again and refuses a pending-renewal approval.
2. `sql/kos_join_level_interest.sql` replaces `submit_membership_application` (same arguments, plus trailing `p_membership_level`) and adds `set_application_membership_level`.
3. `sql/kos_induction_letter_couple_note.sql` replaces `kos_induction_letter_html`. A shared Zeffy URL for two or more unpaid people adds one ticket note.
4. `sql/kos_auxiliary_fee_included.sql` adds `kos_mark_background_fee_included` and replaces `kos_prospect_background_check_email_html` and `send_membership_full_application`. It does not change `kos_dues_catalog`.

`sql/kos_v6_renewal_lapse.sql` is not applied yet. Apply it only after Melissa approves, in the same release as the Hub that calls the new lapse functions. The header of that file has the rollback.

Rollback for each applied file is to put back the previous function from `sql/kos_membership_pipeline_dashboard.sql` or `sql/kos_join_couple_interest.sql`, and to drop `set_application_membership_level` and `kos_mark_background_fee_included` if you are undoing those steps. Do not drop the action check while `level_set` or `background_check_fee_included` rows exist.
