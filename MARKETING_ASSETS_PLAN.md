# Krewe Website Studio — Business & Marketing Asset Plan

**Purpose:** A complete plan for the assets you need to launch and sell a freelance
service that builds **fully membership-driven websites for krewes**. The strategy is
**demo-first**: your single most persuasive asset is a live, clickable sample krewe —
**"The Krewe of Unicorn"** — and every other asset exists to get a prospect to tour it.

**Two pieces of proof, working together:**
1. **Krewe of Shamrock** — a *real, live* krewe running on the platform
   ([krewe-of-shamrock.vercel.app](https://krewe-of-shamrock.vercel.app)). Proof that
   real krewes trust you and the product works in the wild.
2. **The Krewe of Unicorn** — a *fictional, fully-loaded* demo krewe that prospects can
   click through freely to see every possibility (see §2). It lets them imagine the
   platform as *their own* without touching a real krewe's data.

> Shamrock proves it's **real**. Unicorn lets them picture it's **theirs**.

**Your market — say it clearly:** a **Tampa Bay** studio serving **Gasparilla** krewes
and the wider Tampa Bay krewe / social-club community. This is *not* New Orleans Mardi
Gras — Gasparilla is Tampa's own pirate-and-parade tradition, with its own krewes,
captains, balls, and coronations. That local focus is your biggest edge: the Krewe of
Shamrock is a Tampa krewe, so you're already *inside* the community, you speak the
language, and Gasparilla krewes talk to each other. Lead with **"By a Tampa Bay krewe,
for Tampa Bay krewes."**

---

## 1. What you actually sell (the offer, in plain terms)

You don't sell "a website." You sell a **krewe operating system with a beautiful public
face**. Two halves, one platform:

**A. The public-facing site** — recruits members and tells the krewe's story:
Home, Krewe History, Parades & Safety, signature event pages (e.g. Tartan Ball),
Service & Charity, a Heritage "Learn" library, Poetry & Art, Photo Gallery, Video
Library, and a merch Shop.

**B. The members-only operating system** — runs the krewe day to day:
member directory & profiles, event calendar with RSVPs, a gamified engagement system
("Craic Cup" — points, ranks, badges, leaderboards), raffles you create and manage,
carpool & van-pool coordination, locker rentals, a "Parade Ready" wristband checklist,
dues tracking, an officer reports dashboard, and member content submissions.

**Under the hood** (your technical moat): a Supabase/PostgreSQL backend with real
security (row-level access rules, officer-only tools), email automations (dues
reminders, RSVP nudges, onboarding, newsletters), and low-cost hosting on Vercel with
an optional custom domain.

### Suggested service tiers (name them, price them)

| Tier | What it is | Krewe it fits | Anchor features |
|------|-----------|---------------|-----------------|
| **Parade Page** (starter) | Public marketing site only | New/small krewes needing presence & recruiting | Home, history, events, gallery, join form |
| **Krewe Portal** (core) | Public site **+** members portal | Established krewes ready to run online | Everything in starter **+** directory, RSVPs, dues, member content |
| **Krewe HQ** (premium) | Full platform **+** automations & gamification | Large krewes wanting to boost engagement | Everything **+** Craic Cup, raffles, carpools, lockers, officer reports, email automations |
| **Care & Feeding** (retainer) | Monthly hosting, content updates, support | All active clients | Backups, uptime, content adds, seasonal changes, feature requests |

> The retainer is the business. One-time builds pay the bills; monthly recurring
> revenue (hosting + support + seasonal content) is what makes this a sustainable
> freelance practice.

---

## 2. The demo is the pitch — "The Krewe of Unicorn" 🦄

This is the heart of your marketing. Krewe boards don't buy from descriptions — they
buy when they click through a working site and picture their own krewe in it. So the
**Krewe of Unicorn**, a fictional but fully-built sample krewe, is the centerpiece of
every campaign, and **everything else points to it.**

### What it is
- A **complete, generically-branded krewe site** — every public page *and* the full
  members portal — built on the exact platform a client would get.
- **Seeded with believable sample data** so nothing looks empty: a sample roster, events
  already on the calendar, a Craic Cup leaderboard with real-looking standings, an active
  raffle, carpool offers, a stocked gallery, dues records, and officer reports.
- A **guest member login** — a "Try the members area" button with pre-filled demo
  credentials — so a prospect can walk the *private* portal (the part that actually sells
  the platform) without you granting access to anything real.
- A subtle **"DEMO" ribbon** and a short "start here" note so it's self-guided, plus
  reset-friendly sample data so nothing a visitor clicks can break it.

### Why "Krewe of Unicorn"
Whimsical, memorable, and obviously fictional — it borrows *no* real krewe's name, so no
one feels copied, and it's neutral enough that any krewe (pirate, Celtic, civic) can
imagine themselves in its place. It also signals exactly what you do: conjure something
magical for a krewe that doesn't have it yet.

### How the marketing leans on it — the one rule
**Every asset ends in "go see it."** If a piece of collateral doesn't drive someone into
the Krewe of Unicorn, it's decoration.

- **Primary CTA everywhere:** *"Tour the Krewe of Unicorn"* / *"See a real krewe site in
  2 minutes."* Same button on the landing page, in the deck, in every ad, in your email
  signature.
- **Landing page hero** = a big button to the live demo + a short screen-capture loop of
  it in motion.
- **Social & ads** = short screen-recorded clips of the demo's best moments (earning
  Clovers, ranking up, RSVPing, running a raffle), always captioned and always linking to
  the live demo.
- **Sales calls / board pitches** = you don't talk features, you **share your screen and
  walk the board through the Unicorn site**, then say: *"This is yours — with your crest,
  your colors, your members."*
- **The one-pager and pitch deck** are really just signposts to the demo. Keep them short;
  let the demo do the closing.

> **Rule of thumb:** the demo closes; everything else just gets them to the demo. Budget
> your time accordingly — a polished, well-seeded Krewe of Unicorn is worth more than ten
> more slides.

*(This is the "Live demo site" line in the portfolio inventory below, elevated to its own
strategy. Building and seeding it is **Phase 1, item #1** in §6.)*

---

## 3. The asset inventory (what to actually produce)

Grouped by function. Each item lists **what it is**, **why it matters**, and **priority**
(🟢 launch-critical · 🟡 soon · ⚪ later). A phased build order is in §6.

### 3.1 Brand identity & foundation

| Asset | Notes | Priority |
|-------|-------|----------|
| **Business name + tagline** | e.g. "Krewe Website Studio — Websites that run your krewe, not just show it off." | 🟢 |
| **Logo** (primary, icon-only, one-color) | Flexible for Gasparilla/pirate *and* Celtic/heritage krewes; must work on dark *and* light | 🟢 |
| **Color palette + type system** | 2 brand colors, 1 display font, 1 body font; document as a mini style guide | 🟢 |
| **Brand one-liner + 3 value props** | "Recruit members · Run the season · Grow engagement" | 🟢 |
| **Voice & tone guide** | Warm, heritage-proud, plain-English (mirror the Shamrock docs' beginner-friendly tone) | 🟡 |
| **Email signature + business card** | Contact, portfolio link, and a **"Tour the Krewe of Unicorn"** CTA | 🟡 |

### 3.2 Portfolio & proof (the demo leads)

| Asset | Notes | Priority |
|-------|-------|----------|
| **The Krewe of Unicorn demo site** ⭐ | Your #1 asset (see §2): full public site + members portal, seeded data, guest login. Everything links here | 🟢 |
| **Flagship case study (Shamrock)** | 1–2 page story: the problem (spreadsheets, missed dues, low turnout) → the build → the result. Screens + quotes | 🟢 |
| **Annotated screenshot library** | Clean shots *pulled from the Unicorn demo*: home, members directory, Craic Cup leaderboard, raffle manager, event RSVP, officer dashboard, dues view | 🟢 |
| **2–3 min demo video / screen recording** | Voiceover walkthrough of the Unicorn public site → member login → portal features (the .mp3 theme in the repo can score it) | 🟢 |
| **Feature GIFs** | Short loops of the demo's "wow" moments: earning Clovers, RSVPing, ranking up, running a raffle | 🟡 |
| **Before/after narrative** | "How a krewe ran on paper vs. how it runs now (see the Unicorn)" — great for social carousels | 🟡 |

### 3.3 Sales collateral (all roads lead to the demo)

| Asset | Notes | Priority |
|-------|-------|----------|
| **One-page service sheet (PDF)** | The offer, 3 tiers, top features, your face/name, and a big **"Tour the Krewe of Unicorn"** CTA/QR | 🟢 |
| **Pitch deck (8–12 slides)** | Problem → **live demo walkthrough** → tiers/pricing → proof (Shamrock) → next steps. Built to hand off to the demo | 🟢 |
| **Pricing sheet** | Tier prices, retainer, add-ons (custom domain, extra automations, content migration) | 🟢 |
| **Proposal / SOW template** | Reusable, fill-in-the-blank scope, timeline, deliverables, price. Speeds up closing | 🟢 |
| **Feature checklist / comparison** | Tick-box of what each tier includes (see §4 messaging bank) | 🟡 |
| **FAQ sheet** | "Who owns the data? What does it cost to run? Can our officers edit it?" (answers straight from the deployment/backend docs) | 🟡 |
| **Contract / services agreement** | Ownership, hosting, payment terms, support scope. (Have a lawyer review once.) | 🟡 |

### 3.4 Your own marketing website (the studio site)

| Asset | Notes | Priority |
|-------|-------|----------|
| **Landing page** | Hero built around **one giant "Tour the Krewe of Unicorn" button** + demo loop + value props + feature grid + tiers | 🟢 |
| **Portfolio / case-study page** | The Shamrock story + the Unicorn demo embed + demo video + screenshots | 🟢 |
| **Services & pricing page** | The three tiers + retainer, transparent-ish pricing to pre-qualify leads | 🟡 |
| **Contact / booking** | Calendar link + intake form (krewe name, size, current setup, needs) | 🟢 |
| **Lead magnet** | Free download: "The Tampa Bay Krewe Digital Readiness Checklist" (gates emails, then sends them to the demo) | 🟡 |

> Meta-selling point: your own site *is* a portfolio piece. Build it on the same stack
> (static + Supabase form) so you can say "this runs on exactly what your krewe gets."

### 3.5 Advertising & social assets (demo clips, not talk)

| Asset | Notes | Priority |
|-------|-------|----------|
| **Social profiles** | Instagram + Facebook (where Tampa Bay krewes live) + optionally TikTok; consistent handle/branding | 🟢 |
| **Launch post + pinned intro** | "I build websites that run krewes — here's a whole one you can click through 👉 the Krewe of Unicorn" + demo link | 🟢 |
| **Content templates (10–15)** | Feature spotlights (each a clip from the demo), before/after, tip carousels, testimonial cards — reusable Canva templates | 🟡 |
| **Ad creative set** | 3–5 static + 1–2 video ads; every one CTAs to **"Tour the Krewe of Unicorn."** Sized for FB/IG feed, stories, reels | 🟡 |
| **Short-form video hooks** | "Your krewe still runs on a group text? Watch what this one does 👇" → demo clip, 15–30s | 🟡 |
| **Testimonial / quote cards** | From Shamrock officers first; add clients over time | 🟡 |
| **Flyer / postcard (print)** | A **QR code to the Krewe of Unicorn** front and center. For Gasparilla krewe captains' meetings, Tampa Bay krewe events, ball/coronation tables | ⚪ |

### 3.6 Lead-gen & client-management (the pipeline)

| Asset | Notes | Priority |
|-------|-------|----------|
| **Intake questionnaire** | Krewe size, current tools, must-have features, timeline, budget | 🟢 |
| **Cold outreach email/DM templates** | 3 variants, each leading with a one-line "click the Krewe of Unicorn and see for yourself" hook | 🟡 |
| **Email nurture sequence (3–5 emails)** | For lead-magnet subscribers → demo tour → offer | ⚪ |
| **Onboarding kit** | Welcome doc, content-collection checklist, timeline, what-you-need-from-them | 🟡 |
| **Content-collection template** | Structured request for logos, photos, history text, member list, events (mirror `CONTENT_GUIDE.md`) | 🟡 |
| **Invoice + deposit template** | 50/50 or milestone billing; recurring invoice for retainer | 🟡 |
| **Client CRM / pipeline tracker** | Simple spreadsheet or CRM: lead → **demo toured** → proposal → build → live → retainer | 🟢 |

---

## 4. Feature-to-benefit messaging bank

The core of your copy. Translate each real feature into a benefit a krewe captain
*feels* — and remember, the best version of each line is you *showing it live in the
Krewe of Unicorn*. Use these in the deck, one-pager, ads, and site.

| Real feature (live in the demo) | What you say to a krewe |
|--------------------------------------|-------------------------|
| Public heritage site (history, parades, charity, learn) | "Tell your krewe's story and recruit new members 24/7." |
| Membership application + directory | "Turn interested visitors into members — and finally have your roster in one place." |
| Event calendar with RSVPs | "Know who's coming *before* parade day, not on it." |
| Dues tracking + automated reminders | "Stop chasing dues by hand. The site nudges late payers for you." |
| Craic Cup (points, ranks, badges, leaderboards) | "Make showing up fun — and watch attendance and volunteering climb." |
| Raffle create/manage + entries | "Run fundraising raffles online, with the math and entries handled." |
| Carpools & van pools | "Members coordinate rides themselves — fewer texts to you." |
| Locker rentals + Parade Ready checklist | "Every marcher shows up ready, wristband and all." |
| Officer reports dashboard | "Officers see who's paid, who's ready, and who's active — at a glance." |
| Member content (photos, video, poetry, art) | "Your members build the gallery for you — the site stays alive year-round." |
| Merch shop | "Sell krewe gear without a separate store." |
| Supabase backend + security rules | "Real database, real privacy — members' data is protected, officers get the keys." |
| Email automations | "Reminders, confirmations, and newsletters send themselves." |
| Vercel hosting + custom domain | "Fast, always-on, on your own krewe.org address — for pennies a month." |

**Headline candidates:**
- "Don't take my word for it — tour the Krewe of Unicorn."
- "See a real krewe site in 2 minutes."
- "The website that *runs* your krewe."
- "From spreadsheets and group texts to one home for your whole krewe."
- "By a Tampa Bay krewe, for Tampa Bay krewes." *(local-credibility line)*
- "Built for Gasparilla season — and every season after."

---

## 5. Who you're selling to & where to reach them

**Ideal clients:** Tampa Bay **Gasparilla** krewes first and foremost — the parading
and social krewes that make up Tampa's pirate-festival community — plus adjacent local
groups that run the same way: Celtic/heritage societies (like Shamrock), civic and
charity social clubs, and any Tampa Bay membership org that runs on volunteers, dues,
and events. Especially the ones currently living on spreadsheets, Facebook groups, and
group texts.

> **This is not Mardi Gras.** Gasparilla is Tampa's own tradition. Use Gasparilla and
> Tampa Bay language in every asset — krewe names, pirate/parade imagery where it fits,
> local landmarks — so prospects instantly recognize you as one of their own, not an
> out-of-town vendor.

**Buying signals:** an outdated or no website, a captain/board that complains about
dues collection or turnout, an active events/parade calendar, a ball or coronation to
promote, a merch/fundraising need.

**Channels (all Tampa Bay-local) — and the ask is always "go tour the Unicorn":**
- **Krewe-to-krewe referral** — your strongest channel by far. Gasparilla krewes are a
  tight, interconnected community and captains talk to captains. Ask Shamrock for a
  testimonial and warm intros to two other krewes, then send each the demo link.
- **The Gasparilla krewe community** — krewe captains' gatherings, inter-krewe events,
  and the shared calendar of Gasparilla-season parades, balls, and coronations. That's
  where the decision-makers already are — hand them a card with the demo QR.
- **Facebook/Instagram** — Tampa Bay krewe pages and local Gasparilla community groups;
  post demo clips.
- **Tampa Bay Celtic/heritage & civic networks** — a natural adjacency given Shamrock.
- **Cold outreach** to specific Tampa Bay krewes with weak/no sites, using your
  templates (§3.6) and a "fellow Tampa krewe — click this and see what's possible" opener.

---

## 6. Production plan (phased — demo first)

Build the smallest set that lets you pitch, then expand. **The demo comes first because
it's what closes.**

**Phase 1 — "I can pitch tomorrow" (launch-critical 🟢):**
1. **Build & seed the Krewe of Unicorn demo** — full public site + members portal, a
   guest login, and believable sample data across every feature. *(This is the priority.)*
2. Business name, tagline, logo, colors.
3. Screenshot library + 2–3 min demo video, both recorded *from the Unicorn demo*.
4. One-page service sheet (PDF) + pitch deck + pricing sheet — all CTA-ing to the demo.
5. Flagship Shamrock case study.
6. Intake questionnaire + a simple pipeline tracker.
7. Studio landing page whose hero is the "Tour the Krewe of Unicorn" button.

**Phase 2 — "I can market & close" (🟡):**
8. Proposal/SOW template + contract + invoice templates.
9. Social profiles + launch post + 10–15 content templates (demo clips).
10. Onboarding kit + content-collection template.
11. FAQ + feature comparison sheet.
12. Cold outreach templates.

**Phase 3 — "I can scale" (⚪):**
13. Ad creative sets + short-form video + paid campaigns (all pointing at the demo).
14. Lead magnet + email nurture sequence.
15. Print collateral for events (QR to the demo).
16. A repeatable "starter template" build so each new krewe site is faster to ship —
    and so the Unicorn demo doubles as your build template.

---

## 7. Tools to produce these assets

You have connectors available in this workspace that can generate much of the above:

- **Canva** — logo, one-pager, pitch deck, social/ad templates, flyers, quote cards, QR graphics.
- **Google Drive / Docs** — proposal, SOW, contract, onboarding kit, FAQ, intake form.
- **This repo (Shamrock)** — the codebase to fork into the Krewe of Unicorn demo, plus
  screenshots, demo-video source, and the theme `.mp3` already here for scoring the video.
- **Vercel + Supabase** — host the Unicorn demo and seed its sample data.
- **Slides/Docs skills** (pptx, docx, pdf) — polished deck, contract, and PDF sheets.
- **A CRM/spreadsheet** — the pipeline tracker (xlsx skill can generate it).

Say the word and I can start generating any of these — e.g. **build the Krewe of Unicorn
demo**, or draft the pitch deck, the one-page service sheet, the case study, or the
intake questionnaire next.

---

## 8. Quick-start checklist

- [ ] **Build & seed the Krewe of Unicorn demo** (public site + member login, sample data)
- [ ] Lock business name + tagline + logo + colors
- [ ] Record the 2–3 min walkthrough video from the demo
- [ ] Build the screenshot library from the demo
- [ ] Write the flagship Shamrock case study
- [ ] Create the one-pager, pitch deck, and pricing sheet — all CTA-ing to the demo
- [ ] Publish the studio landing page with the "Tour the Krewe of Unicorn" hero button
- [ ] Set up the intake questionnaire + pipeline tracker
- [ ] Get a Shamrock testimonial + two referral intros
- [ ] Draft SOW, contract, and invoice templates
