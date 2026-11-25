-- NOT APPLIED. Apply only after Melissa approves, in the same release as this code.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Safe to run again. Applying this file does not send email and does not
--   change existing member rows.
--
-- Ship this file with the Hub that calls kos_lapse_candidates, kos_mark_lapsed,
-- kos_start_reactivation, kos_get_lapse_date, and kos_set_lapse_date. The Hub
-- hides those buttons when PostgREST returns PGRST202, so a deploy before this
-- SQL does not break Renewals.
--
-- What this file does:
--   * pending-renewal can no longer be approved in Membership Applications.
--     Paying dues (Zeffy, or Officer desk Renewals, Mark renewed) is what
--     makes a returning member active.
--   * Start background check is refused until the full application IDs are in.
--   * Officers can set a lapse date, mark active unpaid members lapsed on or
--     after that date, and send a reactivation link that moves them to
--     pending-renewal (shown in the Hub as Pending dues).
--   * A lapsed member who picks a level on the Renew card gets the same
--     unpaid reactivation row.
--   * Joining packet preview can pass membership_level so Auxiliary uses the
--     real email builder.
--   * kos_is_dues_exempt is the only exempt rule. kos_renewal_rows,
--     kos_lapse_candidates, and kos_mark_lapsed all use it. Dues are due
--     June 1. The default delinquent date is July 1. The default inactive
--     date is July 16. After that the member must reapply.
--
-- Rollback, in the SQL editor, only if no lapsed or reactivation_sent history
-- rows need to stay valid:
--   1. Paste the _apply_membership_application_decision block from
--      sql/kos_renewal_approve_no_welcome.sql and run it.
--   2. Paste the kos_choose_renewal_level block and the kos_renewal_rows
--      block from sql/kos_dues_renewal.sql and run them.
--   3. Paste the preview_joining_packet_email block from
--      sql/kos_joining_packet_email_template.sql and run it.
--   4. Drop the new functions and kos_dues_settings listed at the bottom of
--      this file. Put the previous action check back only when no row uses
--      lapsed or reactivation_sent.

-- ---------------------------------------------------------------------------
-- 1) History actions. Keep every live value, and add the two new ones.
-- ---------------------------------------------------------------------------
alter table public.membership_application_actions
  drop constraint if exists membership_application_actions_action_check;
alter table public.membership_application_actions
  add constraint membership_application_actions_action_check
  check (action in (
    'approve', 'decline', 'archive',
    'background_check', 'background_check_paid', 'start_background_check',
    'dues_pending', 'dues_paid',
    'next_step_sent',
    'full_application_sent', 'full_application_received', 'id_revealed',
    'note', 'renewed',
    'level_set', 'background_check_fee_included',
    'lapsed', 'reactivation_sent', 'inactivated'
  ));

-- Live values are the ten from sql/kos_dues_foundation.sql. The two new
-- types are what kos_mark_lapsed and kos_start_reactivation write.
alter table public.kos_dues_events
  drop constraint if exists kos_dues_events_event_type_check;
alter table public.kos_dues_events
  add constraint kos_dues_events_event_type_check
  check (event_type in (
    'invoice_created',
    'invoice_emailed',
    'payment_recorded',
    'waiver_requested',
    'waiver_approved',
    'waiver_denied',
    'waiver_applied',
    'voided',
    'level_set',
    'officer_exemptions_batch',
    'member_lapsed',
    'reactivation_started',
    'member_inactivated'
  ));

-- ---------------------------------------------------------------------------
-- 2) Bylaws dates. Dues are due June 1. Unpaid on July 1 is delinquent.
--    After July 16 the member can be marked inactive and must reapply.
--    Officers can edit either date for a season. Defaults live here.
-- ---------------------------------------------------------------------------
create table if not exists public.kos_dues_settings (
  membership_year integer primary key,
  delinquent_on date,
  inactive_on date,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.kos_dues_settings add column if not exists delinquent_on date;
alter table public.kos_dues_settings add column if not exists inactive_on date;
alter table public.kos_dues_settings drop column if exists lapse_on;

update public.kos_dues_settings
   set delinquent_on = coalesce(delinquent_on, make_date(membership_year, 7, 1)),
       inactive_on = coalesce(inactive_on, make_date(membership_year, 7, 16))
 where delinquent_on is null or inactive_on is null;

alter table public.kos_dues_settings alter column delinquent_on set not null;
alter table public.kos_dues_settings alter column inactive_on set not null;

alter table public.kos_dues_settings enable row level security;
revoke all on table public.kos_dues_settings from public, anon, authenticated;

comment on table public.kos_dues_settings is
  'Per-season delinquent and inactive dates. No client policies. Officers read and write them through kos_get_dues_dates and kos_set_dues_date.';

create or replace function public.kos_default_delinquent_on(p_year integer)
returns date
language sql
immutable
set search_path = public
as $$
  select make_date(p_year, 7, 1);
$$;

create or replace function public.kos_default_inactive_on(p_year integer)
returns date
language sql
immutable
set search_path = public
as $$
  select make_date(p_year, 7, 16);
$$;

comment on function public.kos_default_delinquent_on(integer) is
  'Default delinquent date: July 1 of the season start year.';
comment on function public.kos_default_inactive_on(integer) is
  'Default inactive date: July 16 of the season start year. After this date a delinquent member must reapply.';

revoke all on function public.kos_default_delinquent_on(integer) from public, anon, authenticated;
revoke all on function public.kos_default_inactive_on(integer) from public, anon, authenticated;

create or replace function public.kos_dues_delinquent_on(p_year integer)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.delinquent_on from public.kos_dues_settings s where s.membership_year = p_year),
    public.kos_default_delinquent_on(p_year)
  );
$$;

