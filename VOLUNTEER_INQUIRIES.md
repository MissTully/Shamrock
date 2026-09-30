# Volunteer inquiries

The public Service & Charity page (`volunteer.html`) has two ways to help.

- **I’d like to volunteer** opens a short interest form. It saves a row and emails the current Charity Chair.
- **Log volunteer hours** opens the Member Hub hours form (`members.html?hub=hours#hours`). That path is unchanged.

Charity partner sections on the page stay as they are. The footer contact stays `secretary@kreweofshamrock.com`.

## Who sees the inbox

Officer Desk, Charity section, tool name **Volunteer inquiries**. Lists are New, Contacted, and Done.

Someone can open it when any of these is true:

- `is_krewe_officer()` (board, officer, or captain)
- `member_roles.role = 'committee'` and `committee` matching Charity
- an officer title containing `Chair of Charity`

The Charity Chair does not need a new grant. Leaders sync already gives that title a Charity committee role. The chair’s email is read from the roster at send time. The form does not name a person, and the SQL does not store a personal mailbox. If no chair is on the roster, the notice goes to `secretary@kreweofshamrock.com`.

## Apply the database file

Melissa does this once in the Supabase SQL editor for project `oazwkwflgbthojvnclfc`. The site deploy does not run it. Until it is applied, the form cannot save and the Hub hides the tool because `can_review_volunteer_inquiries()` does not exist yet.

1. Open `sql/kos_volunteer_inquiries.sql`.
2. Paste it into a new SQL query and run it.
3. Safe to run again.

`enqueue_email` and `is_krewe_officer()` are already on the project. This file does not change volunteer hour logging.

## What the form stores

Name, email, phone, affiliation (`krewe_member`, `other_krewe`, or `neither`), the other krewe’s name when that applies, interests and availability, and an optional note. A hidden company-website field is ignored when it is filled in (the visitor still sees a thank-you). More than 12 new inquiries in 10 minutes, or the same email again inside 10 minutes, is refused. The browser does not insert into the table. `submit_volunteer_inquiry` does.

The letter includes the name, contact, affiliation, interests, notes, and a link to `members.html#volunteer-inquiries`.

Mark contacted or Mark done records the officer’s name, email, and an optional note. Rows are not deleted.
