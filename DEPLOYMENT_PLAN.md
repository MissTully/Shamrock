# Krewe of Shamrock — Launch Readiness & Deployment Plan

**Prepared:** July 3, 2026
**Audience:** ~80 krewe members
**Live site today:** https://krewe-of-shamrock.vercel.app (Vercel, healthy)
**Backend:** Supabase project `njfzrnqwbnuhmopgpsud` ("Tribe Test", shared)

---

## 1. Executive summary

The site is genuinely close. The public pages, the members portal, the raffle
flow, event RSVPs, the membership application, and the email queue are all built
and mostly working. Hosting is live on Vercel and the database is healthy.

**But it is not safe to hand to 80 members yet.** There is one critical security
hole that makes the entire "members-only" area open to anyone on the internet,
plus a set of database permission rules that let any signed-in person read and
change every other member's personal data and dues. These are quick to fix, but
they are launch-blockers.

This plan is organized as:

- **Section 2 — 🔴 Blockers.** Must be fixed before anyone gets the link.
- **Section 3 — 🟠 Should-fix.** Fix during the launch window; visible bugs and
  data-integrity gaps.
- **Section 4 — 🟡 Polish.** Cosmetic/consistency; safe to do after launch.
- **Section 5 — Infrastructure & go-live checklist.** Email, domain, hosting,
  sample-data cleanup, member onboarding.
- **Section 6 — Suggested timeline.**

Everything in Sections 2–4 was verified against the live database and the actual
page source, not assumed.

---

## 2. 🔴 Blockers — fix before launch

### B-1. Anyone can log into the "members-only" area (critical)

`members.html:999` and `share.html:439` call:

```js
sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: ... } })
```

Supabase's `signInWithOtp` defaults to **`shouldCreateUser: true`**. That means
if a stranger types *their own* email into the members sign-in box, Supabase
creates an account for them and emails them a working magic link. They click it
and they are now an authenticated user of your backend. The green "members only"
gate is only `display:none` CSS — it is not real protection.

**Why this is critical:** see B-2. Once someone is authenticated, the database
rules currently let them read and edit everything.

**Fix (choose one):**
- **Fastest:** add `shouldCreateUser: false` to both `signInWithOtp` calls so
  only people you have pre-added as members can ever receive a link. New members
  get added by an officer (or by the `approve_member` flow) first.
- **Belt-and-suspenders:** also turn off open sign-ups in Supabase → Authentication
  → Providers/Settings, and rely on officer-created accounts + invites.

### B-2. Any signed-in user can read & modify every member's data (critical)

I pulled the live RLS policies. On `members`, `dues_payments`, `events`,
`event_signups`, `dues_reminders`, and `content_items`, the write policies are
literally `USING (true)` / `WITH CHECK (true)` for the `authenticated` role.
Supabase's own security advisor flags 25 "RLS policy always true" findings.

Concretely, any authenticated user can:
- Read every member's **name, email, phone, and private notes** (`members`).
- Read and edit **anyone's dues records** — mark unpaid as paid, change amounts
  (`dues_payments`).
