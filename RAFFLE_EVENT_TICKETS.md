# Event raffle tickets — runbook (Patrick & Melissa)

Hybrid sales for Krewe of Shamrock: **Zeffy add-on with the event ticket (any quantity)**, plus **QR and cash at the event**. Same static site, Member Hub, Zeffy, and Supabase. Not a native app. **Only paid tickets are drawn.**

Apply `sql/kos_event_raffle_tickets.sql` in the Supabase SQL editor, then redeploy Edge Function `zeffy-webhook`.

---

## 1. Zeffy campaign (Patrick)

Create **one ticketing campaign per krewe event** (each event already needs its own public link).

1. **Admission** — existing event ticket (fixed price, quantity = people).
2. **Raffle line** — one add-on / ticket type named so the webhook can see it, for example:
   - `50/50 raffle ticket`
   - or `Raffle ticket`
3. Price that raffle line **per ticket**.
4. Set quantity to **buyer-chosen / free quantity** (not packs of 5 or 10). Zeffy shows the line total; they pay.
5. Optional: campaign metadata `kind=event`. If you set `kind=raffle` on a mixed cart, the webhook still treats it as an event purchase when admission items are present.
6. Copy the public campaign URL into **Event Studio → Ticket payment URL**.

Night-of **card-only** sales can reuse this campaign (buyer adds raffle qty) or a raffle-only Zeffy form. Paste a raffle-only URL on the raffle in Member Hub if you do not want admission on the night-of card path.

Webhook behavior for one payment:

| Line | Result |
|------|--------|
| Admission | Auto-RSVP / event ticket (existing) |
| Raffle qty N | **N paid** 50/50 entries (idempotent on Zeffy payment id) |

Name the raffle line with “raffle”, “50/50”, or “fifty-fifty”. Quantity on that line is the number of tickets. Retries do not double-credit.

50/50 is the supported online path. Multi-basket raffles still take cash/QR entries; a Zeffy line is credited to a basket only when that raffle has exactly one basket.

---

## 2. Link raffle ↔ krewe event (hub)

1. Member Hub → **Raffles**.
2. Create a **50/50** raffle (or open an existing one).
3. **Link to krewe event** — pick that night’s event. Save.
4. Optional: paste a raffle-only Zeffy URL. Blank = use the event’s ticket URL for the card QR.
5. Event Studio list then shows **Raffle QR** for that event.

Public RSVP (`event-signup.html`) resolves the linked raffle and points people at `raffle.html?event=<raffle-id>` for extras.

---

## 3. Night-of: QR + cash

**QR (print from Raffles or `raffle-qr-sheet.html?event=<id>`):**

- **Enter / cash** → `raffle.html?event=<raffle-id>` (guest picks any qty on their phone).
- **Card** → Zeffy (raffle URL or the event ticket campaign).

**Cash:** guest submits on the raffle page. Entry is stored **unpaid**. A volunteer uses **Paid vs unpaid list → Mark paid**. Draw RPCs count **paid tickets only**. Unpaid digital entries are not in the drum.

---

## 4. Before the draw

Officer / raffle admin tools show **paid in the drum** vs **unpaid**. Mark cash paid, then draw. The draw will refuse if only unpaid tickets exist.

---

## 5. Test plan

1. **Webhook, qty > 1:** Zeffy (or a test `payment.completed`) with 1 admission + 7 raffle tickets. Confirm one RSVP, seven **paid** 50/50 tickets, and a retry of the same payment id does not add more.
2. **Cash unpaid → paid → draw:** enter on `raffle.html?event=…` without paying; confirm unpaid count; Mark paid; draw; winner comes from paid tickets only.
3. **QR deep link:** scan / open `raffle.html?event=<id>` and `raffle-qr-sheet.html?event=<id>` for that raffle only.
