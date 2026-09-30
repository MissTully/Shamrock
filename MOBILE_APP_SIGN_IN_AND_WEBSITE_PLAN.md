# Sign Out on the Website, Sign In and Out in the Mobile App, and Opening the Full Website from the App — Plan

Status: **plan only, nothing built yet.** Written 2026-09-30.

## 1. What members asked for

| # | Where | The member wants to… |
|---|-------|----------------------|
| 1 | Website (any page, in a normal browser) | Sign out by clicking the green **Signed in** chip in the header. |
| 2 | Krewe of Shamrock mobile app | Sign in and sign out. |
| 3 | Krewe of Shamrock mobile app | Open the full, browser-based website from their phone. |
| 4 | Krewe of Shamrock mobile app | Jump from anywhere inside the app (while navigating) to the full website. |

## 2. What exists today (so we build on it, not around it)

**The "mobile app" is not a separate native app.** It is the Member Hub page
(`members.html`) installed on the phone's home screen as a Progressive Web App
(a website that can be installed and opens without the browser address bar).

| Piece | File | What it does today |
|-------|------|--------------------|
| App definition | `manifest.webmanifest` | `start_url` is `/members.html`, `scope` is `/` (every page on the site counts as "inside the app"), `display` is `standalone` (no browser bar). |
| Install helper | `assets/hub-install.js` | Detects standalone mode (`isStandalone()`), registers `hub-sw.js`, shows the "Install the app" flow. |
| Sign-in | `members.html` (the login gate) | Email and password sign-in with Supabase Auth. Works the same inside the installed app. |
| Sign-out function | `members.html:4009` | `window.kosSignOut = async () => { await sb.auth.signOut(); location.reload(); }` |
| Sign-out on a computer | `members.html:1551` | A **Sign out** button in `.hub-member-bar`. |
| Phone app shell | `members.html:716-728` and `assets/members-desk.js` (`syncAppChrome`, about line 2203) | On phones and in the installed app, `body.hub-app` **hides the website header and `.hub-member-bar`**, so the Sign out button above is hidden. |
| Sign-out on a phone | `assets/members-desk.js:607` (`meLinksHtml`) | A **Sign out** button at the bottom of the **Me** tab → "Your hub" card. It works, but members must scroll to find it. |
| Links to the website from the app | `assets/members-desk.js:608-620` | "Rest of the website" list (Public home, Upcoming events, Parades, …). Because `scope` is `/`, these open **inside the app window**, with no address bar and (on iPhone) no Back button. Members can get stuck on a public page. |
| Header "Signed in" chip | `assets/krewe.js:226-280` (`kosNavSignedChip`) | Reads the Supabase session from `localStorage` (keys that start with `sb-` and contain `auth-token`). If a session exists, the top-left `.nav-hub` link changes to **Signed in** (on `members.html`) or **Member Hub** (other pages). It is only a link to `members.html`; it cannot sign out. Public pages do not load the Supabase library. |

### Two facts that shape the design

1. **`sb.auth.signOut()` with no options signs the member out everywhere.**
   In supabase-js version 2 the default scope is `"global"`, which ends every
   session for that member on every device. Signing out on a laptop today also
   signs the member out of the phone app the next time the phone refreshes its
   token. Passing `{ scope: "local" }` ends only the current browser's session.
   Reference: Supabase JavaScript reference, `auth.signOut()` —
   https://supabase.com/docs/reference/javascript/auth-signout
2. **The installed app and the phone browser may or may not share a sign-in.**
   - **iPhone and iPad:** a home-screen web app has its own storage, separate
     from Safari. Signing in inside the app does **not** sign the member in to
     Safari, and the reverse is also true.
     Reference: WebKit blog, "Full Third-Party Cookie Blocking and More"
     (storage for home-screen web apps) — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
   - **Android with Chrome:** the installed app (a "WebAPK") uses Chrome's
     storage, so the app and Chrome share one sign-in. Signing out in one signs
     out the other.
     Reference: Chrome for Developers, "WebAPKs on Android" —
     https://web.dev/articles/webapks

   Public pages (Home, Parades, Tartan Ball, and so on) do not need a sign-in, so
   opening the full website works for everyone. Only the members-only Hub would ask
   an iPhone member to sign in again inside Safari. We accept that for now (see
   section 7).

## 3. Recommended solution (summary)

