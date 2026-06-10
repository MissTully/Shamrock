# Krewe of Shamrock — Automations & Workflows Plan

**Goal of the app:** reduce the manual work of running the krewe by automating the
four areas that take the most time today — **dues & payments**, **event signups &
RSVPs**, **member communications**, and **onboarding new members** — all built on the
Supabase database backend and integrated with **email**.

This document is written for a beginner. Each workflow explains the manual pain
today, the automated version, exactly what gets built, and a phased path so you never
have to do it all at once. A glossary is at the end.

---

## 1. How to read this plan

For every workflow you'll see four parts:

1. **Today (manual):** what someone currently does by hand.
2. **Automated workflow:** the step-by-step flow once automated.
3. **What to build:** the concrete pieces (database objects, a form, an email, a
   schedule).
4. **Phasing:** Crawl → Walk → Run, so value arrives early and complexity is added
   only when you're ready.

A quick mental model of the moving parts:

```
   People (members, public)
        │
        ▼
   FORMS  ───────────────►  SUPABASE DATABASE  ◄────────  YOU (Table Editor / app)
 (signups,                   members, dues,
  applications)              events, signups
        ▲                         │
        │                         │  (scheduled checks: "who is overdue?",
   EMAIL  ◄───────────────────────┘   "who hasn't RSVP'd?")
 (reminders, confirmations,
  newsletters)
```

Three capabilities power almost everything:

- **The database** (already built) — the single source of truth.
- **A scheduler** — something that wakes up on a timer (e.g., every Monday), asks the
  database a question, and triggers an action. In Supabase this is a *scheduled Edge
  Function* or *pg_cron*; in this Claude workspace it can also be a *scheduled task*.
- **Email** — how the krewe reaches members. Reminders, confirmations, newsletters.

---

## 2. Workflow 1 — Dues & payments  *(highest priority — being built now)*

### Today (manual)
Someone scans a spreadsheet for who hasn't paid, writes individual reminder emails,
and manually marks people as paid when checks/payments arrive. Easy to miss people,
hard to track who was already nudged.

### Automated workflow
1. Each season, dues rows are created for active members (one row per member per year).
2. A scheduler runs weekly and asks the database: *"Which members have unpaid dues
   that are due or overdue?"*
3. For each one, an email reminder is drafted/sent — politely for first reminders,
   firmer as it gets more overdue.
4. Every reminder sent is **logged** so the same person isn't emailed twice in a week
   and you can see the history.
5. When payment arrives, you mark the dues row paid (one click in the Table Editor, or
   automatically if a payment processor is connected later). That member drops off the
   reminder list immediately.

### What to build
- **`v_outstanding_dues`** — a database *view* (a saved question) listing every member
  with unpaid dues, their email, the amount, and how many days overdue. *(Built now.)*
- **`dues_reminders`** — a small table logging each reminder sent (which member, which
  dues row, when, which reminder number). *(Built now.)*
- **A scheduled job** that reads `v_outstanding_dues`, skips anyone reminded in the
  last 7 days, and sends an email via your Gmail/Outlook. *(Next wiring step.)*
- **Reminder email templates** — first notice, second notice, final notice. *(Drafted now.)*

### Phasing
- **Crawl:** the view + a saved email template; you press "send" after reviewing the
  list. (Available immediately.)
- **Walk:** a weekly scheduled task drafts the emails for your approval.
- **Run:** fully automatic weekly sends + auto-marking paid when a payment processor
  (PayPal/Square/Stripe) is connected.

---

## 3. Workflow 2 — Event signups & RSVPs

### Today (manual)
People reply by email or text to say they're coming; someone tallies headcounts by
hand and chases volunteers individually.

### Automated workflow
1. An event is created in the `events` table (name, date, location, capacity).
2. A **public sign-up form** (one link per event) lets members RSVP and say how many
   guests they're bringing and whether they'll volunteer.
3. Each submission writes a row to `event_signups` and triggers an instant
   **confirmation email**.
4. A live **headcount view** shows attendees, guests, volunteers, and remaining
   capacity at any moment.
5. A scheduler sends a **reminder email** a few days before the event to everyone
   registered, and a **"we need volunteers"** nudge if volunteer roles are unfilled.

### What to build
- A **sign-up form** (a simple web page; can be hosted free) that writes to
  `event_signups`.
- **`v_event_headcount`** — a view summarizing per-event totals (registered, confirmed,
  guests, volunteers, capacity remaining).
- A **confirmation email** on signup and a **reminder email** before the event.
- Capacity guard: stop accepting signups (or move to `waitlisted`) once `capacity` is
  reached.

### Phasing
- **Crawl:** the headcount view + a manually shared Google Form that you paste into the
  database.
- **Walk:** a custom form that writes directly to Supabase + automatic confirmation
  emails.
