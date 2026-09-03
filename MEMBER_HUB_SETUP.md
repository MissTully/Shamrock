# Member Hub setup notes

## Supabase project (required)
- URL: `https://oazwkwflgbthojvnclfc.supabase.co`
- Publishable (anon) key is embedded in static pages (publishable only — never commit the service role key).

## Auth URL settings (Melissa must set in Supabase Dashboard → Authentication → URL Configuration)
- **Site URL:** `https://www.kreweofshamrock.com` (or current production host)
- **Redirect URLs** (allow-list all that apply):
  - `https://www.kreweofshamrock.com/members.html`
  - `https://www.kreweofshamrock.com/**`
  - Vercel preview/production app URL(s), e.g. `https://<project>.vercel.app/members.html` and `https://<project>.vercel.app/**`
- Password recovery uses `resetPasswordForEmail` with `redirectTo` = current origin + `/members.html`.

## Public contact and website issues
- **`kreweofshamrocktampa@gmail.com`** is the PUBLIC address only:
  - Public website Contact / mailto links
  - **Report a website problem** / support issue reports

## Board / officer bootstrap (administrator) account
- The site administrator account is **`melissajotully@gmail.com`** (board
  pivot — this replaces the shared mailbox as the admin account).
- A database trigger auto-grants that account **board + officer** the moment
  it is created, and Melissa's roster record carries `member_role = 'board'`,
  so `is_krewe_officer()` recognizes her by either path.
- **Do not invent a password for anyone else.** Melissa sets her own password
  (dashboard invite / direct create / Forgot password); other members set
  theirs through their own email links.

## Role approvals happen ON THE WEBSITE (board decision)
- Role requests and duplicate-record merges are decided by officers **inside
  the Member Hub** (Officer desk tab → **Approvals** card, with a count badge).
  No approval links travel by email. See `MEMBER_ONBOARDING_AUTOMATION.md`
  for the full design, database objects, and test checklist.
- Email is used only where it must be: members proving their own address for
  password create / reset (Supabase Auth sends these automatically).
- `kreweofshamrocktampa@gmail.com` remains the public contact address;
  the bootstrap board/officer (administrator) account is
  `melissajotully@gmail.com`, auto-granted board + officer roles by a
  database trigger the moment the account is created.
- Optional later add-on: a heads-up email ("something is waiting — sign in to
  review", no action links) via database webhook + Edge Function + Resend.

## Enable Email + Password provider
- Supabase Dashboard → Authentication → Providers → Email: enable Email, disable “magic link only” if still forced.
- Confirm email confirmations policy matches board preference (invite-only vs open create-password).
