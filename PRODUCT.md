# ☘ Céilí

### The Krewe of Shamrock's digital gathering place

A **céilí** (KAY-lee) is an Irish gathering where neighbors bring music, stories, and the business
of the community to one warm room. That is exactly what this application is: the krewe's public
face, the members' clubhouse, and the officers' operations desk, together in one place.

**Motto:** All for Fun, Fun for All · **Live at:** krewe-of-shamrock.vercel.app
**Stack:** static HTML/CSS/JS on Vercel · Supabase (Postgres, Auth, Storage, Edge Functions) ·
magic-link sign-in · row-level security on every table

---

## 1. The Public Site

| Page | What's there |
| --- | --- |
| **Home** | Hero with audio Irish greetings (Céad Míle Fáilte, craic), live upcoming events from the database, membership calls to action |
| **Upcoming Events** | Event RSVP with guest counts plus the perpetual season calendar, both driven by live data |
| **Parades & Safety** | The six-parade roster (SantaFest through Rough Riders' St. Patrick's), the Castle of Shenanigans build story ("We didn't just build a float. It built us."), Gasparilla rules, and safety practices |
| **Tartan Ball** | The formal: invitation, venue, and reservation details |
| **Our Heritage — The Heritage Library** | Seven interactive lessons and fourteen story cards shelved by subject (Kilts & Krewe Style first), with videos, the Céilí Hearth listen-along tune, pronunciation audio, key-term chips, quick-check quizzes, and a lesson progress bar that remembers each visitor |
| **Krewe History** | The full story: the 1998 Grace O'Malley security detail, 19 founders in 1999, growth to the permanent 140-member cap, told with real member photos |
| **Krewe Creativity** | The community's stage: a tune picker (Céilí Hearth and four more), a six-craft sharing hub (photography, music & video, art, poetry, writing, recipes) deep-linked to submission forms, an illuminated Irish blessing, and live member poems and artwork |
| **Photo Gallery / Videos** | Curated galleries, parade footage, and member-submitted media (reviewed before publishing) |
| **Service & Charity** | The charity partners, the volunteer program and 12-hour tradition, and TrackItForward logging |
| **Shop** | Crested gear concept store |
| **Join** | Membership at a Glance (Full vs. Associate tiers, dues, parade access, volunteer commitment, sponsor + background check + Board approval, the 140 cap) and the online application |
| **Raffle + QR sheet** | Public basket-raffle and 50/50 entry pages, QR-scannable at events |

## 2. The Members Portal *(magic-link sign-in, roster-only)*

- **🎗️ Parade Ready** — the wristband eligibility engine: live gates for dues paid, digital waiver
  (signed in ten seconds on the card), and mandatory-meeting attendance, with a clear
  PARADE READY status when all three clear
- **📲 QR meeting check-in** — scan the meeting QR; the check-in survives the sign-in flow and
  lands with a Fáilte banner
- **🙌 Volunteer hours** — self-service logging with a progress bar toward the 12-hour commitment
- **🍀 The Craic Cup** — the participation game: Clovers, ranks, badges, seasonal leaderboards,
  and a volunteer podium
- **🎟️ Raffles** — enter baskets and the 50/50, track your tickets, and build raffles you run
- **☘ Share content** — upload videos, photos, artwork, poems, stories, and recipes for review
- **🔑 Coordination** — locker rentals, carpool offers and requests, van-pool seats
- **👥 Member directory** — searchable names and roles

## 3. Officer Operations *(role-guarded in the database itself)*

- **Parade Readiness** — the Wristband Pickup List (who's ready, who's missing what),
  Volunteer Hours Review with one-click approval, and the Meeting Check-In QR creator
- **Events & Attendance** — headcounts, capacity, volunteer coverage, attendee contact lists
- **Membership** — overview, officer roster, new members, full directory, pending applications
- **Dues & Finance** — yearly summaries, outstanding dues with reminder history
- **Logistics** — lockers, carpools, van-pool capacity with recruiting alerts
- **Content & Communications** — content inventory and the outbound email log
- Raffle winner draws, content review, and application approval, all officer-only by policy

## 4. Platform & Automation

- **Publish once**: events and content live in the database and appear everywhere they belong
- **Email pipeline**: an outbound queue and the `process-outbound-emails` function (Resend),
  ready to drive dues reminders the moment the API key and domain are configured
- **Security**: closed signup (roster emails only), member-vs-officer row-level security,
  identity derived from the signed-in profile, officer functions guarded server-side,
  check-in codes stored out of members' reach
- **Tracked migrations** for every schema change; schema documented in `DATABASE_BACKEND.md`

## 5. Roadmap

| Item | Unlocks | Needs |
| --- | --- | --- |
| Automated dues reminders | End of manual dues-chasing | Resend key + domain verification (in progress) |
| Online payments | Dues, application fees, raffle tickets | Stripe or PayPal account |
| Board packet automation | One-click meeting packets | Build on existing reports |
| Officer transition kit | No more lost institutional memory | Document repository |
| Social feed integration | Publish once to site + Facebook | Meta API setup |

---

*Céilí keeps the fun in front and the spreadsheets out of sight — so the leaders can lead,
the members can march, and there's always room at the table. Sláinte!*
