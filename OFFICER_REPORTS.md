# Officer reports

The Officer Desk reports read the live Supabase views and lightweight coordination tables created by `sql/kos_event_marketing_and_officer_reports.sql`.

## Demo data

The migration seeds clearly marked simulation rows using existing member/event foreign keys:

- `volunteer_hours`, `lockers`, `carpools`, `vanpools`, and `content_items` use `is_demo = true` and/or `SIM` notes.
- `dues_payments` and `event_signups` use notes beginning with `SIM`.
- No fabricated member email addresses are added; all report joins use the existing roster.

## Clear demo rows

Run as an officer/database administrator after testing:

```sql
delete from public.event_signups where notes like 'SIM%';
delete from public.dues_payments where notes like 'SIM%';
delete from public.volunteer_hours where is_demo;
delete from public.lockers where is_demo;
delete from public.carpools where is_demo;
delete from public.vanpool_reservations where is_demo;
delete from public.vanpools where is_demo;
delete from public.content_items where is_demo;
```

Reports offer **Download CSV** for spreadsheet-compatible output and **Print / Save PDF** for a print-friendly PDF workflow. Errors include the Supabase relation message so a missing view/table can be identified quickly.
