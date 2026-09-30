-- Event outreach list for the Officer desk.
--
-- How to apply (do this in the Supabase SQL editor; the website does not run it):
--   1. Open project oazwkwflgbthojvnclfc.
--   2. SQL Editor -> New query -> paste this file -> Run.
-- Safe to run more than once.
--
-- What it does:
--   * One view, v_event_outreach, unions three email sources. It does not
--     create a table and it does not insert members.
--   * Website RSVP: members with membership_status = 'prospect', plus their
--     event_signups (registered, confirmed, attended, waitlisted).
--   * Zeffy: payments.payer_email where provider is zeffy and the product is
--     an event ticket (product_kind event, a raffle tied to an event, or a
--     still-unclassified row whose Zeffy payload is ticketing). Emails that
--     already match a non-prospect member stay in the view and are hidden
--     by the default "never applied" filter.
--   * Legacy: Wild Apricot rows in legacy_event_registrations whose email is
--     not on the current roster. Canceled and abandoned registrations are
--     skipped. Those emails are not imported as members.
--   * list_event_outreach and export_event_outreach re-check
--     can_view_event_outreach(). The view is not granted to the API.
--   * Email members gains an Event prospects audience. Officers
--     (is_krewe_officer) can queue that blast. It uses this view, not the
--     active-member list. Apply this file after
--     sql/kos_officer_email_and_invoices.sql. If that email file is run
--     again later, run this file again so the prospect audience stays.
--
-- Who can read it (can_view_event_outreach):
--   * can_manage_events() — the same gate as Reports (board, officers,
--     captains, committee chairs, and matching roster titles).
--   * or can_review_applications() — the same people who see Event prospects
--     under Membership Applications (Membership Chair, President, Secretary,
--     Chair of Technology, and bootstrap site admins).
--
-- Apply after these already-live files:
--   sql/kos_payments.sql
--   sql/kos_legacy_import_and_reports.sql
--   sql/kos_event_studio.sql          (can_manage_events)
--   sql/kos_membership_applications.sql is optional. If
--   can_review_applications() is missing, event managers still see the list.
--
-- This file does not replace officer_event_report or list_membership_applications.

-- ---------------------------------------------------------------------------
-- 1) Who may open the list. Event managers, or application reviewers.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_event_outreach()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_review boolean;
begin
  if coalesce(public.can_manage_events(), false) then
    return true;
  end if;
  if to_regprocedure('public.can_review_applications()') is null then
    return false;
  end if;
  execute 'select public.can_review_applications()' into v_review;
  return coalesce(v_review, false);
end;
$$;

comment on function public.can_view_event_outreach() is
  'Reports gate (can_manage_events) or Membership Applications gate (can_review_applications).';

revoke all on function public.can_view_event_outreach() from public, anon;
grant execute on function public.can_view_event_outreach() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) One row per email. Not granted to anon or authenticated.
-- ---------------------------------------------------------------------------
drop function if exists public.list_event_outreach(text, integer, boolean, integer, integer);
drop function if exists public.export_event_outreach(text, integer, boolean);
drop function if exists public.kos_event_outreach_filtered(text, integer, boolean);
-- These two gain a dependency on the view. Drop them before the view so
-- a re-run can replace the view, then recreate them at the bottom.
drop function if exists public.officer_send_member_email(text, text, text, uuid[]);
drop function if exists public.officer_email_audience_counts();
drop view if exists public.v_event_outreach;