- Insert/update/**delete** any member, event, or signup.

Combined with B-1 (anyone can become authenticated), this is a full PII and
data-integrity exposure to the open internet. This is the single most important
thing to fix.

**Fix:** tighten RLS so that:
- Ordinary members can read only the limited directory (already exists as the
  `member_directory` view: first/last name + role for active members) and their
  **own** row / their **own** dues.
- Only officers (there is already an `is_krewe_officer()` function) can read the
  full roster, edit dues, approve members, or delete rows.
- Replace the blanket `authenticated … USING (true)` policies with
  `USING (public.is_krewe_officer())` for officer-only tables, and
  `USING (member_id = public.caller_member_id())` for self-service ones.

The building blocks (`is_krewe_officer()`, `caller_member_id()`) already exist,
so this is mostly rewriting policy predicates, not new plumbing.

### B-3. `content_items` is editable by anonymous (unauthenticated) users

There is an RLS policy named **"anon moderate update content"** that allows the
`anon` role to `UPDATE content_items` with `USING (true)`. That means a
not-signed-in visitor can rewrite any gallery caption, poem, or article on the
public site.

**Fix:** drop the `anon moderate update content` and `anon delete pending content`
policies. Keep only: anon can read published content, anon can *submit* pending
(unpublished) content, and officers moderate.

### B-4. Officer-only raffle actions rely on server checks — confirm they hold

Good news, mostly verified: the sensitive raffle RPCs (`draw_5050_winner`,
`draw_basket_winner`, `set_raffle_active`, `delete_basket`, `update_raffle`) are
`SECURITY DEFINER` and call `can_manage_raffle()` / `is_krewe_officer()`
internally, so the UI-only gating in `members.html:1090` is backed by a real
server check. **However**, every one of these functions is currently granted
`EXECUTE` to the `anon` role too (32 anon-executable SECURITY DEFINER functions
in the advisor report). The internal officer check will reject a non-officer, so
this is not a live breach, but admin-shaped functions should not be anon-callable.

**Fix:** `REVOKE EXECUTE ... FROM anon` on the officer/admin functions
(`approve_member`, `decline_application`, `grant_badge`, `queue_broadcast`,
`send_dues_reminders`, `draw_*`, `set_raffle_active`, `delete_basket`,
`update_raffle`, the `trg_*` triggers, and `rls_auto_enable`). Keep anon EXECUTE
only on the genuinely public ones (`enter_basket_public`, `buy_5050_public`,
`submit_membership_application`, `rsvp_to_event`).

### B-5. Email is queued but nothing actually sends

The whole email system (dues reminders, RSVP confirmations, welcome/lapsed
notices, officer new-application alerts, broadcasts) writes rows into
`outbound_emails` and a cron job calls the `process-outbound-emails` edge
function every 5 minutes. But that function is a **no-op until `RESEND_API_KEY`
is set**. There are already 5 emails sitting `queued` (the oldest from June 15)
that never went out.

**Fix before launch (or members won't get sign-in-adjacent mail):**
1. Create a Resend account, verify a sending domain.
2. Set `RESEND_API_KEY` and `RESEND_FROM` as edge-function secrets.
3. Decide what to do with the 5 stale queued emails (they'll all send on the
   next flush — you may want to delete the test ones first).

> Note: Supabase **magic-link auth email** is separate from Resend and is sent by
> Supabase directly, so sign-in will work without Resend. But it uses Supabase's
> default rate limits and sender — verify the auth email template and confirm the
> free-tier hourly email cap is enough for an 80-member onboarding wave (see 5.4).

### B-6. The Supabase project pauses on the free tier + shares data with other apps

Two related risks in the design docs, both confirmed:
- The data lives in a **shared** project ("Tribe Test") alongside several
  unrelated apps. That's workable but messy; a data leak in another app's code
  using a broader key could touch these tables.
- Supabase's **free tier pauses a project after ~7 days of inactivity.** If the
  krewe site goes quiet for a week, events/raffles/portal all break until someone
  logs into the dashboard.

**Fix:** upgrade to Supabase Pro (~$25/mo, no pausing, daily backups) *or* add a
keep-alive ping. Pro is strongly recommended once real member PII is in the
database. Ideally also migrate to a dedicated project (the schema is portable),
which was deferred due to a billing hold — resolve that first.

---

## 3. 🟠 Should-fix — during the launch window

### D-1. Two disagreeing event sources on the RSVP page
`event-signup.html` shows a hardcoded static calendar (lines 138–145) **and** a
live Supabase `events` dropdown (269–291). They can disagree — a member sees a
date on the calendar that isn't an RSVP-able event, or vice-versa. Pick one
source of truth (recommend: drive the calendar from `events` too).

### D-2. Raffle is honor-system with no abuse control
`raffle.html` records ticket entries (`enter_basket_public` / `buy_5050_public`)
from an unauthenticated QR page with just a name; payment is "pay a volunteer in
person." Anyone can submit unlimited free entries under any name (qty capped at
200 *per submit* but resubmittable), inflating public ticket counts and the
advertised 50/50 pot, and skewing the weighted draw. For an 80-member krewe this
is acceptable **if** volunteers reconcile cash before the officer draws — but you
should (a) add basic rate-limiting/duplicate detection to the public RPCs, and
(b) make clear in officer training that on-screen counts are unverified until cash
is reconciled.

### D-3. Membership application endpoint has no spam protection
`submit_membership_application` is a public, unauthenticated RPC with only
client-side required-field validation. Add server-side length caps and simple
rate-limiting (e.g. reject a second application from the same email within N
minutes) before the form is publicized.

### D-4. Visible markup bugs
- `members.html:289` — `<<div class="dash-chips">` renders a stray `<` on the
  Share-content chip row.
- `members.html` Share card — chips wrapped in a `role="button"` section whose
  `onclick` navigates to plain `share.html`, so the `?type=video|photo|art`
  deep-links never work (every chip lands on the same page).
- `gallery.html:87` — stray literal `h` before an `<img>` in the "Shamrock
  Sisters" tile.
- `gallery.html:89` — `target="_bhlank"` typo (should be `_blank`).
- `index.html:10` — `hrefh=` typo makes the gstatic preconnect a no-op.

### D-5. Two pages use the old, broken navigation
`videos.html` and `krewe-history.html` still use the **old flat nav** (no mobile
hamburger, no dropdowns, no active-state). `krewe.js` early-returns on them, so on
a phone there is no working menu on those two pages. They also show the wrong
tagline ("Est. for good craic" instead of "Est. 1999") and a condensed footer.
Bring both onto the shared responsive nav/footer used by every other page.

### D-6. No sign-out button in the portal
`window.kosSignOut` is defined (`members.html:1022`) but never wired to a visible
control — members can't log out. Add a sign-out link to the portal header.

### D-7. "Secure" officer reports are permanently unreachable
Several officer/PII reports (`attendee_contacts`, `member_directory_full`,
`pending_apps`, `dues_by_member`, `comms_log`) render a "unlocks when per-member
sign-in is added" notice — but per-member sign-in already exists in the same file.
So officers currently have **no** in-app path to dues-by-member, attendee emails,
or pending applications. Wire these to `is_krewe_officer()` and let officers see
them once B-1/B-2 make roles trustworthy.

### D-8. Redundant identity entry / impersonation on member forms
Locker, carpool, and van-reservation forms make an already-signed-in member
re-type their name/email, and the row isn't tied to `auth.uid()`. After B-2,
default these from the member's profile and stamp `caller_member_id()` server-side
so rows can't be filed under someone else's name.

---

## 4. 🟡 Polish — safe to do after launch

- **Pin the Supabase JS version.** Most pages load `@supabase/supabase-js/+esm`
  **unpinned** (latest); `share.html` uses `@2`. A major-version bump could
  silently break the unpinned pages. Pin all to `@2`.
- **XSS hardening.** The `esc()` helper doesn't escape single quotes; no live
  exploit today (all DB values sit in double-quoted attributes and content is
  admin-review-gated), but harden it for defense-in-depth.
- **Consistent "age of krewe."** Copy drifts between "twenty years," "twenty-five
  years," "over two decades," "25 Years of Shenanigans." Est. 1999 → 2026 = 27
  years. Pick one.
- **Tune-picker labels** in `poetry.html` name traditional songs ("The Parting
  Glass," etc.) but all point to Krewe theme tracks. Fix labels or files.
- **`share.html:395`** footer hardcodes "© 2025."
- **Old-site external media.** `videos.html` hot-links two videos from
  `www.kreweofshamrock.com` and `event-signup.html` embeds an interkrewe.com
  calendar PNG — these break if the old host retires. Re-host locally.
- **Move `pg_net` out of the `public` schema**, set fixed `search_path` on the
  `kos_rank_*` helper functions, and enable **leaked-password protection** in
  Supabase Auth (all flagged by the advisor).
- **Storage buckets** `avatars`, `media`, `raffle-baskets` are public and
  listable — fine for images, but confirm nothing private was uploaded.
- **No pagination anywhere.** Fine at 80 members; revisit if the roster grows.

---

## 5. Infrastructure & go-live checklist

### 5.1 Hosting (Vercel)
- Site is live and healthy at `krewe-of-shamrock.vercel.app` (latest production
  deploy READY).
- **Connect GitHub → Vercel for auto-deploy.** Deploys are currently manual via
  CLI; connecting the repo means every push to `main` redeploys automatically.
- **Vercel Hobby is non-commercial.** For an organization site this is a terms
  risk flagged in the design doc. Either move to Vercel Pro or to Cloudflare Pages
  (free, commercial-OK) before heavy promotion.

### 5.2 Don't ship internal docs to the public site
`.vercelignore` excludes `*.md`, **but not** `Krewe of Shamrock - Software Design
Document.docx`, which contains architecture, keys context, and RLS notes. Add
`*.docx` (and confirm the `.md` exclusion is working) so none of the planning
docs are downloadable from the live URL.

### 5.3 Delete sample/test data before launch
The database still has sample rows: test members (Maureen O'Brien, Sean Callahan,
Bridget Murphy with `@example.com` emails), sample events, and 5 stale
`queued` emails. Delete these before real members and Resend go live, or test
emails will fire and sample people will appear in the directory/leaderboards.

### 5.4 Email & auth deliverability
- Set up Resend (B-5) for app emails.
- Verify the Supabase **magic-link** email template and sender look right (this is
  what members actually click to log in).
- Supabase free tier caps auth emails per hour. Onboarding 80 members at once may
  hit that cap — **stagger invitations** in batches, or raise the limit / use a
  custom SMTP sender on Pro.

### 5.5 Custom domain (optional but recommended)
The design doc plans a custom domain (~$12–20/yr). It also unlocks a clean Resend
sending domain (e.g. `events@kreweofshamrock.org`) for better deliverability than
a shared vercel.app URL.

### 5.6 Member onboarding flow (once B-1/B-2 are fixed)
1. Officer loads the real roster into `members` (name, email, role,
   membership_status).
2. Because sign-up is now closed (B-1), each member's account is pre-provisioned;
   send them the site link and have them request a magic link with the email you
   have on file.
3. First login runs the existing profile-setup + welcome tour.
4. Officers use the approval flow (`approve_member`) for new applicants from the
   public form.

---

## 6. Suggested timeline

**Day 1 — Security (blockers B-1 → B-4).** Close open sign-up, rewrite the
always-true RLS policies to member-vs-officer scoping, drop the anon
content-edit policies, revoke anon EXECUTE on admin functions. Re-run the
Supabase security advisor and confirm the "always true" and anon-execute findings
are gone. *This is the gate — nothing goes to members until this day is done and
verified.*

**Day 2 — Infrastructure (B-5, B-6, 5.1–5.4).** Stand up Resend, upgrade Supabase
to Pro (and/or migrate to a dedicated project), connect GitHub→Vercel, add
`*.docx` to `.vercelignore`, delete sample data.

**Day 3 — Visible bugs (D-1, D-4, D-5, D-6).** Fix the markup typos, unify nav on
the two old pages, add a sign-out button, reconcile the two event sources.

**Day 4 — Officer tooling & forms (D-2, D-3, D-7, D-8).** Wire officer reports,
add abuse controls to public RPCs, tie member forms to the signed-in identity.

**Day 5 — Soft launch.** Invite officers + a handful of members first, watch the
`outbound_emails` queue and Supabase logs, then send the full 80-member wave in
staggered batches.

**Post-launch — Polish (Section 4)** and the still-unbuilt roadmap items
(gamification/Craic Cup is spec-only; Phase-6 real payments; old-site content
pages like Charities / Leaders & Board / Contact and the membership-fee tiers on
the Join page, called out as the biggest content gap in the integration plan).

---

## Appendix — What's already working (verified)

- Vercel production deploy is live and healthy.
- Public pages render; graceful empty-states on all data-driven pages;
  `share.html` and `members.html` correctly set `noindex`.
- Event RSVP (`rsvp_to_event`), membership application
  (`submit_membership_application`), and content submission all reach real
  server-side RPCs.
- Raffle draw functions are `SECURITY DEFINER` with genuine internal
  officer/owner checks (`can_manage_raffle`).
- Email pipeline (queue + cron + edge function) is built and wired; it just needs
  the Resend key.
- Onboarding automation (`approve_member` creates first-year dues + welcome
  email) and dues-reminder cron are in place.
- No hardcoded secrets in the client beyond the intended publishable key; no
  lorem ipsum; copy is real.
