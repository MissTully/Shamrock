-- Membership application pipeline (Phase 2).
--
-- APPLY THIS BEFORE GO-LIVE. The website does not run it.
--   1. Open Supabase project oazwkwflgbthojvnclfc.
--   2. SQL Editor -> New query -> paste this whole file -> Run.
--   3. Safe to run more than once.
-- Run sql/kos_membership_applications.sql first if Membership Applications
-- is not in the Hub yet. If you re-run that older file after this one,
-- run this file again so the new stages and the chair email stay in place.
--
-- What officers get after this file:
--   * Stages on membership_status, beyond approve / decline / archive:
--       pending-new          New (submitted on the join form)
--       background-check     Background check in progress
--       dues-pending         Membership dues pending (after the background check)
--       active               Approved
--       declined             Declined
--       archived             Archived
--   * History stays in membership_application_actions (who, when, note,
--     from status, to status). New action values: background_check,
--     dues_pending, next_step_sent.
--   * Application fee type on the roster row: single ($50) or dual ($75).
--     That fee is the background check. It is not membership dues.
--   * Social Security number for the background check, stored in
--     membership_application_ids. Lists return the last 4 only.
--     The full number is available only to application reviewers, through
--     reveal_membership_application_id. It is never written into email.
--     Direct table reads are revoked. Row level security is on with no
--     client policy, so the browser cannot select the table.
--   * New join applications still queue secretary@ and digital@ as before,
--     and queue the Membership Chair (or lsugrue99@gmail.com if nobody
--     holds that role) with the applicant name and a link to Membership
--     Applications.
--
-- Until this file is applied, the join form still submits name and address
-- through the older function. Stage buttons and the background-check number
-- need this file.

-- ---------------------------------------------------------------------------
-- 1) Status values
-- ---------------------------------------------------------------------------
alter table public.members drop constraint if exists members_membership_status_check;
alter table public.members add constraint members_membership_status_check
  check (membership_status in (
    'active', 'inactive', 'lapsed', 'prospect',
    'pending-new', 'background-check', 'dues-pending', 'pending-renewal',
    'merged', 'declined', 'archived'
  ));

alter table public.members add column if not exists application_fee_type text;
alter table public.members drop constraint if exists members_application_fee_type_check;
alter table public.members add constraint members_application_fee_type_check
  check (application_fee_type is null or application_fee_type in ('single', 'dual'));

alter table public.members add column if not exists partner_first_name text;
alter table public.members add column if not exists partner_last_name text;

comment on column public.members.application_fee_type is
  'Join-form application fee: single ($50) or dual ($75). Not membership dues.';