create view public.v_event_outreach
with (security_invoker = true) as
with roster as (
  select distinct on (lower(btrim(m.email)))
    m.id,
    lower(btrim(m.email)) as email,
    nullif(btrim(concat_ws(' ',
      nullif(btrim(m.first_name), ''),
      nullif(btrim(m.last_name), '')
    )), '') as display_name,
    m.membership_status
  from public.members m
  where m.merged_into is null
    and m.email is not null
    and position('@' in m.email) > 0
  order by lower(btrim(m.email)),
    case when coalesce(m.membership_status, '') = 'prospect' then 1 else 0 end,
    m.created_at desc nulls last
),
zeffy_pay as (
  select
    lower(btrim(pm.payer_email)) as email,
    nullif(btrim(pm.payer_name), '') as person_name,
    case
      when pm.event_id is not null then 'site:' || pm.event_id::text
      else 'zeffy:' || md5(
        lower(btrim(coalesce(pm.description, ''))) || '|' ||
        coalesce((pm.created_at at time zone 'America/New_York')::date::text, pm.id::text)
      )
    end as event_key,
    coalesce(e.name, nullif(btrim(pm.description), ''), 'Zeffy ticket') as event_name,
    coalesce(e.start_time, pm.created_at) as event_at
  from public.payments pm
  left join public.events e on e.id = pm.event_id
  where lower(coalesce(pm.provider, '')) = 'zeffy'
    and pm.payer_email is not null
    and position('@' in pm.payer_email) > 0
    and lower(coalesce(pm.status, '')) not in ('failed', 'refunded', 'canceled', 'cancelled', 'void')
    and (
      pm.product_kind = 'event'
      or (pm.product_kind = 'raffle' and pm.event_id is not null)
      or (
        pm.product_kind = 'other'
        and (
          lower(coalesce(pm.raw #>> '{data,campaign_type}', '')) in ('ticketing', 'event')
          or lower(coalesce(pm.raw #>> '{data,campaign_category}', '')) = 'event'
          or (
            jsonb_typeof(pm.raw #> '{data,items}') = 'array'
            and exists (
              select 1
              from jsonb_array_elements(pm.raw #> '{data,items}') it
              where lower(coalesce(it->>'type', '')) = 'ticket'
            )
          )
        )
      )
    )
),
legacy_reg as (
  select
    lower(btrim(l.email)) as email,
    nullif(btrim(concat_ws(' ',
      nullif(btrim(l.first_name), ''),
      nullif(btrim(l.last_name), '')
    )), '') as person_name,
    case
      when l.event_id is not null then 'site:' || l.event_id::text
      when l.wa_event_id is not null then 'wa:' || l.wa_event_id::text
      else 'legacy:' || md5(
        lower(btrim(coalesce(l.event_title, ''))) || '|' ||
        coalesce(l.event_start::text, l.id::text)
      )
    end as event_key,
    coalesce(nullif(btrim(l.event_title), ''), 'Legacy event') as event_name,
    l.event_start as event_at
  from public.legacy_event_registrations l
  where l.email is not null
    and position('@' in l.email) > 0
    and coalesce(l.payment_state, '') not in ('Canceled', 'Probably abandoned (payment failed)')
),
population as (
  select r.email
    from roster r
   where r.membership_status = 'prospect'
  union
  select z.email from zeffy_pay z
  union
  select l.email
    from legacy_reg l
   where not exists (
     select 1 from roster r where r.email = l.email
   )
),
signups as (
  select
    lower(btrim(m.email)) as email,
    nullif(btrim(concat_ws(' ',
      nullif(btrim(m.first_name), ''),
      nullif(btrim(m.last_name), '')
    )), '') as person_name,
    'site:' || s.event_id::text as event_key,
    coalesce(nullif(btrim(e.name), ''), 'Website RSVP') as event_name,
    e.start_time as event_at
  from public.event_signups s
  join public.members m on m.id = s.member_id
  left join public.events e on e.id = s.event_id
  where m.merged_into is null
    and m.email is not null
    and position('@' in m.email) > 0
    and s.event_id is not null
    and s.status in ('registered', 'confirmed', 'attended', 'waitlisted')
    and lower(btrim(m.email)) in (select pop.email from population pop)
),
touches as (
  select email, person_name, event_key, event_name, event_at from signups
  union all
  select email, person_name, event_key, event_name, event_at
    from zeffy_pay
   where email in (select pop.email from population pop)
  union all
  select email, person_name, event_key, event_name, event_at
    from legacy_reg
   where email in (select pop.email from population pop)
),
event_stats as (
  select t.email, count(distinct t.event_key)::integer as event_count
    from touches t
   group by t.email
),
last_event as (
  select distinct on (t.email)
    t.email,
    t.event_name,
    t.event_at
  from touches t
  order by t.email, t.event_at desc nulls last, t.event_name
),
name_pick as (
  select distinct on (n.email)
    n.email,
    n.person_name
  from (
    select r.email, r.display_name as person_name, 1 as pri, length(r.display_name) as nlen
      from roster r
     where r.display_name is not null
    union all
    select t.email, t.person_name, 2, length(t.person_name)
      from touches t
     where t.person_name is not null
  ) n
  order by n.email, n.pri, n.nlen desc
),
shaped as (
  select
    p.email,
    np.person_name as display_name,
    array_remove(array[
      case when r.membership_status = 'prospect' then 'website_rsvp' else '' end,
      case when exists (select 1 from zeffy_pay z where z.email = p.email) then 'zeffy' else '' end,
      case when exists (select 1 from legacy_reg l where l.email = p.email) then 'legacy' else '' end
    ], '') as source_keys,
    array_remove(array[
      case when r.membership_status = 'prospect' then 'Website RSVP' else '' end,
      case when exists (select 1 from zeffy_pay z where z.email = p.email) then 'Zeffy' else '' end,
      case when exists (select 1 from legacy_reg l where l.email = p.email) then 'Legacy' else '' end
    ], '') as source_labels,
    coalesce(es.event_count, 0) as event_count,
    le.event_name as last_event_name,
    le.event_at as last_event_at,
    r.id as member_id,
    r.membership_status,
    (r.id is not null) as on_roster,
    (r.id is not null and coalesce(r.membership_status, '') <> 'prospect') as applied_to_join
  from population p
  left join roster r on r.email = p.email
  left join name_pick np on np.email = p.email
  left join event_stats es on es.email = p.email
  left join last_event le on le.email = p.email
)
select *
  from shaped
 where coalesce(array_length(source_keys, 1), 0) > 0;

comment on view public.v_event_outreach is
  'Cross-event outreach emails. Read through list_event_outreach and export_event_outreach. Does not create members.';

revoke all on table public.v_event_outreach from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Shared filter. Not granted to the API.
-- ---------------------------------------------------------------------------
create or replace function public.kos_event_outreach_filtered(
  p_source text,
  p_min_events integer,
  p_never_applied boolean
)
returns setof public.v_event_outreach
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source text := lower(btrim(coalesce(p_source, '')));
  v_min integer := least(greatest(coalesce(p_min_events, 0), 0), 1000);
begin
  if not public.can_view_event_outreach() then
    return;
  end if;
  if v_source in ('', 'all') then
    v_source := null;
  elsif v_source not in ('website_rsvp', 'zeffy', 'legacy') then
    return;
  end if;
  return query
    select v.*
      from public.v_event_outreach v
     where (coalesce(p_never_applied, true) = false or v.applied_to_join = false)
       and v.event_count >= v_min
       and (v_source is null or v_source = any (v.source_keys))
     order by v.last_event_at desc nulls last, v.email;
end;
$$;

revoke all on function public.kos_event_outreach_filtered(text, integer, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) List for the Officer desk. Page size is capped; CSV uses the export.
-- ---------------------------------------------------------------------------
create or replace function public.list_event_outreach(
  p_source text default null,
  p_min_events integer default 0,
  p_never_applied boolean default true,
  p_limit integer default 300,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source text := lower(btrim(coalesce(p_source, '')));
  v_min integer := least(greatest(coalesce(p_min_events, 0), 0), 1000);
  v_limit integer := least(greatest(coalesce(p_limit, 300), 1), 300);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_never boolean := coalesce(p_never_applied, true);
begin
  if not public.can_view_event_outreach() then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.');
  end if;
  if v_source in ('', 'all') then
    v_source := null;
  elsif v_source not in ('website_rsvp', 'zeffy', 'legacy') then
    return jsonb_build_object('ok', false, 'message', 'Unknown source filter.');
  end if;

  return (
    with filtered as materialized (
      select *
        from public.kos_event_outreach_filtered(v_source, v_min, v_never)
    )
    select jsonb_build_object(
      'ok', true,
      'total', (select count(*) from filtered),
      'by_source', jsonb_build_object(
        'website_rsvp', (select count(*) from filtered f where 'website_rsvp' = any (f.source_keys)),
        'zeffy', (select count(*) from filtered f where 'zeffy' = any (f.source_keys)),
        'legacy', (select count(*) from filtered f where 'legacy' = any (f.source_keys))
      ),
      'limit', v_limit,
      'offset', v_offset,
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'email', f.email,
          'name', f.display_name,
          'sources', f.source_labels,
          'source_keys', f.source_keys,
          'event_count', f.event_count,
          'last_event_name', f.last_event_name,
          'last_event_at', f.last_event_at,
          'member_id', f.member_id,
          'membership_status', f.membership_status,
          'on_roster', f.on_roster,
          'applied_to_join', f.applied_to_join
        ) order by f.last_event_at desc nulls last, f.email)
        from (
          select *
            from filtered
           order by last_event_at desc nulls last, email
           limit v_limit offset v_offset
        ) f
      ), '[]'::jsonb)
    )
  );
end;
$$;

comment on function public.list_event_outreach(text, integer, boolean, integer, integer) is
  'Officer outreach page. p_source is website_rsvp, zeffy, legacy, or blank. p_never_applied defaults true.';

revoke all on function public.list_event_outreach(text, integer, boolean, integer, integer) from public, anon;
grant execute on function public.list_event_outreach(text, integer, boolean, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Full filtered set for CSV. Capped so one download cannot run away.
-- ---------------------------------------------------------------------------
create or replace function public.export_event_outreach(
  p_source text default null,
  p_min_events integer default 0,
  p_never_applied boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source text := lower(btrim(coalesce(p_source, '')));
  v_min integer := least(greatest(coalesce(p_min_events, 0), 0), 1000);
  v_never boolean := coalesce(p_never_applied, true);
  v_cap integer := 10000;
begin
  if not public.can_view_event_outreach() then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.');
  end if;
  if v_source in ('', 'all') then
    v_source := null;
  elsif v_source not in ('website_rsvp', 'zeffy', 'legacy') then
    return jsonb_build_object('ok', false, 'message', 'Unknown source filter.');
  end if;

  return (
    with filtered as materialized (
      select *
        from public.kos_event_outreach_filtered(v_source, v_min, v_never)
    )
    select jsonb_build_object(
      'ok', true,
      'total', (select count(*) from filtered),
      'truncated', (select count(*) from filtered) > v_cap,
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'email', f.email,
          'name', f.display_name,
          'sources', f.source_labels,
          'source_keys', f.source_keys,
          'event_count', f.event_count,
          'last_event_name', f.last_event_name,
          'last_event_at', f.last_event_at,
          'member_id', f.member_id,
          'membership_status', f.membership_status,
          'on_roster', f.on_roster,
          'applied_to_join', f.applied_to_join
        ) order by f.last_event_at desc nulls last, f.email)
        from (
          select *
            from filtered
           order by last_event_at desc nulls last, email
           limit v_cap
        ) f
      ), '[]'::jsonb)
    )
  );
end;
$$;

comment on function public.export_event_outreach(text, integer, boolean) is
  'Full filtered outreach rows for CSV, capped at 10000. Same gate as list_event_outreach.';

revoke all on function public.export_event_outreach(text, integer, boolean) from public, anon;
grant execute on function public.export_event_outreach(text, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Opt-out. There is no opt-out table in this project today. If one of
--    these shows up later, prospect blasts skip it. No new table is created.
-- ---------------------------------------------------------------------------
create or replace function public.kos_email_is_opted_out(p_email text, p_member uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hit boolean := false;
  v_col text;
begin
  if v_email = '' then
    return false;
  end if;

  if to_regclass('public.email_opt_outs') is not null
     and exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'email_opt_outs'
          and column_name = 'email'
     ) then
    execute
      'select exists (select 1 from public.email_opt_outs o where lower(btrim(o.email)) = $1)'
      into v_hit
      using v_email;
    if coalesce(v_hit, false) then
      return true;
    end if;
  end if;

  foreach v_col in array array['email_opt_out', 'do_not_email', 'marketing_opt_out', 'unsubscribed']
  loop
    if exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'members'
         and column_name = v_col
         and data_type = 'boolean'
    ) then
      execute format(
        'select exists (
           select 1
             from public.members m
            where coalesce(m.%I, false) = true
              and m.merged_into is null
              and (
                ($1 is not null and m.id = $1)
                or lower(btrim(coalesce(m.email, ''''))) = $2
              )
         )',
        v_col
      )
      into v_hit
      using p_member, v_email;
      if coalesce(v_hit, false) then
        return true;
      end if;
    end if;
  end loop;

  return false;
end;
$$;

comment on function public.kos_email_is_opted_out(text, uuid) is
  'True when an existing opt-out table or boolean member column says not to email this address. False when none of those exist.';

revoke all on function public.kos_email_is_opted_out(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Audience counts. Same officer gate as Email members, plus prospect counts.
-- ---------------------------------------------------------------------------
create or replace function public.officer_email_audience_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'active', (select count(*)::int from public.v_active_member_emails),
    'officers', (select count(*)::int from public.v_officer_emails),
    'chairs', (
      select count(*)::int from public.members m
      where m.merged_into is null
        and m.membership_status = 'active'
        and m.email is not null and position('@' in m.email) > 0
        and (
          lower(coalesce(m.officer_title, '')) like '%chair%'
          or lower(coalesce(m.member_role, '')) in ('officer', 'captain', 'board')
        )
    ),
    'prospects', (
      select count(*)::int
        from public.v_event_outreach v
       where v.applied_to_join = false
         and (
           'website_rsvp' = any (v.source_keys)
           or 'zeffy' = any (v.source_keys)
         )
    ),
    'prospects_legacy', (
      select count(*)::int
        from public.v_event_outreach v
       where v.applied_to_join = false
         and (
           'website_rsvp' = any (v.source_keys)
           or 'zeffy' = any (v.source_keys)
           or 'legacy' = any (v.source_keys)
         )
    )
  );
end;
$$;

comment on function public.officer_email_audience_counts() is
  'Email members counts. prospects is website RSVP plus unmatched Zeffy. prospects_legacy adds Wild Apricot emails not on the roster.';

revoke all on function public.officer_email_audience_counts() from public, anon;
grant execute on function public.officer_email_audience_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Send. Event prospects reads v_event_outreach only. Active members are
--    not unioned in. An address is mailed once. Opt-outs are skipped.
-- ---------------------------------------------------------------------------
create or replace function public.officer_send_member_email(
  p_subject text,
  p_body_html text,
  p_audience text default 'active',
  p_member_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_audience text := lower(coalesce(nullif(btrim(p_audience), ''), 'active'));
  v_subject text := nullif(btrim(p_subject), '');
  v_body_in text := nullif(btrim(p_body_html), '');
  v_body text;
  v_count integer := 0;
  v_skipped integer := 0;
  v_ids uuid[] := '{}';
  v_seen text[] := '{}';
  r record;
  v_log_id uuid;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if v_subject is null then
    return jsonb_build_object('ok', false, 'message', 'Subject is required.');
  end if;
  if v_body_in is null then
    return jsonb_build_object('ok', false, 'message', 'Message body is required.');
  end if;
  if v_audience not in (
    'active', 'officers', 'chairs', 'selected', 'prospects', 'prospects_legacy'
  ) then
    return jsonb_build_object(
      'ok', false,
      'message', 'Choose an audience: active, officers, chairs, selected, or event prospects.'
    );
  end if;
  if v_audience = 'selected' and (p_member_ids is null or cardinality(p_member_ids) = 0) then
    return jsonb_build_object('ok', false, 'message', 'Pick at least one member from the roster.');
  end if;

  v_body := public.wrap_all_krewe_email_html(v_subject, v_body_in);

  if v_audience = 'active' then
    for r in
      select member_id, first_name, last_name, email from public.v_active_member_emails
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      if r.email = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(
        r.email,
        nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
        v_subject, v_body, 'officer_email', r.member_id
      );
      v_ids := array_append(v_ids, r.member_id);
      v_count := v_count + 1;
    end loop;
  elsif v_audience = 'officers' then
    for r in
      select member_id, first_name, last_name, email from public.v_officer_emails
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      if r.email = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(
        r.email,
        nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
        v_subject, v_body, 'officer_email', r.member_id
      );
      v_ids := array_append(v_ids, r.member_id);
      v_count := v_count + 1;
    end loop;
  elsif v_audience = 'chairs' then
    for r in
      select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
      from public.members m
      where m.merged_into is null
        and m.membership_status = 'active'
        and m.email is not null and position('@' in m.email) > 0
        and (
          lower(coalesce(m.officer_title, '')) like '%chair%'
          or lower(coalesce(m.member_role, '')) in ('officer', 'captain', 'board')
        )
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      if r.email = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(
        r.email,
        nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
        v_subject, v_body, 'officer_email', r.member_id
      );
      v_ids := array_append(v_ids, r.member_id);
      v_count := v_count + 1;
    end loop;
  elsif v_audience in ('prospects', 'prospects_legacy') then
    -- Only the outreach list. Active members are not added from the roster.
    -- applied_to_join = false keeps current members off this blast. A person
    -- is included only when that email is already a website prospect or an
    -- unmatched Zeffy buyer (and, if asked, a legacy email not on the roster).
    for r in
      select distinct on (lower(btrim(v.email)))
        v.member_id,
        v.display_name,
        lower(btrim(v.email)) as email
      from public.v_event_outreach v
      where v.applied_to_join = false
        and v.email is not null
        and position('@' in v.email) > 0
        and (
          'website_rsvp' = any (v.source_keys)
          or 'zeffy' = any (v.source_keys)
          or (
            v_audience = 'prospects_legacy'
            and 'legacy' = any (v.source_keys)
          )
        )
      order by lower(btrim(v.email))
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      if r.email = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(
        r.email,
        nullif(btrim(coalesce(r.display_name, '')), ''),
        v_subject, v_body, 'event_prospect_email', r.member_id
      );
      if r.member_id is not null then
        v_ids := array_append(v_ids, r.member_id);
      end if;
      v_count := v_count + 1;
    end loop;
  else
    for r in
      select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
      from public.members m
      where m.id = any(p_member_ids)
        and m.merged_into is null
        and m.email is not null and position('@' in m.email) > 0
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      if r.email = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(
        r.email,
        nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
        v_subject, v_body, 'officer_email', r.member_id
      );
      v_ids := array_append(v_ids, r.member_id);
      v_count := v_count + 1;
    end loop;
  end if;

  insert into public.officer_outreach_log
    (kind, audience, subject, body_html, recipient_count, member_ids, meta, sent_by)
  values
    ('email', v_audience, v_subject, v_body_in, v_count, v_ids,
     jsonb_build_object(
       'purpose', case when v_audience in ('prospects', 'prospects_legacy')
                       then 'event_prospect_email' else 'officer_email' end,
       'skipped_opt_out', v_skipped,
       'include_legacy', v_audience = 'prospects_legacy'
     ), auth.uid())
  returning id into v_log_id;

  if v_audience = 'active' then
    insert into public.all_krewe_messages (subject, body_html, sent_by, recipient_count, segment)
    values (v_subject, v_body_in, auth.uid(), v_count, 'active');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_log_id,
    'recipient_count', v_count,
    'skipped_opt_out', v_skipped,
    'audience', v_audience,
    'message', 'Queued for ' || v_count || ' recipient(s).'
      || case when v_skipped > 0
              then ' Skipped ' || v_skipped || ' opted-out address(es).'
              else '' end
      || ' Delivery uses the krewe outbound email queue.'
  );
end;
$$;

comment on function public.officer_send_member_email(text, text, text, uuid[]) is
  'Officer email. prospects and prospects_legacy use v_event_outreach and do not add active members.';

revoke all on function public.officer_send_member_email(text, text, text, uuid[]) from public, anon;
grant execute on function public.officer_send_member_email(text, text, text, uuid[]) to authenticated;
