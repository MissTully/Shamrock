# Dues Reminder Automation (Phase 1)

This is the first automation from **AUTOMATIONS_AND_WORKFLOWS_PLAN.md**. It answers the
question *"who owes dues, and have we reminded them?"* and gives you ready-to-send
reminder emails. It lives in your Supabase **Tribe Test** project
(`njfzrnqwbnuhmopgpsud`).

---

## 1. What was built

| Object | Type | What it does |
|--------|------|--------------|
| `v_outstanding_dues` | View (saved query) | Live list of members with **unpaid** dues, showing email, amount, **days overdue**, how many reminders were sent, and when. |
| `dues_reminders` | Table | A **log** of every reminder you send, so nobody gets emailed twice in a week and you keep a history. |

The view only includes members whose status is `active` or `lapsed` (it ignores
`inactive` and `prospect`), and only dues rows where `paid = false`.

---

## 2. Use it now (the "Crawl" version — no code, no schedule)

**Step 1 — See who owes.** In the Supabase dashboard → **SQL Editor**, run:

```sql
select first_name, last_name, email, amount, due_date, days_overdue, reminders_sent
from public.v_outstanding_dues;
```

(Or open **Table Editor → v_outstanding_dues** to see it as a grid.)

**Step 2 — Send a reminder** using the matching template below. Use the first notice
if `days_overdue` is small, the second if it's been a while, the final notice if it's
badly overdue.

**Step 3 — Log that you sent it** so the person drops off next week's list. Run this,
filling in the member's email:

```sql
insert into public.dues_reminders (dues_payment_id, member_id, reminder_number, sent_to)
select dues_payment_id, member_id, 1, email     -- change 1 to 2 or 3 for later notices
from public.v_outstanding_dues
where email = 'bridget.murphy@example.com';
```

**Step 4 — When they pay**, mark the dues row paid (they instantly leave the list):

```sql
update public.dues_payments
set paid = true, paid_date = current_date, payment_method = 'check'  -- or card/cash/etc.
where id = '<the dues_payment_id from the view>';
```

---

## 3. Email templates

Replace the **[bracketed]** parts. Keep them warm — these are friends and neighbors.

### First notice (friendly)
> **Subject:** Friendly reminder: your Krewe of Shamrock dues
>
> Hi [First name],
>
> Just a quick reminder that your Krewe of Shamrock membership dues of **$[amount]**
> for the [year] season are due. We'd love to keep you marching with us!
>
> You can pay by [payment options]. If you've already paid, thank you — please ignore
> this note.
>
> Sláinte,
> [Your name], Krewe of Shamrock

### Second notice (a nudge)
> **Subject:** Second reminder: Krewe of Shamrock dues ($[amount])
>
> Hi [First name],
>
> We haven't yet received your **$[amount]** dues for the [year] season (now
> [days_overdue] days past due). Staying current keeps you on the roster for parades
> and events.
>
> Here's how to pay: [payment options]. Questions? Just reply to this email.
>
> Thanks so much,
> [Your name], Krewe of Shamrock

### Final notice (firm but kind)
> **Subject:** Final reminder: Krewe of Shamrock dues
>
> Hi [First name],
>
> This is a final reminder that your **$[amount]** dues for the [year] season remain
> unpaid ([days_overdue] days overdue). To keep your membership active, please pay by
> [date] via [payment options].
>
> If there's anything going on or you'd like to talk options, please reach out — we
> want to keep you with us.
>
> Warmly,
> [Your name], Krewe of Shamrock

---

## 4. Make it automatic (the "Walk" and "Run" versions)

To send these on a schedule instead of by hand, you need two things: a **scheduler**
(a timer) and an **email sender**. Three good options, easiest first:

### Option A — Claude scheduled task (easiest, human-in-the-loop)
Ask me to set up a **weekly scheduled task** that:
1. Queries `v_outstanding_dues`,
2. Skips anyone with a reminder in the last 7 days,
3. **Drafts** the reminder emails in your Gmail/Outlook for you to review and send,
4. Logs each send to `dues_reminders`.

This keeps you in control (you approve before anything goes out) and needs no code.
Requires your email connector to be linked.

### Option B — Supabase Edge Function + email service (fully automatic)
A small cloud function Supabase runs on a schedule. It reads the view, sends email via
a service like **Resend**, **SendGrid**, or **Brevo** (free tiers available), and logs
to `dues_reminders`. This is the "set it and forget it" version. I can write this
function when you're ready and have an email-service API key.

### Option C — pg_cron + pg_net (database-only)
Supabase can schedule SQL directly with the `pg_cron` extension and call an email API
with `pg_net`. Powerful but the most technical; usually Option B is cleaner.

**Recommendation:** start with **Option A** (safe, reviewable), then graduate to
**Option B** once you trust the wording and cadence.

---

## 5. Tips & guardrails

- **Don't double-send:** always run the Step 3 log insert after sending. The weekly
  automation uses `last_reminder_at` to skip recent reminders automatically.
- **Escalate politely:** use `reminders_sent` to choose the template (0 → first,
  1 → second, 2+ → final).
- **Test on yourself first:** add yourself as a member with an unpaid dues row and
  confirm the email looks right before sending to the whole roster.
- **Real vs. sample data:** the current list shows the sample member *Bridget Murphy*.
  Delete the sample rows before going live.

---

## 6. What's next

Tell me which to do next:
- **Turn on Option A** (weekly draft-and-review reminders) — I'll set up the schedule.
- **Move to Phase 3** (event signup form + headcount view + confirmation emails).
- **Connect a payment processor** so dues auto-mark as paid.
