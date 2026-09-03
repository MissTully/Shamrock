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

## Role-approval and Auth admin notifications
- Route **signup / role-approval / officer invite confirmation / Auth-related admin alerts** to **`kreweofshamrocktampa@gmail.com`**.
- Configure in Supabase:
  - Auth email templates / custom SMTP, and/or
  - an Edge Function or database webhook that emails `kreweofshamrocktampa@gmail.com` when a member requests elevated role, completes first signup, or needs officer review
- Member Hub UX still gates Officer desk with `is_krewe_officer()`; email notify is operational, not a substitute for that RPC.

## Enable Email + Password provider
- Supabase Dashboard → Authentication → Providers → Email: enable Email, disable “magic link only” if still forced.
- Confirm email confirmations policy matches board preference (invite-only vs open create-password).
