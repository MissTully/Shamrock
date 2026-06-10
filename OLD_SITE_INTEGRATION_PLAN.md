# Old Site Review & Integration Plan

**Source reviewed:** https://www.kreweofshamrock.com/ (live, Wild Apricot membership platform)
**Pages read:** Home, History, Join Us, Shamrock Charities, plus navigation/footer of all sections
**Date:** June 10, 2026
**Purpose:** Identify content/data on the old site that belongs on the new site, and plan how to fold it into the new Celtic design.

---

## 1. What the old site contains (inventory)

The old site is a membership-management platform (Wild Apricot) with these sections:

- **Home** — mission blurb, Tartan Ball promo, upcoming events feed, embedded parade videos, "Become a member" summary
- **Shamrock Leaders & Board** — board/officer roster *(not yet captured — page was rate-limited; should be pulled before launch)*
- **History** — full origin story and growth timeline
- **Join Us** — sponsorship rules, eligibility, membership tiers, fees, and governing documents
- **Shamrock Charities** — current-year core charities and giving totals
- **Events, Tickets, Transportation** — event calendar + ticket/transport logistics
- **Parade Videos** — hosted MP4s (2024 & 2025 Gasparilla)
- **Store** — merchandise (Wild Apricot store)
- **Contact** — mailing address, email, social links
- **Member login / Volunteer Tracking** — Wild Apricot portal + trackitforward.com

---

## 2. Key facts to preserve (captured from the old site)

These are accurate, source-of-truth details the new site should carry over. Several **contradict or are missing from the current new site** — flagged below.