-- ---------------------------------------------------------------------------
-- 2) Background-check ID. Reviewers do not get a table grant.
-- ---------------------------------------------------------------------------
create table if not exists public.membership_application_ids (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  person_slot text not null check (person_slot in ('applicant', 'partner')),
  id_kind text not null default 'ssn' check (id_kind in ('ssn')),
  id_digits text not null check (id_digits ~ '^\d{9}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists membership_application_ids_member_slot_idx
  on public.membership_application_ids (member_id, person_slot);

alter table public.membership_application_ids enable row level security;

revoke all on table public.membership_application_ids from public, anon, authenticated;

comment on table public.membership_application_ids is
  'Background-check Social Security numbers. No direct API read. Lists show last 4. Full value only via reveal_membership_application_id for application reviewers.';

-- ---------------------------------------------------------------------------
-- 3) Wider history actions. Existing approve / decline / archive rows stay.
-- ---------------------------------------------------------------------------
alter table public.membership_application_actions
  drop constraint if exists membership_application_actions_action_check;
alter table public.membership_application_actions
  add constraint membership_application_actions_action_check
  check (action in (
    'approve', 'decline', 'archive',
    'background_check', 'dues_pending', 'next_step_sent'
  ));

-- ---------------------------------------------------------------------------
-- 4) Digits helper. Not a client API. Never log the value.
-- ---------------------------------------------------------------------------
create or replace function public.kos_ssn_digits(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(coalesce(p_text, ''), '\D', '', 'g') ~ '^\d{9}$'
    then regexp_replace(p_text, '\D', '', 'g')
    else null
  end;
$$;

revoke all on function public.kos_ssn_digits(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) List. Buckets: new, background, dues, approved, declined, archived,
--    renewal, prospect. Last 4 only. Never id_digits.
-- ---------------------------------------------------------------------------
create or replace function public.list_membership_applications(p_bucket text default 'new')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bucket text := lower(coalesce(nullif(btrim(p_bucket), ''), 'new'));
  v_status text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;

  if v_bucket = 'renewal' then
    v_status := 'pending-renewal';
  elsif v_bucket = 'prospect' then
    v_status := 'prospect';
  elsif v_bucket = 'background' then
    v_status := 'background-check';
  elsif v_bucket = 'dues' then
    v_status := 'dues-pending';
  elsif v_bucket = 'approved' then
    v_status := 'active';
  elsif v_bucket = 'declined' then
    v_status := 'declined';
  elsif v_bucket = 'archived' then
    v_status := 'archived';
  else
    v_bucket := 'new';
    v_status := 'pending-new';
  end if;

  return jsonb_build_object(
    'ok', true,
    'bucket', v_bucket,
    'counts', jsonb_build_object(
      'new', (select count(*) from public.members m
              where m.merged_into is null and m.membership_status = 'pending-new'),
      'background', (select count(*) from public.members m
                     where m.merged_into is null and m.membership_status = 'background-check'),
      'dues', (select count(*) from public.members m
               where m.merged_into is null and m.membership_status = 'dues-pending'),
      'approved', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'active'
                     and exists (
                       select 1 from public.membership_application_actions a
                       where a.member_id = m.id and a.action = 'approve'
                     )),
      'declined', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'declined'),
      'archived', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'archived'),
      'renewal', (select count(*) from public.members m
                  where m.merged_into is null and m.membership_status = 'pending-renewal'),
      'prospect', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'prospect')
    ),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'first_name', q.first_name,
        'last_name', q.last_name,
        'email', q.email,
        'phone', q.phone,
        'street_address', q.street_address,
        'city', q.city,
        'state', q.state,
        'zip', q.zip,
        'notes', q.notes,
        'interests', q.interests,
        'membership_status', q.membership_status,
        'member_role', q.member_role,
        'application_fee_type', q.application_fee_type,
        'partner_first_name', q.partner_first_name,
        'partner_last_name', q.partner_last_name,
        'ssn_last4', q.ssn_last4,
        'partner_ssn_last4', q.partner_ssn_last4,
        'has_ssn', q.has_ssn,
        'join_date', q.join_date,
        'created_at', q.created_at
      ) order by q.created_at desc)
      from (
        select m.id, m.first_name, m.last_name, m.email, m.phone,
               m.street_address, m.city, m.state, m.zip,
               m.notes, m.interests, m.membership_status, m.member_role,
               m.application_fee_type, m.partner_first_name, m.partner_last_name,
               m.join_date, m.created_at,
               (select right(i.id_digits, 4)
                  from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'applicant'
                 limit 1) as ssn_last4,
               (select right(i.id_digits, 4)
                  from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'partner'
                 limit 1) as partner_ssn_last4,
               exists (
                 select 1 from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'applicant'
               ) as has_ssn
        from public.members m
        where m.merged_into is null
          and m.membership_status = v_status
          and (
            v_status <> 'active'
            or exists (
              select 1 from public.membership_application_actions a
              where a.member_id = m.id and a.action = 'approve'
            )
          )
        order by m.created_at desc
        limit 80
      ) q
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'member_id', q.member_id,
        'action', q.action,
        'note', q.note,
        'from_status', q.from_status,
        'to_status', q.to_status,
        'actor_name', q.actor_name,
        'actor_email', q.actor_email,
        'created_at', q.created_at,
        'applicant', q.applicant
      ) order by q.created_at desc)
      from (
        select a.id, a.member_id, a.action, a.note, a.from_status, a.to_status,
               a.actor_name, a.actor_email, a.created_at,
               btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) as applicant
        from public.membership_application_actions a
        left join public.members m on m.id = a.member_id
        order by a.created_at desc
        limit 12
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Move an application. Records who and when. Does not email an ID number.
-- ---------------------------------------------------------------------------
create or replace function public._apply_membership_application_decision(
  p_member_id uuid,
  p_action text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.members%rowtype;
  v_actor record;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
  v_role text;
  v_to text;
  v_subject text;
  v_html text;
  v_name text;
  v_emailed boolean := false;
  v_message text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if p_action not in ('approve', 'decline', 'archive', 'background_check', 'dues_pending', 'next_step_sent') then
    return jsonb_build_object('ok', false, 'message', 'That action is not available.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing application.');
  end if;

  select * into rec
  from public.members
  where id = p_member_id
  for update;

  if not found or rec.merged_into is not null then
    return jsonb_build_object('ok', false, 'message', 'That application was not found.');
  end if;
  if rec.membership_status not in (
    'pending-new', 'background-check', 'dues-pending', 'pending-renewal', 'prospect'
  ) then
    return jsonb_build_object('ok', false, 'message', 'That application is no longer waiting for review.');
  end if;

  select * into v_actor from public._officer_actor();

  if p_action = 'approve' then
    v_to := 'active';
    v_role := rec.member_role;
    if v_role is null or btrim(v_role) = '' or lower(v_role) in ('prospect', 'pending') then
      v_role := 'member';
    end if;
    update public.members
       set membership_status = 'active',
           member_role = v_role,
           join_date = coalesce(join_date, (timezone('America/New_York', now()))::date),
           updated_at = now()
     where id = rec.id;
    if to_regprocedure('public.kos_sync_roster_role_grants(uuid)') is not null then
      perform public.kos_sync_roster_role_grants(rec.id);
    end if;
  elsif p_action = 'decline' then
    v_to := 'declined';
    update public.members
       set membership_status = 'declined',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'archive' then
    v_to := 'archived';
    update public.members
       set membership_status = 'archived',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'background_check' then
    v_to := 'background-check';
    update public.members
       set membership_status = 'background-check',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'dues_pending' then
    v_to := 'dues-pending';
    update public.members
       set membership_status = 'dues-pending',
           updated_at = now()
     where id = rec.id;
  else
    v_to := rec.membership_status;
  end if;

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, p_action, v_note, rec.membership_status, v_to,
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  v_name := btrim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, ''));

  if p_action = 'approve' and rec.membership_status in (
    'pending-new', 'prospect', 'background-check', 'dues-pending'
  ) then
    v_subject := 'Welcome to the Krewe of Shamrock';
    v_html :=
      '<p>Dear ' || public.kos_html_text(coalesce(nullif(btrim(rec.first_name), ''), 'friend')) || ',</p>'
      || '<p>Welcome. Your membership application is approved, and you are on the krewe roster.</p>'
      || '<p>To use the Member Hub, create your login with the same email you put on the application ('
      || public.kos_html_text(coalesce(rec.email, '')) || '):</p>'
      || '<ol>'
      || '<li>Open the Member Hub at <a href="https://www.kreweofshamrock.com/members.html">kreweofshamrock.com/members.html</a>.</li>'
      || '<li>Tap <strong>Create or reset your password</strong>.</li>'
      || '<li>Enter that email. We will send you a secure link. The same link works for a first password or a reset.</li>'
      || '<li>Open the link on your device and choose a password of at least 8 characters.</li>'
      || '<li>Come back and sign in with that email and password.</li>'
      || '</ol>'
      || '<p>Signing up with this email links your login to your membership. Old Wild Apricot passwords do not work here.</p>'
      || '<p>Questions: <a href="mailto:secretary@kreweofshamrock.com">secretary@kreweofshamrock.com</a>.</p>'
      || '<p>Sláinte!</p>';
    if to_regprocedure('public.wrap_all_krewe_email_html(text,text)') is not null then
      v_html := public.wrap_all_krewe_email_html(v_subject, v_html);
    end if;
    if public.enqueue_email(
      rec.email,
      nullif(v_name, ''),
      v_subject,
      v_html,
      'membership_welcome',
      rec.id
    ) is not null then
      v_emailed := true;
    end if;
    if v_emailed then
      v_message := 'Approved. They are an active member now. We emailed them a welcome note with steps to create a Member Hub login: open the Member Hub, tap Create or reset your password, and use the email on this application. Signing up with that email links their login to this membership.';
    else
      v_message := 'Approved. They are an active member now. We could not email them, so please tell them the next step: open the Member Hub, tap Create or reset your password, and use the email on this application. Signing up with that email links their login to this membership.';
    end if;
  elsif p_action = 'approve' then
    v_message := 'Approved. They are an active member again. They can sign in with the Member Hub login they already use.';
  elsif p_action = 'decline' then
    v_message := 'Declined. Their record stays on file and is off the new-application list. Nothing was deleted.';
  elsif p_action = 'archive' then
    v_message := 'Archived. Their record stays on file and is off the new-application list. Nothing was deleted.';
  elsif p_action = 'background_check' then
    v_message := 'Moved to background check in progress. Other officers can see this status and your note.';
  elsif p_action = 'dues_pending' then
    v_message := 'Moved to dues pending. This is membership dues after the background check, not the application fee.';
  else
    v_message := 'Next step sent. The note is on the application history.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', v_message,
    'emailed', v_emailed,
    'status', v_to
  );
