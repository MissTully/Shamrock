# Phase 5 — Onboarding New Members

This is the final workflow from **AUTOMATIONS_AND_WORKFLOWS_PLAN.md**. It turns a
prospective member into an active one with almost no manual data entry: they apply
through a public form, officers get notified and review a queue, and one approval
action flips them to active, creates their first-year dues, and sends the welcome
email automatically. Built in Supabase **Tribe Test** (`njfzrnqwbnuhmopgpsud`).

---

## 1. What was built

| Object | Type | What it does |
|--------|------|--------------|
| `membership-application.html` | Web page | Public application form (name, email, phone, about-you). |
| `submit_membership_application(...)` | Function (RPC) | The form's safe front door: creates/updates a `prospect` and **emails the officers** to review. Callable by the public. |
| `v_pending_applications` | View | The officers' review queue — everyone currently a `prospect`. |
| `approve_member(member_id, [dues_amount], [year])` | Function | Flips a prospect to **active**, sets role to `member`, and **auto-creates the first-year dues row**. The welcome email fires automatically. |
| `decline_application(member_id)` | Function | Marks a prospect `inactive`. |

`approve_member` and `decline_application` are for signed-in officers only; the public
can only submit applications.

---

## 2. How the flow works

1. A prospective member opens `membership-application.html` and submits.
2. `submit_membership_application` records them as a **prospect** and **queues a
   notification email to every officer/captain/board member**.
3. Officers review the queue: **Table Editor → `v_pending_applications`** (or
   `select * from public.v_pending_applications;`).
4. To approve, an officer runs:
   ```sql
   select public.approve_member('<member_id>');            -- default dues $75, current year
   -- or set a custom amount/year:
   select public.approve_member('<member_id>', 100.00, 2027);
   ```
   This sets them active, creates their dues (due in 30 days, unpaid), and the
   **welcome email is queued automatically** by the member trigger from Phase 4.
5. The new member now flows into every other workflow — they'll get dues reminders,
   can RSVP to events, and receive broadcasts.

To decline instead:
```sql
select public.decline_application('<member_id>');
```

**Tested end-to-end:** a sample application created a prospect, queued notifications to
both officers, appeared in `v_pending_applications`; approving it set the member active
with role `member`, created a 2026 dues row ($75, due in 30 days), and queued the
welcome email. (Test record removed afterward.)

---

## 3. A note on prospects

Anyone added as a `prospect` shows up in `v_pending_applications` — that includes
people created by the **event sign-up form** (Phase 3), not just membership applicants.
That's intentional: event RSVPs are warm leads you can invite into membership. If you
want to tell the two apart, look at the `notes` column (applicants can write about
themselves) or the events they've signed up for.

---

## 4. Hosting the form

Same as the event form: drag `membership-application.html` onto
<https://app.netlify.com/drop> (or any free static host), or add it to the krewe's
website. One self-contained file; the embedded publishable key is safe to expose.

---

## 5. Emails in this workflow

- **Officer notification** (on application) and **welcome** (on approval) both flow
  through the same outbound email queue and Resend sender from
  `EMAIL_AND_PHASE4_GUIDE.md`. They send once your `RESEND_API_KEY` is set; until then
  they sit safely queued.
- Officer notifications go to everyone with role `officer`, `captain`, or `board` and
  a valid email — so keep officer roles current in the `members` table.

---

## 6. The full picture (all phases)

With Phase 5 done, the app now covers the complete member lifecycle:

```
 APPLY (form) ──► prospect ──► approve_member ──► ACTIVE member
                                                     │
                 ┌───────────────────────────────────┼───────────────────────────┐
                 ▼                                     ▼                           ▼
          dues reminders                     event RSVPs + headcounts        broadcasts &
        (weekly, auto-email)               (public form, confirmations)   welcome/lapsed emails
```

Everything writes to the same database and sends through the same email queue.

---

## 7. Optional next steps

- **Connect Resend** to turn all emails on (see `EMAIL_AND_PHASE4_GUIDE.md`).
- **Connect a payment processor** (PayPal/Square/Stripe) so dues auto-mark paid
  (Phase 6 in the master plan).
- **Build an officer dashboard** — a simple signed-in web page with buttons for
  approve/decline and live headcounts, instead of using the SQL editor.
- **Self-service member portal** — let members update their own info and renew dues.

Say which you'd like next.
