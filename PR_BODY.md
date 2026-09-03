# Member Hub redesign

## Summary
- Point the static site at the **new Supabase project** (`oazwkwflgbthojvnclfc`) and replace all old Tribe Test keys (`njfzrnqwbnuhmopgpsud` / `sb_publishable_uZB6*`).
- Replace **magic-link-only** gate on `members.html` with **email + password** (Sign in, Create password, Forgot password). Profile completion step kept.
- Redesign post-login **Member Hub**: Welcome + status chips, dynamic **My next actions**, tabbed sections (My Krewe, Events, Parade Day, Give Back, Fun, Officer desk). Existing tools preserved under tabs (`assets/members-desk.js`).
- Promote **Member Login** in public nav (not buried only under Get Involved).
- Standardize Contact / Report a website problem / Auth admin mailbox to **kreweofshamrocktampa@gmail.com**. Board password is **not** invented — set via Create password or Forgot password.
- Placeholder governing docs under `assets/docs/`. Setup notes in `MEMBER_HUB_SETUP.md`.

## Test plan
- [ ] Confirm no `njfzrnqwbnuhmopgpsud` or `sb_publishable_uZB6` remain in repo
- [ ] Supabase Auth: Site URL + redirect allow-list for `https://www.kreweofshamrock.com` and Vercel app URLs; Email provider allows password sign-in
- [ ] `members.html`: Sign in with password; Create password for invited email; Forgot password email arrives; profile gate still works when incomplete
- [ ] After login: Welcome chips (standing / parade ready / hours); next-action cards; tabs switch without losing feature forms
- [ ] Officer user sees Officer desk / reports; non-officer does not
- [ ] Parade Ready, raffles, Craic Cup, lockers, carpools, vans, directory, share still work
- [ ] Public pages show **Member Login**; Contact / Report a website problem mailto goes to kreweofshamrocktampa@gmail.com
- [ ] Bootstrap board account for kreweofshamrocktampa@gmail.com via Create password or reset (no shared invented password)

## Supabase dashboard (Melissa)
See `MEMBER_HUB_SETUP.md` — Site URL, redirect URLs, Email+password provider, and route role-approval / Auth admin notifies to **kreweofshamrocktampa@gmail.com** (templates / SMTP / Edge Function).
