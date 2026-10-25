-- ============================================================================
-- RSVP flow: normalize names typed in ALL CAPS or all lowercase.
--
-- (Also applied to Supabase as migration kos_rsvp_name_normalization.)
--
-- The signup form saves names exactly as typed, which is how "Linda WISE"
-- reached the roster. kos_normalize_person_name() title-cases a name ONLY
-- when it arrives entirely uppercase or entirely lowercase — evidence the
-- person was not typing intentional capitalization:
--
--   'WISE' / 'wise'         -> 'Wise'
--   "O'BRIEN" / "o'brien"   -> "O'Brien"      (word starts after ' and -)
--   'MCDONALD' / 'mcdonald' -> 'McDonald'     (Mc prefix special-cased)
--   'MARY-JANE'             -> 'Mary-Jane'
--   'McDonald', 'DiCaprio'  -> unchanged      (already mixed case)
--   'DJ', 'AJ'              -> unchanged      (1-2 letter initialisms)
--
-- rsvp_to_event() applies it when creating a NEW prospect record and in the
-- confirmation-email greeting and recipient name. Existing member records are
-- never rewritten, and member matching is unaffected (kos_resolve_rsvp_member
-- already compares names case-insensitively). The function body is otherwise
-- IDENTICAL to kos_rsvp_member_match_aliases.sql.
-- ============================================================================

create or replace function public.kos_normalize_person_name(p_name text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  v text := btrim(coalesce(p_name, ''));
  m text[];
begin
  if v = '' then
    return v;
  end if;
  -- Mixed case is intentional (McDonald, DiCaprio): leave it alone. Only a
  -- name that is entirely upper or entirely lower gets rewritten.
  if v <> upper(v) and v <> lower(v) then
    return v;
  end if;
  -- 1-2 letter all-caps initialisms (DJ, AJ) stay as typed.
  if v = upper(v) and length(regexp_replace(v, '[^A-Za-z]', '', 'g')) <= 2 then
    return v;
  end if;
  -- initcap capitalizes after space and hyphen boundaries: mary-jane ->
  -- Mary-Jane. (Apostrophes are handled explicitly below, because this
  -- database's initcap leaves o'brien as O'brien.)
  v := initcap(lower(v));
  -- Capitalize the letter after an apostrophe: O'brien -> O'Brien.
  loop
    m := regexp_match(v, '('')([a-z])');
    exit when m is null;
    v := regexp_replace(v, '('')([a-z])', m[1] || upper(m[2]));
  end loop;
  -- Mc prefix: Mcdonald -> McDonald (initcap cannot know this one).
  loop
    m := regexp_match(v, '(^|[^A-Za-z])Mc([a-z])');
    exit when m is null;
    v := regexp_replace(v, '(^|[^A-Za-z])Mc([a-z])', m[1] || 'Mc' || upper(m[2]));
  end loop;
  return v;
end;
$$;

revoke execute on function public.kos_normalize_person_name(text) from public, anon, authenticated;

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
  v_first text;
  v_last text;
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
  -- Fix obvious ALL-CAPS / all-lowercase names as typed on the form
  -- (see kos_normalize_person_name; intentional mixed case is untouched).
  v_first := public.kos_normalize_person_name(p_first_name);
  v_last  := public.kos_normalize_person_name(p_last_name);

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
    values (v_first, v_last, lower(p_email), 'prospect', 'prospect')
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
    v_body := '<p>Hi ' || public.kos_escape_html(v_first) || ',</p>'
           || '<p>Thanks for signing up for <strong>' || public.kos_escape_html(v_event_name) || '</strong>. '
           || 'That event is currently full, so you''ve been added to the <strong>waitlist</strong>. '
           || 'We''ll be in touch if a spot opens up.</p><p>Slainte!<br/>Krewe of Shamrock</p>';
  elsif v_pay_status = 'pending' then
    v_subject := 'Almost there: ' || v_event_name;
    v_body := '<p>Hi ' || public.kos_escape_html(v_first) || ',</p>'
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
    v_body := '<p>Hi ' || public.kos_escape_html(v_first) || ',</p>'
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
  perform public.enqueue_email(lower(p_email), v_first || ' ' || v_last,
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
