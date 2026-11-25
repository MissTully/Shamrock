-- Guest phone on the public event signup (NOT APPLIED).
-- Do not run this from the website or a deploy script.
-- The owner applies it in the Supabase SQL editor on project
-- oazwkwflgbthojvnclfc after review. Safe to re-run.
--
-- Replaces the 13-argument rsvp_to_event with one that accepts p_phone.
-- The old function is dropped here. Leaving both would make a call that
-- omits p_phone ambiguous, which breaks Member Hub Going and any public
-- signup that does not send a phone.
-- Until this file is applied, the public form retries without p_phone.
--
-- A new prospect row stores the phone. An existing member keeps the phone
-- already on file; a blank phone is filled from this RSVP.
-- Who's coming reads members.phone, so the number shows up there after apply.
-- Until then, the public form retries without p_phone and stores
-- "Phone: …" on the signup note.

drop function if exists public.rsvp_to_event(uuid, text, text, text, integer, text, numeric, text, integer, text, text, text, text);

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
  p_meal_choice text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_member_status text;
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

  select id, membership_status into v_member_id, v_member_status
    from public.members where lower(email) = lower(p_email);

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
    insert into public.members (first_name, last_name, email, member_role, membership_status, phone)
    values (
      btrim(p_first_name), btrim(p_last_name), lower(p_email), 'prospect', 'prospect',
      nullif(left(btrim(coalesce(p_phone, '')), 40), '')
    )
    returning id into v_member_id;
  end if;

  -- Keep a phone an officer already has. Fill a blank phone from this RSVP.
  if v_member_id is not null and nullif(btrim(coalesce(p_phone, '')), '') is not null then
    update public.members
       set phone = left(btrim(p_phone), 40)
     where id = v_member_id
       and nullif(btrim(coalesce(phone, '')), '') is null;
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
     and lower(coalesce(v_event_source, '')) in ('krewe', 'ikc') then
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

grant execute on function public.rsvp_to_event(uuid, text, text, text, integer, text, numeric, text, integer, text, text, text, text, text)
  to anon, authenticated;
