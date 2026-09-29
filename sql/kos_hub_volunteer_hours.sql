-- APPLY BEFORE GO-LIVE
-- Krewe of Shamrock: Hub-native volunteer hours.
-- Run this whole file in the Supabase SQL editor on project
-- oazwkwflgbthojvnclfc BEFORE members log or approve hours on the new site.
-- Safe to re-run.
--
-- Depends on: events, event_signups, volunteer_hours, members, profiles,
--   is_krewe_officer(), can_manage_events(), kos_current_member_id(),
--   krewe_volunteer_season_year(), door_check_in / meeting_check_in.
--
-- What this adds:
--   * events.volunteer_cap (blank = no cap; 0 = no volunteer signups)
--   * Pending volunteer_hours when someone signs up as volunteer, if a slot remains
--   * One pending row per signup. Door check-in reuses that row instead of a second log.
--   * Officers approve any pending hours. An event host (event creator, or a member
--     signed up as organizer) approves pending hours for that event only.
--   * Optional officer import for a past Track It Forward export.
--     See MEMBER_VOLUNTEER_HOURS.md. No import screen in the Hub.
--
-- Season rules are unchanged: June-May via krewe_volunteer_season_year,
-- 12 hours, $12/hr buyout, in-kind logged as hours. This file does not
-- change dues.

-- ---------------------------------------------------------------------------
-- A. Columns
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists volunteer_cap integer;

alter table public.events drop constraint if exists events_volunteer_cap_check;
alter table public.events
  add constraint events_volunteer_cap_check
  check (volunteer_cap is null or volunteer_cap >= 0);

comment on column public.events.volunteer_cap is
  'Max members who may sign up as volunteer. Null means no cap. Zero blocks volunteer signup. Does not limit attendees.';

alter table public.volunteer_hours
  add column if not exists source text,
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

alter table public.volunteer_hours drop constraint if exists volunteer_hours_source_check;
alter table public.volunteer_hours
  add constraint volunteer_hours_source_check
  check (source is null or source in (
    'manual', 'in_kind', 'event_signup', 'door_checkin', 'trackitforward_import'
  ));

comment on column public.volunteer_hours.source is
  'manual: member log. in_kind: donation counted as hours. event_signup: auto pending row. door_checkin: hours-on-scan. trackitforward_import: officer import, auto-approved.';

create unique index if not exists volunteer_hours_tif_season_uidx
  on public.volunteer_hours (member_id, season_year)
  where source = 'trackitforward_import';

-- Public pages may show the cap number. Slot counts of who signed up stay in the RPC below.
grant select (volunteer_cap) on table public.events to anon;

-- ---------------------------------------------------------------------------
-- B. Public slot counts (no member names)
-- ---------------------------------------------------------------------------
create or replace function public.volunteer_slot_summary()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', e.id,
    'volunteer_cap', e.volunteer_cap,
    'slots_used', (
      select count(*)::int
      from public.event_signups s
      where s.event_id = e.id
        and s.signup_role = 'volunteer'
        and s.status in ('registered', 'confirmed', 'attended')
    )
  )), '[]'::jsonb)
  from public.events e
  where e.volunteer_cap is not null
    and lower(coalesce(e.status, 'published')) in ('published', 'live');
$$;

