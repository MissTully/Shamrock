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
