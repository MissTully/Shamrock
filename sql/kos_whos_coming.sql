-- Who's coming: officer RSVP list for one event.
-- NOT APPLIED. Do not run this from the website or a deploy script.
-- The owner applies it in the Supabase SQL editor on project
-- oazwkwflgbthojvnclfc after review. Safe to re-run.
--
-- Apply after sql/kos_member_roles_and_access.sql so can_manage_events()
-- already includes has_tool('event_studio'). This file does not add a tool
-- key, a title bundle row, or a member_tool_grants value.
--
-- Gate: can_manage_events(), the same check Event Studio uses. That function
-- is has_tool('event_studio') OR the older officer / board / chair check.
-- Whoever can open Event Studio can open this list. event_outreach is a
-- different job (prospect emails across events). reports is a different
-- grant. A new tool key would have to be copied onto every title that
-- already has event_studio, and the two would drift.
--
-- The function only reads rows that already exist. It does not copy them
-- into a new table.
--
-- Included, in this order, skipping a later row when that email is already
-- on the list (a paid ticket that already became an RSVP stays one person):
--   event_signups joined to members
--     Member when the roster row is not a prospect.
--     Guest/Public, source "Public signup", when membership_status or
--     member_role is prospect. That is how the public signup form records
--     a non-member: rsvp_to_event inserts a prospect and an event_signups row.
--     Volunteer and organizer roles stay in this list. They are RSVP rows.
--   parade_guest_registrations, source "Parade guest".
--     Named children in minors are their own rows when that column exists
--     (sql/kos_parade_guest_party.sql). They are not also added as a guest count.
--   legacy_event_registrations linked by event_id, source "Legacy registration".
--   payments for this event that are event tickets, event-linked raffle
--     tickets, or a Zeffy payload that is ticketing. Source is "Zeffy ticket",
--     "Stripe ticket", or "Ticket purchase".
--   tartan_ball_orders and tartan_ball_guests when those tables exist.
--     Source "Tartan Ball".
--   sponsorship_claims when that table exists. Source "Sponsorship".
--
-- Not included:
--   parade_security_signups. Those are shift roster rows, not RSVPs.
--   volunteer_inquiries. They are not tied to one event.
--   door_checkins and volunteer_hours. Those record attendance and hours,
--   not who registered.
--
-- Headcount matches the Hub: each row with counts = true adds 1, plus
-- guests when that number is stored and greater than 0. Members and
-- Guest/Public are totaled separately. Combined is the sum.
-- Counted RSVP statuses: registered, confirmed, attended.
-- Counted parade guest statuses: payment_sent, paid.
-- Waitlisted, cancelled, declined, and abandoned rows still appear.
-- Their counts flag is false, so they stay out of the headcount.

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
    'listed',
      e.start_time is null
      or (
        ((coalesce(e.end_time, e.start_time) at time zone 'America/New_York')::date + 2)
        > (timezone('America/New_York', now()))::date
      )
  ) order by e.start_time asc nulls last), '[]'::jsonb)
    into v_events
  from public.events e
  where coalesce(e.source, '') <> 'ikc';

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
    'status', e.status
  )
    into v_event
  from public.events e
  where e.id = p_event_id
    and coalesce(e.source, '') <> 'ikc';

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
