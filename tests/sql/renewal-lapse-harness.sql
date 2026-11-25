-- TEST ONLY. Do not run this on the live Supabase project oazwkwflgbthojvnclfc.
-- Local Postgres, from the repository root:
--   createdb kos_renewal_lapse_test
--   psql -v ON_ERROR_STOP=1 -d kos_renewal_lapse_test -f tests/sql/renewal-lapse-harness.sql
-- The whole file is one transaction. ROLLBACK drops the mock rows and the
-- functions created here. No email is sent. Names are Jane Sample and Pat Example.

\set ON_ERROR_STOP on

begin;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select '11111111-1111-4111-8111-111111111111'::uuid;
$$;

create extension if not exists pgcrypto;

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
  member_role text,
  officer_title text,
  membership_status text,
  membership_level text,
  application_fee_type text,
  partner_first_name text,
  partner_last_name text,
  partner_member_id uuid,
  merged_into uuid,
  join_date date,
  updated_at timestamptz not null default now()
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

create table public.membership_application_ids (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  person_slot text not null,
  id_kind text not null,
  id_digits text not null
);

create table public.dues_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  membership_year integer not null,
  amount numeric not null default 0,
  due_date date,
  paid boolean not null default false,
  paid_date date,
  payment_method text,
  notes text,
  membership_level text,
  standard_amount numeric,
  waiver_kind text,
  waiver_status text,
  zeffy_campaign_key text
);

create unique index dues_payments_member_year_uidx
  on public.dues_payments (member_id, membership_year);

create table public.kos_dues_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor text,
  member_id uuid,
  membership_year integer,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table public.kos_dues_catalog (
  id uuid primary key default gen_random_uuid(),
  membership_year integer not null,
  level text not null,
  amount numeric not null,
  zeffy_url text,
  active boolean not null default true
);

create or replace function public.kos_can_manage_renewals()
returns boolean language sql stable as $$ select true $$;

create or replace function public.kos_dues_season_year(p_on date default null)
returns integer language sql stable as $$ select 2026 $$;

create or replace function public.kos_dues_invoice_due_date(p_issued date default null)
returns date language sql stable as $$ select date '2026-12-22' $$;

create or replace function public.kos_dues_fallback_amount(p_level text)
returns numeric language sql immutable as $$ select 375::numeric $$;

create or replace function public.kos_dues_quote(p_year integer, p_level text)
returns jsonb language sql stable as $$
  select jsonb_build_object('level', coalesce(nullif(p_level, ''), 'full'), 'amount', 375, 'zeffy_url', 'https://www.zeffy.com/en-US/ticketing/example');
$$;

create or replace function public.kos_is_elected_officer_title(p_title text)
returns boolean language sql immutable as $$
  select exists (
    select 1
      from unnest(regexp_split_to_array(coalesce(p_title, ''), '\s*·\s*')) as seg(part)
     where btrim(part) ~* '^(president|vice president|secretary|treasurer)$'
  );
$$;

create or replace function public._officer_actor()
returns table (uid uuid, email text, display_name text)
language sql stable as $$
  select '11111111-1111-4111-8111-111111111111'::uuid, 'pat.example@example.com'::text, 'Pat Example'::text;
$$;