| Request | Solution |
|---------|----------|
| 1. Website sign-out | Turn the header chip into a small **account menu** when signed in: "Signed in as *Name*", **Open Member Hub**, **Sign out**. It works on every page, including public ones. |
| 2. App sign-in and sign-out | Sign-in already works. Make sign-out easy to find: tap the **avatar circle** (top-left of the app header) to open an **Account sheet** with the member's name, **Open the full website**, and **Sign out**. Keep the existing Me tab button. |
| 3. Open the full website | An **Open the full website** action that opens `index.html` in a real browser view (Safari on iPhone, Chrome on Android), so the member has an address bar and can close it to return to the app. |
| 4. From anywhere in the app | Put the Account sheet on the avatar, which is visible on every app screen. Phase 2 also changes the app's `scope` so every public-page link automatically opens in a browser view with a close button. |
| All | Sign out with `{ scope: "local" }` so signing out on one device does not sign the member out everywhere. |

## 4. Detailed design

### 4.1 Website: click "Signed in" to sign out (request 1)

**Behavior**

1. Signed out: the chip reads **Member Hub Login** and links to `members.html` (no change).
2. Signed in: the chip reads **Signed in** (any page). Clicking it opens a small menu
   anchored under the chip instead of navigating:
   - Line 1: "Signed in as Maeve Kelly" (first and last name if we have it, otherwise "Signed in").
   - **Open Member Hub** — link to `members.html` (hidden when already on `members.html`).
   - **Sign out** — signs out, closes the menu, and turns the chip back into **Member Hub Login**.
3. The menu closes on the Escape key, on a click outside it, and when a menu item is chosen.

Why a menu and not "one click signs you out": the chip has always been the way
back to the Hub. A one-click sign-out would surprise members who tap it to reach
the Hub, and would sign them out by accident.

**Code changes**

| File | Change |
|------|--------|
| `assets/krewe.js` (`kosNavSignedChip`) | When a session exists, change the `.nav-hub` element from a plain link into a button-like control: add `role="button"`, `aria-haspopup="menu"`, `aria-expanded="false"`, and `aria-controls="kosAcctMenu"`. Insert a `<div id="kosAcctMenu" role="menu" hidden>` with the three items. Keep the `href="members.html"` so the control still works if JavaScript fails. |
| `assets/krewe.js` (new `kosSiteSignOut()`) | Public pages do not load Supabase. On **Sign out**: (a) if `window.kosSignOut` exists (we are on `members.html`), call it; (b) otherwise load supabase-js with `import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")` (the same address `members.html` already uses), create a client with `KOS_SB_URL` and `KOS_SB_KEY`, and call `auth.signOut({ scope: "local" })`; (c) if the network call fails, remove the `sb-…-auth-token` keys from `localStorage` so the browser is signed out anyway; (d) put the chip back to **Member Hub Login**. |
| `assets/krewe.js` (name) | Read the member's name from the stored session (`user.user_metadata`) if present; do not add a database call to public pages. Fall back to "Signed in". |
| `assets/krewe.css` | Styles for `.nav-acct-menu`: gold border, green text, 44-pixel-tall touch targets, visible focus ring, positioned under the chip on desktop and full-width under the chip on phones (the chip is on its own top row at 640 pixels and below). |
| `members.html:4009` | Change to `await sb.auth.signOut({ scope: "local" })`. |
| All pages that load `krewe.js` / `krewe.css` | Bump the `?v=` cache-busting query string. |

### 4.2 App: sign in and sign out (request 2)

**Sign in** already works: the installed app opens `members.html`, which shows
the login gate when no session exists. Items to confirm only:

- The gate appears after sign-out inside the installed app (because
  `kosSignOut` reloads the page). Confirm on an iPhone and an Android phone.
- "Forgot password" email links open in the phone browser, not the app. On
  iPhone this means the member resets the password in Safari and then signs in
  inside the app with the new password. Add one sentence of help text under the
  gate's "Forgot password" link that says so.

**Sign out made easy to find**

| File | Change |
|------|--------|
| `assets/members-desk.js` (`appChromeHtml`) | Change the avatar `<div class="app-av" id="appAv" aria-hidden="true">` into `<button type="button" class="app-av" id="appAv" aria-label="Account and sign out" data-app-go="account">`. |
| `assets/members-desk.js` (`handleAppGo`) | Add `go === "account"`: open the existing bottom sheet (`#appSheet`, the same one other features use) with: member name and email, **Open the full website**, **Install the app** (only when not installed, using `window.KOS_HUB_INSTALL.wasInstalled()` from `hub-install.js`), and **Sign out**. |
| `assets/members-desk.js` (`handleAppGo`) | For `go === "signout"`, ask "Sign out of the Krewe app on this phone?" with **Sign out** and **Cancel** inside the sheet, not the browser's `confirm()` (which looks broken in standalone mode on some phones). |
| `assets/members-desk.js` (`meLinksHtml`) | Keep the Me tab **Sign out** button, and move it to the top of the "Your hub" card so it does not require scrolling. |

