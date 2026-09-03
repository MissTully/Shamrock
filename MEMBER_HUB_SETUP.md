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

## Public contact, website issues, and Auth admin mailbox
- **`kreweofshamrocktampa@gmail.com`** is used for:
  - Public website Contact / mailto links
  - **Report a website problem** / support issue reports
  - Role-approval and Auth-related admin notifications (templates / SMTP / Edge Function)
  - First board/officer bootstrap account (no invented password — set via Create password or Forgot password)

## Board / officer bootstrap account
- Public contact **and** Auth admin notify address: **`kreweofshamrocktampa@gmail.com`**
- Treat this email as the first board/officer account when importing members / assigning roles (`is_krewe_officer` / board role).
- **Do not invent a password.** Melissa or Tim must set the password via:
  - Member Hub → **Create password** (sign up) for that email, or
  - **Forgot password** / invite reset link from Supabase Auth
- Same address is the public website contact (`mailto:` / Contact Us).

## Role approvals happen ON THE WEBSITE (board decision)
- Role requests and duplicate-record merges are decided by officers **inside
  the Member Hub** (Officer desk tab → **Approvals** card, with a count badge).
  No approval links travel by email. See `MEMBER_ONBOARDING_AUTOMATION.md`
  for the full design, database objects, and test checklist.
- Email is used only where it must be: members proving their own address for
  password create / reset (Supabase Auth sends these automatically).
- `kreweofshamrocktampa@gmail.com` remains the public contact and the
  bootstrap board/officer account — it is auto-granted board + officer roles
  by a database trigger the moment the account is created.
- Optional later add-on: a heads-up email ("something is waiting — sign in to
  review", no action links) via database webhook + Edge Function + Resend.

## Enable Email + Password provider
- Supabase Dashboard → Authentication → Providers → Email: enable Email, disable “magic link only” if still forced.
- Confirm email confirmations policy matches board preference (invite-only vs open create-password).
