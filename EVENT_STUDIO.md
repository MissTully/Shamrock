# Event Studio

Event Studio lives in the authenticated Member Hub under **Officer desk**. Members with the normal officer role, or a board/officer/captain/committee-chair event-management grant, can create and edit Krewe events.

## Create or edit an event

1. Open `members.html` and sign in.
2. Open **Officer desk**, then **Event Studio**.
3. Choose **New / clear** for a new event, or **Edit** beside an existing Krewe event.
4. Enter the name and start time, then add the location, description, capacity, event type, visibility, mandatory flag, status, flyer, and ticket details.
5. Save. The list refreshes from `officer_list_events()`. If a raffle is linked to the event (Member Hub → Raffles), **Raffle QR** opens that night’s enter/cash page. **RSVP QR** is on the same row.

IKC-sourced events are read-only. The database authorization is enforced again by `officer_upsert_event`, so hiding the UI is not the security boundary.

## Flyers (featured event)

The public sign-up page (`event-signup.html`) features the earliest upcoming **published, public** event that has a flyer. To attach one:

1. In the Event Studio form, use **Upload flyer (PDF or image)**. Accepted types are PDF, JPG, PNG, and WEBP, up to 10 MB.
2. The file uploads to the public `event-flyers` Supabase Storage bucket (created by `sql/kos_event_flyers_storage.sql`; storage row-level security allows writes only for members who pass `can_manage_events()`), and the resulting public URL is placed in the **Flyer URL** field automatically. You can also paste any URL there by hand.
3. Press **Save event**. Once the event is published and public, the flyer appears in the "Featured Event" section — PDFs render in an embedded viewer with an "Open flyer PDF" link, images render directly.

## Paid tickets

Create a Zeffy ticketing campaign with admission plus an optional raffle add-on (any quantity, priced per ticket). Paste the public link into **Ticket payment URL**. See `PAYMENTS_SETUP.md` and `RAFFLE_EVENT_TICKETS.md`.
