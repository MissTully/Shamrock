-- =============================================================================
-- Security lockdown, 2026-10-01
-- Already applied to the live database (project oazwkwflgbthojvnclfc) as the
-- migration "security_lockdown_member_emails_flags_payment_helpers".
-- Kept here so the repository matches the database. Safe to re-run.
--
-- Why: PostgreSQL and Supabase give every new view and function to the
-- anonymous role by default. Before this fix, anyone holding the public
-- website key could:
--   1. read the active member, officer, and lapsed member email lists;
--   2. edit kos_runtime_flags, which holds the background check payment links;
--   3. call the payment helpers that mark a member paid and award Clovers.
-- =============================================================================

-- 1. Member email list views: never readable from the website.
--    Database functions that use them run as the owner and keep working.
revoke all on public.v_active_member_emails, public.v_officer_emails,
  public.v_lapsed_member_emails from public, anon, authenticated;
alter view public.v_active_member_emails set (security_invoker = true);
alter view public.v_officer_emails set (security_invoker = true);
alter view public.v_lapsed_member_emails set (security_invoker = true);
grant select on public.v_active_member_emails, public.v_officer_emails,
  public.v_lapsed_member_emails to service_role;

-- 2. Runtime flags (background check payment links, email switch):
--    row-level security on, no access from the website.
--    Functions such as kos_membership_prospect_emails_enabled() still read it
--    because they run as the owner.
alter table public.kos_runtime_flags enable row level security;
revoke all on public.kos_runtime_flags from public, anon, authenticated;
grant select, insert, update, delete on public.kos_runtime_flags to service_role;

-- 3. Payment matching helpers: server (Zeffy webhook) only.
--    kos_record_payment calls these with the owner's rights, so the webhook
--    keeps working.
revoke execute on function public.kos_auto_rsvp_from_payment(uuid, uuid, integer, text, uuid, integer),
  public.kos_match_member_by_email(text),
  public.kos_match_member_by_name(text),
  public.kos_find_event_for_payment(jsonb)
  from public, anon, authenticated;
grant execute on function public.kos_auto_rsvp_from_payment(uuid, uuid, integer, text, uuid, integer),
  public.kos_match_member_by_email(text),
  public.kos_match_member_by_name(text),
  public.kos_find_event_for_payment(jsonb)
  to service_role;

-- 4. Going forward: new functions are NOT callable by anonymous visitors
--    unless a migration grants it on purpose, for example:
--      grant execute on function public.my_public_form(text) to anon;
--    Signed-in access is unchanged.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
