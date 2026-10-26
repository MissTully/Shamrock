-- Lock the public API out of admin raffle (and other officer) functions.
--
-- Confirmed on the Krewe project the website calls (oazwkwflgbthojvnclfc),
-- 2026-10-26: sql/kos_raffles.sql does `revoke all ... from public` and then
-- `grant execute ... to authenticated`. Supabase also grants EXECUTE to `anon`
-- directly, and that direct grant survives a revoke from PUBLIC. The security
-- advisor therefore still lists draw_5050_winner, delete_basket, update_raffle,
-- and the other officer RPCs as callable with the publishable key.
-- The function bodies do reject a caller with no auth.uid() / no officer check.
-- This migration removes the grant so PostgREST never enters those functions.
--
-- Apply (either project; safe to re-run):
--   1. Supabase Dashboard → SQL Editor.
--   2. Paste this file and run it. Do not pause or delete the project.
--   3. Dedicated Krewe project: oazwkwflgbthojvnclfc
--      (kreweofshamrock.com, members hub, raffle.html).
--   4. Older shared project named in the health report: Tribe Test
--      njfzrnqwbnuhmopgpsud. This script only touches Krewe names
--      (officer_*, kos_*, and the raffle/admin list below). It does not
--      revoke unrelated apps' functions.
--
-- Verify (SQL editor, after it commits):
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'execute') as anon_exec
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'draw_5050_winner','delete_basket','set_raffle_active','get_raffle_admin',
--       'enter_basket_public','buy_5050_public'
--     )
--   order by 1;
--   -- admin names: anon_exec false (or the function is absent)
--   -- enter_basket_public / buy_5050_public: anon_exec true
--   select c.relname, c.reloptions
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname in (
--       'v_raffle_events_public','v_raffle_baskets_public',
--       'v_season_leaderboard','v_volunteer_leaderboard',
--       'member_directory','v_member_profiles'
--     );
--   -- security_invoker=true on each view that exists
-- Then reload the security advisor. anon_security_definer_function_executable
-- should no longer list the admin raffle RPCs. security_definer_view should
-- no longer list the four Krewe views above.
--
-- Authenticated (signed-in hub) keeps EXECUTE on officer RPCs. There is no
-- separate officer database role; members.html calls draw_5050_winner and
-- delete_basket with the officer's JWT, and the function body still requires
-- kos_can_manage_raffle() / is_krewe_officer(). Internal helpers and trigger
-- functions lose authenticated as well and stay callable by the owner and
-- service_role (edge functions, webhooks).

create schema if not exists kos_internal;
revoke all on schema kos_internal from public;
grant usage on schema kos_internal to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Views. security_invoker so the advisor stops flagging SECURITY DEFINER
-- views. The row source moves into kos_internal (not an API schema) so the
-- public raffle page can still total tickets without a SELECT policy on
-- raffle_*_entries (those rows include guest name and email).
-- Leaderboard functions are authenticated-only: clover_ledger RLS is
-- self-only, and the standings page is the signed-in hub.
-- ---------------------------------------------------------------------------

do $views$
declare
  v_name text;
  v_fn text;
  v_def text;
  v_body text;
  v_opts text[];
  v_filter text;
