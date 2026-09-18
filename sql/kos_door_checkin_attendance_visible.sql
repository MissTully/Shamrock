-- Door check-in attendance must show up for officers.
-- Applied live to Supabase project oazwkwflgbthojvnclfc. Safe to re-run.
--
-- WHY: meeting_check_in already sets event_signups.status = 'attended', but
-- officer_event_report totals.checked_in only counted old-site (Wild Apricot)
-- check-ins. Website door scans showed a tiny ✔ on the row (if you looked)
-- while the "checked in" chip stayed 0. Event Studio also had no attendance list.
--
-- This:
--   1. Counts website status=attended in the Event report checked-in total
--   2. Labels those rows "Checked in" in the Status column
--   3. Adds officer_event_checkins() so Event Studio can list who is here

-- ---------------------------------------------------------------------------
-- A. Event Studio: who scanned the door QR (status = attended)
-- ---------------------------------------------------------------------------
create or replace function public.officer_event_checkins(p_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_name text;
  v_members jsonb;
  v_count bigint;
begin
  if not public.can_manage_events() then
    return jsonb_build_object('ok', false, 'message',
      'Only officers and event chairs can see who checked in.');
  end if;
  if p_event is null then
    return jsonb_build_object('ok', false, 'message', 'Event is required.');
  end if;

  select e.name into v_name from public.events e where e.id = p_event;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Event not found.');
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'member_id', m.id,
      'name', trim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
      'email', m.email,
      'role', s.signup_role
    ) order by m.last_name, m.first_name), '[]'::jsonb),
    count(*)
  into v_members, v_count
  from public.event_signups s
  join public.members m on m.id = s.member_id
  where s.event_id = p_event
    and s.status = 'attended';

  return jsonb_build_object(
    'ok', true,
    'event', v_name,
    'event_id', p_event,
    'count', v_count,
    'members', v_members
  );
end;
$$;

comment on function public.officer_event_checkins(uuid) is
  'Officer/event-chair RPC: members marked attended for this event (door QR or officer confirm).';