end;
$$;

create or replace function public.set_membership_application_status(
  p_member_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._apply_membership_application_decision(p_member_id, p_action, p_note);
end;
$$;

revoke all on function public._apply_membership_application_decision(uuid, text, text) from public, anon, authenticated;

revoke all on function public.set_membership_application_status(uuid, text, text) from public, anon;
grant execute on function public.set_membership_application_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Full number for a reviewer who opens one application. Not used in lists.
-- ---------------------------------------------------------------------------
create or replace function public.reveal_membership_application_id(
  p_member_id uuid,
  p_slot text default 'applicant'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slot text := lower(coalesce(nullif(btrim(p_slot), ''), 'applicant'));
  v_digits text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if v_slot not in ('applicant', 'partner') then
    return jsonb_build_object('ok', false, 'message', 'That person is not on the application.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing application.');
  end if;

  select i.id_digits into v_digits
  from public.membership_application_ids i
  where i.member_id = p_member_id
    and i.person_slot = v_slot
  limit 1;

  if v_digits is null then
    return jsonb_build_object('ok', false, 'message', 'No Social Security number is on file for that person.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'slot', v_slot,
    'last4', right(v_digits, 4),
    'ssn', substr(v_digits, 1, 3) || '-' || substr(v_digits, 4, 2) || '-' || substr(v_digits, 6, 4)
  );
end;
$$;

revoke all on function public.reveal_membership_application_id(uuid, text) from public, anon;
grant execute on function public.reveal_membership_application_id(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Join form. Same secretary and digital notices. Chair copy names the
--    applicant and points at Membership Applications. No ID number in email.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_membership_application(text, text, text, text, text, text, text, text, text);

create or replace function public.submit_membership_application(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_street_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null,
  p_fee_type text default null,
  p_partner_first text default null,
  p_partner_last text default null,
  p_ssn text default null,
  p_partner_ssn text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := left(trim(coalesce(p_first_name,'')), 80);
  v_last  text := left(trim(coalesce(p_last_name,'')), 80);
  v_email text := left(lower(trim(coalesce(p_email,''))), 120);
  v_phone text := nullif(left(trim(coalesce(p_phone,'')), 40), '');
  v_notes text := nullif(left(trim(coalesce(p_notes,'')), 2000), '');
  v_street text := nullif(left(trim(coalesce(p_street_address,'')), 120), '');
  v_city text := nullif(left(trim(coalesce(p_city,'')), 80), '');
  v_state text := nullif(left(trim(coalesce(p_state,'')), 20), '');
  v_zip text := nullif(left(trim(coalesce(p_zip,'')), 16), '');
  v_fee text := lower(coalesce(nullif(btrim(p_fee_type), ''), ''));
  v_partner_first text := nullif(left(trim(coalesce(p_partner_first, '')), 80), '');
  v_partner_last text := nullif(left(trim(coalesce(p_partner_last, '')), 80), '');
  v_ssn text;
  v_partner_ssn text;
  v_id uuid;
  v_status text;
  v_is_new boolean := false;
  v_open boolean := false;
  v_recent int;
  v_addr text;
  v_chair_sent boolean := false;
  v_chair record;
  v_chair_html text;
  v_fee_line text;
begin
  if v_first = '' or v_last = '' then
    return jsonb_build_object('ok', false, 'message', 'First and last name are required.');
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'A valid email is required.');
  end if;
  if v_street is null or v_city is null or v_state is null or v_zip is null then
    return jsonb_build_object('ok', false, 'message', 'Please add your mailing address.');
  end if;
  if v_fee = 'couple' then
    v_fee := 'dual';
  end if;
  if v_fee <> '' and v_fee not in ('single', 'dual') then
    return jsonb_build_object('ok', false, 'message', 'Choose single applicant or couple for the application fee.');
  end if;
  if nullif(btrim(coalesce(p_ssn, '')), '') is not null then
    v_ssn := public.kos_ssn_digits(p_ssn);
    if v_ssn is null then
      return jsonb_build_object('ok', false, 'message', 'Enter a 9 digit Social Security number for the background check. Do not send a driver license number.');
    end if;
  end if;
  if nullif(btrim(coalesce(p_partner_ssn, '')), '') is not null then
    v_partner_ssn := public.kos_ssn_digits(p_partner_ssn);
    if v_partner_ssn is null then
      return jsonb_build_object('ok', false, 'message', 'Enter a 9 digit Social Security number for the second applicant. Do not send a driver license number.');
    end if;
  end if;

  select count(*) into v_recent
  from public.members
  where membership_status in ('pending-new', 'prospect', 'background-check', 'dues-pending')
    and created_at > now() - interval '10 minutes';
  if v_recent >= 12 then
    return jsonb_build_object('ok', false, 'message', 'Please try again in a few minutes.');
  end if;

  select id, membership_status into v_id, v_status
  from public.members
  where lower(email) = v_email and merged_into is null
  order by created_at
  limit 1;

  if v_id is null then
    insert into public.members (
      first_name, last_name, email, phone, notes,
      street_address, city, state, zip,
      member_role, membership_status,
      application_fee_type, partner_first_name, partner_last_name
    ) values (
      v_first, v_last, v_email, v_phone, v_notes,
      v_street, v_city, v_state, v_zip,
      'prospect', 'pending-new',
      nullif(v_fee, ''), v_partner_first, v_partner_last
    ) returning id into v_id;
    v_is_new := true;
    v_status := 'pending-new';
    v_open := true;
  else
    v_open := v_status in ('prospect', 'pending-new', 'background-check', 'dues-pending');
    update public.members set
      first_name = v_first,
      last_name = v_last,
      phone = coalesce(v_phone, phone),
      notes = coalesce(v_notes, notes),
      street_address = coalesce(v_street, street_address),
      city = coalesce(v_city, city),
      state = coalesce(v_state, state),
      zip = coalesce(v_zip, zip),
      application_fee_type = case when v_open and v_fee <> '' then v_fee else application_fee_type end,
      partner_first_name = case when v_open then coalesce(v_partner_first, partner_first_name) else partner_first_name end,
      partner_last_name = case when v_open then coalesce(v_partner_last, partner_last_name) else partner_last_name end,
      updated_at = now()
    where id = v_id;
  end if;

  -- Store the background-check number only for an open application.
  -- Active members who hit the join form do not get an ID written.
  if v_open and v_ssn is not null then
    insert into public.membership_application_ids (member_id, person_slot, id_kind, id_digits)
    values (v_id, 'applicant', 'ssn', v_ssn)
    on conflict (member_id, person_slot) do update
      set id_digits = excluded.id_digits,
          updated_at = now();
  end if;
  if v_open and v_fee = 'dual' and v_partner_ssn is not null then
    insert into public.membership_application_ids (member_id, person_slot, id_kind, id_digits)
    values (v_id, 'partner', 'ssn', v_partner_ssn)
    on conflict (member_id, person_slot) do update
      set id_digits = excluded.id_digits,
          updated_at = now();
  end if;

  v_addr := v_street || ', ' || v_city || ', ' || v_state || ' ' || v_zip;
  v_fee_line := case
    when v_fee = 'dual' then 'Application fee: couple, $75. This is the background check fee, not membership dues.'
    when v_fee = 'single' then 'Application fee: single applicant, $50. This is the background check fee, not membership dues.'
    else 'Application fee: $50 single or $75 couple. Membership dues are separate and come after the background check.'
  end;

  if v_is_new or v_status in ('prospect', 'pending-new') then
    perform public.enqueue_email(
      'secretary@kreweofshamrock.com',
      'Krewe Secretary',
      'New membership application: ' || v_first || ' ' || v_last,
      '<p>A membership application just arrived.</p><p><strong>'
        || v_first || ' ' || v_last || '</strong><br/>'
        || v_email || case when v_phone is not null then '<br/>' || v_phone else '' end
        || '<br/>' || v_addr || '</p>'
        || case when v_notes is not null then '<p>' || replace(v_notes, E'\n', '<br/>') || '</p>' else '' end
        || '<p>Review in the Member Hub or v_pending_applications.</p>',
      'membership_application',
      v_id
    );
    perform public.enqueue_email(
      'digital@kreweofshamrock.com',
      'Krewe Digital',
      'New membership application: ' || v_first || ' ' || v_last,
      '<p>' || v_first || ' ' || v_last || ' applied (' || v_email || ').</p><p>' || v_addr || '</p>',
      'membership_application',
      v_id
    );

    v_chair_html :=
      '<p>A new membership application just arrived from the join form.</p><p><strong>'
      || public.kos_html_text(v_first) || ' ' || public.kos_html_text(v_last) || '</strong><br/>'
      || public.kos_html_text(v_email)
      || case when v_phone is not null then '<br/>' || public.kos_html_text(v_phone) else '' end
      || '<br/>' || public.kos_html_text(v_addr) || '</p>'
      || '<p>' || public.kos_html_text(v_fee_line) || '</p>'
      || case when v_notes is not null then '<p>' || replace(public.kos_html_text(v_notes), E'\n', '<br/>') || '</p>' else '' end
      || '<p>Sign in to the Member Hub, open your Officer desk, and choose Membership Applications.</p>'
      || '<p><a href="https://www.kreweofshamrock.com/members.html#applications">Open Membership Applications</a></p>'
      || '<p>This email does not include a Social Security number.</p>';

    for v_chair in
      select distinct
        lower(btrim(m.email)) as email,
        btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) as full_name
      from public.members m
      where m.merged_into is null
        and coalesce(m.membership_status, 'active') in ('active', 'pending-renewal')
        and m.email is not null
        and position('@' in m.email) > 0
        and (
          coalesce(m.officer_title, '') ilike '%Chair of Membership%'
          or exists (
            select 1
            from public.profiles p
            join public.member_roles r on r.user_id = p.id
            where p.member_id = m.id
              and r.role = 'committee'
              and r.committee ilike 'Membership'
          )
        )
    loop
      if v_chair.email in ('secretary@kreweofshamrock.com', 'digital@kreweofshamrock.com') then
        continue;
      end if;
      perform public.enqueue_email(
        v_chair.email,
        nullif(v_chair.full_name, ''),
        'New membership application: ' || v_first || ' ' || v_last,
        v_chair_html,
        'membership_application',
        v_id
      );
      v_chair_sent := true;
    end loop;

    if not v_chair_sent then
      perform public.enqueue_email(
        'lsugrue99@gmail.com',
        'Membership Chair',
        'New membership application: ' || v_first || ' ' || v_last,
        v_chair_html,
        'membership_application',
        v_id
      );
    end if;
  end if;

  if v_status in ('active', 'pending-renewal', 'lapsed') then
    return jsonb_build_object(
      'ok', true,
      'message', 'You are already on our roster. We updated your mailing address. Questions: secretary@kreweofshamrock.com'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'Application received. Next: the application fee is $50 for one person or $75 for a couple. That fee is the background check. It is not membership dues. Membership dues ($375 full krewe, or $100 leave of absence) come after the background check, when the Membership Chair marks dues pending. We will follow up by email. Sláinte!'
  );
end;
$$;

grant execute on function public.submit_membership_application(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

revoke all on function public.list_membership_applications(text) from public, anon;
grant execute on function public.list_membership_applications(text) to authenticated;
