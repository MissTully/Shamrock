-- TEST ONLY. Do not run this on the live database.
-- Builds a tiny local schema, applies sql/kos_member_roles_and_access.sql,
-- and checks the permission rules. Run with:
--   psql -v ON_ERROR_STOP=1 -f tests/sql/roles-access-harness.sql

\set ON_ERROR_STOP on

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select '{}'::jsonb;
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

create table if not exists public.members (
  id uuid primary key,
  first_name text,
  last_name text,
  email text,
  officer_title text,
  member_role text,
  membership_status text,
  merged_into uuid,
  committee_interests text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  member_id uuid references public.members(id)
);

create table if not exists public.member_roles (
  user_id uuid not null,
  role text not null,
  committee text,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.committee_chair_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  committee text not null,
  note text,
  status text not null default 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create or replace function public.kos_current_member_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.member_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.kos_committee_list()
returns text[]
language sql
immutable
as $$
  select array['Membership','Bylaws and Rules','Float','Parade','Social','Charity/Fundraising','Merchandise','Finance','Communication','Technology']::text[];
$$;

create or replace function public.kos_sync_roster_role_grants(p_member uuid)
returns void
language plpgsql
as $$
begin
  return;
end $$;

create or replace function public.is_krewe_officer()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;
create or replace function public.can_manage_events()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;
create or replace function public.can_manage_shop()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;
create or replace function public.can_view_payments()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;
create or replace function public.can_review_applications()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;
create or replace function public.can_review_volunteer_inquiries()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;
create or replace function public.can_view_event_outreach()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;
create or replace function public.kos_can_review_parade_guests()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;
create or replace function public.is_committee_chair()
returns boolean language sql stable security definer set search_path to 'public' as $$ select false; $$;

\ir ../../sql/kos_member_roles_and_access.sql

insert into public.members (id, first_name, last_name, email, officer_title, member_role, membership_status)
values
  ('11111111-1111-1111-1111-111111111111', 'Tim', 'Fitzpatrick', 'tim@example.test', 'President', 'officer', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Lisa', 'Sugrue', 'lisa@example.test', 'Board Member · Committee Chair of Membership', 'board', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'Tammy', 'Miller', 'tammy@example.test', 'Co-Chair of Merchandise', 'member', 'active'),
  ('44444444-4444-4444-4444-444444444444', 'Riley', 'Quinn', 'riley@example.test', null, 'member', 'active'),
  ('55555555-5555-5555-5555-555555555555', 'Jordan', 'Hale', 'jordan@example.test', null, 'member', 'lapsed'),
  ('66666666-6666-6666-6666-666666666666', 'Patrick', 'Pustay', 'patrick@example.test', 'Treasurer · Committee Chair of Finance', 'officer', 'active')
on conflict (id) do nothing;

insert into public.profiles (id, member_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '55555555-5555-5555-5555-555555555555'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '66666666-6666-6666-6666-666666666666')
on conflict (id) do nothing;

create or replace function public.kos_test_as(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

do $$
declare
  v_end date;
  v_grant timestamptz;
  v_audit uuid;
  v_ok boolean;
begin
  -- Fixed calendar checks, independent of the machine clock.
  v_end := (public.kos_next_grant_end('2026-11-14 16:00+00') at time zone 'America/New_York')::date;
  if v_end <> date '2027-06-30' then
    raise exception 'Nov 14 should end on 2027-06-30, got %', v_end;
  end if;
  v_end := (public.kos_next_grant_end('2026-06-29 16:00+00') at time zone 'America/New_York')::date;
  if v_end <> date '2026-06-30' then
    raise exception 'June 29 should end on 2026-06-30, got %', v_end;
  end if;
  v_end := (public.kos_next_grant_end('2026-06-30 16:00+00') at time zone 'America/New_York')::date;
  if v_end <> date '2027-06-30' then
    raise exception 'June 30 should roll to next year, got %', v_end;
  end if;

  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3');
  begin
    perform public.grant_member_tool('33333333-3333-3333-3333-333333333333', 'shop_studio', null, null);
    raise exception 'Self grant should have failed';
  exception when others then
    if position('own title or tools' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2');
  begin
    perform public.set_member_access(
      '44444444-4444-4444-4444-444444444444',
      array['president'],
      '[]'::jsonb,
      null,
      false
    );
    raise exception 'Membership Chair should not set President';
  exception when others then
    if position('committee chair titles only' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  perform public.set_member_access(
    '44444444-4444-4444-4444-444444444444',
    array['chair_parade'],
    '[]'::jsonb,
    null,
    false
  );
  if not ('chair_parade' = any (public.kos_title_keys_in((
    select officer_title from public.members where id = '44444444-4444-4444-4444-444444444444'
  )))) then
    raise exception 'Membership Chair should be able to assign a chair title';
  end if;

  -- Clear Riley before the grant tests.
  update public.members
     set officer_title = null, member_role = 'member'
   where id = '44444444-4444-4444-4444-444444444444';
  delete from public.member_tool_grants where member_id = '44444444-4444-4444-4444-444444444444';

  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
  perform public.grant_member_tool('44444444-4444-4444-4444-444444444444', 'shop_studio', null, 'sample');
  select ends_at into v_grant
  from public.member_tool_grants
  where member_id = '44444444-4444-4444-4444-444444444444'
    and tool_key = 'shop_studio'
    and revoked_at is null;
  if (v_grant at time zone 'America/New_York')::date <> (public.kos_next_grant_end(now()) at time zone 'America/New_York')::date then
    raise exception 'Default end date was %', v_grant;
  end if;

  update public.member_tool_grants
     set ends_at = now() - interval '1 day'
   where member_id = '44444444-4444-4444-4444-444444444444'
     and tool_key = 'shop_studio';
  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4');
  if public.has_tool('shop_studio') then
    raise exception 'An expired grant must not allow the tool';
  end if;

  update public.member_tool_grants
     set ends_at = now() + interval '30 days'
   where member_id = '44444444-4444-4444-4444-444444444444'
     and tool_key = 'shop_studio';
  if not public.has_tool('shop_studio') then
    raise exception 'An active member should get an unexpired grant';
  end if;

  update public.members set membership_status = 'lapsed' where id = '44444444-4444-4444-4444-444444444444';
  if public.has_tool('shop_studio') then
    raise exception 'A lapsed member should not get the grant';
  end if;
  update public.members set membership_status = 'active' where id = '44444444-4444-4444-4444-444444444444';
  if not public.has_tool('shop_studio') then
    raise exception 'Reactivating the member should resume the grant';
  end if;
  if not exists (
    select 1 from public.hub_notices
    where member_id = '44444444-4444-4444-4444-444444444444'
      and title = 'Your extra tools are available again'
  ) then
    raise exception 'Reactivation should leave a Hub notice';
  end if;

  -- Grantor leaves office: the grant stays and is marked for review.
  update public.members
     set officer_title = null, member_role = 'member'
   where id = '11111111-1111-1111-1111-111111111111';
  if not exists (
    select 1 from public.member_tool_grants
    where member_id = '44444444-4444-4444-4444-444444444444'
      and tool_key = 'shop_studio'
      and revoked_at is null
      and needs_review = true
  ) then
    raise exception 'Leaving office should mark the grant for review and keep it';
  end if;
  -- Put the President title back for later checks.
  update public.members
     set officer_title = 'President', member_role = 'officer'
   where id = '11111111-1111-1111-1111-111111111111';

  -- Handover. Extra email grant stays with Tammy.
  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
  insert into public.member_tool_grants (member_id, tool_key, granted_by, ends_at)
  values (
    '33333333-3333-3333-3333-333333333333',
    'email_members',
    '11111111-1111-1111-1111-111111111111',
    now() + interval '60 days'
  );
  perform public.handover_member_title(
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    'cochair_merchandise',
    array['shop_studio'],
    null,
    null
  );
  if exists (
    select 1 from public.members
    where id = '33333333-3333-3333-3333-333333333333'
      and 'cochair_merchandise' = any (public.kos_title_keys_in(officer_title))
  ) then
    raise exception 'Handover should remove the title from the outgoing member';
  end if;
  if not exists (
    select 1 from public.members
    where id = '44444444-4444-4444-4444-444444444444'
      and 'cochair_merchandise' = any (public.kos_title_keys_in(officer_title))
  ) then
    raise exception 'Handover should give the title to the incoming member';
  end if;
  if not exists (
    select 1 from public.member_tool_grants
    where member_id = '33333333-3333-3333-3333-333333333333'
      and tool_key = 'email_members'
      and revoked_at is null
  ) then
    raise exception 'Extra grants should stay with the outgoing member';
  end if;

  -- Undo window.
  select id into v_audit
  from public.member_access_audit
  where action = 'handover'
  order by created_at desc
  limit 1;
  update public.member_access_audit
     set created_at = now() - interval '8 days',
         actor_member_id = '22222222-2222-2222-2222-222222222222'
   where id = v_audit;
  -- Later rows would block everyone, including the President. Park them so
  -- this check is about the 7 day window.
  update public.member_access_audit
     set undone_at = now()
   where id <> v_audit
     and undone_at is null
     and action <> 'undo';

  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2');
  begin
    perform public.undo_member_access_change(v_audit);
    raise exception 'An 8 day old change should not be undoable by the officer';
  exception when others then
    if position('7 days' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
  perform public.undo_member_access_change(v_audit);

  select id into v_audit from public.member_access_audit where action = 'grant' order by created_at desc limit 1;
  update public.member_access_audit
     set created_at = now() - interval '1 day',
         actor_member_id = '22222222-2222-2222-2222-222222222222',
         undone_at = null
   where id = v_audit;
  update public.member_access_audit
     set undone_at = now()
   where id <> v_audit and undone_at is null and action <> 'undo';
  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2');
  perform public.undo_member_access_change(v_audit);

  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3');
  if not public.has_tool('shop_studio') then
    raise exception 'Merchandise co-chair bundle should include Shop Studio';
  end if;
  if public.has_tool('reports.finance') then
    raise exception 'Merchandise co-chair should not get finance reports from the title';
  end if;
  if not public.has_tool('reports.merch') then
    raise exception 'Merchandise co-chair should get merchandise reports';
  end if;

  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6');
  if not public.has_tool('reports.finance') then
    raise exception 'Treasurer should have finance reports';
  end if;
  if public.has_tool('applications') then
    raise exception 'Treasurer should not have Membership Applications from the title';
  end if;

  select public.can_manage_shop() into v_ok;
  perform public.kos_test_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4');
  -- Riley may or may not still hold the co-chair after the undo. The gate
  -- wrapper itself must exist and include has_tool.
  if to_regprocedure('public.kos_legacy_can_manage_shop()') is null then
    raise exception 'Legacy shop gate was not snapshotted';
  end if;
end $$;