begin
  foreach v_name in array array[
    'v_raffle_events_public',
    'v_raffle_baskets_public',
    'v_season_leaderboard',
    'v_volunteer_leaderboard'
  ]
  loop
    if to_regclass('public.' || v_name) is null then
      continue;
    end if;

    select c.reloptions into v_opts
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_name;

    v_fn := case v_name
      when 'v_raffle_events_public' then 'raffle_events_public_rows'
      when 'v_raffle_baskets_public' then 'raffle_baskets_public_rows'
      when 'v_season_leaderboard' then 'season_leaderboard_rows'
      else 'volunteer_leaderboard_rows'
    end;

    if coalesce(v_opts, '{}'::text[]) @> array['security_invoker=true']
       and to_regprocedure(format('kos_internal.%I()', v_fn)) is not null then
      continue;
    end if;

    v_def := pg_get_viewdef(to_regclass('public.' || v_name), true);
    v_def := regexp_replace(v_def, ';\s*$', '');

    if v_name = 'v_raffle_events_public' then
      v_filter := 'coalesce(q.audience, ''both'') <> ''internal'' or auth.uid() is not null';
    elsif v_name = 'v_raffle_baskets_public' then
      v_filter := $f$
        auth.uid() is not null
        or exists (
          select 1
          from public.raffle_events e
          where e.id = q.raffle_event_id
            and coalesce(e.audience, 'both') <> 'internal'
        )
      $f$;
    else
      -- Standings stay a signed-in hub view. Anon has no select on these.
      v_filter := 'true';
    end if;

    v_body := 'select * from (' || v_def || ') q where ' || v_filter;

    execute
      'create or replace function kos_internal.' || quote_ident(v_fn)
      || '() returns setof public.' || quote_ident(v_name)
      || ' language sql stable security definer set search_path to public as $fn$ '
      || v_body
      || ' $fn$';

    if v_name in ('v_season_leaderboard', 'v_volunteer_leaderboard') then
      execute format('revoke all on function kos_internal.%I() from public, anon, authenticated', v_fn);
      execute format('grant execute on function kos_internal.%I() to authenticated, service_role', v_fn);
    else
      execute format('revoke all on function kos_internal.%I() from public', v_fn);
      execute format(
        'grant execute on function kos_internal.%I() to anon, authenticated, service_role',
        v_fn
      );
    end if;

    execute format(
      'create or replace view public.%I as select * from kos_internal.%I()',
      v_name, v_fn
    );
    execute format('alter view public.%I set (security_invoker = true)', v_name);
  end loop;
end
$views$;

-- Directory and published-content views. Already security_invoker on the
-- dedicated project (member_directory is not granted to anon). Re-applying
-- is a no-op there. On an older database that still has the definer copies,
-- this makes the caller RLS apply instead of the view owner.
do $invoker$
declare
  v_name text;
begin
  foreach v_name in array array[
    'member_directory',
    'v_member_profiles',
    'v_public_events',
    'v_active_member_emails',
    'v_lapsed_member_emails',
    'v_officer_emails',
    'v_officer_member_directory',
    'v_officer_outstanding_dues',
    'v_outstanding_dues',
    'v_event_attendee_emails',
    'v_event_headcount',
    'v_event_outreach',
    'v_parade_ready',
    'v_pending_applications',
    'v_report_dues_summary',
    'v_report_membership',
    'v_secretary_engagement',
    'v_tartan_ball_avery_18660',
    'v_tartan_ball_caterer_counts',
    'v_tartan_ball_meal_jewel'
  ]
  loop
    if to_regclass('public.' || v_name) is null then
      continue;
    end if;
    execute format('alter view if exists public.%I set (security_invoker = true)', v_name);
  end loop;
end
$invoker$;

-- Keep the public raffle catalog readable. Do not grant anon the directory.
do $grants$
begin
  if to_regclass('public.v_raffle_events_public') is not null then
    execute 'grant select on public.v_raffle_events_public to anon, authenticated, service_role';
  end if;
  if to_regclass('public.v_raffle_baskets_public') is not null then
    execute 'grant select on public.v_raffle_baskets_public to anon, authenticated, service_role';
  end if;
end
$grants$;

-- ---------------------------------------------------------------------------
-- EXECUTE. Revoke anon (and public) on Krewe admin / officer SECURITY DEFINER
-- functions. Keep authenticated on the ones the signed-in hub calls.
-- Revoke authenticated on internal helpers, triggers, and service-role jobs.
-- ---------------------------------------------------------------------------

