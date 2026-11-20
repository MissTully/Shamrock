-- Member RSVP for every event, including Inter-Krewe Council rows.
-- NOT APPLIED. Do not run this from the website or a deploy script.
-- The owner applies it in the Supabase SQL editor on project
-- oazwkwflgbthojvnclfc after review. Safe to re-run.
--
-- Live check on 20 Nov 2026 (do not apply from this file until reviewed):
--   public.rsvp_to_event rejects source = 'ikc'
--     (where id = p_event_id and source <> 'ikc').
--   public.officer_whos_coming omits those rows from the event picker
--     and from the single-event lookup.
--   public.event_signups already accepts a member's own row for any event.
--     Policies signups_insert_self / signups_update_self_or_officer key off
--     member_id, not event source. No policy change in this file.
--
-- After this file:
--   rsvp_to_event saves Going for an IKC event the same way as a Krewe event.
--   The +5 RSVP Clovers award includes source krewe and source ikc.
--   officer_whos_coming lists IKC events and their RSVPs (names, guests, CSV).
--   Each event object includes source so the picker can label IKC.
--
-- Based on the current function bodies in
-- sql/kos_event_members_only_address.sql and sql/kos_whos_coming.sql.

-- D. rsvp_to_event: members-only gate + private address in confirmation email
-- ---------------------------------------------------------------------------
drop function if exists public.rsvp_to_event(uuid, text, text, text, integer, text, numeric);
drop function if exists public.rsvp_to_event(uuid, text, text, text, integer, text, numeric, text);
drop function if exists public.rsvp_to_event(uuid, text, text, text, integer, text, numeric, text, integer, text, text, text);

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
    insert into public.members (first_name, last_name, email, member_role, membership_status)
    values (btrim(p_first_name), btrim(p_last_name), lower(p_email), 'prospect', 'prospect')
    returning id into v_member_id;
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

grant execute on function public.rsvp_to_event(uuid,text,text,text,integer,text,numeric,text,integer,text,text,text,text)
  to anon, authenticated;

create or replace function public.kos_wc_col(p_table text, p_col text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_col
  );
$$;

revoke all on function public.kos_wc_col(text, text) from public, anon, authenticated;