create or replace function public.kos_log_dues_event(p_event_type text, p_member_id uuid, p_year integer, p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.kos_dues_events (event_type, actor, member_id, membership_year, payload)
  values (p_event_type, 'pat.example@example.com', p_member_id, p_year, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

\ir ../../sql/kos_v6_renewal_lapse.sql

insert into public.members (id, first_name, last_name, email, member_role, officer_title, membership_status, membership_level, join_date)
values
  ('22222222-2222-4222-8222-222222222222', 'Jane', 'Sample', 'jane.sample@example.com', 'member', null, 'lapsed', 'full', '2020-01-15'),
  ('33333333-3333-4333-8333-333333333333', 'Robin', 'Example', 'robin.example@example.com', 'member', null, 'active', 'full', '2020-01-15'),
  ('44444444-4444-4444-8444-444444444444', 'Pat', 'Example', 'pat.officer@example.com', 'member', 'Treasurer', 'active', 'full', '2018-06-01'),
  ('55555555-5555-4555-8555-555555555555', 'Bo', 'Example', 'bo.example@example.com', 'board', 'Board Member', 'active', 'full', '2019-01-01'),
  ('66666666-6666-4666-8666-666666666666', 'Cam', 'Example', 'cam.example@example.com', 'captain', 'Captain', 'active', 'full', '2019-01-01'),
  ('77777777-7777-4777-8777-777777777777', 'Val', 'Example', 'val.example@example.com', 'officer', 'Vice President', 'active', 'full', '2019-01-01');

do $$
declare
  v_started jsonb;
  v_status text;
  v_paid boolean;
  v_notes text;
  v_candidates jsonb;
  v_mark jsonb;
  v_robin text;
begin
  insert into public.kos_dues_settings (membership_year, delinquent_on, inactive_on)
  values (2026, date '2026-07-01', date '2099-07-16');

  v_started := public.kos_start_reactivation(array['22222222-2222-4222-8222-222222222222'::uuid]);
  if coalesce(v_started->>'ok', '') <> 'true' or coalesce(v_started->>'started', '') <> '1' then
    raise exception 'start_reactivation failed: %', v_started;
  end if;

  select m.membership_status into v_status
    from public.members m
   where m.id = '22222222-2222-4222-8222-222222222222';
  if v_status <> 'pending-renewal' then
    raise exception 'expected pending-renewal, got %', v_status;
  end if;

  select d.paid, d.notes into v_paid, v_notes
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222222'
     and d.membership_year = 2026;
  if v_paid is distinct from false or coalesce(v_notes, '') not like '%Reactivation invoice.%' then
    raise exception 'expected an unpaid reactivation row, paid=% notes=%', v_paid, v_notes;
  end if;

  -- Simulated kos_record_payment activation. The live function in
  -- sql/kos_dues_renewal.sql does this when a Zeffy dues payment lands
  -- on a lapsed or pending-renewal member. This harness does not call
  -- the webhook and does not send email.
  update public.dues_payments
     set paid = true,
         paid_date = current_date,
         payment_method = 'card'
   where member_id = '22222222-2222-4222-8222-222222222222'
     and membership_year = 2026
     and paid = false
     and coalesce(waiver_status, '') <> 'applied';
  update public.members
     set membership_status = 'active',
         updated_at = now()
   where id = '22222222-2222-4222-8222-222222222222'
     and lower(coalesce(membership_status, '')) in ('lapsed', 'pending-renewal');
  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status, actor_name
  ) values (
    '22222222-2222-4222-8222-222222222222',
    'renewed',
    'Renewed via Zeffy dues payment',
    'pending-renewal',
    'active',
    'zeffy-webhook'
  );

  select m.membership_status into v_status
    from public.members m
   where m.id = '22222222-2222-4222-8222-222222222222';
  select d.paid into v_paid
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222222'
     and d.membership_year = 2026;
  if v_status <> 'active' or v_paid is distinct from true then
    raise exception 'simulated payment did not activate Jane, status=% paid=%', v_status, v_paid;
  end if;
  if not exists (
    select 1 from public.membership_application_actions a
     where a.member_id = '22222222-2222-4222-8222-222222222222'
       and a.action = 'renewed'
       and a.note = 'Renewed via Zeffy dues payment'
  ) then
    raise exception 'missing Renewed via Zeffy dues payment action';
  end if;

  v_candidates := public.kos_lapse_candidates(2026);
  if coalesce(v_candidates->>'ok', '') <> 'true' then
    raise exception 'lapse candidates failed: %', v_candidates;
  end if;
  if v_candidates::text like '%44444444-4444-4444-8444-444444444444%'
     or v_candidates::text ilike '%Pat%' then
    raise exception 'elected treasurer was a lapse candidate: %', v_candidates;
  end if;
  select string_agg(m.first_name, ',') into v_robin
    from jsonb_array_elements(v_candidates->'members') as person
    join public.members m on m.id = (person->>'id')::uuid;
  if coalesce(v_robin, '') not like '%Robin%'
     or v_robin not like '%Bo%'
     or v_robin not like '%Cam%' then
    raise exception 'board and captain should be candidates, got %', v_candidates;
  end if;
  if v_robin like '%Val%' or v_candidates::text like '%77777777-7777-4777-8777-777777777777%' then
    raise exception 'vice president should not be a candidate, got %', v_candidates;
  end if;

  insert into public.kos_dues_settings (membership_year, delinquent_on, inactive_on)
  values (2026, date '2099-07-01', date '2099-07-16')
  on conflict (membership_year) do update
    set delinquent_on = excluded.delinquent_on,
        inactive_on = excluded.inactive_on;
  v_mark := public.kos_mark_lapsed(array['33333333-3333-4333-8333-333333333333'::uuid], 'too early');
  if coalesce(v_mark->>'ok', '') <> 'false' then
    raise exception 'mark lapsed should refuse before the date: %', v_mark;
  end if;
  select m.membership_status into v_status
    from public.members m
   where m.id = '33333333-3333-4333-8333-333333333333';
  if v_status <> 'active' then
    raise exception 'early mark lapsed changed Robin to %', v_status;
  end if;
end $$;

rollback;
