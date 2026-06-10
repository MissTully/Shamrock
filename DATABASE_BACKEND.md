# Krewe of Shamrock — Database Backend Guide

This document explains the database backend that powers the Krewe of Shamrock app.
It is written for a beginner: every section tells you *what* something is, *why* it
exists, and *how* to use it.

---

## 1. What was set up

Your backend runs on **Supabase**, which is a hosted **PostgreSQL** database plus an
automatic web **API**. In plain terms:

- **PostgreSQL** is the database — the place your data lives, in tables.
- **Supabase** wraps that database and automatically gives you a secure web address
  (an "API") so a website or app can read and write data without you writing any
  server code.

The backend currently lives inside your existing Supabase project named
**Tribe Test**. (A dedicated "Krewe of Shamrock" project could not be created
because of an overdue invoice on the *Encountive* organization in your Supabase
account. Once that invoice is settled, the tables here can be copied into a new
dedicated project — the design is fully portable.)

### Connection details

| Item | Value |
|------|-------|
| Project | Tribe Test |
| Project ref / ID | `njfzrnqwbnuhmopgpsud` |
| API URL | `https://njfzrnqwbnuhmopgpsud.supabase.co` |
| Publishable (client) key | `sb_publishable_uZB6_Cix3nh7Bl4AC1TUFA_nUbWHwzF` |
| Region | us-east-1 |
| Postgres version | 17 |

> **About keys.** The *publishable key* above is safe to put in a website or mobile
> app — it can only do what your security rules (below) allow. There is also a
> separate **service role key** (found in your Supabase dashboard under
> *Project Settings → API*) that bypasses all security. **Never** put the service
> role key in a website, app, or anything a user could see. Keep it only on a
> trusted server.

---

## 2. The four tables

The database has four tables. Think of each table as a spreadsheet: columns define
what facts you store, and each row is one record.

### `members` — the roster

One row per person in the krewe.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Unique ID, generated automatically. |
| `first_name` | text | Required. |
| `last_name` | text | Required. |
| `email` | text | Must be unique (no two members share one). |
| `phone` | text | Optional. |
| `member_role` | text | One of: `member`, `officer`, `captain`, `board`, `prospect`. Defaults to `member`. |
| `membership_status` | text | One of: `active`, `inactive`, `lapsed`, `prospect`. Defaults to `active`. |
| `join_date` | date | Defaults to today. |
| `notes` | text | Free-form. |
| `created_at` | timestamp | Set automatically when the row is created. |
| `updated_at` | timestamp | Updated automatically whenever the row changes. |

### `dues_payments` — membership dues

One row per dues charge. A member can have several rows over the years.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Unique ID. |
| `member_id` | uuid | **Links to** `members.id`. If a member is deleted, their dues rows are removed too. |
| `membership_year` | int | The year the dues cover. Defaults to the current year. |
| `amount` | numeric | Dollar amount. Must be 0 or more. |
| `due_date` | date | When payment is due. |
| `paid` | boolean | `true` / `false`. Defaults to `false`. |
| `paid_date` | date | When it was actually paid. |
| `payment_method` | text | One of: `cash`, `check`, `card`, `paypal`, `square`, `other`. |
| `notes` | text | Free-form. |

### `events` — parades, parties, meetings, fundraisers

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Unique ID. |
| `name` | text | Required. |
| `description` | text | Optional. |
| `event_type` | text | One of: `parade`, `party`, `meeting`, `fundraiser`, `volunteer`, `other`. |
| `start_time` | timestamp | Date and time it starts. |
| `end_time` | timestamp | Date and time it ends. |
| `location` | text | Where it happens. |
| `capacity` | int | Max headcount (optional). |

### `event_signups` — who is attending or volunteering

This is a **join table**: each row links one member to one event. It answers
"who signed up for what."

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Unique ID. |
| `event_id` | uuid | **Links to** `events.id`. |
| `member_id` | uuid | **Links to** `members.id`. |
| `signup_role` | text | One of: `attendee`, `volunteer`, `organizer`. |
| `status` | text | One of: `registered`, `confirmed`, `attended`, `cancelled`, `waitlisted`. |
| `guests_count` | int | How many guests they're bringing. Defaults to 0. |
| `notes` | text | Free-form. |

A member can only sign up for a given event **once** (enforced by the database).

---

## 3. How the tables relate

```
        members
        /      \
       /        \
 dues_payments   event_signups ----- events
 (one member,    (one member signs    (one event has
  many dues)      up for one event)    many signups)
```

- A **member** can have many **dues_payments**.
- A **member** can have many **event_signups**.
- An **event** can have many **event_signups**.
- `event_signups` sits between members and events, connecting them.

These links are called **foreign keys**. They keep your data honest — you can't, for
example, record a dues payment for a member who doesn't exist.

---

## 4. Security (Row Level Security)

Every table has **Row Level Security (RLS)** turned on. With RLS on, a table is
locked by default and only the rules ("policies") you create allow access.

**Current rule:** any **signed-in** user can read and write all four tables.
Anonymous (not-signed-in) visitors get **no** access at all.

This is a sensible default for an **internal management tool** where everyone with a
login is a trusted krewe officer. When you build the front end, you'll add Supabase
**Authentication** so officers log in, and they'll automatically be able to use the
data.

> **Note for later:** Supabase's automated linter flags these "any signed-in user can
> do anything" rules as broad. That is expected and intentional here. If you later
> want finer control — for example, only officers can delete members, or members can
> only see their own dues — those rules can be tightened. Just ask.

---

## 5. Trying it out

### Easiest: the Supabase Table Editor (no code)

1. Go to <https://supabase.com> and open the **Tribe Test** project.
2. Click **Table Editor** in the left sidebar.
3. You'll see `members`, `dues_payments`, `events`, and `event_signups`, already
   filled with a few sample rows. You can add, edit, and delete rows by hand here.

### From a website or app (JavaScript example)

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://njfzrnqwbnuhmopgpsud.supabase.co',
  'sb_publishable_uZB6_Cix3nh7Bl4AC1TUFA_nUbWHwzF'
)

// Get all active members
const { data, error } = await supabase
  .from('members')
  .select('first_name, last_name, member_role')
  .eq('membership_status', 'active')
```

(Reads/writes from a website require the user to be signed in, per the security
rules above.)

---

## 6. Sample data already loaded

Three example members (Maureen O'Brien – captain, Sean Callahan – officer,
Bridget Murphy – member), their 2026 dues (Murphy's is unpaid as an example), two
events (the 2027 parade and a planning meeting), and parade signups for all three
members. Delete these whenever you're ready to enter real data.

---

## 7. Pre-existing item to review (not created here)

The Tribe Test project already contained a database function named
`public.rls_auto_enable()` before this work began. Supabase's linter flags it as
runnable by anonymous users. It was **not** created as part of the Krewe backend, so
it was left untouched. If you don't recognize it, you may want to review or remove it
in the Supabase dashboard — happy to help.

---

## 8. Suggested next steps

1. **Settle the Supabase invoice** (Encountive org) if you want a dedicated project.
2. **Build the front end** — a web page for managing members, dues, and events.
3. **Add automations** (your project's goal), for example:
   - Email reminders for unpaid dues.
   - A public sign-up form for events.
   - A dashboard showing active members and upcoming events.

Tell me which of these you'd like to tackle next.
