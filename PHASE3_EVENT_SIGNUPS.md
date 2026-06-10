# Phase 3 — Event Signups & RSVPs

This is the second automation from **AUTOMATIONS_AND_WORKFLOWS_PLAN.md**. It gives the
krewe a **public sign-up page**, a **live headcount**, and **automatic waitlisting**
when an event fills up. It builds on the same Supabase **Tribe Test** project
(`njfzrnqwbnuhmopgpsud`).

---

## 1. What was built

| Object | Type | What it does |
|--------|------|--------------|
| `events.is_public` | New column | When `true`, the event shows on the public sign-up page. Defaults to `true`. Set it to `false` to hide internal events (e.g., private meetings). |
| Public read policy | RLS policy | Lets not-signed-in visitors **read public events only**. Members, dues, and signups stay private. |
| `v_event_headcount` | View | Live per-event totals: signups, guests, volunteers, waitlisted, total headcount, and spots remaining. |
| `rsvp_to_event(...)` | Function (RPC) | The safe "front door" for the form. Validates input, finds-or-creates the person, enforces capacity (waitlists when full), and records the signup — **without exposing your tables**. |
| `event-signup.html` | Web page | The actual sign-up form, themed in Krewe green, ready to host. |

### Why a function instead of letting the form write directly
A public form can't be trusted to write straight into your tables — anyone could
insert anything. Instead the form calls **one controlled function** that does only the
safe, validated steps. This is the standard secure pattern for public forms on
Supabase.

---

## 2. How the sign-up flow works

1. A visitor opens `event-signup.html`.
2. The page lists every event where `is_public = true`, soonest first.
3. They pick an event, enter name, email, guest count, and attendee/volunteer.
4. On submit, the page calls `rsvp_to_event(...)`, which:
   - validates the input,
   - finds the person by email or **creates them as a `prospect` member**,
   - checks the event's `capacity` (counting people **and** their guests),
   - records the signup as **`registered`**, or **`waitlisted`** if the event is full,
   - returns a friendly message shown on screen.
5. You watch numbers climb in `v_event_headcount`.

**Tested and verified:** a capacity-1 event correctly registered the first person and
waitlisted the second; guests are counted toward capacity; the headcount view reports
signups, guests, volunteers, waitlist, and spots remaining accurately.

---

## 3. Using it

### See live headcounts (no code)
Supabase dashboard → **Table Editor → v_event_headcount**, or in the **SQL Editor**:

```sql
select name, capacity, signups, total_guests, volunteers, waitlisted,
       total_headcount, spots_remaining
from public.v_event_headcount;
```

### See who signed up for one event
```sql
select m.first_name, m.last_name, m.email, s.signup_role, s.status, s.guests_count
from public.event_signups s
join public.members m on m.id = s.member_id
join public.events  e on e.id = s.event_id
where e.name = 'St. Patrick''s Day Parade 2027'
order by s.status, m.last_name;
```

### Hide an event from the public form
```sql
update public.events set is_public = false where name = 'Spring Kickoff Meeting';
```

### Hosting the form (so people can reach it)
The file works by just double-clicking it locally for testing. To share a public link,
host it for free on any static host — easiest options:

- **Netlify Drop** — drag `event-signup.html` onto <https://app.netlify.com/drop>; you
  get a public URL in seconds.
- **GitHub Pages**, **Vercel**, or **Cloudflare Pages** — also free.
- Or drop it into the krewe's existing website.

No build step is needed — it's one self-contained file. The publishable key inside it
is safe to expose; it can only do what your security rules allow.

---

## 4. Confirmation & reminder emails

Right now the form shows an **instant on-screen confirmation**. To also email people,
you add an email sender — the same choice as the dues reminder (see
`DUES_REMINDER_AUTOMATION.md`, section 4):

- **Confirmation on signup (recommended next):** a Supabase **Edge Function** can be
  set to run whenever a row is added to `event_signups`, emailing the person a "you're
  confirmed / you're waitlisted" note via a service like Resend, SendGrid, or Brevo.
- **Pre-event reminder:** a weekly/daily scheduled job emails everyone `registered` for
  events happening in the next few days, and can nudge for volunteers if
  `volunteers` is low in `v_event_headcount`.
- **Human-in-the-loop alternative:** a Claude scheduled task that drafts these emails in
  your Gmail for review before sending — no code, requires your email connector linked.

Tell me which you'd like and I'll wire it up.

---

## 5. Notes & guardrails

- **New people become prospects.** Anyone who RSVPs with a new email is added to
  `members` as `membership_status = 'prospect'`. That feeds the onboarding workflow
  (Phase 5) — these are warm leads to invite into membership.
- **Re-RSVP is safe.** Submitting again with the same email for the same event updates
  the existing signup rather than creating a duplicate.
- **Capacity counts guests.** A person bringing 2 guests counts as 3 toward capacity.
- **Spam hardening (later).** Because the form is public, for a high-traffic page you
  may later add a CAPTCHA or rate limiting. For a krewe-sized audience this is usually
  unnecessary to start.
- **The publishable key** in the HTML is intentionally public and safe. The separate
  **service role key** must never go in this file.

---

## 6. What's next

- **Add confirmation emails** to the signup flow (Edge Function or scheduled drafts).
- **Phase 4 — Member communications:** always-current mailing lists + welcome/lapsed
  triggers.
- **Phase 5 — Onboarding:** turn RSVP prospects into members with an application +
  approval flow.