create or replace function public.officer_whos_coming(p_event_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_events jsonb := '[]'::jsonb;
  v_event jsonb := null;
  v_rows jsonb := '[]'::jsonb;
  v_members integer := 0;
  v_public integer := 0;
  v_name text;
  v_phone text;
  v_at text;
  v_guests text;
  v_role text;
  v_pay_link text;
  v_sql text;
begin
  if coalesce(public.can_manage_events(), false) is not true then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'start_time', e.start_time,
    'end_time', e.end_time,
    'status', e.status,
    'source', e.source,
    'listed',
      e.start_time is null
      or (
        ((coalesce(e.end_time, e.start_time) at time zone 'America/New_York')::date + 2)
        > (timezone('America/New_York', now()))::date
      )
  ) order by e.start_time asc nulls last), '[]'::jsonb)
    into v_events
  from public.events e

  if p_event_id is null then
    return jsonb_build_object(
      'ok', true,
      'events', v_events,
      'event', null,
      'rows', '[]'::jsonb,
      'counts', jsonb_build_object('members', 0, 'public', 0, 'headcount', 0)
    );
  end if;

  select jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'start_time', e.start_time,
    'end_time', e.end_time,
    'status', e.status,
    'source', e.source
  )
    into v_event
  from public.events e
  where e.id = p_event_id

  if v_event is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Event not found.',
      'events', v_events,
      'rows', '[]'::jsonb
    );
  end if;

  drop table if exists pg_temp.wc;
  create temporary table wc (
    person_name text,
    audience text,
    source text,
    status text,
    guests integer,
    signed_up_at timestamptz,
    phone text,
    email text,
    counts boolean,
    email_key text,
    name_key text
  ) on commit drop;

  if to_regclass('public.event_signups') is not null then
    v_phone := case when public.kos_wc_col('members', 'phone') then 'm.phone' else 'null::text' end;
    v_at := case when public.kos_wc_col('event_signups', 'created_at') then 's.created_at' else 'null::timestamptz' end;
    v_guests := case when public.kos_wc_col('event_signups', 'guests_count') then 's.guests_count::integer' else 'null::integer' end;
    v_role := case when public.kos_wc_col('event_signups', 'signup_role') then 's.signup_role' else 'null::text' end;
    v_sql := format($q$
      insert into pg_temp.wc (
        person_name, audience, source, status, guests, signed_up_at, phone, email, counts, email_key, name_key
      )
      select
        coalesce(
          nullif(btrim(concat_ws(' ', nullif(btrim(m.first_name), ''), nullif(btrim(m.last_name), ''))), ''),
          nullif(btrim(m.email), ''),
          'Signup'
        ),
        case
          when coalesce(m.membership_status, '') = 'prospect'
            or coalesce(m.member_role, '') = 'prospect'
          then 'Guest/Public' else 'Member'
        end,
        case
          when coalesce(m.membership_status, '') = 'prospect'
            or coalesce(m.member_role, '') = 'prospect'
          then 'Public signup'
          when coalesce(%1$s, '') in ('volunteer', 'organizer')
          then 'Member RSVP, ' || %1$s
          else 'Member RSVP'
        end,
        nullif(btrim(s.status), ''),
        %2$s,
        %3$s,
        %4$s,
        nullif(btrim(m.email), ''),
        s.status in ('registered', 'confirmed', 'attended'),
        lower(btrim(coalesce(m.email, ''))),
        lower(btrim(concat_ws(' ', m.first_name, m.last_name)))
      from public.event_signups s
      join public.members m on m.id = s.member_id
      where s.event_id = $1
        and m.merged_into is null
    $q$, v_role, v_guests, v_at, v_phone);
    execute v_sql using p_event_id;
  end if;

  if to_regclass('public.parade_guest_registrations') is not null then
    v_phone := case
      when public.kos_wc_col('parade_guest_registrations', 'phone') then 'g.phone'
      else 'null::text'
    end;
    execute format($q$
      insert into pg_temp.wc (
        person_name, audience, source, status, guests, signed_up_at, phone, email, counts, email_key, name_key
      )
      select
        coalesce(
          nullif(btrim(concat_ws(' ', nullif(btrim(g.first_name), ''), nullif(btrim(g.last_name), ''))), ''),
          nullif(btrim(g.email), ''),
          'Parade guest'
        ),
        'Guest/Public',
        'Parade guest',
        nullif(btrim(g.status), ''),
        null,
        g.created_at,
        %1$s,
        nullif(btrim(g.email), ''),
        g.status in ('payment_sent', 'paid'),
        lower(btrim(coalesce(g.email, ''))),
        lower(btrim(concat_ws(' ', g.first_name, g.last_name)))
      from public.parade_guest_registrations g
      where g.event_id = $1
        and not exists (
          select 1 from pg_temp.wc w
          where w.email_key <> ''
            and w.email_key = lower(btrim(coalesce(g.email, '')))
        )
    $q$, v_phone) using p_event_id;

    if public.kos_wc_col('parade_guest_registrations', 'minors') then
      execute $q$
        insert into pg_temp.wc (
          person_name, audience, source, status, guests, signed_up_at, phone, email, counts, email_key, name_key
        )
        select
          nullif(btrim(concat_ws(' ',
            nullif(btrim(child->>'first_name'), ''),
            nullif(btrim(child->>'last_name'), '')
          )), ''),
          'Guest/Public',
          'Parade guest',
          nullif(btrim(g.status), ''),
          null,
          g.created_at,
          null,
          null,
          g.status in ('payment_sent', 'paid'),
          '',
          lower(btrim(concat_ws(' ', child->>'first_name', child->>'last_name')))
        from public.parade_guest_registrations g
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(g.minors) = 'array' then g.minors else '[]'::jsonb end
        ) as child
        where g.event_id = $1
          and nullif(btrim(concat_ws(' ', child->>'first_name', child->>'last_name')), '') is not null
          and not exists (
            select 1 from pg_temp.wc w
            where w.name_key <> ''
              and w.name_key = lower(btrim(concat_ws(' ', child->>'first_name', child->>'last_name')))
          )
      $q$ using p_event_id;
    end if;
  end if;

  if to_regclass('public.legacy_event_registrations') is not null then
    insert into pg_temp.wc (
      person_name, audience, source, status, guests, signed_up_at, phone, email, counts, email_key, name_key
    )
    select
      coalesce(
        nullif(btrim(concat_ws(' ', nullif(btrim(l.first_name), ''), nullif(btrim(l.last_name), ''))), ''),
        nullif(btrim(l.email), ''),
        'Legacy registration'
      ),
      case
        when coalesce(btrim(l.guest_of), '') <> '' then 'Guest/Public'
        when l.is_member then 'Member'
        else 'Guest/Public'
      end,
      'Legacy registration',
      nullif(btrim(l.payment_state), ''),
      null,
      l.registered_at,
      nullif(btrim(l.phone), ''),
      nullif(btrim(l.email), ''),
      coalesce(l.payment_state, '') not in ('Canceled', 'Probably abandoned (payment failed)'),
      lower(btrim(coalesce(l.email, ''))),
      lower(btrim(concat_ws(' ', l.first_name, l.last_name)))
    from public.legacy_event_registrations l
    where l.event_id = p_event_id
      and not exists (
        select 1 from pg_temp.wc w
        where w.email_key <> ''
          and w.email_key = lower(btrim(coalesce(l.email, '')))
      );
  end if;

  if to_regclass('public.payments') is not null then
    v_pay_link := case
      when public.kos_wc_col('event_signups', 'payment_id') then 'yes'
      else 'no'
    end;
    if v_pay_link = 'yes' then
      insert into pg_temp.wc (
        person_name, audience, source, status, guests, signed_up_at, phone, email, counts, email_key, name_key
      )
      select
        coalesce(nullif(btrim(pm.payer_name), ''), nullif(btrim(pm.payer_email), ''), 'Ticket buyer'),
        case
          when m.id is not null
            and coalesce(m.membership_status, '') <> 'prospect'
            and coalesce(m.member_role, '') <> 'prospect'
          then 'Member' else 'Guest/Public'
        end,
        case lower(coalesce(pm.provider, ''))
          when 'zeffy' then 'Zeffy ticket'
          when 'stripe' then 'Stripe ticket'
          else 'Ticket purchase'
        end,
        nullif(btrim(pm.status), ''),
        null,
        pm.created_at,
        null,
        nullif(btrim(pm.payer_email), ''),
        lower(coalesce(pm.status, '')) in ('succeeded', 'paid', 'completed', 'success', 'approved'),
        lower(btrim(coalesce(pm.payer_email, ''))),
        lower(btrim(coalesce(pm.payer_name, '')))
      from public.payments pm
      left join public.members m on m.id = pm.member_id and m.merged_into is null
      where pm.event_id = p_event_id
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
        and not exists (
          select 1 from pg_temp.wc w
          where w.email_key <> ''
            and w.email_key = lower(btrim(coalesce(pm.payer_email, '')))
        )
        and not exists (
          select 1 from public.event_signups s
          where s.event_id = pm.event_id
            and s.payment_id = pm.id
        );
    else
      insert into pg_temp.wc (
        person_name, audience, source, status, guests, signed_up_at, phone, email, counts, email_key, name_key
      )
      select
        coalesce(nullif(btrim(pm.payer_name), ''), nullif(btrim(pm.payer_email), ''), 'Ticket buyer'),
        case
          when m.id is not null
            and coalesce(m.membership_status, '') <> 'prospect'
            and coalesce(m.member_role, '') <> 'prospect'
          then 'Member' else 'Guest/Public'
        end,
        case lower(coalesce(pm.provider, ''))
          when 'zeffy' then 'Zeffy ticket'
          when 'stripe' then 'Stripe ticket'
          else 'Ticket purchase'
        end,
        nullif(btrim(pm.status), ''),
        null,
        pm.created_at,
        null,
        nullif(btrim(pm.payer_email), ''),
        lower(coalesce(pm.status, '')) in ('succeeded', 'paid', 'completed', 'success', 'approved'),
        lower(btrim(coalesce(pm.payer_email, ''))),
        lower(btrim(coalesce(pm.payer_name, '')))
      from public.payments pm
      left join public.members m on m.id = pm.member_id and m.merged_into is null
      where pm.event_id = p_event_id
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
        and not exists (
          select 1 from pg_temp.wc w
          where w.email_key <> ''
            and w.email_key = lower(btrim(coalesce(pm.payer_email, '')))
        );
    end if;
  end if;

  if to_regclass('public.tartan_ball_orders') is not null
     and to_regclass('public.tartan_ball_guests') is not null
     and public.kos_wc_col('tartan_ball_orders', 'event_id')
     and public.kos_wc_col('tartan_ball_guests', 'order_id') then
    if public.kos_wc_col('tartan_ball_guests', 'first_name')
       and public.kos_wc_col('tartan_ball_guests', 'last_name') then
      v_name := 'nullif(btrim(concat_ws('' '', nullif(btrim(g.first_name), ''''), nullif(btrim(g.last_name), ''''))), '''')';
    elsif public.kos_wc_col('tartan_ball_guests', 'guest_name') then
      v_name := 'nullif(btrim(g.guest_name), '''')';
    else
      v_name := 'null::text';
    end if;
    v_phone := case
      when public.kos_wc_col('tartan_ball_guests', 'phone') then 'g.phone'
      else 'null::text'
    end;
    if public.kos_wc_col('tartan_ball_guests', 'email') then
      v_sql := 'nullif(btrim(g.email), '''')';
    else
      v_sql := 'null::text';
    end if;
    if public.kos_wc_col('tartan_ball_orders', 'submitted_at') then
      v_at := 'o.submitted_at';
    elsif public.kos_wc_col('tartan_ball_orders', 'created_at') then
      v_at := 'o.created_at';
    else
      v_at := 'null::timestamptz';
    end if;
    execute format($q$
      insert into pg_temp.wc (
        person_name, audience, source, status, guests, signed_up_at, phone, email, counts, email_key, name_key
      )
      select
        coalesce(%1$s, %2$s, 'Tartan Ball guest'),
        'Guest/Public',
        'Tartan Ball',
        null,
        null,
        %3$s,
        %4$s,
        %2$s,
        true,
        lower(btrim(coalesce(%2$s, ''))),
        lower(btrim(coalesce(%1$s, '')))
      from public.tartan_ball_guests g
      join public.tartan_ball_orders o on o.id = g.order_id
      where o.event_id = $1
        and coalesce(%1$s, %2$s) is not null
        and not exists (
          select 1 from pg_temp.wc w
          where w.name_key <> ''
            and w.name_key = lower(btrim(coalesce(%1$s, '')))
        )
    $q$, v_name, v_sql, v_at, v_phone) using p_event_id;
  end if;

  if to_regclass('public.sponsorship_claims') is not null
     and public.kos_wc_col('sponsorship_claims', 'event_id') then
    insert into pg_temp.wc (
      person_name, audience, source, status, guests, signed_up_at, phone, email, counts, email_key, name_key
    )
    select
      coalesce(
        nullif(btrim(concat_ws(' ', nullif(btrim(c.first_name), ''), nullif(btrim(c.last_name), ''))), ''),
        nullif(btrim(c.email), ''),
        'Sponsor'
      ),
      case
        when m.id is not null
          and coalesce(m.membership_status, '') <> 'prospect'
          and coalesce(m.member_role, '') <> 'prospect'
        then 'Member' else 'Guest/Public'
      end,
      'Sponsorship',
      nullif(btrim(c.payment_status), ''),
      null,
      c.created_at,
      null,
      nullif(btrim(c.email), ''),
      lower(coalesce(c.payment_status, '')) in ('pledged', 'paid'),
      lower(btrim(coalesce(c.email, ''))),
      lower(btrim(concat_ws(' ', c.first_name, c.last_name)))
    from public.sponsorship_claims c
    left join public.members m on m.id = c.member_id and m.merged_into is null
    where c.event_id = p_event_id
      and lower(coalesce(c.payment_status, '')) <> 'cancelled'
      and not exists (
        select 1 from pg_temp.wc w
        where w.email_key <> ''
          and w.email_key = lower(btrim(coalesce(c.email, '')))
      );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', person_name,
    'audience', audience,
    'source', source,
    'status', status,
    'guests', guests,
    'signed_up_at', signed_up_at,
    'phone', nullif(btrim(phone), ''),
    'email', nullif(btrim(email), ''),
    'counts', coalesce(counts, false)
  ) order by case when audience = 'Member' then 0 else 1 end, person_name), '[]'::jsonb)
    into v_rows
  from pg_temp.wc;

  select
    coalesce(sum(case
      when coalesce(counts, false) and audience = 'Member'
      then 1 + greatest(coalesce(guests, 0), 0) else 0 end), 0),
    coalesce(sum(case
      when coalesce(counts, false) and audience is distinct from 'Member'
      then 1 + greatest(coalesce(guests, 0), 0) else 0 end), 0)
    into v_members, v_public
  from pg_temp.wc;

  return jsonb_build_object(
    'ok', true,
    'events', v_events,
    'event', v_event,
    'rows', v_rows,
    'counts', jsonb_build_object(
      'members', v_members,
      'public', v_public,
      'headcount', v_members + v_public
    )
  );
end;
$$;

revoke all on function public.officer_whos_coming(uuid) from public, anon;
grant execute on function public.officer_whos_coming(uuid) to authenticated;

comment on function public.officer_whos_coming(uuid) is
  'Officer who-is-coming list. Same gate as Event Studio (can_manage_events). Reads event_signups, parade guests, legacy registrations, ticket payments, Tartan Ball guests, and sponsorship claims. Does not read security shift rosters.';
