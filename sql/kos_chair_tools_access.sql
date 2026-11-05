-- Committee chairs get Event Studio, Email members, and Krewe Tidings (All Krewe Messages).
-- Today is_krewe_officer() already covers every chair except Merchandise (it excludes merch titles/roles),
-- so this mainly opens these tools to the Merchandise co-chairs. Payments, invoices, and dues stay as they are.
-- NOT APPLIED. Apply only after Melissa approves.

create or replace function public.can_use_chair_tools()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_krewe_officer() or public.is_committee_chair();
$$;
revoke all on function public.can_use_chair_tools() from public, anon;
grant execute on function public.can_use_chair_tools() to authenticated;

-- can_manage_events
CREATE OR REPLACE FUNCTION public.can_manage_events()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_krewe_officer()
    or public.is_committee_chair()
    or public.can_manage_social_charity()
    or exists (
      select 1 from public.member_roles r
      where r.user_id = auth.uid()
        and (
          r.role in ('board','officer','captain','committee_chair')
          or (
            r.role in ('committee','committee_chair')
            and coalesce(r.committee,'') ~* '(social|charity|charities|events|event)'
          )
        )
    )
    or exists (
      select 1
      from public.members m
      join public.profiles p on p.member_id = m.id
      where p.id = auth.uid()
        and m.membership_status = 'active'
        and (
          m.member_role in ('officer','captain','board')
          or coalesce(m.officer_title,'') ~* '(social|charity|charities|events?\\s+chair|event\\s+committee)'
          or (
            coalesce(m.officer_title,'') ~* '(chair|committee)'
            and coalesce(m.officer_title,'') !~* '(merchandise|merch|shop|store)'
          )
        )
    );
$function$;

-- list_all_krewe_messages
CREATE OR REPLACE FUNCTION public.list_all_krewe_messages(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if not public.can_use_chair_tools() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.', 'messages', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'messages', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id, subject, body_html, sent_by, created_at, recipient_count, segment
        from public.all_krewe_messages
        order by created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

-- officer_email_audience_counts
CREATE OR REPLACE FUNCTION public.officer_email_audience_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_use_chair_tools() then
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
$function$;

-- officer_list_outreach_log
CREATE OR REPLACE FUNCTION public.officer_list_outreach_log(p_kind text DEFAULT NULL::text, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text := lower(nullif(btrim(p_kind), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
begin
  if not public.can_use_chair_tools() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.', 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id, kind, audience, subject, recipient_count, meta, sent_by, created_at
        from public.officer_outreach_log
        where v_kind is null or kind = v_kind
        order by created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

-- officer_search_roster
CREATE OR REPLACE FUNCTION public.officer_search_roster(p_q text DEFAULT ''::text, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
begin
  if not public.can_use_chair_tools() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.', 'members', '[]'::jsonb);
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
          and m.email is not null
          and position('@' in m.email) > 0
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
$function$;

-- officer_send_member_email
CREATE OR REPLACE FUNCTION public.officer_send_member_email(p_subject text, p_body_html text, p_audience text DEFAULT 'active'::text, p_member_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not public.can_use_chair_tools() then
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
$function$;

-- send_all_krewe_message
CREATE OR REPLACE FUNCTION public.send_all_krewe_message(p_subject text, p_body_html text, p_segment text DEFAULT 'active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_segment text := lower(coalesce(nullif(btrim(p_segment), ''), 'active'));
  v_subject text := nullif(btrim(p_subject), '');
  v_body text := nullif(btrim(p_body_html), '');
  v_count integer;
  v_id uuid;
begin
  if not public.can_use_chair_tools() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if v_subject is null then
    return jsonb_build_object('ok', false, 'message', 'Subject is required.');
  end if;
  if v_body is null then
    return jsonb_build_object('ok', false, 'message', 'Message body is required.');
  end if;
  if v_segment not in ('active', 'officers', 'all') then
    return jsonb_build_object('ok', false, 'message', 'Invalid segment.');
  end if;

  -- Pass officer-composed HTML; queue_broadcast applies the branded wrapper once.
  v_count := public.queue_broadcast(v_subject, v_body, v_segment);

  -- Persist the unwrapped officer body for readable history in the Officer desk.
  insert into public.all_krewe_messages (subject, body_html, sent_by, recipient_count, segment)
  values (v_subject, v_body, auth.uid(), v_count, v_segment)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'recipient_count', v_count,
    'segment', v_segment,
    'message', 'Queued for ' || v_count || ' recipient(s).'
  );
end;
$function$;
