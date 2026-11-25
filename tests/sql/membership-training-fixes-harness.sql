-- TEST ONLY. Do not run this on the live Supabase project oazwkwflgbthojvnclfc.
-- Local Postgres, from the repository root:
--   createdb kos_membership_training_test
--   psql -v ON_ERROR_STOP=1 -d kos_membership_training_test -f tests/sql/membership-training-fixes-harness.sql
-- The whole file is one transaction. ROLLBACK drops the mock rows and the
-- functions created here. No email is sent.

\set ON_ERROR_STOP on

begin;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

create table public.members (
  id uuid primary key,
  first_name text,
  last_name text,
  email text,
  phone text,
  notes text,
  street_address text,
  city text,
  state text,
  zip text,
  member_role text,
  membership_status text,
  membership_level text not null default 'full',
  application_fee_type text,
  partner_first_name text,
  partner_last_name text,
  partner_email text,
  partner_phone text,
  partner_member_id uuid,
  merged_into uuid,
  join_date date,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.membership_application_actions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  action text not null,
  note text,
  from_status text,
  to_status text,
  actor_uid uuid,
  actor_email text,
  actor_name text,
  created_at timestamptz not null default now()
);

create table public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  to_name text,
  subject text not null,
  body_html text not null,
  purpose text not null default 'other',
  related_member_id uuid,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create table public.kos_dues_events (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  member_id uuid,
  membership_year integer,
  payload jsonb
);

create or replace function public.can_review_applications()
returns boolean
language sql
stable
as $$
  select current_setting('kos.test_reviewer', true) = 'on';
$$;

create or replace function public._officer_actor()
returns table (uid uuid, email text, display_name text)
language sql
stable
as $$
  select auth.uid(), 'chair@example.com'::text, 'Membership Chair'::text;
$$;

create or replace function public.kos_html_text(p_text text)
returns text
language sql
immutable
as $$
  select coalesce(p_text, '');
$$;

