-- Applied to the Krewe of Shamrock project (oazwkwflgbthojvnclfc) on 2026-09-03
-- as migrations `kos_public_events_and_rsvp` and `kos_event_types_and_fall_2026_seed`.
--
-- WHY: the new Supabase project was created without the public-events plumbing
-- the website depends on, so every page showed "Could not load events":
--   1. events had no `is_public` column (all pages filter on it) and no `notes`.
--   2. No RLS policy let anonymous visitors read events at all.
--   3. The `rsvp_to_event` function the sign-up form calls did not exist,
--      nor did its `enqueue_email` helper or the `outbound_emails` queue.
--   4. The event_type check constraint was missing 'social' and 'ball'.
-- Everything below is ported from the old Tribe Test project. Safe to re-run.

-- 1. Columns the site queries
alter table public.events add column if not exists is_public boolean not null default true;
alter table public.events add column if not exists notes text;

-- 2. Anonymous visitors may read public events only
drop policy if exists events_select_public on public.events;
create policy events_select_public on public.events
  for select to anon
  using (is_public = true);

-- 3. Event types the Krewe actually uses
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events add constraint events_event_type_check
  check (event_type is null or event_type = any (array['parade','party','meeting','fundraiser','volunteer','social','ball','other']));

-- 4. Outbound email queue (written only via security-definer functions;
--    no client policies on purpose)
create table if not exists public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  to_name text,
  subject text not null,
  body_html text not null,
  purpose text not null default 'other',
  related_member_id uuid references public.members(id) on delete set null,
  status text not null default 'queued',
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.outbound_emails enable row level security;

-- 5. Email enqueue helper
create or replace function public.enqueue_email(p_to text, p_to_name text, p_subject text, p_body_html text, p_purpose text, p_member_id uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if p_to is null or position('@' in p_to) = 0 then
    return null;  -- no valid recipient; skip silently
  end if;
  insert into public.outbound_emails (to_email, to_name, subject, body_html, purpose, related_member_id)
  values (lower(p_to), p_to_name, p_subject, p_body_html, p_purpose, p_member_id)
  returning id into v_id;
  return v_id;
end;
$function$;

-- 6. The RSVP front door the sign-up form calls
create or replace function public.rsvp_to_event(p_event_id uuid, p_first_name text, p_last_name text, p_email text, p_guests_count integer default 0, p_signup_role text default 'attendee'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_member_id uuid;
  v_capacity  int;
  v_current   int;
  v_status    text;
  v_signup_id uuid;
  v_event_name text;
  v_subject   text;
  v_body      text;
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

  select name, capacity into v_event_name, v_capacity
  from public.events
  where id = p_event_id and is_public = true;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That event was not found or is not open for signups.');
  end if;

  select id into v_member_id from public.members where lower(email) = lower(p_email);
  if not found then
    insert into public.members (first_name, last_name, email, member_role, membership_status)
    values (btrim(p_first_name), btrim(p_last_name), lower(p_email), 'prospect', 'prospect')
    returning id into v_member_id;
  end if;

  select coalesce(sum(1 + guests_count), 0) into v_current
  from public.event_signups
  where event_id = p_event_id and status in ('registered','confirmed','attended');

  if v_capacity is not null and (v_current + 1 + p_guests_count) > v_capacity then
    v_status := 'waitlisted';
  else
    v_status := 'registered';
  end if;

  insert into public.event_signups (event_id, member_id, signup_role, status, guests_count)
  values (p_event_id, v_member_id, p_signup_role, v_status, p_guests_count)
  on conflict (event_id, member_id)
  do update set signup_role = excluded.signup_role,
                guests_count = excluded.guests_count,
                status = excluded.status
  returning id into v_signup_id;

  -- Queue a confirmation email
  if v_status = 'waitlisted' then
    v_subject := 'You''re on the waitlist: ' || v_event_name;
    v_body := '<p>Hi ' || btrim(p_first_name) || ',</p>'
           || '<p>Thanks for signing up for <strong>' || v_event_name || '</strong>. '
           || 'That event is currently full, so you''ve been added to the <strong>waitlist</strong>. '
           || 'We''ll be in touch if a spot opens up.</p><p>Sláinte! 🍀<br/>Krewe of Shamrock</p>';
  else
    v_subject := 'You''re signed up: ' || v_event_name;
    v_body := '<p>Hi ' || btrim(p_first_name) || ',</p>'
           || '<p>You''re confirmed for <strong>' || v_event_name || '</strong>'
           || case when p_guests_count > 0 then ' with ' || p_guests_count || ' guest(s)' else '' end
           || '. We can''t wait to see you!</p><p>Sláinte! 🍀<br/>Krewe of Shamrock</p>';
  end if;

  perform public.enqueue_email(lower(p_email), btrim(p_first_name) || ' ' || btrim(p_last_name),
                               v_subject, v_body, 'rsvp_confirmation', v_member_id);

  return jsonb_build_object(
    'ok', true,
    'signup_id', v_signup_id,
    'status', v_status,
    'message', case when v_status = 'waitlisted'
                    then 'This event is full — you have been added to the waitlist. We''ll be in touch.'
                    else 'You''re signed up! See you there.' end
  );
end;
$function$;

-- 7. Grants: the RSVP function is the only public entry point
revoke execute on function public.enqueue_email(text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.rsvp_to_event(uuid,text,text,text,integer,text) to anon, authenticated;
