-- ============================================================================
-- Krewe of Shamrock — Officer Reports + Wild Apricot history import
--
-- Adds the "Reports" feature in the Member Hub Officer desk: who is coming to
-- an event and how much has been raised, combining
--   1. live website RSVPs (public.event_signups) and Stripe payments
--      (public.payments), with
--   2. the registration and payment history exported from the old
--      Wild Apricot site (kreweofshamrock.com), held in the two
--      legacy_* tables below.
--
-- The schema and functions here were applied live to Supabase project
-- oazwkwflgbthojvnclfc on 2026-09-07. The actual legacy DATA (1,618 event
-- registrations, 1,460 payments from the 2026-09-03 export) was loaded in
-- separate live migrations and is deliberately NOT in this repository:
-- the repo is public and the rows contain member emails and phone numbers.
-- To reload it, re-run the import from a fresh Wild Apricot export.
--
-- Authorization: every report function re-checks can_manage_events()
-- (board / officer / captain / committee chair — see kos_event_studio.sql),
-- so hiding the UI is not the security boundary. The legacy tables have row
-- level security enabled with NO client policies: the definer functions are
-- the only way to read them.
-- ============================================================================

-- 1. Old-site event registrations (one row per person, guests included;
--    guest rows carry guest_of and no fee — the registrant's row holds the
--    whole invoice total, so summing fees never double-counts).
create table if not exists public.legacy_event_registrations (
  id              uuid primary key default gen_random_uuid(),
  wa_event_id     bigint,
  event_title     text not null,
  event_start     timestamptz,
  event_location  text,
  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  is_member       boolean not null default false,
  ticket_type     text,
  total_fee_cents integer,          -- full invoice total on registrant rows
  invoice_number  text,
  payment_state   text,             -- Paid / Free / Unpaid / Canceled / …
  registered_at   timestamptz,
  guest_of        text,             -- "Last, First" of the linked registrant
  raffle_choice   text,             -- 50/50 raffle add-on chosen at checkout
  team_name       text,
  checked_in      boolean not null default false,
  event_id        uuid references public.events(id) on delete set null,
  imported_at     timestamptz not null default now()
);
create index if not exists legacy_event_regs_wa_event
  on public.legacy_event_registrations (wa_event_id);
create index if not exists legacy_event_regs_event
  on public.legacy_event_registrations (event_id);
alter table public.legacy_event_registrations enable row level security;

-- 2. Old-site payments (money actually received; refund rows from the export
--    are folded into refunded_cents on the original payment).
create table if not exists public.legacy_payments (
  id             uuid primary key default gen_random_uuid(),
  paid_at        timestamptz,
  first_name     text,
  last_name      text,
  email          text,
  amount_cents   integer not null default 0,
  settled_cents  integer not null default 0,
  refunded_cents integer not null default 0,
  origin         text,     -- Event registration / Member renewal / Online store order / …
  origin_details text,
  invoice_number text,
  status         text,
  imported_at    timestamptz not null default now()
);
alter table public.legacy_payments enable row level security;

-- 3. Link imported registrations to the matching events-table row so one
--    report shows old-site and website sign-ups together. Matches on the
--    calendar date (America/New_York) and only when that date has exactly
--    one non-IKC event, so it can never guess between two same-day events.
--    Safe to re-run any time (e.g. after creating an event in Event Studio).
create or replace function public.link_legacy_registrations()
returns integer
language sql
security definer
set search_path to 'public'
as $$
  with matched as (
    update public.legacy_event_registrations l
       set event_id = e.id
      from public.events e
     where l.event_id is null
       and l.event_start is not null
       and e.start_time is not null
       and coalesce(e.source,'') <> 'ikc'
       and (l.event_start at time zone 'America/New_York')::date
           = (e.start_time at time zone 'America/New_York')::date
       and (select count(*) from public.events e2
             where coalesce(e2.source,'') <> 'ikc'
               and e2.start_time is not null
               and (e2.start_time at time zone 'America/New_York')::date
                   = (e.start_time at time zone 'America/New_York')::date) = 1
     returning 1
  )
  select count(*)::integer from matched;
$$;
revoke all on function public.link_legacy_registrations() from public, anon, authenticated;

-- 4. Dropdown feed for the Reports card: every non-IKC website event plus
--    every old-site event that has no website counterpart.
create or replace function public.officer_report_options()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.can_manage_events() then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.');
  end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.start_time desc nulls last)
    from (
      select 'site:' || e.id                          as key,
             e.name                                   as title,
             e.start_time                             as start_time,
             (select count(*)::bigint from public.legacy_event_registrations l
               where l.event_id = e.id)               as legacy_regs,
             (select count(*)::bigint from public.event_signups s
               where s.event_id = e.id)               as site_rsvps
        from public.events e
       where coalesce(e.source,'') <> 'ikc'
      union all
      select 'wa:' || l.wa_event_id,
             min(l.event_title),
             min(l.event_start),
             count(*)::bigint,
             0::bigint
        from public.legacy_event_registrations l
       where l.event_id is null and l.wa_event_id is not null
       group by l.wa_event_id
    ) x
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.officer_report_options() from public, anon;
grant execute on function public.officer_report_options() to authenticated;