revoke all on function public.volunteer_slot_summary() from public;
grant execute on function public.volunteer_slot_summary() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- C. Volunteer cap + one pending hours row on volunteer signup
-- ---------------------------------------------------------------------------
create or replace function public.kos_volunteer_signup_occupies_slot(p_role text, p_status text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select p_role = 'volunteer'
     and p_status in ('registered', 'confirmed', 'attended');
$$;

create or replace function public.kos_guard_volunteer_cap()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_cap integer;
  v_used integer;
begin
  if not public.kos_volunteer_signup_occupies_slot(new.signup_role, new.status) then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and public.kos_volunteer_signup_occupies_slot(old.signup_role, old.status)
     and old.event_id is not distinct from new.event_id then
    return new;
  end if;

  select e.volunteer_cap into v_cap
  from public.events e
  where e.id = new.event_id
  for update;

  if v_cap is null then
    return new;
  end if;

  select count(*)::int into v_used
  from public.event_signups s
  where s.event_id = new.event_id
    and s.id is distinct from new.id
    and public.kos_volunteer_signup_occupies_slot(s.signup_role, s.status);

  if v_used >= v_cap then
    raise exception 'Volunteer slots are full for this event.';
  end if;
  return new;
end;
$$;

drop trigger if exists kos_guard_volunteer_cap on public.event_signups;
create trigger kos_guard_volunteer_cap
  before insert or update of signup_role, status, event_id
  on public.event_signups
  for each row
  execute function public.kos_guard_volunteer_cap();

create or replace function public.kos_autolog_volunteer_hours()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event public.events%rowtype;
  v_hours numeric;
  v_existing uuid;
begin
  if not public.kos_volunteer_signup_occupies_slot(new.signup_role, new.status) then
    delete from public.volunteer_hours
    where signup_id = new.id
      and status = 'pending'
      and source = 'event_signup';
    return new;
  end if;

  select * into v_event from public.events where id = new.event_id;
  if not found then
    return new;
  end if;

  select v.id into v_existing
  from public.volunteer_hours v
  where v.status <> 'rejected'
    and (
      v.signup_id = new.id
      or (v.event_id = new.event_id and v.member_id = new.member_id)
    )
  order by v.created_at
  limit 1;

  if v_existing is not null then
    update public.volunteer_hours
       set signup_id = coalesce(signup_id, new.id),
           event_id = coalesce(event_id, new.event_id)
     where id = v_existing
       and (signup_id is null or event_id is null);
    return new;
  end if;

  v_hours := new.volunteer_hours_planned;
  if v_hours is null and v_event.start_time is not null and v_event.end_time is not null then
    v_hours := round(extract(epoch from (v_event.end_time - v_event.start_time)) / 3600.0, 1);
  end if;
  v_hours := least(greatest(coalesce(v_hours, 2), 0.5), 24);

  insert into public.volunteer_hours (
    member_id, season_year, activity, hours, worked_on,
    approved, status, event_id, signup_id, source, notes
  ) values (
    new.member_id,
    public.krewe_volunteer_season_year(coalesce(v_event.start_time::date, current_date)),
    coalesce(v_event.name, 'Event') || ' volunteer',
    v_hours,
    coalesce(v_event.start_time::date, current_date),
    false,
    'pending',
    new.event_id,
    new.id,
    'event_signup',
    'Logged when you signed up to volunteer.'
  );
  return new;
exception when unique_violation then
  return new;
end;
$$;

drop trigger if exists kos_autolog_volunteer_hours on public.event_signups;
create trigger kos_autolog_volunteer_hours
  after insert or update of signup_role, status, volunteer_hours_planned, event_id
  on public.event_signups
  for each row
  execute function public.kos_autolog_volunteer_hours();

-- ---------------------------------------------------------------------------
-- D. Door check-in reuses the signup row (one pending log, still not auto-approved)
-- ---------------------------------------------------------------------------
create or replace function public.door_check_in(p_code text) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_base jsonb;
  v_event_id uuid;
  v_mid uuid := public.kos_current_member_id();
  v_e public.events%rowtype;
  v_hours numeric;
  v_planned numeric;
  v_signup uuid;
  v_inserted boolean := false;
  v_gate jsonb;
  v_existing_id uuid;
  v_existing_hours numeric;
  v_existing_status text;
begin
  v_event_id := public.kos_checkin_event_for_code(p_code);
  if v_event_id is not null then
    select * into v_e from public.events where id = v_event_id;
    if found then
      v_gate := public.kos_parade_soft_gate_block(v_e, v_mid);
      if v_gate is not null then
        return v_gate;
      end if;
    end if;
  end if;

  v_base := public.meeting_check_in(p_code);
  if coalesce(v_base->>'ok', 'false') <> 'true' then
    return v_base;
  end if;

  v_event_id := nullif(v_base->>'event_id', '')::uuid;
  if v_event_id is null then
    v_event_id := public.kos_checkin_event_for_code(p_code);
  end if;
  if v_event_id is null or v_mid is null then
    return v_base;
  end if;

  insert into public.door_checkins(event_id, member_id)
  values (v_event_id, v_mid)
  on conflict (event_id, member_id) do nothing;
  v_inserted := found;
  if not v_inserted then
    return v_base || jsonb_build_object('already_checked_in', true);
  end if;

  select * into v_e from public.events where id = v_event_id;
  if not found then
    return v_base;
  end if;

  select s.id, s.volunteer_hours_planned
    into v_signup, v_planned
  from public.event_signups s
  where s.event_id = v_event_id
    and s.member_id = v_mid
    and s.signup_role = 'volunteer'
    and s.status in ('registered', 'confirmed', 'attended')
  order by s.created_at desc nulls last
  limit 1;

  if not found and v_e.event_type <> 'volunteer' then
    return v_base;
  end if;

  select v.id, v.hours, v.status
    into v_existing_id, v_existing_hours, v_existing_status
  from public.volunteer_hours v
  where v.member_id = v_mid
    and v.event_id = v_event_id
    and v.status <> 'rejected'
  order by v.created_at
  limit 1;

  if v_existing_id is not null then
    update public.door_checkins
       set hours_awarded = v_existing_hours
     where event_id = v_event_id and member_id = v_mid;
    return v_base || jsonb_build_object(
      'hours_already_logged', true,
      'hours_pending', case when v_existing_status = 'pending' then v_existing_hours else null end
    );
  end if;

  v_hours := v_planned;
  if v_hours is null and v_e.start_time is not null and v_e.end_time is not null then
    v_hours := round(extract(epoch from (v_e.end_time - v_e.start_time)) / 3600.0, 1);
  end if;
  v_hours := least(greatest(coalesce(v_hours, 2), 0.5), 24);

  insert into public.volunteer_hours(
    member_id, season_year, activity, hours, worked_on,
    approved, status, event_id, signup_id, source
  ) values (
    v_mid,
    public.krewe_volunteer_season_year(coalesce(v_e.start_time::date, current_date)),
    'Door check-in: ' || coalesce(v_e.name, 'volunteer event'),
    v_hours,
    coalesce(v_e.start_time::date, current_date),
    false,
    'pending',
    v_event_id,
    v_signup,
    'door_checkin'
  );
  update public.door_checkins
     set hours_awarded = v_hours
   where event_id = v_event_id and member_id = v_mid;

  return v_base || jsonb_build_object('hours_pending', v_hours);
end;
$$;

revoke all on function public.door_check_in(text) from public;
grant execute on function public.door_check_in(text) to authenticated;

-- ---------------------------------------------------------------------------
-- E. Member log + host/officer review
-- ---------------------------------------------------------------------------
create or replace function public.kos_is_event_hours_host(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_event is not null and (
    exists (
      select 1 from public.events e
      where e.id = p_event and e.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.event_signups s
      where s.event_id = p_event
        and s.member_id = public.kos_current_member_id()
        and s.signup_role = 'organizer'
        and s.status in ('registered', 'confirmed', 'attended')
    )
  );
$$;

revoke all on function public.kos_is_event_hours_host(uuid) from public;
revoke all on function public.kos_is_event_hours_host(uuid) from anon, authenticated;

create or replace function public.kos_can_review_hour(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_krewe_officer()
      or public.kos_is_event_hours_host(p_event);
$$;

revoke all on function public.kos_can_review_hour(uuid) from public;
revoke all on function public.kos_can_review_hour(uuid) from anon, authenticated;

create or replace function public.log_my_volunteer_hours(
  p_hours numeric,
  p_activity text,
  p_worked_on date default null,
  p_kind text default 'shift'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mid uuid := public.kos_current_member_id();
  v_kind text := lower(coalesce(p_kind, 'shift'));
  v_activity text;
  v_source text;
  v_notes text;
  v_on date := coalesce(p_worked_on, current_date);
  v_id uuid;
begin
  if auth.uid() is null or v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in with a linked member record to log hours.');
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 500 then
    return jsonb_build_object('ok', false, 'message', 'Enter hours between 0.5 and 500.');
  end if;
  if v_kind not in ('shift', 'in_kind', 'season_file') then
    v_kind := 'shift';
  end if;

  v_activity := nullif(btrim(coalesce(p_activity, '')), '');
  if v_kind = 'season_file' then
    v_activity := coalesce(v_activity, 'Season hours on file');
    v_source := 'manual';
    v_notes := 'One-time season balance entered in the Hub.';
    if exists (
      select 1 from public.volunteer_hours v
      where v.member_id = v_mid
        and v.season_year = public.krewe_volunteer_season_year(v_on)
        and v.activity = 'Season hours on file'
        and v.status <> 'rejected'
    ) then
      return jsonb_build_object('ok', false, 'message',
        'Season hours on file are already saved for this season. Log new shifts as hours worked.');
    end if;
  elsif v_kind = 'in_kind' then
    v_activity := coalesce(v_activity, 'In-kind donation');
    v_source := 'in_kind';
    v_notes := 'In-kind donation. $12 counts as 1 hour.';
  else
    v_activity := coalesce(v_activity, 'Volunteer shift');
    v_source := 'manual';
    v_notes := null;
  end if;

  insert into public.volunteer_hours (
    member_id, season_year, activity, hours, worked_on,
    approved, status, source, notes
  ) values (
    v_mid,
    public.krewe_volunteer_season_year(v_on),
    v_activity,
    p_hours,
    v_on,
    false,
    'pending',
    v_source,
    v_notes
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending');
end;
$$;

revoke all on function public.log_my_volunteer_hours(numeric, text, date, text) from public;
grant execute on function public.log_my_volunteer_hours(numeric, text, date, text) to authenticated;

create or replace function public.list_pending_volunteer_hours()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_officer boolean := public.is_krewe_officer();
  v_host boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('viewer', 'none', 'hours', '[]'::jsonb);
  end if;

  v_host := exists (
    select 1 from public.events e where e.created_by = auth.uid()
  ) or exists (
    select 1
    from public.event_signups s
    where s.member_id = public.kos_current_member_id()
      and s.signup_role = 'organizer'
      and s.status in ('registered', 'confirmed', 'attended')
  );

  if not v_officer and not v_host then
    return jsonb_build_object('viewer', 'none', 'hours', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'viewer', case when v_officer then 'officer' else 'host' end,
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'member_name', trim(both ' ' from coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
        'hours', v.hours,
        'activity', v.activity,
        'worked_on', v.worked_on,
        'event_id', v.event_id,
        'event_name', e.name,
        'source', v.source,
        'notes', v.notes,
        'created_at', v.created_at
      ) order by v.created_at)
      from public.volunteer_hours v
      join public.members m on m.id = v.member_id
      left join public.events e on e.id = v.event_id
      where v.status = 'pending'
        and coalesce(v.is_demo, false) = false
        and (
          v_officer
          or public.kos_is_event_hours_host(v.event_id)
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_pending_volunteer_hours() from public;
grant execute on function public.list_pending_volunteer_hours() to authenticated;

create or replace function public.decide_volunteer_hours(
  p_id uuid,
  p_approved boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.volunteer_hours%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to review hours.');
  end if;

  select * into v_row from public.volunteer_hours where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That hours log was not found.');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'message', 'That hours log is already decided.');
  end if;

  if not (
    public.is_krewe_officer()
    or (v_row.event_id is not null and public.kos_is_event_hours_host(v_row.event_id))
  ) then
    return jsonb_build_object('ok', false, 'message', 'You can only confirm hours for events you host.');
  end if;

  if char_length(coalesce(v_note, '')) > 500 then
    return jsonb_build_object('ok', false, 'message', 'Keep the note under 500 characters.');
  end if;

  update public.volunteer_hours
     set approved = coalesce(p_approved, false),
         status = case when coalesce(p_approved, false) then 'approved' else 'rejected' end,
         review_note = v_note,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id
     and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'status', case when coalesce(p_approved, false) then 'approved' else 'rejected' end
  );
end;
$$;

revoke all on function public.decide_volunteer_hours(uuid, boolean, text) from public;
grant execute on function public.decide_volunteer_hours(uuid, boolean, text) to authenticated;

-- Officers set the cap from Event Studio. Blank clears it.
create or replace function public.officer_set_volunteer_cap(p_event uuid, p_cap integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.can_manage_events() then
    return jsonb_build_object('ok', false, 'message', 'Only officers and event managers can set volunteer slots.');
  end if;
  if p_cap is not null and p_cap < 0 then
    return jsonb_build_object('ok', false, 'message', 'Volunteer slots must be zero or more, or blank for no cap.');
  end if;

  update public.events
     set volunteer_cap = p_cap,
         updated_at = now()
   where id = p_event
     and coalesce(source, '') <> 'ikc';

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Event not found, or IKC events cannot be edited.');
  end if;
  return jsonb_build_object('ok', true, 'volunteer_cap', p_cap);
end;
$$;

revoke all on function public.officer_set_volunteer_cap(uuid, integer) from public;
grant execute on function public.officer_set_volunteer_cap(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- F. Track It Forward import (officers, no Hub screen)
--    Auto-approved: those hours were already accepted in the old system.
--    One row per member per season. A second import skips that member.
--    Shape: [{"email","hours","season_year","activity","worked_on"}]
-- ---------------------------------------------------------------------------
create or replace function public.import_trackitforward_hours(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row jsonb;
  v_email text;
  v_hours numeric;
  v_season integer;
  v_activity text;
  v_on date;
  v_mid uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Pass a JSON array of rows.');
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_email := lower(btrim(coalesce(v_row->>'email', '')));
    begin
      v_hours := (v_row->>'hours')::numeric;
    exception when others then
      v_hours := null;
    end;
    v_season := null;
    if nullif(btrim(coalesce(v_row->>'season_year', '')), '') is not null then
      begin
        v_season := (v_row->>'season_year')::integer;
      exception when others then
        v_season := null;
      end;
    end if;
    v_on := null;
    if nullif(btrim(coalesce(v_row->>'worked_on', '')), '') is not null then
      begin
        v_on := (v_row->>'worked_on')::date;
      exception when others then
        v_on := null;
      end;
    end if;
    v_on := coalesce(v_on, current_date);
    v_season := coalesce(v_season, public.krewe_volunteer_season_year(v_on));
    v_activity := coalesce(nullif(btrim(coalesce(v_row->>'activity', '')), ''), 'Season hours imported');

    if v_email = '' or v_hours is null or v_hours <= 0 or v_hours > 500 then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'email', v_email, 'message', 'Need an email and hours between 0.5 and 500.'
      ));
      continue;
    end if;

    select m.id into v_mid
    from public.members m
    where lower(m.email) = v_email
      and m.merged_into is null
    order by m.created_at nulls last
    limit 1;

    if v_mid is null then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'email', v_email, 'message', 'No roster member with that email.'
      ));
      continue;
    end if;

    begin
      insert into public.volunteer_hours (
        member_id, season_year, activity, hours, worked_on,
        approved, status, source, notes
      ) values (
        v_mid, v_season, v_activity, v_hours, v_on,
        true, 'approved', 'trackitforward_import',
        'Imported from a Track It Forward export. Already accepted, so this row is approved.'
      );
      v_inserted := v_inserted + 1;
    exception when unique_violation then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'email', v_email, 'message', 'Already imported for that season.'
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.import_trackitforward_hours(jsonb) from public;
grant execute on function public.import_trackitforward_hours(jsonb) to authenticated;

-- Public event list may include the cap so signup can warn before the trigger.
drop view if exists public.v_public_events;
create view public.v_public_events
with (security_invoker = true) as
select
  id, name, description, event_type, start_time, end_time, location,
  capacity, volunteer_cap, is_public, source, external_url,
  ticket_price_cents, ticket_label, ticket_payment_url, flyer_url,
  status, is_featured, collect_guests, collect_guest_names,
  collect_raffle, raffle_options, raffle_event_id, collect_meals,
  meal_options, is_online, registration_closes_at, members_only
from public.events
where is_public = true;

grant select on public.v_public_events to anon, authenticated;