- **Run:** scheduled pre-event reminders, waitlist handling, volunteer-gap nudges.

---

## 4. Workflow 3 — Member communications

### Today (manual)
Newsletters and announcements are assembled by hand and sent to a manually maintained
address list that drifts out of date.

### Automated workflow
1. The recipient list is always **derived from the database** (e.g., "all active
   members"), so it's never stale.
2. **Triggered messages** fire on events: a welcome email when a member is added, a
   "we miss you" email when status flips to `lapsed`, a birthday/anniversary note, etc.
3. **Broadcast messages** (newsletters, announcements) are sent to a segment you choose
   (all active members, officers only, this event's attendees).
4. Every send is logged so you can see what went out and to whom.

### What to build
- **Segment views**, e.g. `v_active_member_emails`, `v_officer_emails`,
  `v_event_attendee_emails(event)`.
- **Trigger-based emails** (welcome / lapsed / renewal) driven by changes in the
  `members` table.
- A simple **broadcast process**: pick a segment → compose → send → log.
- Optional later: connect a dedicated email tool (Mailchimp, Brevo, Klaviyo) for
  unsubscribe handling and nicer templates.

### Phasing
- **Crawl:** segment views that export an up-to-date address list you paste into Gmail.
- **Walk:** welcome + lapsed trigger emails fire automatically.
- **Run:** full broadcast tooling with templates, scheduling, and unsubscribe handling.

---

## 5. Workflow 4 — Onboarding new members

### Today (manual)
A prospective member emails or fills a paper/PDF form; someone retypes them into the
roster, sets up their dues, and welcomes them — several manual steps, easily dropped.

### Automated workflow
1. A **public application form** captures name, contact info, and interests; it writes
   a `members` row with status `prospect`.
2. Officers get a **"new applicant" notification email** and review/approve in the
   Table Editor (status `prospect` → `active`).
3. On approval, the system **auto-creates the first-year dues row** and sends a
   **welcome email** with payment instructions and upcoming events.
4. The new member now flows naturally into the dues and event workflows above.

### What to build
- A **public application form** writing `members` rows as `prospect`.
- An **officer notification email** on new applications.
- An **approval trigger**: when status changes to `active`, create the dues row and
  send the welcome email.
- A **`v_pending_applications`** view so officers have a clear review queue.

### Phasing
- **Crawl:** application form + a pending-applications view; you create dues manually.
- **Walk:** auto-create dues and send the welcome email on approval.
- **Run:** self-service member portal where members update their own info.

---

## 6. Recommended build order (roadmap)

The workflows reinforce each other; this order delivers value fastest and reuses each
piece.

| Phase | Focus | Why this order |
|-------|-------|----------------|
| **Phase 1 (now)** | Dues reminder foundation: `v_outstanding_dues` view, `dues_reminders` log, email templates | Highest, most repetitive manual cost; proves the database→email pattern that everything else reuses. |
| **Phase 2** | Schedule the dues reminders (weekly draft-for-approval) | Turns the foundation into a hands-off routine. |
| **Phase 3** | Event signup form + headcount view + confirmation email | Second-biggest pain; reuses the email pattern from Phase 1–2. |
| **Phase 4** | Member-communications segment views + welcome/lapsed triggers | Builds the always-current mailing lists used by every other workflow. |
| **Phase 5** | Onboarding application form + approval automation | Ties members, dues, and comms together end-to-end. |
| **Phase 6** | Connect a payment processor; auto-mark dues paid | Removes the last manual step in the dues loop. |

---

## 7. What is being built right now (Phase 1)

As the "start building one" step, the **dues-reminder foundation** is being created in
your Supabase **Tribe Test** project:

1. `v_outstanding_dues` — the live "who owes money" list.
2. `dues_reminders` — the log that prevents double-emailing and records history.
3. Three reminder email templates (first / second / final notice).

The companion file **DUES_REMINDER_AUTOMATION.md** documents exactly how these work and
how to turn on weekly sending. See that file once this step completes.

---

## 8. Glossary (plain English)

- **View:** a saved query. It looks like a table but is really a live question the
  database answers fresh every time (e.g., "who owes dues?"). Building views keeps the
  real tables clean.
- **Trigger:** a rule that says "when X happens to a row, automatically do Y" (e.g.,
  "when a member is added, send a welcome email").
- **Scheduler / cron:** a timer that runs a job on a schedule (e.g., every Monday at
  9 a.m.).
- **Edge Function:** a small piece of code Supabase runs for you in the cloud — used
  for things the database alone can't do, like sending an email.
- **Segment:** a slice of your members defined by a rule (e.g., "active members,"
  "officers," "this event's attendees").
- **RLS (Row Level Security):** the database's lock system that controls who can read
  or change which rows. Already enabled on all your tables.
