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

`submit_membership_application` still emails `secretary@kreweofshamrock.com` and `digital@kreweofshamrock.com` with the same message as before.

It also emails whoever currently holds Membership Chair (committee grant or a title containing Chair of Membership). If nobody holds that role, it falls back to `lsugrue99@gmail.com`. The chair copy is skipped when that address is already secretary or digital, so those two are not mailed twice.

The chair letter names the applicant and includes a link to Membership Applications (`members.html#applications`). It names the application fee (single $50 or couple $75). It does not include a Social Security number.

## Pipeline stages

Join-form applications move through these `membership_status` values. Officers do this from Membership Applications. Each change is a row in `membership_application_actions` (who, when, note, from status, to status).

| Stage | Status value | What it means |
|---|---|---|
| New | `pending-new` | Submitted on the join form |
| Background check in progress | `background-check` | Chair started the background check |
| Dues pending | `dues-pending` | Background check is done. Membership dues are next. This is not the application fee. |
| Approved | `active` | Approve. Welcome email for new applicants. |
| Declined | `declined` | Record stays. Off the new list. |
| Archived | `archived` | Record stays. Off the new list. |

Mark next step sent keeps the current status and stores the note so other officers can see it.

Renewals (`pending-renewal`) and event prospects (`prospect`) stay in their own lists.

## Fees

Two different fees:

- Application fee (background check): $50 single applicant, $75 couple. The join page says the payment link is not published there. The Membership Chair sends that step. Do not use the dues links for this fee.
- Membership dues (after the background check): full krewe $375 and leave of absence $100. Those Zeffy links are already on the join page and in the Hub, labeled as membership dues.

The roster column `application_fee_type` is `single` or `dual`.

Officers and board members (`member_role` or `member_roles` / `officer_title` of officer, captain, or board, using the same title map as the Hub) do not see a pay-dues checklist item. Regular members do.

## Background check number

The join form collects a Social Security number (the board's preferred ID; a driver license was the old path). It is stored in `membership_application_ids`, not on the public page and not in email.

- Lists show the last 4 only.
- `reveal_membership_application_id` returns the full number only when `can_review_applications()` is true.
- The table has row level security and no client grants. The browser cannot select it directly.

## Apply the pipeline file before go-live

The site deploy does not run SQL. Do this in the Supabase SQL editor for project `oazwkwflgbthojvnclfc` before the new stages, the chair letter, and the background-check number are live.

1. If Membership Applications is not installed yet, run `sql/kos_membership_applications.sql` first.
2. Open `sql/kos_membership_application_pipeline.sql`.
3. Paste it into a new SQL query and run it.
4. Safe to run again.

If you run the older membership applications file after the pipeline file, run the pipeline file again.

Until the pipeline file is applied, the join form still saves the name and address. The background-check number is not stored, and the new stage buttons need the file.