-- 5. The event report: who is coming and how much this event has raised.
--    p_key is 'site:<events.id>' or 'wa:<wa_event_id>' from the dropdown.
create or replace function public.officer_event_report(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
  v_checked_in      bigint := 0;
  v_legacy_raised   bigint := 0;
  v_legacy_pending  bigint := 0;
  v_site_raised     bigint := 0;
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

  -- Website RSVPs (only site events have these)
  if v_event_id is not null then
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'source', 'Website RSVP',
        'name', trim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')),
        'email', m.email,
        'detail', s.signup_role,
        'status', s.status,
        'guests', coalesce(s.guests_count, 0),
        'amount_cents', null,
        'checked_in', s.status = 'attended'
      ) order by m.last_name, m.first_name), '[]'::jsonb),
      coalesce(sum(case when s.status in ('registered','confirmed','attended')
                        then 1 + coalesce(s.guests_count, 0) else 0 end), 0)
      into v_site_attendees, v_site_headcount
      from public.event_signups s
      join public.members m on m.id = s.member_id
     where s.event_id = v_event_id;

    select coalesce(sum(p.amount_cents), 0) into v_site_raised
      from public.payments p
     where p.event_id = v_event_id and p.status = 'succeeded';
  end if;

  -- Old-site registrations (matched by event_id for site events,
  -- by wa_event_id for legacy-only events)
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
      'status', l.payment_state,
      'guests', 0,
      'amount_cents', l.total_fee_cents,
      'checked_in', l.checked_in
    ) order by l.registered_at), '[]'::jsonb),
    coalesce(count(*) filter (where coalesce(l.payment_state,'')
      not in ('Canceled','Probably abandoned (payment failed)')), 0),
    coalesce(count(*) filter (where l.checked_in), 0),
    coalesce(sum(l.total_fee_cents) filter (where l.payment_state = 'Paid'), 0),
    coalesce(sum(l.total_fee_cents) filter (where l.payment_state = 'Unpaid'), 0)
    into v_legacy_attendees, v_legacy_headcount, v_checked_in,
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
      'checked_in', v_checked_in,
      'raised_cents', v_legacy_raised + v_site_raised,
      'pending_cents', v_legacy_pending),
    'attendees', v_site_attendees || v_legacy_attendees);
end;
$$;
revoke all on function public.officer_event_report(text) from public, anon;
grant execute on function public.officer_event_report(text) to authenticated;

-- 6. Fundraising summary: money received by category and by event.
--    Optional date range filters payments by pay date and events by start.
create or replace function public.officer_fundraising_report(
  p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_by_category jsonb;
  v_by_event    jsonb;
  v_total       bigint;
begin
  if not public.can_manage_events() then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.');
  end if;

  with legacy as (
    select case
             when lp.origin = 'Event registration' then 'Events'
             when lp.origin in ('Member renewal','Member application','Member level change')
               then 'Membership dues & applications'
             when lp.origin = 'Online store order' then 'Store'
             when lp.origin = 'Manual invoice' then 'Manual invoices'
             when lp.origin like '%;%' then 'Mixed'
             else 'Other'
           end as category,
           (lp.settled_cents - lp.refunded_cents) as net_cents
      from public.legacy_payments lp
     where (p_from is null or lp.paid_at >= p_from)
       and (p_to is null or lp.paid_at < p_to + 1)
  ), site as (
    select case p.product_kind
             when 'event' then 'Events'
             when 'dues' then 'Membership dues & applications'
             when 'store' then 'Store'
             when 'raffle' then 'Raffle'
             when 'donation' then 'Donations'
             else 'Other'
           end as category,
           p.amount_cents as net_cents
      from public.payments p
     where p.status = 'succeeded'
       and (p_from is null or p.created_at >= p_from)
       and (p_to is null or p.created_at < p_to + 1)
  ), unioned as (
    select * from legacy union all select * from site
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.total_cents desc), '[]'::jsonb),
         coalesce(sum(c.total_cents), 0)
    into v_by_category, v_total
    from (select category, sum(net_cents)::bigint as total_cents,
                 count(*)::bigint as payments
            from unioned group by category) c;

  with per_event as (
    select e.name as title, e.start_time,
           coalesce((select sum(p.amount_cents) from public.payments p
                      where p.event_id = e.id and p.status = 'succeeded'), 0)
         + coalesce((select sum(l.total_fee_cents)
                       from public.legacy_event_registrations l
                      where l.event_id = e.id and l.payment_state = 'Paid'), 0)
           as raised_cents,
           coalesce((select sum(1 + coalesce(s.guests_count,0))
                       from public.event_signups s
                      where s.event_id = e.id
                        and s.status in ('registered','confirmed','attended')), 0)
         + coalesce((select count(*)
                       from public.legacy_event_registrations l
                      where l.event_id = e.id
                        and coalesce(l.payment_state,'')
                            not in ('Canceled','Probably abandoned (payment failed)')), 0)
           as headcount
      from public.events e
     where coalesce(e.source,'') <> 'ikc'
    union all
    select min(l.event_title), min(l.event_start),
           coalesce(sum(l.total_fee_cents) filter (where l.payment_state = 'Paid'), 0),
           count(*) filter (where coalesce(l.payment_state,'')
             not in ('Canceled','Probably abandoned (payment failed)'))
      from public.legacy_event_registrations l
     where l.event_id is null and l.wa_event_id is not null
     group by l.wa_event_id
  )
  select coalesce(jsonb_agg(to_jsonb(pe) order by pe.start_time desc nulls last), '[]'::jsonb)
    into v_by_event
    from per_event pe
   where (pe.raised_cents > 0 or pe.headcount > 0)
     and (p_from is null or pe.start_time >= p_from)
     and (p_to is null or pe.start_time < p_to + 1);

  return jsonb_build_object(
    'ok', true,
    'total_cents', v_total,
    'by_category', v_by_category,
    'by_event', v_by_event);
end;
$$;
revoke all on function public.officer_fundraising_report(date, date) from public, anon;
grant execute on function public.officer_fundraising_report(date, date) to authenticated;

-- 7. Run the matcher once now (no-op until the legacy data is imported).
select public.link_legacy_registrations();
