-- Local test only. Do not run this on the live database.
-- Applies sql/kos_member_search_any_name.sql against a tiny schema and checks
-- that a typed name finds a non-merged member past the 25-row preview.
--   psql -v ON_ERROR_STOP=1 -f tests/sql/member-search.sql

\set ON_ERROR_STOP on

create schema if not exists auth;

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
  committee_interests text[] not null default '{}'
);

create or replace function public.kos_can_open_roles()
returns boolean
language sql
stable
as $$
  select true;
$$;

\ir ../../sql/kos_member_search_any_name.sql

insert into public.members (id, first_name, last_name, email, member_role, membership_status)
select
  ('70000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'Pat',
  'Early' || lpad(i::text, 2, '0'),
  'early' || i || '@example.test',
  'member',
  'active'
from generate_series(1, 30) as s(i)
on conflict (id) do nothing;

insert into public.members (id, first_name, last_name, email, member_role, membership_status, officer_title)
values
  ('13630601-e76d-4948-b758-8985643be69d', 'Anna', 'Peterson', 'anna@example.test', 'member', 'active', null),
  ('88888888-8888-8888-8888-888888888888', 'Pat', 'Merged', 'merged@example.test', 'member', 'active', null),
  ('99999999-9999-9999-9999-999999999999', 'Nina', 'Prospect', 'nina@example.test', 'prospect', 'prospect', null)
on conflict (id) do nothing;

update public.members
   set merged_into = '70000000-0000-0000-0000-000000000001'
 where id = '88888888-8888-8888-8888-888888888888';

do $$
declare
  v_anna uuid := '13630601-e76d-4948-b758-8985643be69d';
begin
  if jsonb_array_length(public.search_member_access('')) > 25 then
    raise exception 'Blank search should stay a 25 row preview';
  end if;
  if exists (
    select 1 from jsonb_array_elements(public.search_member_access('')) elem
    where elem->>'id' = v_anna::text
  ) then
    raise exception 'Blank search should not be required to list Peterson';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.search_member_access('Peterson')) elem
    where elem->>'id' = v_anna::text
  ) then
    raise exception 'Peterson should find Anna';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.search_member_access('Anna')) elem
    where elem->>'id' = v_anna::text
  ) then
    raise exception 'Anna should find Anna Peterson';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.search_member_access('anna peterson')) elem
    where elem->>'id' = v_anna::text
  ) then
    raise exception 'Full name should find Anna';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.search_member_access('Peterson, Anna')) elem
    where elem->>'id' = v_anna::text
  ) then
    raise exception 'Last-then-first should find Anna';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.search_member_access('ann pet')) elem
    where elem->>'id' = v_anna::text
  ) then
    raise exception 'Partial tokens should find Anna';
  end if;
  if exists (
    select 1 from jsonb_array_elements(public.search_member_access('Merged')) elem
    where elem->>'last_name' = 'Merged'
  ) then
    raise exception 'A merged member should not be found';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.search_member_access('Nina')) elem
    where elem->>'id' = '99999999-9999-9999-9999-999999999999'
  ) then
    raise exception 'A non-merged prospect should be findable by name';
  end if;
  if jsonb_array_length(public.search_member_access('Pat')) <= 25 then
    raise exception 'A typed query should not stop at the 25 row preview';
  end if;
  if exists (
    select 1 from jsonb_array_elements(public.search_member_access('Anna')) elem
    where elem ? 'phone' or elem ? 'street_address'
  ) then
    raise exception 'Search results should not add phone or address fields';
  end if;
end $$;
