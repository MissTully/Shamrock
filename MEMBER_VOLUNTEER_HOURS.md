# Hub volunteer hours

Members log volunteer hours in the Member Hub. Officers and event hosts confirm them on Approvals. Track It Forward is not the ongoing path.

Apply `sql/kos_hub_volunteer_hours.sql` in the Supabase SQL editor before this goes live. The site deploy does not run SQL. The file is safe to re-run.

## Season rules (unchanged)

- Season is June through May. `season_year` is the calendar year the season ends (`krewe_volunteer_season_year`).
- Full members need 12 hours.
- Shortfall buyout is $12 per hour.
- In-kind donations count: every $12 is one hour. The member enters the hours, and marks the log as in-kind.
- Parade security on an alcohol parade is logged at double hours. The member enters the hours that should count. The Hub does not double them again.
- Officers and board stay dues-exempt the way Phase 2 already set. This does not change dues.

## How a log is created

| Path | `source` | Starts as |
|---|---|---|
| Member desk form, hours worked | `manual` | pending |
| Member desk form, in-kind | `in_kind` | pending |
| Member desk form, season hours on file (one time) | `manual` | pending |
| Volunteer signup, while a slot remains | `event_signup` | pending |
| Door check-in, only if no hours row exists yet for that member and event | `door_checkin` | pending |
| Officer import of a past export | `trackitforward_import` | approved |

One pending row per event signup. If the member already has a pending or approved row for that event, door check-in reuses it and does not add a second log. Check-in does not approve the row. A host or an officer still confirms it.

Volunteer signup uses planned hours when the member entered them. Otherwise it uses the event length, or 2 hours if the event has no end time. The amount is kept between 0.5 and 24.

## Who can approve

- Officers and board can approve or decline any pending log, including hours with no event.
- An event host can approve or decline pending logs for that event only. A host is the person who created the event, or a member signed up as organizer for it.
- Hosts do not see other members' email, phone, or dues. The queue shows name, hours, activity, date, event, and the member's note.
- Decline sets `status` to `rejected`. Those hours do not count.

## Volunteer slots

Event Studio has **Volunteer slots** next to Capacity.

- Blank: no cap.
- A number: that many members may sign up as `volunteer`. Attendees are not limited by this field.
- Zero: volunteer signup is blocked.
- Parade security uses the same cap on that event.

The database trigger is what stops an overbook. The signup page also warns when `volunteer_slot_summary()` says the cap is full.

Saving an event calls `officer_set_volunteer_cap` after the normal event save, so the cap is stored even though older `officer_upsert_event` builds do not know the column.

## Past export (no Hub import screen)

There is no import button. When an officer has a Track It Forward export, load it with `import_trackitforward_hours`. Those rows are **auto-approved**, because they were already accepted in the old system. One row per member per season. A second import skips that member.

Columns:

| Column | Required | Notes |
|---|---|---|
| `email` | yes | Matches `members.email`, ignoring case. Merged-away rows are skipped. |
| `hours` | yes | Greater than 0, up to 500. |
| `season_year` | no | Season ending year. Default is the season of `worked_on`. |
| `worked_on` | no | `YYYY-MM-DD`. Default is today. |
| `activity` | no | Default is `Season hours imported`. |

Example:

```sql
select public.import_trackitforward_hours('[
  {"email":"member@example.com","hours":8.5,"season_year":2027,"worked_on":"2026-08-15","activity":"Season hours imported"}
]'::jsonb);
```

The result is `{ ok, inserted, skipped, errors }`. `source` on each row is `trackitforward_import`.

A member can also type **Season hours on file** once on Member desk. That row stays pending until an officer confirms the number. Use the import when the export file arrives. Use the form when one member needs to bring a balance over by hand.
