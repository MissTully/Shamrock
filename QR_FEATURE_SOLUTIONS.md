# QR feature solutions — members & officers

Krewe of Shamrock / Krewe & Kin living case. QR codes are **links drawn as a square**. Officers generate them in Member Hub; members scan with a phone camera.

Status key: **Live** = works today · **Pack** = generate from Officer QR Solutions · **Planned** = build next.

---

## Member solutions

| # | Solution | What the QR opens | Status | Why it helps |
|---|----------|-------------------|--------|--------------|
| M1 | **Event RSVP / Sign Me Up** | `event-signup.html` (later: deep-link one event) | Pack (calendar) · Planned (per-event) | Flyer/table tent → signup without hunting the site |
| M2 | **Pay member dues** | Zeffy Full Krewe dues form | Pack | Meeting slide / postcard → pay without asking treasurer for the link |
| M3 | **Log volunteer hours** | `members.html?hub=hours#hours` (login → hours form) | Pack | Warehouse door / shift sheet → form in one scan |
| M4 | **Members Facebook group** | Members-only FB group | Pack | Welcome packet / locker area → private group |
| M5 | **Public Facebook group** | Public krewe FB group | Pack | Public flyer / parade giveaway |
| M6 | **Store / merch** | `store.html` (later: one product) | Pack (store) · Planned (per SKU) | Bar / float → shop |
| M7 | **Tartan Ball guest card** | Guest seating / meal line (Avery data) | Planned | Table card → “where am I / what am I eating” |
| M8 | **Meeting / event check-in** | `members.html?checkin=CODE` | Live (meetings) · Planned (Attendance QR Studio) | Wall QR → attended (+ volunteer hours when volunteering) |

---

## Officer solutions

| # | Solution | What it does | Status | Why it helps |
|---|----------|--------------|--------|--------------|
| O1 | **Attendance QR Studio** | Per-event QR; scan marks attendance; volunteers get hours | Planned (extends Live meeting QR) | No clipboard; ties events + hours |
| O2 | **Meeting Check-In QR** | Schedule meeting + show QR; Parade Ready meeting gate | Live | Already in Officer reports |
| O3 | **QR Solutions pack** | One officer page: tonight’s useful squares (dues, hours, store, FB, RSVP, check-in link) | Pack (this ship) | Projector + print without hunting URLs |
| O4 | **Wristband pickup station** | QR → member’s Parade Ready status | Planned | Line moves faster at wristband table |
| O5 | **Event confirm deep-link** | QR → Confirm Attendance & Hours for one event | Planned | Officer phone at door |
| O6 | **Locker claim sticker** | QR → locker request/status | Planned | Physical locker ↔ hub |
| O7 | **Help / secretary** | QR → `mailto:secretary@kreweofshamrock.com` | Pack | “Something’s wrong” without hunting email |
| O8 | **Raffle basket QRs** | Per-basket entry | Live | Already shipped (`raffle-qr-sheet.html`) |

---

## Attendance QR Studio (genius upgrade) — planned

**Officer:** pick event → set default volunteer hours → Show QR (fullscreen) → live scan feed.  
**Member scan:** login if needed → mark attended on event signup → if volunteer/organizer (or confirms volunteer), credit hours → toast.  
**Rules:** one scan per member/event; time window; mandatory meetings still set Parade Ready.

Builds on: `officer_enable_checkin`, `meeting_check_in`, `officer_confirm_attendance`, `volunteer_hours`.

---

## Implementation notes

- QR library: `qrcode` on `members.html` (same as meeting check-in).
- Check-in codes stay in `meeting_checkin_codes` (officer-only), not public `events`.
- Prefer `https://www.kreweofshamrock.com/...` absolute URLs on printed material.
- Soft-launch: board first; mass blast on hold until product owner says go.

---

*Added 2026-09-09 for Melissa / Krewe digital.*