do $revoke$
declare
  r record;
  -- Intentionally callable without a login. Re-granted at the end so a
  -- name-prefix match cannot lock them by accident.
  public_keep text[] := array[
    'enter_basket_public',
    'buy_5050_public',
    'rsvp_to_event',
    'submit_membership_application',
    'submit_membership_full_application',
    'lookup_membership_full_application',
    'submit_volunteer_inquiry',
    'resolve_qr',
    'list_public_shop_products',
    'list_public_shop_vendors',
    'list_public_shop_vendor_looks',
    'volunteer_slot_summary',
    'claim_sponsorship',
    'hub_door_status'
  ];
  -- Not a hub RPC. Owner (and service_role) only.
  internal_only text[] := array[
    '_clover_request_member_id',
    '_officer_actor',
    '_rotate_published_videos',
    '_submitter_label',
    'content_items_force_media_pending',
    'kos_autolog_volunteer_hours',
    'kos_raffle_display_name',
    'kos_checkin_event_for_code',
    'kos_parade_soft_gate_block',
    'kos_membership_prospect_emails_enabled',
    'kos_credit_raffle_from_payment',
    'kos_find_raffle_for_payment',
    'kos_record_payment',
    'kos_claim_locker_from_payment',
    'kos_locker_payment_size',
    'enqueue_email',
    'send_dues_reminders',
    'award_dues_points',
    'award_signup_points',
    'grant_badge',
    'recompute_member_badges',
    'rls_auto_enable'
  ];
  -- Admin-shaped names that do not use the officer_ or kos_ prefix.
  -- Includes legacy Tribe Test names (set_raffle_active, get_raffle_admin)
  -- so a missing function is simply skipped.
  explicit_admin text[] := array[
    'add_basket',
    'add_basket_donation',
    'add_raffle_basket',
    'update_basket',
    'update_basket_donation',
    'delete_basket',
    'create_raffle',
    'update_raffle',
    'draw_5050_winner',
    'draw_basket_winner',
    'draw_winner',
    'set_raffle_active',
    'set_raffle_entry_paid',
    'get_raffle_admin',
    'get_raffle_settlement',
    'get_my_raffles',
    'get_my_raffle_summary',
    'list_basket_donations',
    'list_events_for_raffle_link',
    'enter_basket_as_member',
    'buy_5050_as_member',
    'can_manage_raffles',
    'can_manage_social_charity',
    'can_manage_events',
    'can_manage_shop',
    'can_view_payments',
    'can_review_applications',
    'can_review_volunteer_inquiries',
    'approve_member',
    'approve_clover_request',
    'approve_content_item',
    'approve_role_request',
    'decline_application',
    'deny_clover_request',
    'deny_content_item',
    'decide_volunteer_hours',
    'import_trackitforward_hours',
    'queue_broadcast',
    'send_all_krewe_message',
    'door_check_in',
    'meeting_check_in',
    'log_my_volunteer_hours',
    'member_parade_season',
    'publish_krewe_video',
    'submit_krewe_photo',
    'submit_clover_request',
    'list_my_clover_requests',
    'list_pending_clover_requests',
    'list_pending_media_approvals',
    'list_pending_volunteer_hours',
    'list_content_approval_log',
    'list_board_announcements',
    'list_all_krewe_messages',
    'list_membership_applications',
    'list_officer_approvals',
    'list_volunteer_inquiries',
    'list_recent_payments',
    'list_todays_birthdays',
    'search_craic_members',
    'get_craic_member_card',
    'get_member_game_card',
    'delete_shop_product',
    'upsert_shop_product',
    'attach_shop_zeffy_url',
    'discover_document',
    'update_my_member_profile',
    'complete_krewe_profile',
    'submit_role_request',
    'has_media_consent',
    'get_my_krewe_profile',
    'is_krewe_officer'
  ];
begin
  for r in
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prorettype = 'pg_catalog.trigger'::regtype as is_trigger
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname <> all (public_keep)
      and (
        p.proname like 'officer\_%'
        or p.proname like 'kos\_%'
        or p.proname = any (explicit_admin)
        or p.proname = any (internal_only)
      )
  loop
    execute format(
      'revoke all on function public.%I(%s) from public, anon',
      r.proname, r.args
    );

    if r.is_trigger or r.proname = any (internal_only) then
      execute format(
        'revoke all on function public.%I(%s) from authenticated',
        r.proname, r.args
      );
      execute format(
        'grant execute on function public.%I(%s) to service_role',
        r.proname, r.args
      );
    else
      execute format(
        'grant execute on function public.%I(%s) to authenticated, service_role',
        r.proname, r.args
      );
    end if;
  end loop;

  for r in
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (public_keep)
  loop
    execute format(
      'grant execute on function public.%I(%s) to anon, authenticated, service_role',
      r.proname, r.args
    );
  end loop;
end
$revoke$;

do $assert$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'draw_5050_winner', 'draw_basket_winner', 'delete_basket',
        'set_raffle_active', 'get_raffle_admin', 'update_raffle',
        'add_basket', 'create_raffle'
      )
      and has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'anon can still execute an admin raffle function';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'enter_basket_public'
  ) and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'enter_basket_public'
      and has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'anon lost execute on enter_basket_public';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'buy_5050_public'
  ) and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'buy_5050_public'
      and has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'anon lost execute on buy_5050_public';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'v_raffle_events_public', 'v_raffle_baskets_public',
        'v_season_leaderboard', 'v_volunteer_leaderboard',
        'member_directory', 'v_member_profiles'
      )
      and not (coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true'])
  ) then
    raise exception 'a Krewe directory or raffle view is still security definer';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