### 4.3 App: open the full website (requests 3 and 4)

**Phase 1 — an explicit button (small, safe, ship first)**

- Add **Open the full website** to the Account sheet (4.2) and at the top of the
  Me tab's "Rest of the website" list.
- The button calls a new helper `kosOpenFullSite(path)` in `assets/members-desk.js`:
  - In standalone mode (`window.KOS_HUB_INSTALL.isStandalone()`, or `isHubStandalone()` already in `members-desk.js`): `window.open(location.origin + "/" + (path || "index.html"), "_blank", "noopener")`.
    On iPhone this opens the page in Safari. On Android it opens in a Chrome
    browser tab or an in-app browser view with a close button, depending on the
    Chrome version.
  - In a normal phone browser (not installed): simple navigation to the page.
- Show a short toast: "Opening the Krewe website in your browser. Come back to the app any time."

**Phase 2 — make every public link a browser view (do after device testing)**

- Change `manifest.webmanifest` `"scope": "/"` to `"scope": "/members"`.
  Scope is a URL prefix, so `/members.html` stays inside the app and every other
  page (`/index.html`, `/parades.html`, …) becomes "outside the app". Browsers
  open outside pages in an in-app browser view that shows the address and a
  close (✕ or Done) button that returns to the app.
  Reference: MDN Web Docs, "scope" manifest member —
  https://developer.mozilla.org/en-US/docs/Web/Manifest/scope
- This also fixes today's trap where "Rest of the website" links open inside the
  app with no Back button on iPhone.
- Things to check before shipping Phase 2:
  - `start_url` (`/members.html`) must stay inside the new scope. It does.
  - Android updates installed apps' manifests on its own (usually within a day
    of the app being opened). iPhone keeps the old scope until the member
    removes and re-adds the app, so Phase 1's button is still needed on iPhone.
  - `hub-sw.js` stays registered at scope `/`; installability does not change.
  - Links the Hub already opens with `target="_blank"` (waiver, raffle demo,
    photo release) will open in the browser view, which is the desired result.

## 5. Tests to add (Playwright, `tests/specs/`)

| Spec file | New test |
|-----------|----------|
| `interactions.spec.js` | With a fake session in `localStorage`, the header chip reads **Signed in**, clicking it opens a menu with **Open Member Hub** and **Sign out**, Escape closes it, and **Sign out** removes the `sb-…-auth-token` key and resets the chip to **Member Hub Login**. Stub the network request to Supabase so the test never touches the live database. |
| `interactions.spec.js` | Signed-out chip is still a plain link to `members.html` (keeps the existing header test passing). |
| `hub-app-shell.spec.js` | At 390 × 844 pixels, the avatar is a button named "Account and sign out"; tapping it opens the sheet with **Open the full website** and **Sign out**; **Sign out** asks for confirmation and then calls `kosSignOut`. |
| `hub-app-shell.spec.js` | **Open the full website** calls `window.open` with `/index.html` and `_blank` when standalone mode is simulated (`page.emulateMedia` does not cover `display-mode`, so stub `window.KOS_HUB_INSTALL.isStandalone`). |
| `static-check.mjs` | Phase 2 only: the manifest `scope` is `/members` and `start_url` begins with it. |

Also run `node tests/static-check.mjs` and the full Playwright suite (see `tests/README.md`).

## 6. Manual checks on real phones (cannot be automated)

1. iPhone, Safari, installed app: sign in, open the Account sheet, **Open the full website** opens Safari; switching back to the app keeps the member signed in; **Sign out** returns to the login gate.
2. Android, Chrome, installed app: same steps; confirm the website view has a close button that returns to the app.
3. Laptop: sign in on `members.html`, go to `index.html`, click **Signed in** → **Sign out**; then confirm the phone app is **still signed in** (proves `scope: "local"`).
4. Phase 2 only: after the manifest updates on Android, tap "Parades" in the Me tab and confirm it opens in the browser view.

## 7. Out of scope and open questions

- **Carrying the sign-in from the iPhone app into Safari.** Possible later with a
  one-time sign-in link (Supabase "magic link" or a short-lived token handoff),
  but it adds security risk and is not needed for public pages. Not recommended now.
- **A native app store app** (for example, a React Native or Capacitor wrapper).
  Not needed for these requests; the installed web app already covers them.
- **Decision for the owner:** confirm that signing out should affect **only this
  device** (recommended, `scope: "local"`), not every device.

## 8. Suggested order of work (one pull request each)

1. Website account menu and local sign-out (section 4.1) with its tests.
2. App Account sheet, easier sign-out, and **Open the full website** button (sections 4.2 and 4.3 Phase 1) with tests.
3. After real-phone checks: manifest scope change (section 4.3 Phase 2).
