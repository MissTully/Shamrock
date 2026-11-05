-- NOT APPLIED. Review, then run in the Supabase SQL editor on oazwkwflgbthojvnclfc.
-- Krewe of Shamrock: let any signed-in ACTIVE member use Email members.
-- Safe to re-run.
--
-- Depends on: is_krewe_officer(), kos_current_member_id(), members, profiles,
--   officer_send_member_email, officer_email_audience_counts,
--   officer_list_outreach_log, officer_search_roster,
--   officer_committee_recipients, officer_committee_audience_counts,
--   kos_chat_is_member() from sql/kos_krewe_chat_v1.sql (recreated below if missing).
--
-- What this changes:
--   * Active members (not prospects) may queue member email, same as officers.
--   * Event prospects audiences stay officers only (website / Zeffy / legacy lists).
--   * Non-officers: at most 10 email sends per calendar day (America/New_York).
--   * Opt-out skip, confirm checkbox, and branded template stay as they are.
-- Never public: anon still cannot call these RPCs.

create or replace function public.kos_chat_is_member()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.profiles p
    join public.members m on m.id = p.member_id
    where p.id = auth.uid()
      and coalesce(m.membership_status, '') = 'active'
      and coalesce(m.member_role, 'member') <> 'prospect'
  );
$$;
revoke all on function public.kos_chat_is_member() from public, anon;
grant execute on function public.kos_chat_is_member() to authenticated;

create or replace function public.kos_can_send_member_email()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_krewe_officer() or public.kos_chat_is_member();
$$;
revoke all on function public.kos_can_send_member_email() from public, anon;
grant execute on function public.kos_can_send_member_email() to authenticated;

-- Non-officer daily cap (10). Officers unlimited. Counts rows they queued today.
create or replace function public.kos_member_email_under_daily_cap()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_krewe_officer()
    or (
      select count(*) from public.officer_outreach_log
      where sent_by = auth.uid()
        and kind = 'email'
        and created_at >= date_trunc('day', now() at time zone 'America/New_York')
          at time zone 'America/New_York'
    ) < 10;
$$;
revoke all on function public.kos_member_email_under_daily_cap() from public, anon;
grant execute on function public.kos_member_email_under_daily_cap() to authenticated;

create or replace function public.officer_email_audience_counts()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.kos_can_send_member_email() then
    return jsonb_build_object('ok', false, 'message', 'Signed-in members only.');
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
    'prospects', case when public.is_krewe_officer() then (
      select count(*)::int from public.v_event_outreach v
       where v.applied_to_join = false
         and ('website_rsvp' = any (v.source_keys) or 'zeffy' = any (v.source_keys))
    ) else null end,
    'prospects_legacy', case when public.is_krewe_officer() then (
      select count(*)::int from public.v_event_outreach v
       where v.applied_to_join = false
         and ('website_rsvp' = any (v.source_keys) or 'zeffy' = any (v.source_keys) or 'legacy' = any (v.source_keys))
    ) else null end
  );
end;
$$;