revoke all on function public.officer_event_checkins(uuid) from public, anon;
grant execute on function public.officer_event_checkins(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- B. Event report: website door check-ins count toward "checked in"
-- ---------------------------------------------------------------------------
create or replace function public.officer_event_report(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_event_id        uuid;
  v_wa              bigint;
  v_title           text;
  v_start           timestamptz;
  v_location        text;
  v_site_attendees  jsonb := '[]'::jsonb;
  v_legacy_attendees jsonb := '[]'::jsonb;
  v_site_headcount  bigint := 0;
  v_legacy_headcount bigint := 0;
  v_site_checked_in bigint := 0;
  v_legacy_checked_in bigint := 0;
  v_legacy_raised   bigint := 0;
  v_legacy_pending  bigint := 0;
  v_site_raised     bigint := 0;
  v_site_pending    bigint := 0;
begin
  if not public.can_manage_events() then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.');
  end if;

  if p_key like 'site:%' then
    begin
      v_event_id := substring(p_key from 6)::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'message', 'Bad report key.');
    end;
    select e.name, e.start_time, e.location into v_title, v_start, v_location
      from public.events e where e.id = v_event_id;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'Event not found.');
    end if;
  elsif p_key like 'wa:%' then
    begin
      v_wa := substring(p_key from 4)::bigint;
    exception when others then
      return jsonb_build_object('ok', false, 'message', 'Bad report key.');
    end;
    select min(l.event_title), min(l.event_start), min(l.event_location)
      into v_title, v_start, v_location
      from public.legacy_event_registrations l where l.wa_event_id = v_wa;
    if v_title is null then
      return jsonb_build_object('ok', false, 'message', 'Event not found.');
    end if;
  else
    return jsonb_build_object('ok', false, 'message', 'Bad report key.');
  end if;

  if v_event_id is not null then
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'source', 'Website RSVP',
        'name', trim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
        'email', m.email,
        'detail', trim(both ' ·' from
          coalesce(nullif(s.ticket_type, ''), s.signup_role, '')
          || case when coalesce(s.raffle_tickets, 0) > 0
                  then ' · raffle: ' || s.raffle_tickets::text || ' ticket(s)' else '' end
          || case when coalesce(s.meal_choice, '') <> ''
                  then ' · meal: ' || left(s.meal_choice, 80) else '' end
          || case when coalesce(s.guest_names, '') <> ''
                  then ' · guests: ' || left(s.guest_names, 120) else '' end
        ),
        'status', case
          when s.status = 'attended' then
            trim(both ' ·' from 'Checked in' || case
              when s.payment_status = 'paid' then ' · Paid (Zeffy)'
              when s.payment_status = 'pending' then ' · Pending Zeffy'
              when s.payment_status = 'already_purchased' then ' · Already purchased'
              when s.payment_status = 'unpaid' then ' · Unpaid'
              else ''
            end)
          when s.payment_status = 'paid' then 'Paid (Zeffy)'
          when s.payment_status = 'pending' then 'Pending Zeffy'
          when s.payment_status = 'already_purchased' then 'Already purchased'
          when s.payment_status = 'unpaid' then 'Unpaid'
          else s.status
        end,
        'guests', coalesce(s.guests_count, 0),
        'guest_names', s.guest_names,
        'raffle_tickets', coalesce(s.raffle_tickets, 0),
        'meal_choice', s.meal_choice,
        'payment_status', s.payment_status,
        'amount_cents', coalesce(
          s.amount_cents,
          case when s.payment_status = 'paid' then (
            select p.amount_cents from public.payments p
             where p.id = s.payment_id
          ) end
        ),
        'checked_in', s.status = 'attended'
      ) order by m.last_name, m.first_name), '[]'::jsonb),
      coalesce(sum(case when s.status in ('registered','confirmed','attended')
                        then 1 + coalesce(s.guests_count, 0) else 0 end), 0),
      coalesce(sum(case when s.payment_status = 'pending' then 1 else 0 end), 0),
      coalesce(count(*) filter (where s.status = 'attended'), 0)
      into v_site_attendees, v_site_headcount, v_site_pending, v_site_checked_in
      from public.event_signups s
      join public.members m on m.id = s.member_id
     where s.event_id = v_event_id;

    select coalesce(sum(p.amount_cents), 0) into v_site_raised
      from public.payments p
     where p.event_id = v_event_id and p.status = 'succeeded';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'source', 'Old site',
      'name', trim(coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'')),
      'email', l.email,
      'detail', trim(both ' ·' from
        coalesce(l.ticket_type, '')
        || case when coalesce(l.raffle_choice,'') <> ''
                then ' · raffle: ' || l.raffle_choice else '' end
        || case when coalesce(l.guest_of,'') <> ''
                then ' · guest of ' || l.guest_of else '' end),
      'status', case when l.checked_in then 'Checked in' else l.payment_state end,
      'guests', 0,
      'guest_names', null,
      'raffle_tickets', case
        when l.raffle_choice ~ '^[0-9]+' then (substring(l.raffle_choice from '^[0-9]+'))::int
        else 0
      end,
      'meal_choice', null,
      'payment_status', lower(coalesce(l.payment_state, '')),
      'amount_cents', l.total_fee_cents,
      'checked_in', l.checked_in
    ) order by l.registered_at), '[]'::jsonb),
    coalesce(count(*) filter (where coalesce(l.payment_state,'')
      not in ('Canceled','Probably abandoned (payment failed)')), 0),
    coalesce(count(*) filter (where l.checked_in), 0),
    coalesce(sum(l.total_fee_cents) filter (where l.payment_state = 'Paid'), 0),
    coalesce(sum(l.total_fee_cents) filter (where l.payment_state = 'Unpaid'), 0)
    into v_legacy_attendees, v_legacy_headcount, v_legacy_checked_in,
         v_legacy_raised, v_legacy_pending
    from public.legacy_event_registrations l
   where (v_event_id is not null and l.event_id = v_event_id)
      or (v_wa is not null and l.wa_event_id = v_wa);

  return jsonb_build_object(
    'ok', true,
    'event', jsonb_build_object(
      'title', v_title, 'start_time', v_start, 'location', v_location),
    'totals', jsonb_build_object(
      'expected_headcount', v_site_headcount + v_legacy_headcount,
      'website_rsvp_headcount', v_site_headcount,
      'legacy_headcount', v_legacy_headcount,
      'checked_in', coalesce(v_site_checked_in, 0) + coalesce(v_legacy_checked_in, 0),
      'raised_cents', v_legacy_raised + v_site_raised,
      'pending_cents', v_legacy_pending,
      'pending_zeffy_signups', v_site_pending),
    'attendees', v_site_attendees || v_legacy_attendees);
end;
$function$;

comment on function public.officer_event_report(text) is
  'Officer event attendance report. totals.checked_in includes website door check-ins (status=attended) plus old-site check-ins.';

revoke all on function public.officer_event_report(text) from public, anon;
grant execute on function public.officer_event_report(text) to authenticated;

notify pgrst, 'reload schema';