create or replace function public.enqueue_email(
  p_to text,
  p_to_name text,
  p_subject text,
  p_body_html text,
  p_purpose text,
  p_member_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_to is null or position('@' in p_to) = 0 then
    return null;
  end if;
  insert into public.outbound_emails (to_email, to_name, subject, body_html, purpose, related_member_id)
  values (lower(p_to), p_to_name, p_subject, p_body_html, p_purpose, p_member_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.kos_log_dues_event(
  p_event_type text,
  p_member_id uuid,
  p_year integer,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.kos_dues_events (event_type, member_id, membership_year, payload)
  values (p_event_type, p_member_id, p_year, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

\ir ../../sql/kos_renewal_approve_no_welcome.sql
\ir ../../sql/kos_join_level_interest.sql
\ir ../../sql/kos_induction_letter_couple_note.sql
\ir ../../sql/kos_auxiliary_fee_included.sql

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('kos.test_reviewer', 'on', true);

insert into public.members (id, first_name, last_name, email, membership_status, membership_level, member_role)
values
  ('10000000-0000-0000-0000-000000000001', 'John', 'Sample', 'john.sample@example.com', 'pending-renewal', 'full', 'member'),
  ('10000000-0000-0000-0000-000000000002', 'Jane', 'Sample', 'jane.sample@example.com', 'dues-pending', 'full', 'prospect'),
  ('10000000-0000-0000-0000-000000000003', 'Nia', 'Test', 'nia.test@example.com', 'pending-new', 'full', 'prospect'),
  ('10000000-0000-0000-0000-000000000004', 'John', 'Sample', 'john.partner@example.com', 'pending-new', 'full', 'prospect'),
  ('10000000-0000-0000-0000-000000000005', 'Ada', 'Sample', 'ada.sample@example.com', 'dues-pending', 'full', 'prospect'),
  ('10000000-0000-0000-0000-000000000006', 'Bea', 'Sample', 'bea.sample@example.com', 'background-check', 'full', 'prospect'),
  ('10000000-0000-0000-0000-000000000007', 'Cal', 'Sample', 'cal.sample@example.com', 'active', 'full', 'member'),
  ('10000000-0000-0000-0000-000000000008', 'Dee', 'Sample', 'dee.sample@example.com', 'background-check', 'auxiliary', 'prospect'),
  ('10000000-0000-0000-0000-000000000009', 'Eve', 'Sample', 'eve.sample@example.com', 'background-check', 'full', 'prospect'),
  ('10000000-0000-0000-0000-00000000000a', 'Finn', 'Sample', 'finn.sample@example.com', 'prospect', 'full', 'prospect'),
  ('10000000-0000-0000-0000-00000000000b', 'Gina', 'Sample', 'gina.sample@example.com', 'bg_paid', 'full', 'prospect'),
  ('10000000-0000-0000-0000-00000000000c', 'Holly', 'Sample', 'holly.sample@example.com', 'bg_in_process', 'full', 'prospect'),
  ('10000000-0000-0000-0000-00000000000d', 'Ira', 'Sample', 'ira.sample@example.com', 'background-check', 'full', 'prospect');

update public.members
   set partner_member_id = '10000000-0000-0000-0000-000000000004'
 where id = '10000000-0000-0000-0000-000000000003';
update public.members
   set partner_member_id = '10000000-0000-0000-0000-000000000003'
 where id = '10000000-0000-0000-0000-000000000004';
update public.members
   set partner_member_id = '10000000-0000-0000-0000-000000000009'
 where id = '10000000-0000-0000-0000-000000000008';
update public.members
   set partner_member_id = '10000000-0000-0000-0000-000000000008'
 where id = '10000000-0000-0000-0000-000000000009';

do $$
declare
  v_renewal uuid := '10000000-0000-0000-0000-000000000001';
  v_dues uuid := '10000000-0000-0000-0000-000000000002';
  v_new uuid := '10000000-0000-0000-0000-000000000003';
  v_partner uuid := '10000000-0000-0000-0000-000000000004';
  v_blocked uuid := '10000000-0000-0000-0000-000000000005';
  v_full_fee uuid := '10000000-0000-0000-0000-000000000006';
  v_active uuid := '10000000-0000-0000-0000-000000000007';
  v_aux uuid := '10000000-0000-0000-0000-000000000008';
  v_aux_partner uuid := '10000000-0000-0000-0000-000000000009';
  v_prospect uuid := '10000000-0000-0000-0000-00000000000a';
  v_paid uuid := '10000000-0000-0000-0000-00000000000b';
  v_process uuid := '10000000-0000-0000-0000-00000000000c';
  v_plain_fee uuid := '10000000-0000-0000-0000-00000000000d';
  v_result jsonb;
  v_letter text;
  v_mails int;
  v_status text;
  v_level text;
  v_who uuid;
begin
  -- Phase 1. Pending renewal queues no welcome. Dues pending queues one.
  v_result := public._apply_membership_application_decision(v_renewal, 'approve', null);
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'Phase 1 renewal approve failed: %', v_result;
  end if;
  if v_result->>'message' <> 'Renewed. They are active again and keep their current Member Hub login. No email was sent.' then
    raise exception 'Phase 1 renewal message: %', v_result->>'message';
  end if;
  if coalesce(v_result->>'emailed', '') = 'true' then
    raise exception 'Phase 1 renewal must not email';
  end if;
  select membership_status into v_status from public.members where id = v_renewal;
  if v_status <> 'active' then
    raise exception 'Phase 1 renewal status: %', v_status;
  end if;
  select count(*) into v_mails from public.outbound_emails where purpose = 'membership_welcome';
  if v_mails <> 0 then
    raise exception 'Phase 1 renewal queued a welcome';
  end if;

  v_result := public._apply_membership_application_decision(v_dues, 'approve', null);
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'Phase 1 dues approve failed: %', v_result;
  end if;
  select count(*) into v_mails from public.outbound_emails where purpose = 'membership_welcome';
  if v_mails <> 1 then
    raise exception 'Phase 1 dues-pending should queue one welcome, found %', v_mails;
  end if;
  if not exists (
    select 1 from public.outbound_emails
     where purpose = 'membership_welcome'
       and related_member_id = v_dues
       and subject = 'Welcome to the Krewe of Shamrock'
       and body_html like '%https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR%'
       and body_html like '%Create or reset your password%'
  ) then
    raise exception 'Phase 1 welcome letter content changed';
  end if;

  -- Phase 2. Gate, then the allowed statuses.
  perform set_config('kos.test_reviewer', 'off', true);
  v_result := public.set_application_membership_level(v_new, 'associate');
  if coalesce(v_result->>'ok', '') <> 'false' then
    raise exception 'Phase 2 gate should refuse a non-reviewer: %', v_result;
  end if;
  select membership_level into v_level from public.members where id = v_new;
  if v_level <> 'full' then
    raise exception 'Phase 2 gate changed the level';
  end if;

  perform set_config('kos.test_reviewer', 'on', true);
  v_result := public.set_application_membership_level(v_blocked, 'associate');
  if coalesce(v_result->>'ok', '') <> 'false' then
    raise exception 'Phase 2 should refuse dues-pending: %', v_result;
  end if;
  v_result := public.set_application_membership_level(v_active, 'loa');
  if coalesce(v_result->>'ok', '') <> 'false' then
    raise exception 'Phase 2 should refuse active: %', v_result;
  end if;
  v_result := public.set_application_membership_level(v_new, 'guest');
  if coalesce(v_result->>'ok', '') <> 'false' then
    raise exception 'Phase 2 should refuse an unknown level: %', v_result;
  end if;

  foreach v_who in array array[v_prospect, v_full_fee, v_paid, v_process] loop
    v_result := public.set_application_membership_level(v_who, 'auxiliary');
    if coalesce(v_result->>'ok', '') <> 'true' then
      raise exception 'Phase 2 allowed status failed for %: %', v_who, v_result;
    end if;
    if not exists (
      select 1 from public.membership_application_actions
       where member_id = v_who and action = 'level_set'
    ) then
      raise exception 'Phase 2 missing level_set action for %', v_who;
    end if;
    if not exists (
      select 1 from public.kos_dues_events
       where member_id = v_who and event_type = 'level_set'
    ) then
      raise exception 'Phase 2 missing level_set dues event for %', v_who;
    end if;
  end loop;

  v_result := public.set_application_membership_level(v_new, 'associate');
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'Phase 2 pending-new failed: %', v_result;
  end if;
  select membership_level into v_level from public.members where id = v_new;
  if v_level <> 'associate' then
    raise exception 'Phase 2 primary level: %', v_level;
  end if;
  select membership_level into v_level from public.members where id = v_partner;
  if v_level <> 'associate' then
    raise exception 'Phase 2 partner level: %', v_level;
  end if;
  if (select count(*) from public.membership_application_actions where action = 'level_set' and member_id in (v_new, v_partner)) <> 2 then
    raise exception 'Phase 2 should log level_set for the applicant and the partner';
  end if;

  -- Phase 3. The couple line is added once when unpaid offers share a URL.
  v_letter := public.kos_induction_letter_html(
    'Jane',
    jsonb_build_array(
      jsonb_build_object('paid', false, 'name', 'Jane Sample', 'label', 'Full Krewe', 'amount', '375.00', 'url', 'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership'),
      jsonb_build_object('paid', false, 'name', 'John Sample', 'label', 'Full Krewe', 'amount', '375.00', 'url', 'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership')
    ),
    'Tuesday, January 6, 2026 at 7:00 PM',
    'Krewe hall'
  );
  if length(v_letter) - length(replace(v_letter, 'On Zeffy, add one ticket for each person and put each person''s name and email on their own ticket.', ''))
     <> length('On Zeffy, add one ticket for each person and put each person''s name and email on their own ticket.') then
    raise exception 'Phase 3 shared URL should add the ticket line once';
  end if;
  if v_letter not like '%$375.00%' or v_letter not like '%Jane Sample%' or v_letter not like '%John Sample%' then
    raise exception 'Phase 3 letter dropped a dues block';
  end if;

  v_letter := public.kos_induction_letter_html(
    'Nia',
    jsonb_build_array(
      jsonb_build_object('paid', false, 'name', 'Nia Test', 'label', 'Full Krewe', 'amount', '375.00', 'url', 'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership')
    ),
    'Tuesday',
    'Hall'
  );
  if v_letter like '%On Zeffy, add one ticket%' then
    raise exception 'Phase 3 one person should not get the couple line';
  end if;

  v_letter := public.kos_induction_letter_html(
    'Jane',
    jsonb_build_array(
      jsonb_build_object('paid', false, 'name', 'Jane Sample', 'label', 'Full Krewe', 'amount', '375.00', 'url', 'https://www.zeffy.com/full'),
      jsonb_build_object('paid', false, 'name', 'John Sample', 'label', 'Associate', 'amount', '450.00', 'url', 'https://www.zeffy.com/associate')
    ),
    'Tuesday',
    'Hall'
  );
  if v_letter like '%On Zeffy, add one ticket%' then
    raise exception 'Phase 3 different URLs should not get the couple line';
  end if;

  -- Phase 4. Non-auxiliary is refused. Auxiliary moves to bg_paid. No email row.
  select count(*) into v_mails from public.outbound_emails;
  v_result := public.kos_mark_background_fee_included(v_plain_fee, null);
  if coalesce(v_result->>'ok', '') <> 'false' then
    raise exception 'Phase 4 non-auxiliary should be refused: %', v_result;
  end if;
  select membership_status into v_status from public.members where id = v_plain_fee;
  if v_status <> 'background-check' then
    raise exception 'Phase 4 non-auxiliary status changed to %', v_status;
  end if;

  v_result := public.kos_mark_background_fee_included(v_aux, null);
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'Phase 4 auxiliary move failed: %', v_result;
  end if;
  if coalesce(v_result->>'emailed', '') = 'true' then
    raise exception 'Phase 4 must not email';
  end if;
  select membership_status into v_status from public.members where id = v_aux;
  if v_status <> 'bg_paid' then
    raise exception 'Phase 4 auxiliary status: %', v_status;
  end if;
  select membership_status into v_status from public.members where id = v_aux_partner;
  if v_status <> 'bg_paid' then
    raise exception 'Phase 4 partner status: %', v_status;
  end if;
  if not exists (
    select 1 from public.membership_application_actions
     where member_id = v_aux
       and action = 'background_check_fee_included'
       and note = 'Auxiliary: background check fee included in the $200 dues.'
       and to_status = 'bg_paid'
  ) then
    raise exception 'Phase 4 missing the auxiliary action note';
  end if;
  if (select count(*) from public.outbound_emails) <> v_mails then
    raise exception 'Phase 4 created an email row';
  end if;
end $$;

rollback;
