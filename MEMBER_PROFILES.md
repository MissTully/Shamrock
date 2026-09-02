# Member profiles and officer titles

**Answer first:** Members now get a real profile card. Officers keep a separate access role so a committee name is a title people see, not a secret admin switch.

On `members.html` after sign-in:

- A welcome card with photo, name, title, and Edit my profile
- A strip of this season's officers
- Directory cards that open a profile
- An Officer Desk for approving applications
- Access role (`member`, `officer`, `captain`, `board`) separate from display title

Run `sql/kos_member_profiles_and_titles.sql` in the Tribe Test Supabase SQL editor before go-live.
Optionally run `sql/kos_seed_fall_2026_events.sql` for the August meeting dates.

The display title **Social and Charity Committee** is the combined committee from the 26 August 2026 meeting.
