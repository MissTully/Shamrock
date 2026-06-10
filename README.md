# Krewe of Shamrock — Website

Tampa's original kilted krewe (Est. 1999). This repository holds the source for the
Krewe of Shamrock website.

**Live site:** https://krewe-of-shamrock.vercel.app

## Overview
A static website (HTML / CSS / JavaScript) with dynamic content served from a
Supabase backend (events, poetry & art, the shop, and member coordination tools).
No build step is required — the pages are served as-is.

## Structure
- `*.html` — the site pages (Home, Events, Parades, Tartan Ball, Join, Service,
  Gallery, Shop, Videos, Learn, Poetry & Art, Members)
- `assets/krewe.css`, `assets/krewe.js` — shared styles and scripts
- `assets/img/`, `assets/audio/` — images, the crest/logo, and the theme music
- `*.md` — project plans and guides
- `Krewe of Shamrock - Software Design Document.docx` — architecture & cost analysis

## Running locally
Open `index.html` in a browser, or serve the folder with any static server.

## Deploying
Hosted on Vercel as a static site. Connecting this repository to Vercel
(Import Git Repository) will redeploy automatically on every push to `main`.

## Notes
- The backend is a Supabase project; only the public "publishable" key ships in the
  client — no secrets are stored in this repository.
- Large raw source media (zip archives, source videos) are intentionally excluded
  via `.gitignore`.
