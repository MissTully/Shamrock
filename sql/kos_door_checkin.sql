-- Door check-in QR for Event Studio (and QR Code Studio meetings).
-- Applied live to Supabase project oazwkwflgbthojvnclfc. Safe to re-run.
--
-- WHY: the Member Hub already calls public.officer_enable_checkin(p_event)
-- and public.meeting_check_in(p_code), but those RPCs (and the private
-- meeting_checkin_codes table) were never ported from the old Tribe Test
-- parade-ready engine onto this project. Clicking Door check-in QR failed
-- with a PostgREST schema-cache miss.
--
-- Product:
--   * Door QR works for any Event Studio event (meetings AND socials such as
--     Book Club / Basket-Making Happy Hour), not only event_type = meeting.
--   * Member scan of members.html?checkin=CODE marks them attended.
--   * RSVP QR stays unimplemented in the UI (no extra SQL).

-- ---------------------------------------------------------------------------
-- A. Private per-event check-in codes (kept off events; members can read events)
-- ---------------------------------------------------------------------------
create table if not exists public.meeting_checkin_codes (
  event_id uuid primary key references public.events(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index if not exists meeting_checkin_codes_code_key
  on public.meeting_checkin_codes (code);

alter table public.meeting_checkin_codes enable row level security;

-- No client policies on purpose: codes are only created/consumed by the
-- SECURITY DEFINER RPCs below. Same pattern as outbound_emails.
revoke all on table public.meeting_checkin_codes from public, anon, authenticated;

comment on table public.meeting_checkin_codes is
  'Officer-only door check-in codes, one per event. Members never read this table; they submit the code via meeting_check_in().';

-- ---------------------------------------------------------------------------
-- B. Officer: create or return the door check-in code for an event
-- ---------------------------------------------------------------------------
create or replace function public.officer_enable_checkin(p_event uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code text;
  v_status text;
  v_tries int := 0;
begin
  if not public.can_manage_events() then
    raise exception 'Only officers and event chairs can make a door check-in QR.';
  end if;
  if p_event is null then
    raise exception 'Event is required.';
  end if;

  select status into v_status from public.events where id = p_event;
  if not found then
    raise exception 'Event not found.';
  end if;
  if v_status = 'cancelled' then
    raise exception 'That event is cancelled.';
  end if;

  select c.code into v_code
  from public.meeting_checkin_codes c
  where c.event_id = p_event;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := encode(extensions.gen_random_bytes(12), 'hex');
    begin
      insert into public.meeting_checkin_codes (event_id, code, created_by)
      values (p_event, v_code, auth.uid())
      on conflict (event_id) do nothing;
    exception when unique_violation then
      v_code := null;
    end;

    select c.code into v_code
    from public.meeting_checkin_codes c
    where c.event_id = p_event;
    if v_code is not null then
      return v_code;
    end if;
    if v_tries >= 5 then
      raise exception 'Could not create a check-in code. Try again.';
    end if;
  end loop;
end;
$$;

comment on function public.officer_enable_checkin(uuid) is
  'Officer/event-chair RPC: create or return the door check-in code for any Event Studio event.';

revoke all on function public.officer_enable_checkin(uuid) from public, anon;
grant execute on function public.officer_enable_checkin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- C. Member: scan the door QR (?checkin=CODE) and mark attendance
-- ---------------------------------------------------------------------------
create or replace function public.meeting_check_in(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member uuid;
  v_event public.events%rowtype;
  v_signup_id uuid;
  v_prior text;
  v_window_end timestamptz;
begin
  v_member := public.kos_current_member_id();
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in with your member account to check in.');
  end if;
  if v_member is null then
    return jsonb_build_object('ok', false, 'error', 'Your login is not linked to a krewe member record yet.');
  end if;
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing check-in code.');
  end if;

  select e.* into v_event
  from public.meeting_checkin_codes c
  join public.events e on e.id = c.event_id
  where c.code = btrim(p_code);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'That check-in code was not found.');
  end if;

  if v_event.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'That event is cancelled.');
  end if;

  -- Open until 12 hours after the event ends so the door QR works all evening.
  -- No early bound: officers can verify the square before the night.
  v_window_end := coalesce(v_event.end_time, v_event.start_time) + interval '12 hours';
  if v_window_end is not null and now() > v_window_end then
    return jsonb_build_object('ok', false, 'error', 'Check-in for this event has closed.');
  end if;

  select s.id, s.status into v_signup_id, v_prior
  from public.event_signups s
  where s.event_id = v_event.id and s.member_id = v_member;

  if v_signup_id is null then
    insert into public.event_signups (event_id, member_id, signup_role, status)
    values (v_event.id, v_member, 'attendee', 'attended')
    on conflict (event_id, member_id) do update
      set status = 'attended'
    returning id into v_signup_id;
  elsif v_prior is distinct from 'attended' then
    update public.event_signups
      set status = 'attended'
    where id = v_signup_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'event', v_event.name,
    'event_id', v_event.id,
    'already', v_prior = 'attended'
  );
end;
$$;

comment on function public.meeting_check_in(text) is
  'Signed-in member RPC: consume a door check-in code and mark event_signups.status = attended.';

revoke all on function public.meeting_check_in(text) from public, anon;
grant execute on function public.meeting_check_in(text) to authenticated;

-- ---------------------------------------------------------------------------
-- D. QR Code Studio: schedule a meeting (same missing parade-ready RPC)
-- ---------------------------------------------------------------------------
create or replace function public.officer_upsert_meeting(
  p_name text,
  p_start timestamptz,
  p_mandatory boolean default true
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not public.can_manage_events() then
    raise exception 'Only officers and event chairs can schedule meetings.';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null or char_length(v_name) < 3 then
    raise exception 'Give the meeting a name.';
  end if;
  if p_start is null then
    raise exception 'Give the meeting a date and time.';
  end if;

  insert into public.events (
    name, event_type, start_time, is_mandatory, is_public, status, source
  ) values (
    v_name,
    'meeting',
    p_start,
    coalesce(p_mandatory, true),
    false,
    'published',
    'krewe'
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.officer_upsert_meeting(text, timestamptz, boolean) is
  'Officer/event-chair RPC: create a krewe meeting event for QR Code Studio check-in.';

revoke all on function public.officer_upsert_meeting(text, timestamptz, boolean) from public, anon;
grant execute on function public.officer_upsert_meeting(text, timestamptz, boolean) to authenticated;

notify pgrst, 'reload schema';
