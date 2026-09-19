-- ============================================================================
-- RSVP flow: match members by email, known aliases, and name before creating
-- a prospect — so a member's RSVP Clovers land on THEIR Craic Cup record.
--
-- (Also applied to Supabase as migration kos_rsvp_member_match_aliases.)
--
-- Why: rsvp_to_event() used to look members up by roster email only. A member
-- RSVPing with a second email (work address, spouse's address) silently became
-- a brand-new "prospect" record — a duplicate person — and their +5 RSVP
-- Clovers were credited to that phantom instead of their real Craic Cup total.
-- That is exactly how the duplicate "Douglas Tully" prospect was born
-- (Book Club Night RSVP under an alternate work email).
--
-- The fix, in matching order (first hit wins):
--   1. email        — roster email of a live (non-merged) member record.
--   2. alias        — the email is in member_email_aliases (known alternate
--                     emails, also used by Zeffy payment matching).
--   3. merged_email — the email is the roster email of a merged duplicate;
--                     follow merged_into to the surviving record.
--   4. name         — exact first + last name match (case-insensitive),
--                     only when EXACTLY ONE live record matches. An
--                     ambiguous name (two people share it) never guesses.
--   5. Only when all four miss does the signup create a prospect record,
--     as before.
--
-- On a merged_email or name match, the typed email is saved to
-- member_email_aliases (note says it was auto-added) so the NEXT signup or
-- payment under that email matches at step 2. Officers can delete an alias
-- row if a rare same-name stranger ever gets mis-matched.
--
-- The members-only gate benefits too: a member RSVPing to a members-only
-- event under a known alternate email is now recognized instead of rejected.
--
-- rsvp_to_event() is otherwise IDENTICAL to kos_event_members_only_address.sql;
-- the changes are the resolver call, the auto-alias insert, and a matched_by
-- field in the JSON response.
-- ============================================================================

-- Follow a merged record to its surviving keeper (bounded, cycle-safe).
create or replace function public.kos_follow_member_merge(p_id uuid)
returns uuid
language plpgsql
stable
set search_path to ''
as $$
declare
  v_id uuid := p_id;
  v_next uuid;
  i int := 0;
begin
  loop
    select merged_into into v_next from public.members where id = v_id;
    exit when v_next is null or i >= 5;
    v_id := v_next;
    i := i + 1;
  end loop;
  return v_id;
end;
$$;

-- The matcher. Returns the member and HOW they matched (o_matched_by:
-- 'email' | 'alias' | 'merged_email' | 'name' | null = no match).
create or replace function public.kos_resolve_rsvp_member(
  p_email text,
  p_first_name text default null,
  p_last_name text default null,
  out o_member_id uuid,
  out o_member_status text,
  out o_matched_by text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_first text := lower(btrim(coalesce(p_first_name, '')));
  v_last  text := lower(btrim(coalesce(p_last_name, '')));
  v_id uuid;
  v_count int;
begin
  if v_email <> '' then
    -- 1) Roster email of a live record.
    select id, membership_status into o_member_id, o_member_status
      from public.members
     where lower(btrim(email)) = v_email and merged_into is null
     limit 1;
    if o_member_id is not null then
      o_matched_by := 'email';
      return;
    end if;

    -- 2) Known alternate email.
    select a.member_id into v_id
      from public.member_email_aliases a
     where lower(btrim(a.email)) = v_email
     limit 1;
    if v_id is not null then
      v_id := public.kos_follow_member_merge(v_id);
      select id, membership_status into o_member_id, o_member_status
        from public.members where id = v_id and merged_into is null;
      if o_member_id is not null then
        o_matched_by := 'alias';
        return;
      end if;
    end if;

    -- 3) Roster email of a merged duplicate -> its keeper.
    select id into v_id
      from public.members
     where lower(btrim(email)) = v_email and merged_into is not null
     limit 1;
    if v_id is not null then
      v_id := public.kos_follow_member_merge(v_id);
      select id, membership_status into o_member_id, o_member_status
        from public.members where id = v_id and merged_into is null;
      if o_member_id is not null then
        o_matched_by := 'merged_email';
        return;
      end if;
    end if;
  end if;

  -- 4) Exact full-name match, only when unambiguous.
  if v_first <> '' and v_last <> '' then
    select count(*) into v_count
      from public.members
     where merged_into is null
       and lower(btrim(first_name)) = v_first
       and lower(btrim(last_name)) = v_last;
    if v_count = 1 then
      select id, membership_status into o_member_id, o_member_status
        from public.members
       where merged_into is null
         and lower(btrim(first_name)) = v_first
         and lower(btrim(last_name)) = v_last;
      o_matched_by := 'name';
      return;
    end if;
  end if;

  o_matched_by := null;  -- no match: caller decides (prospect / rejection)