create or replace function public.kos_dues_inactive_on(p_year integer)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.inactive_on from public.kos_dues_settings s where s.membership_year = p_year),
    public.kos_default_inactive_on(p_year)
  );
$$;

revoke all on function public.kos_dues_delinquent_on(integer) from public, anon, authenticated;
revoke all on function public.kos_dues_inactive_on(integer) from public, anon, authenticated;

drop function if exists public.kos_get_lapse_date(integer);
drop function if exists public.kos_set_lapse_date(integer, date);
drop function if exists public.kos_default_lapse_date(integer);

create or replace function public.kos_get_dues_dates(p_year integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_dates$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
  v_delinquent date := public.kos_dues_delinquent_on(v_year);
  v_inactive date := public.kos_dues_inactive_on(v_year);
  v_today date := (timezone('America/New_York', now()))::date;
begin
  if not public.kos_can_manage_renewals() then
    return jsonb_build_object('ok', false, 'message', 'Renewals are for the Membership Chair, Treasurer, President, or an admin.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'year', v_year,
    'delinquent_on', v_delinquent,
    'inactive_on', v_inactive,
    'can_mark_delinquent', v_today >= v_delinquent,
    'can_mark_inactive', v_today >= v_inactive
  );
end;
$get_dates$;

comment on function public.kos_get_dues_dates(integer) is
  'Membership Chair, Treasurer, President, and site admins. Delinquent and inactive dates for the season.';

revoke all on function public.kos_get_dues_dates(integer) from public, anon;
grant execute on function public.kos_get_dues_dates(integer) to authenticated;

create or replace function public.kos_set_dues_date(p_year integer, p_kind text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_date$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_actor record;
  v_by text;
  v_delinquent date;
  v_inactive date;
  v_today date := (timezone('America/New_York', now()))::date;
begin
  if not public.kos_can_manage_renewals() then
    return jsonb_build_object('ok', false, 'message', 'Renewals are for the Membership Chair, Treasurer, President, or an admin.');
  end if;
  if v_kind not in ('delinquent', 'inactive') then
    return jsonb_build_object('ok', false, 'message', 'Choose the delinquent date or the inactive date.');
  end if;
  if p_date is null then
    return jsonb_build_object('ok', false, 'message', 'Choose a date.');
  end if;
  v_delinquent := public.kos_dues_delinquent_on(v_year);
  v_inactive := public.kos_dues_inactive_on(v_year);
  if v_kind = 'delinquent' then
    v_delinquent := p_date;
  else
    v_inactive := p_date;
  end if;
  select * into v_actor from public._officer_actor();
  v_by := nullif(btrim(coalesce(v_actor.email, v_actor.display_name, '')), '');
  insert into public.kos_dues_settings (membership_year, delinquent_on, inactive_on, updated_at, updated_by)
  values (v_year, v_delinquent, v_inactive, now(), v_by)
  on conflict (membership_year) do update
    set delinquent_on = excluded.delinquent_on,
        inactive_on = excluded.inactive_on,
        updated_at = now(),
        updated_by = excluded.updated_by;
  return jsonb_build_object(
    'ok', true,
    'year', v_year,
    'delinquent_on', v_delinquent,
    'inactive_on', v_inactive,
    'can_mark_delinquent', v_today >= v_delinquent,
    'can_mark_inactive', v_today >= v_inactive,
    'message', 'Date saved.'
  );
end;
$set_date$;

comment on function public.kos_set_dues_date(integer, text, date) is
  'Membership Chair, Treasurer, President, and site admins. Saves the delinquent or inactive date for one season. Does not change member status and does not send email.';

revoke all on function public.kos_set_dues_date(integer, text, date) from public, anon;
grant execute on function public.kos_set_dues_date(integer, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Who is exempt from dues. One helper. kos_renewal_rows,
--    kos_lapse_candidates, and kos_mark_lapsed all use it.
--    Only an elected officer title (President, Vice President, Secretary,
--    or Treasurer), a paid row, or an applied waiver. Board, captains,
--    and committee chairs owe dues. There is no member_role test.
-- ---------------------------------------------------------------------------
create or replace function public.kos_is_dues_exempt(p_member_id uuid, p_year integer)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $exempt$
declare
  v_title text;
begin
  select m.officer_title
    into v_title
    from public.members m
   where m.id = p_member_id;
  if not found then
    return true;
  end if;
  -- Bylaws Section 3. Only President, Vice President, Secretary, and
  -- Treasurer. kos_is_elected_officer_title matches those four as a whole
  -- title segment, split on the middle dot the site uses between titles.
  if to_regprocedure('public.kos_is_elected_officer_title(text)') is not null
     and public.kos_is_elected_officer_title(v_title) then
    return true;
  end if;
  if exists (
    select 1
      from public.dues_payments d
     where d.member_id = p_member_id
       and d.membership_year = p_year
       and (d.paid = true or coalesce(d.waiver_status, '') = 'applied')
  ) then
    return true;
  end if;
  return false;
end;
$exempt$;

comment on function public.kos_is_dues_exempt(uuid, integer) is
  'Internal. The only dues exempt rule. Elected officer title (President, Vice President, Secretary, Treasurer), or a paid or applied-waiver row for the year.';

revoke all on function public.kos_is_dues_exempt(uuid, integer) from public, anon, authenticated;

-- Same list as before, with the exempt rule moved into kos_is_dues_exempt.
create or replace function public.kos_renewal_rows(p_year integer default null)
returns table (
  member_id uuid,
  first_name text,
  last_name text,
  email text,
  membership_status text,
  membership_level text,
  partner_name text,
  last_paid_year integer,
  amount numeric,
  zeffy_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
begin
  return query
  select
    m.id,
    m.first_name,
    m.last_name,
    lower(m.email),
    m.membership_status,
    coalesce(m.membership_level, 'full'),
    nullif(btrim(coalesce(partner.first_name, '') || ' ' || coalesce(partner.last_name, '')), ''),
    (
      select d.membership_year
        from public.dues_payments d
       where d.member_id = m.id
         and d.paid
       order by d.membership_year desc
       limit 1
    ),
    coalesce(c.amount, public.kos_dues_fallback_amount(coalesce(m.membership_level, 'full'))),
    c.zeffy_url
  from public.members m
  left join public.kos_dues_catalog c
    on c.membership_year = v_year
   and c.level = coalesce(m.membership_level, 'full')
   and c.active
  left join public.members partner
    on partner.id = public.kos_linked_partner_id(m.id)
  where m.merged_into is null
    and coalesce(m.membership_status, '') in ('active', 'lapsed', 'pending-renewal')
    and not public.kos_is_dues_exempt(m.id, v_year)
  order by m.last_name, m.first_name;
end;
$$;

comment on function public.kos_renewal_rows(integer) is
  'Internal. Active, lapsed, and pending-renewal members who are not kos_is_dues_exempt for the season. Not granted to the browser.';

revoke all on function public.kos_renewal_rows(integer) from public, anon, authenticated;

create or replace function public._kos_is_lapse_candidate(p_member_id uuid, p_year integer)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $candidate$
declare
  v_status text;
  v_merged uuid;
  v_joined date;
begin
  select m.membership_status, m.merged_into, m.join_date
    into v_status, v_merged, v_joined
    from public.members m
   where m.id = p_member_id;
  if not found or v_merged is not null then
    return false;
  end if;
  if lower(coalesce(v_status, '')) <> 'active' then
    return false;
  end if;
  if public.kos_is_dues_exempt(p_member_id, p_year) then
    return false;
  end if;
  -- Inducted this season, or no join date, stays active.
  if v_joined is null or v_joined >= make_date(p_year, 6, 1) then
    return false;
  end if;
  return true;
end;
$candidate$;

comment on function public._kos_is_lapse_candidate(uuid, integer) is
  'Internal. Active, not merged, not exempt, joined before June 1 of the season year.';

revoke all on function public._kos_is_lapse_candidate(uuid, integer) from public, anon, authenticated;

create or replace function public._kos_exemptions_missing(p_year integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.members m
   where m.merged_into is null
     and public.kos_is_elected_officer_title(m.officer_title)
     and not exists (
       select 1
         from public.dues_payments d
        where d.member_id = m.id
          and d.membership_year = p_year
          and d.waiver_status = 'applied'
          and d.waiver_kind = 'elected_officer'
     );
$$;

comment on function public._kos_exemptions_missing(integer) is
  'Internal. Count of elected officers with no applied elected_officer waiver for the year. Names are not returned.';

revoke all on function public._kos_exemptions_missing(integer) from public, anon, authenticated;

create or replace function public.kos_lapse_candidates(p_year integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $rows$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
  v_on date;
  v_today boolean;
  v_missing integer;
  v_members jsonb;
begin
  if not public.kos_can_manage_renewals() then
    return jsonb_build_object('ok', false, 'message', 'Renewals are for the Membership Chair, Treasurer, President, or an admin.');
  end if;
  v_on := public.kos_dues_delinquent_on(v_year);
  v_today := (timezone('America/New_York', now()))::date >= v_on;
  v_missing := public._kos_exemptions_missing(v_year);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'member_id', m.id,
    'first_name', m.first_name,
    'last_name', m.last_name,
    'email', lower(m.email),
    'membership_status', m.membership_status,
    'membership_level', coalesce(m.membership_level, 'full'),
    'lapse_on', v_on,
    'can_lapse_today', v_today,
    'exemptions_missing', v_missing
  ) order by m.last_name, m.first_name), '[]'::jsonb)
    into v_members
    from public.members m
   where public._kos_is_lapse_candidate(m.id, v_year);
  return jsonb_build_object(
    'ok', true,
    'year', v_year,
    'lapse_on', v_on,
    'can_lapse_today', v_today,
    'exemptions_missing', v_missing,
    'count', coalesce(jsonb_array_length(v_members), 0),
    'members', v_members
  );
end;
$rows$;

comment on function public.kos_lapse_candidates(integer) is
  'Membership Chair, Treasurer, President, and site admins. Active members who would lapse. Each row repeats lapse_on, can_lapse_today, and exemptions_missing. Does not change rows and does not send email.';

revoke all on function public.kos_lapse_candidates(integer) from public, anon;
grant execute on function public.kos_lapse_candidates(integer) to authenticated;

create or replace function public.kos_mark_lapsed(p_member_ids uuid[], p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $mark$
declare
  v_year integer := public.kos_dues_season_year();
  v_on date;
  v_actor record;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
  v_id uuid;
  v_lapsed integer := 0;
  v_skipped integer := 0;
begin
  if not public.kos_can_manage_renewals() then
    return jsonb_build_object('ok', false, 'message', 'Renewals are for the Membership Chair, Treasurer, President, or an admin.');
  end if;
  v_on := public.kos_dues_delinquent_on(v_year);
  if (timezone('America/New_York', now()))::date < v_on then
    return jsonb_build_object(
      'ok', false,
      'lapsed', 0,
      'skipped', 0,
      'message', 'Mark delinquent is available on ' || to_char(v_on, 'FMMonth FMDD, YYYY') || '.'
    );
  end if;

  select * into v_actor from public._officer_actor();

  foreach v_id in array coalesce(p_member_ids, array[]::uuid[])
  loop
    if v_id is not null then
      perform 1
        from public.members m
       where m.id = v_id
       for update;
    end if;
    if v_id is null or not public._kos_is_lapse_candidate(v_id, v_year) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    update public.members
       set membership_status = 'lapsed',
           updated_at = now()
     where id = v_id
       and merged_into is null
       and lower(coalesce(membership_status, '')) = 'active';
    if not found then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.membership_application_actions (
      member_id, action, note, from_status, to_status,
      actor_uid, actor_email, actor_name
    ) values (
      v_id, 'lapsed', v_note, 'active', 'lapsed',
      v_actor.uid, v_actor.email, v_actor.display_name
    );
    if to_regprocedure('public.kos_log_dues_event(text,uuid,integer,jsonb)') is not null then
      perform public.kos_log_dues_event(
        'member_lapsed',
        v_id,
        v_year,
        jsonb_build_object('note', v_note, 'lapse_on', v_on)
      );
    elsif to_regclass('public.kos_dues_events') is not null then
      insert into public.kos_dues_events (event_type, actor, member_id, membership_year, payload)
      values (
        'member_lapsed',
        coalesce(v_actor.email, v_actor.display_name, 'officer'),
        v_id,
        v_year,
        jsonb_build_object('note', v_note, 'lapse_on', v_on)
      );
    end if;
    v_lapsed := v_lapsed + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'lapsed', v_lapsed,
    'skipped', v_skipped,
    'message', v_lapsed::text || ' marked lapsed. ' || v_skipped::text || ' skipped. No email was sent.'
  );
end;
$mark$;

comment on function public.kos_mark_lapsed(uuid[], text) is
  'Membership Chair, Treasurer, President, and site admins. On or after the lapse date, sets qualifying active members to lapsed. Skips anyone who no longer qualifies. No email.';

revoke all on function public.kos_mark_lapsed(uuid[], text) from public, anon;
grant execute on function public.kos_mark_lapsed(uuid[], text) to authenticated;

create or replace function public.kos_mark_inactive(p_member_ids uuid[], p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $inactive$
declare
  v_year integer := public.kos_dues_season_year();
  v_on date := public.kos_dues_inactive_on(v_year);
  v_actor record;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
  v_id uuid;
  v_status text;
  v_count integer := 0;
  v_skipped integer := 0;
begin
  if not public.kos_can_manage_renewals() then
    return jsonb_build_object('ok', false, 'message', 'Renewals are for the Membership Chair, Treasurer, President, or an admin.');
  end if;
  if (timezone('America/New_York', now()))::date < v_on then
    return jsonb_build_object(
      'ok', false,
      'inactivated', 0,
      'skipped', 0,
      'message', 'Mark inactive is available on ' || to_char(v_on, 'FMMonth FMDD, YYYY') || '.'
    );
  end if;
  select * into v_actor from public._officer_actor();
  foreach v_id in array coalesce(p_member_ids, array[]::uuid[])
  loop
    select m.membership_status into v_status
      from public.members m
     where m.id = v_id
       and m.merged_into is null
     for update;
    if not found
       or lower(coalesce(v_status, '')) not in ('lapsed', 'pending-renewal')
       or public.kos_is_dues_exempt(v_id, v_year) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    update public.members
       set membership_status = 'inactive',
           updated_at = now()
     where id = v_id
       and lower(coalesce(membership_status, '')) in ('lapsed', 'pending-renewal');
    if not found then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.membership_application_actions (
      member_id, action, note, from_status, to_status,
      actor_uid, actor_email, actor_name
    ) values (
      v_id, 'inactivated', v_note, v_status, 'inactive',
      v_actor.uid, v_actor.email, v_actor.display_name
    );
    if to_regprocedure('public.kos_log_dues_event(text,uuid,integer,jsonb)') is not null then
      perform public.kos_log_dues_event(
        'member_inactivated', v_id, v_year, jsonb_build_object('note', v_note, 'inactive_on', v_on)
      );
    end if;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object(
    'ok', true,
    'inactivated', v_count,
    'skipped', v_skipped,
    'message', v_count::text || ' marked inactive. ' || v_skipped::text || ' skipped. No email was sent.'
  );
end;
$inactive$;

comment on function public.kos_mark_inactive(uuid[], text) is
  'Membership Chair, Treasurer, President, and site admins. On or after the inactive date, sets unpaid lapsed or pending-renewal members to inactive. No email.';

revoke all on function public.kos_mark_inactive(uuid[], text) from public, anon;
grant execute on function public.kos_mark_inactive(uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Reactivation. Lapsed only, and only before the inactive date.
--    A paid row or an applied waiver is left alone.
-- ---------------------------------------------------------------------------
create or replace function public._kos_reactivate_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $one$
declare
  v_year integer := public.kos_dues_season_year();
  v_member record;
  v_actor record;
  v_quote jsonb;
  v_level text;
  v_amount numeric;
  v_url text;
  v_dues_id uuid;
begin
  if p_member_id is null then
    return false;
  end if;
  select m.id, m.membership_status, m.membership_level, m.merged_into
    into v_member
    from public.members m
   where m.id = p_member_id
   for update;
  if not found or v_member.merged_into is not null then
    return false;
  end if;
  if lower(coalesce(v_member.membership_status, '')) <> 'lapsed' then
    return false;
  end if;
  if (timezone('America/New_York', now()))::date >= public.kos_dues_inactive_on(v_year) then
    return false;
  end if;
  if exists (
    select 1
      from public.dues_payments d
     where d.member_id = p_member_id
       and d.membership_year = v_year
       and (d.paid = true or coalesce(d.waiver_status, '') = 'applied')
  ) then
    return false;
  end if;

  v_quote := public.kos_dues_quote(v_year, coalesce(v_member.membership_level, 'full'));
  v_level := coalesce(nullif(v_quote->>'level', ''), coalesce(v_member.membership_level, 'full'));
  v_amount := coalesce((v_quote->>'amount')::numeric, public.kos_dues_fallback_amount(v_level));
  v_url := nullif(btrim(v_quote->>'zeffy_url'), '');

  insert into public.dues_payments (
    member_id, membership_year, amount, due_date, paid,
    membership_level, standard_amount, zeffy_campaign_key, notes
  ) values (
    p_member_id, v_year, v_amount, public.kos_dues_invoice_due_date(), false,
    v_level, v_amount, v_url, 'Reactivation invoice.'
  )
  on conflict (member_id, membership_year) do update
    set amount = excluded.amount,
        due_date = excluded.due_date,
        membership_level = excluded.membership_level,
        standard_amount = excluded.standard_amount,
        zeffy_campaign_key = coalesce(excluded.zeffy_campaign_key, public.dues_payments.zeffy_campaign_key),
        notes = case
          when coalesce(public.dues_payments.notes, '') ilike '%Reactivation invoice.%' then public.dues_payments.notes
          when coalesce(public.dues_payments.notes, '') = '' then 'Reactivation invoice.'
          else public.dues_payments.notes || E'\n' || 'Reactivation invoice.'
        end
  where public.dues_payments.paid = false
    and coalesce(public.dues_payments.waiver_status, '') <> 'applied'
  returning id into v_dues_id;

  if v_dues_id is null then
    return false;
  end if;

  update public.members
     set membership_status = 'pending-renewal',
         updated_at = now()
   where id = p_member_id
     and lower(coalesce(membership_status, '')) = 'lapsed';
  if not found then
    return false;
  end if;

  select * into v_actor from public._officer_actor();
  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    p_member_id,
    'reactivation_sent',
    'Reactivation invoice.',
    'lapsed',
    'pending-renewal',
    v_actor.uid, v_actor.email, v_actor.display_name
  );
  if to_regprocedure('public.kos_log_dues_event(text,uuid,integer,jsonb)') is not null then
    perform public.kos_log_dues_event(
      'reactivation_started',
      p_member_id,
      v_year,
      jsonb_build_object('dues_payment_id', v_dues_id, 'membership_level', v_level, 'amount', v_amount)
    );
  elsif to_regclass('public.kos_dues_events') is not null then
    insert into public.kos_dues_events (event_type, actor, member_id, membership_year, payload)
    values (
      'reactivation_started',
      coalesce(v_actor.email, v_actor.display_name, 'officer'),
      p_member_id,
      v_year,
      jsonb_build_object('dues_payment_id', v_dues_id, 'membership_level', v_level, 'amount', v_amount)
    );
  end if;
  return true;
end;
$one$;

comment on function public._kos_reactivate_member(uuid) is
  'Internal. Lapsed member only. Upserts an unpaid dues row and sets pending-renewal. Does not touch a paid row or an applied waiver. No email.';

revoke all on function public._kos_reactivate_member(uuid) from public, anon, authenticated;

create or replace function public.kos_start_reactivation(p_member_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $start$
declare
  v_id uuid;
  v_started integer := 0;
  v_skipped integer := 0;
begin
  if not public.kos_can_manage_renewals() then
    return jsonb_build_object('ok', false, 'message', 'Renewals are for the Membership Chair, Treasurer, President, or an admin.');
  end if;
  if (timezone('America/New_York', now()))::date >= public.kos_dues_inactive_on(public.kos_dues_season_year()) then
    return jsonb_build_object(
      'ok', false,
      'started', 0,
      'skipped', coalesce(cardinality(p_member_ids), 0),
      'message', 'Reactivation is closed. After the inactive date a member must submit a new application.'
    );
  end if;
  foreach v_id in array coalesce(p_member_ids, array[]::uuid[])
  loop
    if public._kos_reactivate_member(v_id) then
      v_started := v_started + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'ok', true,
    'started', v_started,
    'skipped', v_skipped,
    'message', v_started::text || ' set to pending dues. ' || v_skipped::text || ' skipped.'
  );
end;
$start$;

comment on function public.kos_start_reactivation(uuid[]) is
  'Membership Chair, Treasurer, President, and site admins. Lapsed members only. Unpaid reactivation invoice and pending-renewal. No email. Call this after the reactivation letter is queued.';

revoke all on function public.kos_start_reactivation(uuid[]) from public, anon;
grant execute on function public.kos_start_reactivation(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Full application IDs. Start background check waits for these.
-- ---------------------------------------------------------------------------
create or replace function public._kos_application_ids_ready(p_member_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $ids$
declare
  rec public.members%rowtype;
  v_couple boolean := false;
  v_has_ssn boolean := false;
  v_has_dl boolean := false;
  v_has_partner_ssn boolean := false;
  v_has_partner_dl boolean := false;
begin
  select * into rec
    from public.members
   where id = p_member_id
     and merged_into is null;
  if not found then
    return false;
  end if;
  v_couple := lower(btrim(coalesce(rec.application_fee_type, ''))) in ('dual', 'couple')
    or nullif(btrim(coalesce(rec.partner_first_name, '') || ' ' || coalesce(rec.partner_last_name, '')), '') is not null;
  select
    exists (
      select 1 from public.membership_application_ids i
       where i.member_id = rec.id and i.person_slot = 'applicant' and i.id_kind = 'ssn'
    ),
    exists (
      select 1 from public.membership_application_ids i
       where i.member_id = rec.id and i.person_slot = 'applicant' and i.id_kind = 'dl'
    ),
    exists (
      select 1 from public.membership_application_ids i
       where i.member_id = rec.id and i.person_slot = 'partner' and i.id_kind = 'ssn'
    ),
    exists (
      select 1 from public.membership_application_ids i
       where i.member_id = rec.id and i.person_slot = 'partner' and i.id_kind = 'dl'
    )
    into v_has_ssn, v_has_dl, v_has_partner_ssn, v_has_partner_dl;
  if not (v_has_ssn and v_has_dl) then
    return false;
  end if;
  if v_couple and not (v_has_partner_ssn and v_has_partner_dl) then
    return false;
  end if;
  return true;
end;
$ids$;

comment on function public._kos_application_ids_ready(uuid) is
  'Internal. Applicant SSN and driver license are on file. A couple also needs the partner SSN and driver license.';

revoke all on function public._kos_application_ids_ready(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Application decisions. Same branches as
--    sql/kos_renewal_approve_no_welcome.sql, except:
--    approve of pending-renewal changes nothing, and start_background_check
--    waits for the full application. Welcome email still queues only from
--    dues-pending. Decline and archive of a pending-renewal row still run.
-- ---------------------------------------------------------------------------
create or replace function public._apply_membership_application_decision(
  p_member_id uuid,
  p_action text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $decision$
declare
  rec public.members%rowtype;
  v_actor record;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
  v_role text;
  v_to text;
  v_subject text;
  v_html text;
  v_name text;
  v_emailed boolean := false;
  v_message text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if p_action not in ('approve', 'decline', 'archive', 'background_check', 'start_background_check', 'dues_pending', 'next_step_sent') then
    return jsonb_build_object('ok', false, 'message', 'That action is not available.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing application.');
  end if;

  select * into rec
  from public.members
  where id = p_member_id
  for update;

  if not found or rec.merged_into is not null then
    return jsonb_build_object('ok', false, 'message', 'That application was not found.');
  end if;
  if rec.membership_status not in (
    'pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending', 'pending-renewal', 'prospect'
  ) then
    return jsonb_build_object('ok', false, 'message', 'That application is no longer waiting for review.');
  end if;

  -- Approve does not review pending-renewal. Decline and archive still do.
  if p_action = 'approve' and rec.membership_status = 'pending-renewal' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Renewals are automatic when dues are paid. For cash or check, use Officer desk, Renewals, Mark renewed.'
    );
  end if;
  if p_action = 'approve' and rec.membership_status not in (
    'pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending', 'prospect'
  ) then
    return jsonb_build_object('ok', false, 'message', 'That application is no longer waiting for review.');
  end if;

  if p_action = 'start_background_check' and not public._kos_application_ids_ready(rec.id) then
    return jsonb_build_object(
      'ok', false,
      'message', 'The full application is not in yet. Start the background check after they submit it.'
    );
  end if;

  select * into v_actor from public._officer_actor();

  if p_action = 'approve' then
    v_to := 'active';
    v_role := rec.member_role;
    if v_role is null or btrim(v_role) = '' or lower(v_role) in ('prospect', 'pending') then
      v_role := 'member';
    end if;
    update public.members
       set membership_status = 'active',
           member_role = v_role,
           join_date = coalesce(join_date, (timezone('America/New_York', now()))::date),
           updated_at = now()
     where id = rec.id;
    if to_regprocedure('public.kos_sync_roster_role_grants(uuid)') is not null then
      perform public.kos_sync_roster_role_grants(rec.id);
    end if;
  elsif p_action = 'decline' then
    v_to := 'declined';
    update public.members
       set membership_status = 'declined',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'archive' then
    v_to := 'archived';
    update public.members
       set membership_status = 'archived',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'background_check' then
    v_to := 'background-check';
    update public.members
       set membership_status = 'background-check',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'start_background_check' then
    v_to := 'bg_in_process';
    update public.members
       set membership_status = 'bg_in_process',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'dues_pending' then
    v_to := 'dues-pending';
    update public.members
       set membership_status = 'dues-pending',
           updated_at = now()
     where id = rec.id;
  else
    v_to := rec.membership_status;
  end if;

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, p_action, v_note, rec.membership_status, v_to,
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  v_name := btrim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, ''));

  if p_action = 'approve' and rec.membership_status = 'dues-pending' then
    v_subject := 'Welcome to the Krewe of Shamrock';
    v_html :=
      '<p>Dear ' || public.kos_html_text(coalesce(nullif(btrim(rec.first_name), ''), 'friend')) || ',</p>'
      || '<p>Welcome. Your membership is approved, subject to final ratification by the Board of Directors, and you are on the roster.</p>'
      || '<p>To use the Member Hub, create your login with the same email you put on the application ('
      || public.kos_html_text(coalesce(rec.email, '')) || '):</p>'
      || '<ol>'
      || '<li>Open the Member Hub at <a href="https://www.kreweofshamrock.com/members.html">kreweofshamrock.com/members.html</a>.</li>'
      || '<li>Tap <strong>Create or reset your password</strong>.</li>'
      || '<li>Enter that email. We will send you a secure link. The same link works for a first password or a reset.</li>'
      || '<li>Open the link on your device and choose a password of at least 8 characters.</li>'
      || '<li>Come back and sign in with that email and password.</li>'
      || '</ol>'
      || '<p>Signing up with this email links your login to your membership. Old Wild Apricot passwords do not work here.</p>'
      || '<p>When you are signed in, watch the member website training video: '
      || '<a href="https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR">Member Hub training</a>.</p>'
      || '<p>Questions: <a href="mailto:secretary@kreweofshamrock.com">secretary@kreweofshamrock.com</a>.</p>'
      || '<p>Sláinte!</p>';
    if to_regprocedure('public.wrap_all_krewe_email_html(text,text)') is not null then
      v_html := public.wrap_all_krewe_email_html(v_subject, v_html);
    end if;
    if public.enqueue_email(
      rec.email,
      nullif(v_name, ''),
      v_subject,
      v_html,
      'membership_welcome',
      rec.id
    ) is not null then
      v_emailed := true;
    end if;
    if v_emailed then
      v_message := 'Approved. They are an active member now. We emailed a welcome note with the Member Hub login steps and the training video: https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR';
    else
      v_message := 'Approved. They are an active member now. We could not email them, so please tell them the next step: open the Member Hub, tap Create or reset your password, and use the email on this application. The training video is https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR';
    end if;
  elsif p_action = 'approve' then
    v_message := 'Approved. They are an active member again. They can sign in with the Member Hub login they already use.';
  elsif p_action = 'decline' then
    v_message := 'Declined. Their record stays on file and is off the new-application list. Nothing was deleted.';
  elsif p_action = 'archive' then
    v_message := 'Withdrawn. Their record stays on file and is off the new-application list. Nothing was deleted.';
  elsif p_action = 'background_check' then
    v_message := 'Called. The background check email is the next message.';
  elsif p_action = 'start_background_check' then
    v_message := 'Background check in process. Copy the driver''s license and Social Security number into the background check site. No email was sent.';
  elsif p_action = 'dues_pending' then
    v_message := 'Induction pending. The dues link and the meeting invitation are the next email.';
  else
    v_message := 'Next step sent. The note is on the application history.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', v_message,
    'emailed', v_emailed,
    'status', v_to
  );
end;
$decision$;

revoke all on function public._apply_membership_application_decision(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Member picks a level. Same as sql/kos_dues_renewal.sql, then a lapsed
--    caller (and a lapsed partner when asked) gets the reactivation invoice.
-- ---------------------------------------------------------------------------
create or replace function public.kos_choose_renewal_level(
  p_level text,
  p_include_partner boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_level text := lower(btrim(coalesce(p_level, '')));
  v_from text;
  v_status text;
  v_year integer := public.kos_dues_season_year();
  v_partner uuid;
  v_partner_status text;
  v_url text;
  v_partner_updated boolean := false;
  v_reactivated boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to choose a level.');
  end if;
  v_id := public.kos_current_member_id();
  if v_id is null then
    return jsonb_build_object('ok', false, 'message', 'Your login is not linked to a roster row yet.');
  end if;
  if v_level not in ('full', 'associate', 'loa', 'auxiliary') then
    return jsonb_build_object('ok', false, 'message', 'Choose Full, Associate, Leave of absence, or Auxiliary.');
  end if;

  if exists (
    select 1 from public.dues_payments d
     where d.member_id = v_id
       and d.membership_year = v_year
       and d.paid
  ) then
    return jsonb_build_object(
      'ok', true,
      'already_paid', true,
      'membership_level', v_level,
      'message', 'You are already paid for the ' || v_year::text || '-' || right((v_year + 1)::text, 2) || ' season.'
    );
  end if;

  select m.membership_level, m.membership_status
    into v_from, v_status
    from public.members m
   where m.id = v_id
     and m.merged_into is null;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Your roster row was not found.');
  end if;
  if lower(coalesce(v_status, '')) = 'inactive' then
    return jsonb_build_object('ok', false, 'message', 'Your membership is inactive. To rejoin, submit a new membership application.');
  end if;
  if lower(coalesce(v_status, '')) = 'lapsed'
     and (timezone('America/New_York', now()))::date >= public.kos_dues_inactive_on(v_year) then
    return jsonb_build_object('ok', false, 'message', 'The date to pay and stay a member has passed. To rejoin, submit a new membership application.');
  end if;

  if v_from is distinct from v_level then
    update public.members
       set membership_level = v_level
     where id = v_id;
    perform public.kos_log_dues_event(
      'level_set',
      v_id,
      v_year,
      jsonb_build_object('from', v_from, 'to', v_level, 'source', 'member_renewal')
    );
  end if;

  if coalesce(p_include_partner, false) then
    v_partner := public.kos_linked_partner_id(v_id);
    if v_partner is not null and not exists (
      select 1 from public.dues_payments d
       where d.member_id = v_partner
         and d.membership_year = v_year
         and d.paid
    ) then
      update public.members
         set membership_level = v_level
       where id = v_partner
         and membership_level is distinct from v_level;
      if found then
        v_partner_updated := true;
        perform public.kos_log_dues_event(
          'level_set',
          v_partner,
          v_year,
          jsonb_build_object('to', v_level, 'source', 'member_renewal_partner', 'by_member', v_id)
        );
      end if;
      select m.membership_status into v_partner_status
        from public.members m
       where m.id = v_partner
         and m.merged_into is null;
      if lower(coalesce(v_partner_status, '')) = 'lapsed' then
        if public._kos_reactivate_member(v_partner) then
          v_reactivated := true;
        end if;
      end if;
    end if;
  end if;

  if lower(coalesce(v_status, '')) = 'lapsed' then
    if public._kos_reactivate_member(v_id) then
      v_reactivated := true;
    end if;
  end if;

  select c.zeffy_url into v_url
    from public.kos_dues_catalog c
   where c.membership_year = v_year
     and c.level = v_level
     and c.active
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'already_paid', false,
    'membership_level', v_level,
    'partner_updated', v_partner_updated,
    'reactivated', v_reactivated,
    'zeffy_url', v_url,
    'message', 'Your level is saved. Zeffy is the next step.'
  );
end;
$$;

comment on function public.kos_choose_renewal_level(text, boolean) is
  'Signed-in member sets their own dues level for the open season, and optionally the linked partner. A lapsed member, and a lapsed partner when included, gets an unpaid reactivation row and pending-renewal. Does not mark anyone paid and does not send email.';

revoke all on function public.kos_choose_renewal_level(text, boolean) from public, anon;
grant execute on function public.kos_choose_renewal_level(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Joining packet preview. Read membership_level before the template
--    check strips it, then put it back so Auxiliary uses the real builder.
-- ---------------------------------------------------------------------------
create or replace function public.preview_joining_packet_email(p_template jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview$
declare
  v_check jsonb;
  v_clean jsonb;
  v_level text := lower(btrim(coalesce(p_template->>'membership_level', '')));
  v_url text := 'https://www.kreweofshamrock.com/membership-full-application.html?token=' || repeat('a', 64);
  v_html text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  v_check := public.kos_joining_packet_template_check(p_template);
  if coalesce(v_check->>'ok', '') <> 'true' then
    return v_check;
  end if;
  v_clean := v_check->'template';
  if v_level <> '' then
    v_clean := v_clean || jsonb_build_object('membership_level', v_level);
  end if;
  v_html := public.kos_prospect_background_check_email_html('Nia', v_url, v_clean);
  return jsonb_build_object(
    'ok', true,
    'sample_name', 'Nia',
    'subject', v_clean->>'subject',
    'html', v_html
  );
end;
$preview$;

revoke all on function public.preview_joining_packet_email(jsonb) from public, anon;
grant execute on function public.preview_joining_packet_email(jsonb) to authenticated;

comment on function public.preview_joining_packet_email(jsonb) is
  'Reviewers only. Preview the joining packet for the sample name Nia and a placeholder token. Optional membership_level auxiliary uses the Auxiliary fee sentence. Does not send email.';

-- Member hub card. Same body as sql/kos_dues_renewal.sql, plus the
-- inactive date, and exempt comes from kos_is_dues_exempt. A paid row
-- still reports paid so the card can say they are paid.
create or replace function public.kos_my_renewal()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_member record;
  v_year integer := public.kos_dues_season_year();
  v_paid boolean := false;
  v_paid_date date;
  v_partner_id uuid;
  v_partner jsonb := null;
  v_levels jsonb;
  v_exempt boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to renew.');
  end if;
  v_id := public.kos_current_member_id();
  if v_id is null then
    return jsonb_build_object('ok', false, 'message', 'Your login is not linked to a roster row yet.');
  end if;
  select m.id, m.membership_level, m.membership_status, m.officer_title, m.member_role
    into v_member
    from public.members m
   where m.id = v_id
     and m.merged_into is null;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Your roster row was not found.');
  end if;

  select d.paid, d.paid_date
    into v_paid, v_paid_date
    from public.dues_payments d
   where d.member_id = v_id
     and d.membership_year = v_year
     and d.paid
   limit 1;
  v_paid := coalesce(v_paid, false);

  v_exempt := public.kos_is_dues_exempt(v_id, v_year) and not v_paid;

  v_partner_id := public.kos_linked_partner_id(v_id);
  if v_partner_id is not null then
    select jsonb_build_object(
      'member_id', p.id,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'membership_level', coalesce(p.membership_level, 'full'),
      'paid', exists (
        select 1 from public.dues_payments d
         where d.member_id = p.id
           and d.membership_year = v_year
           and d.paid
      )
    )
      into v_partner
      from public.members p
     where p.id = v_partner_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'level', x.level,
    'label', x.label,
    'amount', coalesce(c.amount, public.kos_dues_fallback_amount(x.level)),
    'zeffy_url', c.zeffy_url,
    'explainer', c.explainer
  ) order by x.ord), '[]'::jsonb)
    into v_levels
    from (
      values
        (1, 'full', 'Full'),
        (2, 'associate', 'Associate'),
        (3, 'auxiliary', 'Auxiliary'),
        (4, 'loa', 'Leave of absence')
    ) as x(ord, level, label)
    left join public.kos_dues_catalog c
      on c.membership_year = v_year
     and c.level = x.level
     and c.active;

  return jsonb_build_object(
    'ok', true,
    'year', v_year,
    'season_label', v_year::text || '-' || right((v_year + 1)::text, 2),
    'paid', v_paid,
    'paid_date', v_paid_date,
    'exempt', v_exempt,
    'inactive_on', public.kos_dues_inactive_on(v_year),
    'membership_level', coalesce(v_member.membership_level, 'full'),
    'membership_status', v_member.membership_status,
    'partner', v_partner,
    'levels', v_levels,
    'treasurer_email', 'treasurer@kreweofshamrock.com'
  );
end;
$$;

comment on function public.kos_my_renewal() is
  'Signed-in member. Current dues season, catalog levels, paid flag, linked partner, and whether kos_is_dues_exempt applies before payment. Does not change any row.';

revoke all on function public.kos_my_renewal() from public, anon;
grant execute on function public.kos_my_renewal() to authenticated;

-- Rollback only. Do not run this list as part of applying the file.
-- After restoring the three function bodies named in the header:
--   drop function if exists public.preview_joining_packet_email(jsonb); -- then restore the previous body
--   drop function if exists public.kos_choose_renewal_level(text, boolean);
--   drop function if exists public.kos_renewal_rows(integer);
--   drop function if exists public.kos_start_reactivation(uuid[]);
--   drop function if exists public.kos_mark_lapsed(uuid[], text);
--   drop function if exists public.kos_lapse_candidates(integer);
--   drop function if exists public.kos_set_lapse_date(integer, date);
--   drop function if exists public.kos_get_lapse_date(integer);
--   drop function if exists public._kos_reactivate_member(uuid);
--   drop function if exists public._kos_exemptions_missing(integer);
--   drop function if exists public._kos_is_lapse_candidate(uuid, integer);
--   drop function if exists public._kos_application_ids_ready(uuid);
--   drop function if exists public.kos_is_dues_exempt(uuid, integer);
--   drop function if exists public.kos_default_lapse_date(integer);
--   drop table if exists public.kos_dues_settings;
-- Restore membership_application_actions_action_check from
-- sql/kos_auxiliary_fee_included.sql, and kos_dues_events_event_type_check
-- from sql/kos_dues_foundation.sql, only when no row uses lapsed,
-- reactivation_sent, member_lapsed, or reactivation_started.
