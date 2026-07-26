# Krewe of Unicorns — Demo Website

A **Krewe & Kin** marketing demo site. It shows a full, real-feeling krewe website —
public pages *and* a member portal — built on the same feature set as the flagship
Krewe of Shamrock build, but with an original **unicorn / rainbow / magic** theme.

Use it to show prospective krewes what "your own site, your own identity" looks like:
same engine, completely different soul.

**The Krewe of Unicorns is fictional** — invented purely for this demo.

## What's inside (same features as a full krewe build)
- **Home** — hero, about, live-style events list, recruiting
- **Events** — upcoming events + RSVP form · **Parades** · **The Enchanted Ball** (gala)
- **About** — **Unicorn Lore** (interactive lesson library with quizzes & progress),
  **Krewe History**, **Krewe Creativity** (poetry & member art)
- **Media** — Photo Gallery · Videos · Share Yours
- **Get Involved** — Volunteer/Service · Shop · **Members Area** (directory, dues,
  RSVPs, engagement, and more)
- **Join** — membership application
- Floating music player, animated sparkle field, responsive nav, scroll reveals

## Demo data (no backend)
Every dynamic screen is populated with **baked-in sample data** and every form is
**demo-only** — nothing is sent anywhere and there is no database. On a live Krewe & Kin
build these are wired to a real Supabase backend (see the Shamrock build). This keeps the
demo self-contained, instant, and safe to share.

## Structure
- `*.html` — the site pages
- `assets/krewe.css`, `assets/krewe.js` — shared theme + behavior
- `assets/img/` — the original SVG crest, star/rainbow ornaments, and generated
  aurora "scene" SVGs
- `assets/img/photos/` — web-optimized unicorn artwork used across the site
  (hero, page headers, gallery, features); full-resolution source files live in
  `source-images/` and are excluded from the deploy
- `assets/audio/krewe-theme.wav` — the krewe's theme tune

## Running locally
Open `index.html` in a browser, or serve the folder with any static server:
```
python3 -m http.server   # then visit http://localhost:8000
```
No build step — the pages are served as-is.

## Deploying to Vercel
This folder is a static site. Import it into Vercel (no framework preset needed) and it
deploys as-is; every push redeploys automatically.

## Promoting this demo to its own repository
It currently lives as a self-contained subfolder inside the Shamrock repo. To give it its
own `krewe-of-unicorns` repo:
```
# from the repo root
cp -r krewe-of-unicorns /tmp/krewe-of-unicorns
cd /tmp/krewe-of-unicorns
git init && git add . && git commit -m "Krewe of Unicorns demo site"
# create an empty repo named krewe-of-unicorns on GitHub, then:
git remote add origin https://github.com/MissTully/krewe-of-unicorns.git
git branch -M main && git push -u origin main
```
Then point Vercel at the new repo.

---
Built with 🦄 by Krewe & Kin.