### Identity
- **Founded:** 1999 (idea formed 1998; first march in the 1999 St. Patrick's Day Parade). Matches the "Est. 1999" on the recruiting flyer.
- **Tagline / motto:** *"All for Fun" and "Fun for All."* (The new site currently uses "Est. for good craic" — consider adding the real motto.)
- **Identity line:** Tampa's original "kilted" krewe; Celtic-themed; **Irish or Scottish ancestry is not required**; family-like atmosphere; ~140-member cap.

### History timeline
- **1998** — Founders (Matt Glow, Tim Hubbell, Hayden Polk, Chris Jenkins, Steve Hubbell) walked Ybor City parades as security for Ye Loyal Krewe of Grace O'Malley.
- **1999** — Don Cassels approached the St. Patrick's Day Parade Committee; Krewe approved. **19 members** marched in kilts with bagpipes.
- **2000** — Grew to **40 members**; first float built.
- **2006** — Membership expanded to **100**.
- **2010** — Expanded to current cap of **140**.

### Membership tiers & fees (from "Join Us") — *currently absent from the new site*
- **Full Member — $375/yr:** 12 volunteer hours/yr (or $12/hr in-kind), participation in all parades, annual T-shirt, full voting rights.
- **Associate Member — $450:** 2 parades of choice, no volunteer requirement, no free St. Patrick's party admission, no voting; one year only.
- **Auxiliary Member (non-voting) — $200:** one major parade; convertible to full membership.
- **Application / background check:** $50 single, $75 dual (non-refundable).
- **Eligibility:** must be 21+, sponsored by a member in good standing (or assigned a sponsor); approved by the Membership Committee + Board.
- **Governing documents:** Bylaws, Code of Conduct, Waiver, Text-Messaging Consent (PDFs hosted on old site).

### Parades (membership includes)
SantaFest, Gasparilla Children's Parade, Gasparilla Day Parade, Knights of Sant' Yago Knight Parade, Rough Riders St. Patrick's Day Parade (plus others as the Board determines).

### Charities
- **2025–2026 core charities:** No More Umbrellas, New Life Warehouse, CDC Tampa.
- **2024–2025:** contributed **$3,000+** and many volunteer hours.
- **Historically supported:** Florida Sheriff's Youth Ranches (prime), Feeding Tampa Bay, Metropolitan Ministries, A Kid's Place, Miles for Moffitt, Shriners.

### Contact & social
- **Mail:** Krewe of Shamrock, P.O. Box 274102, Tampa, FL 33688
- **Email:** kreweofshamrocktampa@gmail.com
- **Facebook:** facebook.com/Krewe-of-Shamrock-254165718576675
- **Instagram:** @kreweofshamrock
- **Tartan Ball ticketing:** tampabaytartanball.com
- **Volunteer tracking:** trackitforward.com
- **Inter-Krewe calendar:** interkrewe.com/Calendar

### Media
- Parade videos: 2024 & 2025 Gasparilla (MP4s hosted at kreweofshamrock.com). *(Already embedded on the new Videos page.)*

---

## 3. Gap analysis — new site vs. old site

| Content | Old site | New site (today) | Action |
|---|---|---|---|
| Mission / motto | Yes | Partial | Add real motto + "ancestry not required" line |
| History & timeline | Full page | **Missing** | **New History page** |
| Leaders / Board | Full page | **Missing** | **New page** (pull roster first) |
| Membership tiers & fees | Full detail | **Missing** | Expand Join page |
| Parade list | Yes | **Missing** | Add to Join / History |
| Charities | Full page | **Missing** | **New Charities page** |
| Contact info | Yes | Only footer tagline | **New Contact page / section** |
| Events | Calendar + tickets | Dynamic feed (Supabase) | Keep; add ticket/transport notes |
| Tartan Ball | Promo + tickets | New dedicated page | Reconcile date + link ticketing |
| Parade videos | Hosted MP4s | **Embedded ✓** | Done |
| Store | Wild Apricot store | **Missing** | Link out or defer |
| Member login / volunteer | Wild Apricot portal | **Missing** | Link out to existing tools |

---

## 4. Recommended integration (mapped to the new design)

Keep the new site's Celtic styling (green/gold palette, Cinzel/Cormorant fonts, ornate framed images, knot dividers, the music player, and the Supabase-driven Events/Videos/Content loaders). Fold old content into that system rather than copying the Wild Apricot look.

**Add these pages, styled to match:**

1. **History** (`history.html`) — narrative + a visual timeline (1998 → 2010) using the knot-divider and framed images. Reuse the founders' story verbatim. Hero image: a parade/kilt photo from the new gallery set.

2. **Charities** (`charities.html`) — "All for Fun, Fun for All… and good for the community." Lead with the $3,000+/year impact line, list the 2025–26 core charities as cards (pillars style), and a "charities we've supported" list. Add a volunteer-hours call-to-action linking to trackitforward.com.

3. **Leaders & Board** (`leaders.html`) — officer/board roster as cards. *Requires pulling the roster from the old Leaders page (rate-limited today).*

4. **Contact** (`contact.html`) — mailing address, email, social buttons, and a simple message form (can write to Supabase like the membership form does). Embed the social links already gathered.

**Enhance existing pages:**

5. **Join** (`membership-application.html`) — add a "Membership Levels" section above the form: Full / Associate / Auxiliary cards with fees and benefits, the 21+/sponsor rules, and links to Bylaws, Code of Conduct, Waiver, and Text-Messaging Consent. This is the single biggest content gap.

6. **Home** (`index.html`) — add the real motto and the "ancestry not required / family atmosphere" line to the About section; add a "4 Big Parades" highlight.

7. **Tartan Ball** (`tartan-ball.html`) — link the "RSVP/Reserve" buttons to the real ticketing site (tampabaytartanball.com) and reconcile the event date (flyer says **Oct 24, 2026, Higgins Hall**; old site references a 2025 ball — confirm which is current).

8. **Footer (all pages)** — add the mailing address, email, and social icons so contact info is everywhere.

**Link out (don't rebuild):**
- **Store** and **Member Login / Volunteer Tracking** — keep on Wild Apricot / trackitforward.com; link to them. Rebuilding e-commerce and the membership database is out of scope for the static site.

---

## 5. Design integration principles

- **One nav, consistent everywhere.** Adding History, Charities, Leaders, Contact will make the nav long — consider grouping (e.g., an "About" dropdown: History / Leaders / Charities) to keep it tidy on mobile.
- **Reuse existing components:** `section-title`, `band band-green`, `pillars/pillar`, `feature`/`ft-text`/`ft-media`, `framed ornate`, `knot-divider`, `grid-auto`. No new CSS needed for most of this.
- **Data vs. static:** dynamic, frequently-changing content (events, videos, content items) stays in Supabase; stable content (history, membership rules, charities) can be static HTML for speed and resilience.
- **Accuracy first:** the membership fees, parade names, and charity list are the kind of facts members will check — pull them verbatim and date-stamp them (they change yearly).

---

## 6. Suggested build order

1. **Join page expansion** (membership tiers/fees) — highest-value gap.
2. **History page** — content is fully captured and ready to build now.
3. **Charities page** — content captured and ready.
4. **Contact page + footer contact info** — quick win.
5. **Leaders page** — after pulling the board roster.
6. **Tartan Ball ticketing link + date reconciliation.**
7. **Home copy updates** (motto, parades, ancestry line).
8. **Store / member-login links** — link out.

---

## Open items to confirm with the Krewe
- Current **board/officer roster** (re-pull the Leaders page).
- **Tartan Ball date** — is the Oct 24, 2026 / Higgins Hall flyer the current event, and should tickets route to tampabaytartanball.com?
- **Membership cap and fees** — confirm 140 cap and the $375 / $450 / $200 figures are current for the 2026 season.
- Whether to **keep Wild Apricot** for store/login/volunteer tracking, or migrate those into the new Supabase backend later.