create or replace function public.officer_list_outreach_log(p_kind text default null, p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_kind text := lower(nullif(btrim(p_kind), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
begin
  if not public.kos_can_send_member_email() then
    return jsonb_build_object('ok', false, 'message', 'Signed-in members only.', 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id, kind, audience, subject, recipient_count, meta, sent_by, created_at
        from public.officer_outreach_log
        where (v_kind is null or kind = v_kind)
          and (public.is_krewe_officer() or sent_by = auth.uid())
        order by created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.officer_search_roster(p_q text default '', p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
begin
  if not public.kos_can_send_member_email() then
    return jsonb_build_object('ok', false, 'message', 'Signed-in members only.', 'members', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'members', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.last_name, x.first_name)
      from (
        select m.id, m.first_name, m.last_name, lower(m.email) as email,
               m.member_role, coalesce(m.officer_title, '') as officer_title,
               m.membership_status
        from public.members m
        where m.merged_into is null
          and m.membership_status in ('active', 'lapsed', 'pending-renewal')
          and m.email is not null and position('@' in m.email) > 0
          and (
            v_q = ''
            or lower(m.first_name) like '%' || v_q || '%'
            or lower(m.last_name) like '%' || v_q || '%'
            or lower(m.email) like '%' || v_q || '%'
            or lower(coalesce(m.officer_title, '')) like '%' || v_q || '%'
            or lower(m.first_name || ' ' || m.last_name) like '%' || v_q || '%'
          )
        order by m.last_name, m.first_name
        limit v_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.officer_committee_recipients(p_committees text[], p_include_chairs boolean default true)
returns table (member_id uuid, first_name text, last_name text, email text, via text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.kos_can_send_member_email() then
    raise exception 'Signed-in members only.';
  end if;
  return query
  with pick as (
    select distinct c from unnest(coalesce(p_committees, '{}'::text[])) c
     where c = any(public.kos_committee_list())
  ),
  hits as (
    select m.id, 'member'::text via from public.members m
     where m.merged_into is null and m.membership_status = 'active'
       and m.committee_interests && (select coalesce(array_agg(c), '{}') from pick)
    union
    select h.member_id, 'chair' from public.kos_committee_chair_rows() h
     where coalesce(p_include_chairs, true) and h.committee in (select c from pick)
  )
  select m.id, m.first_name, m.last_name, lower(m.email), min(h.via)
    from hits h join public.members m on m.id = h.id
   where m.email is not null and position('@' in m.email) > 0
   group by m.id, m.first_name, m.last_name, m.email
   order by m.last_name, m.first_name;
end $$;

create or replace function public.officer_committee_audience_counts(p_include_chairs boolean default true)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.kos_can_send_member_email() then
    return jsonb_build_object('ok', false, 'message', 'Signed-in members only.');
  end if;
  return jsonb_build_object('ok', true, 'committees', coalesce((
    select jsonb_object_agg(c, n) from (
      select c, (select count(*) from public.officer_committee_recipients(array[c], p_include_chairs))::int n
        from unnest(public.kos_committee_list()) c
    ) x), '{}'::jsonb));
end $$;

-- Recreate send RPC with active-member gate, prospects still officers-only,
-- and the non-officer daily cap. Body copied from the live function.
create or replace function public.officer_send_member_email(
  p_subject text, p_body_html text, p_audience text default 'active', p_member_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
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
  if not public.kos_can_send_member_email() then
    return jsonb_build_object('ok', false, 'message', 'Signed-in members only.');
  end if;
  if not public.kos_member_email_under_daily_cap() then
    return jsonb_build_object('ok', false, 'message', 'Daily send limit reached (10 per day for members). Try again tomorrow, or ask an officer.');
  end if;
  if v_subject is null then
    return jsonb_build_object('ok', false, 'message', 'Subject is required.');
  end if;
  if v_body_in is null then
    return jsonb_build_object('ok', false, 'message', 'Message body is required.');
  end if;
  if v_audience in ('prospects', 'prospects_legacy') and not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Event prospects are officers only.');
  end if;
  if v_audience not in ('active', 'officers', 'chairs', 'selected', 'prospects', 'prospects_legacy') then
    return jsonb_build_object('ok', false, 'message', 'Choose an audience: active, officers, chairs, selected, or event prospects.');
  end if;
  if v_audience = 'selected' and (p_member_ids is null or cardinality(p_member_ids) = 0) then
    return jsonb_build_object('ok', false, 'message', 'Pick at least one member from the roster.');
  end if;

  v_body := public.wrap_all_krewe_email_html(v_subject, v_body_in);

  if v_audience = 'active' then
    for r in select member_id, first_name, last_name, email from public.v_active_member_emails
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  elsif v_audience = 'officers' then
    for r in select member_id, first_name, last_name, email from public.v_officer_emails
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  elsif v_audience = 'chairs' then
    for r in
      select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
      from public.members m
      where m.merged_into is null and m.membership_status = 'active'
        and m.email is not null and position('@' in m.email) > 0
        and (lower(coalesce(m.officer_title, '')) like '%chair%'
          or lower(coalesce(m.member_role, '')) in ('officer', 'captain', 'board'))
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  elsif v_audience in ('prospects', 'prospects_legacy') then
    for r in
      select distinct on (lower(btrim(v.email)))
        v.member_id, v.display_name, lower(btrim(v.email)) as email
      from public.v_event_outreach v
      where v.applied_to_join = false and v.email is not null and position('@' in v.email) > 0
        and ('website_rsvp' = any (v.source_keys) or 'zeffy' = any (v.source_keys)
          or (v_audience = 'prospects_legacy' and 'legacy' = any (v.source_keys)))
      order by lower(btrim(v.email))
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.display_name, '')), ''), v_subject, v_body, 'event_prospect_email', r.member_id);
      if r.member_id is not null then v_ids := array_append(v_ids, r.member_id); end if;
      v_count := v_count + 1;
    end loop;
  else
    for r in
      select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
      from public.members m
      where m.id = any(p_member_ids) and m.merged_into is null
        and m.email is not null and position('@' in m.email) > 0
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  end if;

  insert into public.officer_outreach_log
    (kind, audience, subject, body_html, recipient_count, member_ids, meta, sent_by)
  values
    ('email', v_audience, v_subject, v_body_in, v_count, v_ids,
     jsonb_build_object(
       'purpose', case when v_audience in ('prospects', 'prospects_legacy') then 'event_prospect_email' else 'officer_email' end,
       'skipped_opt_out', v_skipped,
       'include_legacy', v_audience = 'prospects_legacy',
       'sent_as_member', not public.is_krewe_officer()
     ), auth.uid())
  returning id into v_log_id;

  if v_audience = 'active' then
    insert into public.all_krewe_messages (subject, body_html, sent_by, recipient_count, segment)
    values (v_subject, v_body_in, auth.uid(), v_count, 'active');
  end if;

  return jsonb_build_object(
    'ok', true, 'id', v_log_id, 'recipient_count', v_count, 'skipped_opt_out', v_skipped, 'audience', v_audience,
    'message', 'Queued for ' || v_count || ' recipient(s).'
      || case when v_skipped > 0 then ' Skipped ' || v_skipped || ' opted-out address(es).' else '' end
      || ' Delivery uses the krewe outbound email queue.'
  );
end;
$$;

revoke all on function public.officer_email_audience_counts() from public, anon;
revoke all on function public.officer_list_outreach_log(text, integer) from public, anon;
revoke all on function public.officer_search_roster(text, integer) from public, anon;
revoke all on function public.officer_send_member_email(text, text, text, uuid[]) from public, anon;
grant execute on function public.officer_email_audience_counts() to authenticated;
grant execute on function public.officer_list_outreach_log(text, integer) to authenticated;
grant execute on function public.officer_search_roster(text, integer) to authenticated;
grant execute on function public.officer_send_member_email(text, text, text, uuid[]) to authenticated;