end;
$$;

-- Internal helpers: only rsvp_to_event (security definer) calls them.
revoke execute on function public.kos_follow_member_merge(uuid) from public, anon, authenticated;
revoke execute on function public.kos_resolve_rsvp_member(text, text, text) from public, anon, authenticated;

create or replace function public.rsvp_to_event(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_guests_count integer default 0,
  p_signup_role text default 'attendee'::text,
  p_volunteer_hours_planned numeric default null::numeric,
  p_note text default null,
  p_raffle_tickets integer default 0,
  p_guest_names text default null,
  p_ticket_type text default null,
  p_payment_status text default null,
  p_meal_choice text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_member_status text;
  v_matched_by text;
  v_capacity  int;
  v_current   int;
  v_status    text;
  v_signup_id uuid;
  v_event_name text;
  v_event_source text;
  v_ticket_url text;
  v_reg_closes timestamptz;
  v_subject   text;
  v_body      text;
  v_hours_planned numeric;
  v_note      text;
  v_clovers_awarded int := 0;
  v_raffle int := greatest(coalesce(p_raffle_tickets, 0), 0);
  v_guest_names text;
  v_ticket_type text;
  v_pay_status text;
  v_collect_meals boolean;
  v_meal_options text;
  v_meals text[];
  v_meal text;
  v_is_online boolean;
  v_meeting_url text;
  v_join_html text := '';
  v_addr_html text := '';
  v_members_only boolean;
  v_member_address text;
begin
  if p_email is null or position('@' in p_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'A valid email is required.');
  end if;
  if coalesce(btrim(p_first_name), '') = '' or coalesce(btrim(p_last_name), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'First and last name are required.');
  end if;
  if p_signup_role not in ('attendee','volunteer','organizer') then
    p_signup_role := 'attendee';
  end if;
  if p_guests_count is null or p_guests_count < 0 then
    p_guests_count := 0;
  end if;

  v_hours_planned := null;
  if p_signup_role in ('volunteer','organizer') then
    v_hours_planned := p_volunteer_hours_planned;
    if v_hours_planned is not null and v_hours_planned <= 0 then
      v_hours_planned := null;
    end if;
  end if;

  v_note := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_guest_names := nullif(left(btrim(coalesce(p_guest_names, '')), 1000), '');
  v_ticket_type := nullif(left(btrim(coalesce(p_ticket_type, '')), 120), '');
  v_meal := nullif(left(btrim(coalesce(p_meal_choice, '')), 160), '');

  v_pay_status := nullif(lower(btrim(coalesce(p_payment_status, ''))), '');
  if v_pay_status is not null and v_pay_status not in (
    'pending', 'paid', 'already_purchased', 'n/a', 'unpaid'
  ) then
    v_pay_status := null;
  end if;

  select name, capacity, source, ticket_payment_url, registration_closes_at,
         coalesce(collect_meals, false), meal_options,
         coalesce(is_online, false), meeting_url,
         coalesce(members_only, false), member_address
    into v_event_name, v_capacity, v_event_source, v_ticket_url, v_reg_closes,
         v_collect_meals, v_meal_options, v_is_online, v_meeting_url,
         v_members_only, v_member_address
  from public.events
  where id = p_event_id
    and source <> 'ikc'
    and (
      is_public = true
      or coalesce(members_only, false) = true
    );
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That event was not found or is not open for signups.');
  end if;

  if v_reg_closes is not null and now() >= v_reg_closes then
    return jsonb_build_object('ok', false, 'message', 'Registration closed for this event.', 'registration_closed', true);
  end if;

  v_meeting_url := public.kos_clean_meeting_url(v_meeting_url);
  v_member_address := nullif(btrim(coalesce(v_member_address, '')), '');

  -- Match to a member: roster email, then known alternate email, then a
  -- merged duplicate's email, then an unambiguous exact name match —
  -- BEFORE ever creating a prospect (see kos_resolve_rsvp_member above).
  select r.o_member_id, r.o_member_status, r.o_matched_by
    into v_member_id, v_member_status, v_matched_by
    from public.kos_resolve_rsvp_member(p_email, p_first_name, p_last_name) r;

  if v_members_only then
    if v_member_id is null
       or lower(coalesce(v_member_status, '')) in ('prospect', 'pending-new', 'pending') then
      return jsonb_build_object(
        'ok', false,
        'members_only', true,
        'message', 'This event is for Krewe members. Sign in on the Member Hub, or RSVP with the email on your member record.'
      );
    end if;
  elsif v_member_id is null then
    insert into public.members (first_name, last_name, email, member_role, membership_status)
    values (btrim(p_first_name), btrim(p_last_name), lower(p_email), 'prospect', 'prospect')
    returning id into v_member_id;
    v_matched_by := 'new_prospect';
  end if;

  -- Matched through a merged record's email or by name: this email is not on
  -- the member's record yet, so remember it as an alias — the next RSVP or
  -- Zeffy payment under it then matches directly.
  if v_matched_by in ('merged_email', 'name') then
    insert into public.member_email_aliases (member_id, email, note)
    values (v_member_id, lower(btrim(p_email)),
            'Auto: RSVP matched member by ' || v_matched_by)
    on conflict ((lower(btrim(email)))) do nothing;
  end if;

  if v_collect_meals then
    v_meals := public.kos_parse_meal_options(v_meal_options);
    if coalesce(array_length(v_meals, 1), 0) > 0 then
      if v_meal is null or not (v_meal = any (v_meals)) then
        return jsonb_build_object('ok', false, 'message', 'Please choose a meal for this event.');
      end if;
    else
      v_meal := null;
    end if;
  else
    v_meal := null;
  end if;

  if v_pay_status is null then
    if p_signup_role in ('volunteer', 'organizer') then
      v_pay_status := 'n/a';
    elsif v_note is not null and v_note ilike 'Ticket already purchased%' then
      v_pay_status := 'already_purchased';
    elsif coalesce(v_ticket_url, '') <> '' and p_signup_role = 'attendee' then
      v_pay_status := 'pending';
    else
      v_pay_status := 'n/a';
    end if;
  end if;

  select coalesce(sum(1 + guests_count), 0) into v_current
  from public.event_signups
  where event_id = p_event_id and status in ('registered','confirmed','attended');

  if v_capacity is not null and (v_current + 1 + p_guests_count) > v_capacity then
    v_status := 'waitlisted';
  else
    v_status := 'registered';
  end if;

  insert into public.event_signups (
    event_id, member_id, signup_role, status, guests_count,
    volunteer_hours_planned, notes,
    raffle_tickets, guest_names, ticket_type, payment_status, meal_choice
  ) values (
    p_event_id, v_member_id, p_signup_role, v_status, p_guests_count,
    v_hours_planned, v_note,
    v_raffle, v_guest_names, v_ticket_type, v_pay_status, v_meal
  )
  on conflict (event_id, member_id)
  do update set signup_role = excluded.signup_role,
                guests_count = excluded.guests_count,
                status = excluded.status,
                volunteer_hours_planned = excluded.volunteer_hours_planned,
                notes = coalesce(excluded.notes, public.event_signups.notes),
                raffle_tickets = excluded.raffle_tickets,
                guest_names = coalesce(excluded.guest_names, public.event_signups.guest_names),
                ticket_type = coalesce(excluded.ticket_type, public.event_signups.ticket_type),
                meal_choice = excluded.meal_choice,
                payment_status = case
                  when public.event_signups.payment_status = 'paid' then 'paid'
                  else excluded.payment_status
                end
  returning id into v_signup_id;

  if v_status <> 'waitlisted' and v_is_online and v_meeting_url is not null then
    v_join_html := '<p>Your join link for this event: <a href="'
      || public.kos_escape_html(v_meeting_url) || '">'
      || public.kos_escape_html(v_meeting_url) || '</a></p>';
  end if;

  -- Private street address: confirmation email only, and only after a real seat.
  if v_status <> 'waitlisted' and v_member_address is not null then
    v_addr_html := '<p>Member address: '
      || public.kos_escape_html(v_member_address)
      || '</p>';
  end if;

  if v_status = 'waitlisted' then
    v_subject := 'You''re on the waitlist: ' || v_event_name;
    v_body := '<p>Hi ' || public.kos_escape_html(btrim(p_first_name)) || ',</p>'
           || '<p>Thanks for signing up for <strong>' || public.kos_escape_html(v_event_name) || '</strong>. '
           || 'That event is currently full, so you''ve been added to the <strong>waitlist</strong>. '
           || 'We''ll be in touch if a spot opens up.</p><p>Slainte!<br/>Krewe of Shamrock</p>';
  elsif v_pay_status = 'pending' then
    v_subject := 'Almost there: ' || v_event_name;
    v_body := '<p>Hi ' || public.kos_escape_html(btrim(p_first_name)) || ',</p>'
           || '<p>We saved your spot for <strong>' || public.kos_escape_html(v_event_name) || '</strong>'
           || case when p_guests_count > 0 then ' with ' || p_guests_count || ' guest(s)' else '' end
           || case when v_raffle > 0 then ' and ' || v_raffle || ' raffle ticket(s)' else '' end
           || case when v_meal is not null then ' (meal: ' || public.kos_escape_html(v_meal) || ')' else '' end
           || '. Finish checkout on Zeffy to complete payment. If you already paid in another tab, you''re all set.</p>'
           || v_join_html
           || v_addr_html
           || '<p>Slainte!<br/>Krewe of Shamrock</p>';
  else
    v_subject := 'You''re signed up: ' || v_event_name;
    v_body := '<p>Hi ' || public.kos_escape_html(btrim(p_first_name)) || ',</p>'
           || '<p>You''re confirmed for <strong>' || public.kos_escape_html(v_event_name) || '</strong>'
           || case when p_guests_count > 0 then ' with ' || p_guests_count || ' guest(s)' else '' end
           || case when v_meal is not null then ' (meal: ' || public.kos_escape_html(v_meal) || ')' else '' end
           || case when p_signup_role in ('volunteer','organizer') then ' as a <strong>volunteer</strong>' else '' end
           || '. We can''t wait to see you!</p>'
           || v_join_html
           || v_addr_html
           || '<p>Slainte!<br/>Krewe of Shamrock</p>';
  end if;

  -- Same outbound_emails / Resend path as online join links.
  perform public.enqueue_email(lower(p_email), btrim(p_first_name) || ' ' || btrim(p_last_name),
                               v_subject, v_body, 'rsvp_confirmation', v_member_id);

  if v_status in ('registered', 'confirmed')
     and lower(coalesce(v_event_source, '')) = 'krewe' then
    if not exists (
      select 1 from public.clover_ledger cl
      where cl.member_id = v_member_id
        and cl.event_id = p_event_id
        and cl.reason = 'rsvp'
    ) then
      insert into public.clover_ledger (member_id, clovers, reason, event_id, event_name)
      values (v_member_id, 5, 'rsvp', p_event_id, v_event_name);
      v_clovers_awarded := 5;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'signup_id', v_signup_id,
    'status', v_status,
    'payment_status', v_pay_status,
    'volunteer_hours_planned', v_hours_planned,
    'meal_choice', v_meal,
    'meeting_url', case
      when v_status <> 'waitlisted' and v_is_online then v_meeting_url
      else null
    end,
    'members_only', v_members_only,
    'clovers_awarded', v_clovers_awarded,
    'matched_by', v_matched_by,
    'message', case
      when v_status = 'waitlisted'
        then 'This event is full - you have been added to the waitlist. We''ll be in touch.'
      when v_pay_status = 'pending'
        then 'Details saved. Opening ticket checkout next.'
      else 'You''re signed up! See you there.'
    end
  );
end;
$function$;

grant execute on function public.rsvp_to_event(uuid,text,text,text,integer,text,numeric,text,integer,text,text,text,text)
  to anon, authenticated;
