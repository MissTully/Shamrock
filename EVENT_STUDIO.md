# Event Studio

Event Studio lives in the authenticated Member Hub under **Officer desk**. Members with the normal officer role, or a board/officer/captain/committee-chair event-management grant, can create and edit Krewe events.

## Create or edit an event

1. Open `members.html` and sign in.
2. Open **Officer desk**, then **Event Studio**.
3. Choose **New / clear** for a new event, or **Edit** beside an existing Krewe event.
4. Enter the name and start time, then add the location, description, capacity, event type, visibility, mandatory flag, status, flyer, and ticket details.
5. Save. The list refreshes from `officer_list_events()`.

IKC-sourced events are read-only. The database authorization is enforced again by `officer_upsert_event`, so hiding the UI is not the security boundary.

## Flyers (featured event)

The public sign-up page (`event-signup.html`) features the earliest upcoming **published, public** event that has a flyer. To attach one:

1. In the Event Studio form, use **Upload flyer (PDF or image)**. Accepted types are PDF, JPG, PNG, and WEBP, up to 10 MB.
2. The file uploads to the public `event-flyers` Supabase Storage bucket (created by `sql/kos_event_flyers_storage.sql`; storage row-level security allows writes only for members who pass `can_manage_events()`), and the resulting public URL is placed in the **Flyer URL** field automatically. You can also paste any URL there by hand.
3. Press **Save event**. Once the event is published and public, the flyer appears in the "Featured Event" section — PDFs render in an embedded viewer with an "Open flyer PDF" link, images render directly.

## Paid tickets

Create a Stripe Payment Link for the event, set Payment Link metadata `kind=event`, and paste the link into **Ticket payment URL**. Enter the customer-facing ticket label and dollar price; Event Studio converts dollars to cents for the `events.ticket_price_cents` column. Payment reconciliation remains handled by the Stripe webhook and payments ledger. See `PAYMENTS_SETUP.md` for the Stripe runbook.
