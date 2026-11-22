-- TEST ONLY. Do not run this on the live Supabase project oazwkwflgbthojvnclfc.
-- Local Postgres, from the repository root:
--   createdb kos_treasurer_ledger_test
--   psql -v ON_ERROR_STOP=1 -d kos_treasurer_ledger_test -f tests/sql/treasurer-ledger-harness.sql
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
  select nullif(current_setting('kos.uid', true), '')::uuid;
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(current_setting('kos.email', true), '');
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
  phone text,
  member_role text,
  officer_title text,
  membership_status text,
  membership_level text,
  partner_member_id uuid,
  merged_into uuid,
  join_date date,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key,
  member_id uuid references public.members(id)
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

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  amount_cents integer not null default 0,
  status text not null default 'succeeded',
  product_kind text,
  member_id uuid,
  partner_member_id uuid,
  payer_name text,
  payer_email text,
  description text,
  event_id uuid,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key,
  name text,
  start_time timestamptz,
  source text
);

create table public.event_signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  guests_count integer,
  status text
);

create table public.legacy_payments (
  origin text,
  settled_cents integer,
  refunded_cents integer,
  paid_at timestamptz
);

create table public.legacy_event_registrations (
  event_id uuid,
  wa_event_id text,
  total_fee_cents integer,
  payment_state text,
  event_title text,
  event_start timestamptz
);

create or replace function public.kos_dues_actor()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(auth.email()), ''), nullif(auth.uid()::text, ''), 'officer');
$$;

create or replace function public.kos_current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.member_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.kos_is_site_admin()
returns boolean
language sql
stable
as $$
  select false;
$$;

create or replace function public.kos_title_keys_in(p_title text)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(k.k), '{}'::text[])
    from (
      select case lower(btrim(seg.part))
        when 'treasurer' then 'treasurer'
        when 'president' then 'president'
        when 'secretary' then 'secretary'
        when 'membership chair' then 'chair_membership'
        when 'committee chair of membership' then 'chair_membership'
        when 'chair of membership' then 'chair_membership'
        when 'board' then 'board_member'
        when 'board member' then 'board_member'
        when 'chair of finance' then 'chair_finance'
        when 'committee chair of finance' then 'chair_finance'
        else null
      end as k
      from unnest(regexp_split_to_array(coalesce(p_title, ''), '\s*[·|,;]\s*')) as seg(part)
    ) k
   where k.k is not null;
$$;

create or replace function public.kos_can_manage_renewals()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_title text;
  v_keys text[];
begin
  if auth.uid() is null then
    return false;
  end if;
  if public.kos_is_site_admin() then
    return true;
  end if;
  select m.officer_title into v_title
    from public.members m
   where m.id = public.kos_current_member_id()
     and m.merged_into is null;
  v_keys := public.kos_title_keys_in(v_title);
  return v_keys && array['president', 'treasurer', 'chair_membership']::text[];
end;
$$;

create or replace function public.kos_can_run_report(p_group text)
returns boolean
language sql
stable
as $$
  select true;
$$;

create or replace function public.can_view_payments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
      join public.members m on m.id = p.member_id
     where p.id = auth.uid()
       and public.kos_title_keys_in(m.officer_title)
           && array['treasurer', 'president', 'secretary', 'chair_finance', 'chair_membership']::text[]
  );
$$;

create or replace function public.is_krewe_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
      join public.members m on m.id = p.member_id
     where p.id = auth.uid()
       and (
         coalesce(m.member_role, '') in ('officer', 'board', 'captain')
         or coalesce(m.officer_title, '') <> ''
       )
  );
$$;

create or replace function public.has_tool(p_tool text)
returns boolean
language sql
stable
as $$
  select false;
$$;

create or replace function public.kos_dues_season_year(p_on date default null)
returns integer
language sql
stable
as $$
  select 2026;
$$;

create or replace function public.kos_dues_invoice_due_date(p_issued date default null)
returns date
language sql
stable
as $$
  select date '2026-12-22';
$$;

create or replace function public.kos_dues_fallback_amount(p_level text)
returns numeric
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_level, 'full')))
    when 'associate' then 450
    when 'loa' then 100
    when 'auxiliary' then 200
    else 375
  end::numeric;
$$;

create or replace function public.kos_dues_quote(p_year integer, p_level text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'level', case lower(btrim(coalesce(p_level, 'full')))
      when 'associate' then 'associate'
      when 'loa' then 'loa'
      when 'auxiliary' then 'auxiliary'
      else 'full'
    end,
    'amount', public.kos_dues_fallback_amount(p_level),
    'zeffy_url', 'https://www.zeffy.com/en-US/ticketing/example'
  );
$$;

create or replace function public.kos_is_elected_officer_title(p_title text)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
      from unnest(regexp_split_to_array(coalesce(p_title, ''), '\s*·\s*')) as seg(part)
     where btrim(part) ~* '^(president|vice president|secretary|treasurer)$'
  );
$$;

create or replace function public.kos_linked_partner_id(p_member uuid)
returns uuid
language sql
stable
as $$
  select m.partner_member_id
    from public.members m
   where m.id = p_member
     and m.merged_into is null
     and m.partner_member_id is not null
     and m.partner_member_id <> p_member;
$$;

create or replace function public.kos_log_dues_event(
  p_event_type text,
  p_member_id uuid,
  p_year integer,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.kos_dues_events (event_type, actor, member_id, membership_year, payload)
  values (p_event_type, public.kos_dues_actor(), p_member_id, p_year, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

\ir ../../sql/kos_v6_renewal_lapse.sql

create or replace function public.kos_decide_dues_waiver(
  p_member_id uuid,
  p_year integer,
  p_approve boolean,
  p_apply boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_krewe_officer() or public.has_tool('dues_waivers')) then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Waiver decision recorded in the test stub.');
end;
$$;

create or replace function public.kos_apply_elected_officer_exemptions(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_krewe_officer() or public.has_tool('dues_waivers')) then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Batch recorded in the test stub.');
end;
$$;

create or replace function public.kos_request_dues_waiver(
  p_member_id uuid,
  p_year integer,
  p_kind text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_krewe_officer() or public.has_tool('dues_waivers')) then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Waiver requested in the test stub.');
end;
$$;

create or replace function public.kos_create_level_invoices(
  p_member_ids uuid[],
  p_year integer,
  p_exclude_elected_officers boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Invoices recorded in the test stub.');
end;
$$;

create or replace function public.officer_list_invoice_targets(
  p_filter text,
  p_year integer,
  p_q text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_krewe_officer() or public.has_tool('send_invoices')) then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object('ok', true, 'targets', '[]'::jsonb);
end;
$$;

create or replace function public.officer_create_and_send_invoices(
  p_member_ids uuid[],
  p_year integer,
  p_amount numeric,
  p_note text,
  p_invoice_type text,
  p_send_email boolean,
  p_pay_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_krewe_officer() or public.has_tool('send_invoices')) then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Send recorded in the test stub.');
end;
$$;

grant all on table public.dues_payments to anon, authenticated;
grant all on table public.payments to anon, authenticated;
grant execute on function public.kos_log_dues_event(text, uuid, integer, jsonb) to authenticated;

\ir ../../sql/kos_v7_treasurer_ledger.sql

insert into public.kos_dues_catalog (membership_year, level, amount, active)
values
  (2026, 'full', 375, true),
  (2026, 'associate', 450, true),
  (2026, 'loa', 100, true),
  (2026, 'auxiliary', 200, true);

insert into public.members (
  id, first_name, last_name, email, phone, member_role, officer_title, membership_status, membership_level
) values
  ('11111111-1111-4111-8111-111111111111', 'Pat', 'Example', 'pat.example@example.com', '555-0100', 'officer', 'Treasurer', 'active', 'full'),
  ('11111111-1111-4111-8111-111111111112', 'Sam', 'Example', 'sam.example@example.com', '555-0100', 'officer', 'President', 'active', 'full'),
  ('11111111-1111-4111-8111-111111111113', 'Casey', 'Example', 'casey.example@example.com', '555-0100', 'officer', 'Committee Chair of Membership', 'active', 'full'),
  ('11111111-1111-4111-8111-111111111114', 'Riley', 'Example', 'riley.example@example.com', '555-0100', 'officer', 'Secretary', 'active', 'full'),
  ('11111111-1111-4111-8111-111111111115', 'Jordan', 'Example', 'jordan.example@example.com', '555-0100', 'board', 'Board Member', 'active', 'full'),
  ('11111111-1111-4111-8111-111111111116', 'Avery', 'Example', 'avery.example@example.com', '555-0100', 'officer', 'Chair of Finance', 'active', 'full'),
  ('11111111-1111-4111-8111-111111111117', 'Drew', 'Example', 'drew.example@example.com', '555-0100', 'member', null, 'active', 'full');

insert into public.profiles (id, member_id)
select id, id from public.members
 where id::text like '11111111-%';

insert into public.members (
  id, first_name, last_name, email, phone, member_role, membership_status, membership_level, partner_member_id
) values
  ('22222222-2222-4222-8222-222222222221', 'Jane', 'Sample', 'jane.sample@example.com', '555-0100', 'member', 'lapsed', 'full', '22222222-2222-4222-8222-222222222222'),
  ('22222222-2222-4222-8222-222222222222', 'Quinn', 'Example', 'quinn.example@example.com', '555-0100', 'member', 'lapsed', 'full', '22222222-2222-4222-8222-222222222221'),
  ('22222222-2222-4222-8222-222222222223', 'Robin', 'Example', 'robin.example@example.com', '555-0100', 'member', 'active', 'full', null),
  ('22222222-2222-4222-8222-222222222224', 'Alex', 'Example', 'alex.example@example.com', '555-0100', 'member', 'inactive', 'full', null),
  ('22222222-2222-4222-8222-222222222225', 'Nia', 'Example', 'nia.example@example.com', '555-0100', 'member', 'dues-pending', 'full', null),
  ('22222222-2222-4222-8222-222222222226', 'Blake', 'Example', 'blake.example@example.com', '555-0100', 'member', 'pending-renewal', 'full', null),
  ('22222222-2222-4222-8222-222222222227', 'Sky', 'Example', 'sky.example@example.com', '555-0100', 'member', 'active', 'full', '22222222-2222-4222-8222-222222222228'),
  ('22222222-2222-4222-8222-222222222228', 'River', 'Example', 'river.example@example.com', '555-0100', 'member', 'active', 'full', '22222222-2222-4222-8222-222222222227'),
  ('22222222-2222-4222-8222-222222222229', 'Lane', 'Example', 'lane.example@example.com', '555-0100', 'member', 'active', 'full', null),
  ('22222222-2222-4222-8222-22222222222a', 'Morgan', 'Example', 'morgan.example@example.com', '555-0100', 'member', 'active', 'full', null);

insert into public.dues_payments (member_id, membership_year, amount, paid, paid_date, payment_method, membership_level, standard_amount)
values
  ('22222222-2222-4222-8222-222222222223', 2026, 375, true, date '2026-06-02', 'card', 'full', 375);

insert into public.dues_payments (member_id, membership_year, amount, paid, membership_level, standard_amount, notes)
values
  ('22222222-2222-4222-8222-222222222225', 2026, 375, false, 'full', 375, 'Induction invoice.'),
  ('22222222-2222-4222-8222-222222222226', 2026, 375, false, 'full', 375, 'Reactivation invoice.'),
  ('22222222-2222-4222-8222-22222222222a', 2026, 375, false, 'full', 375, 'Renewal invoice.');

create or replace function public.kos_test_actor(p_uid uuid, p_email text)
returns void
language plpgsql
as $$
begin
  perform set_config('kos.uid', p_uid::text, true);
  perform set_config('kos.email', p_email, true);
end;
$$;

do $$
declare
  v_day date := (timezone('America/New_York', now()))::date;
  v_res jsonb;
  v_status text;
  v_paid boolean;
  v_paid_date date;
  v_method text;
  v_amount numeric;
  v_share numeric;
  v_other numeric;
  v_receipt uuid;
  v_report jsonb;
  v_rows integer;
  v_flag integer;
begin
  perform public.kos_test_actor(
    '11111111-1111-4111-8111-111111111111',
    'pat.example@example.com'
  );

  v_res := public.kos_record_dues_receipt(
    '22222222-2222-4222-8222-222222222221',
    'check',
    375,
    v_day,
    '1001',
    false,
    null
  );
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'lapsed check failed: %', v_res;
  end if;
  if position('No email was sent.' in coalesce(v_res->>'message', '')) = 0 then
    raise exception 'receipt message missing the no-email line: %', v_res;
  end if;

  select m.membership_status into v_status
    from public.members m
   where m.id = '22222222-2222-4222-8222-222222222221';
  select d.paid, d.paid_date, d.payment_method, d.amount
    into v_paid, v_paid_date, v_method, v_amount
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222221'
     and d.membership_year = 2026;
  if v_status <> 'active' or v_paid is distinct from true or v_paid_date is distinct from v_day or v_method <> 'check' then
    raise exception 'lapsed check did not land, status=% paid=% date=% method=%', v_status, v_paid, v_paid_date, v_method;
  end if;
  if not exists (
    select 1 from public.membership_application_actions a
     where a.member_id = '22222222-2222-4222-8222-222222222221'
       and a.action = 'renewed'
       and a.to_status = 'active'
  ) then
    raise exception 'missing renewed action for Jane';
  end if;
  if not exists (
    select 1 from public.kos_dues_events e
     where e.member_id = '22222222-2222-4222-8222-222222222221'
       and e.event_type = 'payment_recorded'
       and e.payload->>'source' = 'officer_receipt'
       and e.payload->>'check_number' = '1001'
  ) then
    raise exception 'missing payment_recorded event for Jane';
  end if;

  v_res := public.kos_record_dues_receipt(
    '22222222-2222-4222-8222-222222222227',
    'check',
    700,
    v_day,
    '2002',
    true,
    null
  );
  if coalesce(v_res->>'message', '') <> 'Amount differs from $750.00 expected. Add a note.' then
    raise exception 'wrong amount should be refused: %', v_res;
  end if;
  if exists (
    select 1 from public.dues_payments d
     where d.member_id in (
       '22222222-2222-4222-8222-222222222227',
       '22222222-2222-4222-8222-222222222228'
     )
  ) then
    raise exception 'refused couple entry wrote a dues row';
  end if;

  v_res := public.kos_record_dues_receipt(
    '22222222-2222-4222-8222-222222222227',
    'check',
    750,
    v_day,
    '2002',
    true,
    null
  );
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'couple check failed: %', v_res;
  end if;
  select d.amount into v_share
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222227';
  select d.amount into v_other
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222228';
  if v_share is distinct from 375 or v_other is distinct from 375 then
    raise exception 'couple split expected 375 and 375, got % and %', v_share, v_other;
  end if;

  v_res := public.kos_record_dues_receipt(
    '22222222-2222-4222-8222-222222222221',
    'check',
    750,
    v_day,
    '3003',
    true,
    null
  );
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'already-paid couple should refuse the whole entry: %', v_res;
  end if;
  if exists (
    select 1 from public.dues_payments d
     where d.member_id = '22222222-2222-4222-8222-222222222222'
       and d.paid
  ) then
    raise exception 'refused entry marked the partner paid';
  end if;

  v_res := public.kos_record_dues_receipt(
    '22222222-2222-4222-8222-222222222224',
    'cash',
    375,
    v_day,
    null,
    false,
    null
  );
  if coalesce(v_res->>'message', '') <> 'Inactive members must reapply.' then
    raise exception 'inactive message: %', v_res;
  end if;

  v_res := public.kos_record_dues_receipt(
    '22222222-2222-4222-8222-222222222225',
    'cash',
    375,
    v_day,
    null,
    false,
    null
  );
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'dues-pending cash failed: %', v_res;
  end if;
  select m.membership_status, d.paid
    into v_status, v_paid
    from public.members m
    join public.dues_payments d on d.member_id = m.id and d.membership_year = 2026
   where m.id = '22222222-2222-4222-8222-222222222225';
  if v_status <> 'dues-pending' or v_paid is distinct from true then
    raise exception 'dues-pending should stay dues-pending and be paid, status=% paid=%', v_status, v_paid;
  end if;
  if not exists (
    select 1 from public.membership_application_actions a
     where a.member_id = '22222222-2222-4222-8222-222222222225'
       and a.action = 'dues_paid'
       and a.from_status = 'dues-pending'
       and a.to_status = 'dues-pending'
  ) then
    raise exception 'missing dues_paid action';
  end if;

  select r.id into v_receipt
    from public.kos_dues_receipts r
   where '22222222-2222-4222-8222-222222222221' = any (r.member_ids)
     and r.voided_at is null;
  v_res := public.kos_void_dues_receipt(v_receipt, 'Test void');
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'void failed: %', v_res;
  end if;
  select m.membership_status into v_status
    from public.members m
   where m.id = '22222222-2222-4222-8222-222222222221';
  select d.paid, d.paid_date, d.payment_method, d.receipt_id is null
    into v_paid, v_paid_date, v_method, v_paid
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222221';
  if v_status <> 'active' then
    raise exception 'void changed status to %', v_status;
  end if;
  select d.paid, d.payment_method, d.receipt_id::text
    into v_paid, v_method, v_status
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222221';
  if v_paid is distinct from false or v_method is not null or v_status is not null then
    raise exception 'void did not clear the dues row, paid=% method=% receipt=%', v_paid, v_method, v_status;
  end if;

  select r.id into v_receipt
    from public.kos_dues_receipts r
   where r.check_number = '2002'
     and r.voided_at is null;
  v_res := public.kos_adjust_dues_receipt(v_receipt, 750.01, v_day, '2002', 'Penny correction');
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'adjust failed: %', v_res;
  end if;
  select d.amount into v_share
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222227';
  select d.amount into v_other
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222228';
  if v_share is distinct from 375.01 or v_other is distinct from 375.00 then
    raise exception 'adjust split expected 375.01 and 375.00, got % and %', v_share, v_other;
  end if;
  if not exists (
    select 1 from public.kos_dues_events e
     where e.event_type = 'payment_adjusted'
       and e.member_id = '22222222-2222-4222-8222-222222222227'
       and e.payload->'before'->>'check_number' = '2002'
       and (e.payload->'after'->>'share')::numeric = 375.01
       and (e.payload->'before'->>'amount')::numeric = 750
  ) then
    raise exception 'missing payment_adjusted before/after';
  end if;

  perform public.kos_test_actor('11111111-1111-4111-8111-111111111115', 'jordan.example@example.com');
  v_res := public.kos_record_dues_receipt('22222222-2222-4222-8222-222222222229', 'cash', 375, v_day, null, false, null);
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'board should not record: %', v_res;
  end if;
  v_res := public.kos_void_dues_receipt(v_receipt, 'no');
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'board should not void: %', v_res;
  end if;
  v_res := public.kos_create_level_invoices(array['22222222-2222-4222-8222-222222222229']::uuid[], 2026, true);
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'board should not invoice: %', v_res;
  end if;

  perform public.kos_test_actor('11111111-1111-4111-8111-111111111114', 'riley.example@example.com');
  v_res := public.kos_record_dues_receipt('22222222-2222-4222-8222-222222222229', 'cash', 375, v_day, null, false, null);
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'secretary should not record: %', v_res;
  end if;
  v_res := public.kos_void_dues_receipt(v_receipt, 'no');
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'secretary should not void: %', v_res;
  end if;
  v_res := public.kos_create_level_invoices(array['22222222-2222-4222-8222-222222222229']::uuid[], 2026, true);
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'secretary should not invoice: %', v_res;
  end if;

  perform public.kos_test_actor('11111111-1111-4111-8111-111111111117', 'drew.example@example.com');
  v_res := public.kos_record_dues_receipt('22222222-2222-4222-8222-222222222229', 'cash', 375, v_day, null, false, null);
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'plain member should not record: %', v_res;
  end if;
  v_res := public.kos_void_dues_receipt(v_receipt, 'no');
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'plain member should not void: %', v_res;
  end if;
  v_res := public.kos_create_level_invoices(array['22222222-2222-4222-8222-222222222229']::uuid[], 2026, true);
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'plain member should not invoice: %', v_res;
  end if;

  perform public.kos_test_actor('11111111-1111-4111-8111-111111111113', 'casey.example@example.com');
  v_res := public.kos_decide_dues_waiver('22222222-2222-4222-8222-222222222229', 2026, true, true);
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'membership chair should not decide a waiver: %', v_res;
  end if;
  v_res := public.kos_apply_elected_officer_exemptions(2026);
  if coalesce(v_res->>'ok', '') <> 'false' then
    raise exception 'membership chair should not apply exemptions: %', v_res;
  end if;
  v_res := public.kos_request_dues_waiver('22222222-2222-4222-8222-222222222229', 2026, 'service_in_lieu', 'Test');
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'membership chair should still request a waiver: %', v_res;
  end if;

  perform public.kos_test_actor('11111111-1111-4111-8111-111111111112', 'sam.example@example.com');
  v_res := public.kos_decide_dues_waiver('22222222-2222-4222-8222-222222222229', 2026, true, true);
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'president should decide a waiver: %', v_res;
  end if;
  v_res := public.kos_record_dues_receipt('22222222-2222-4222-8222-222222222229', 'cash', 375, v_day, null, false, null);
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'president should record cash: %', v_res;
  end if;

  perform public.kos_test_actor('11111111-1111-4111-8111-111111111111', 'pat.example@example.com');
  v_res := public.kos_create_level_invoices(array['22222222-2222-4222-8222-22222222222a']::uuid[], 2026, true);
  if coalesce(v_res->>'ok', '') <> 'true' then
    raise exception 'treasurer should invoice: %', v_res;
  end if;
  v_res := public.kos_mark_renewal_paid('22222222-2222-4222-8222-22222222222a', 'cash', null);
  if coalesce(v_res->>'ok', '') <> 'true'
     or coalesce(v_res->>'already_paid', '') <> 'false'
     or position('is marked paid by cash' in coalesce(v_res->>'message', '')) = 0
     or position('No email was sent.' in coalesce(v_res->>'message', '')) = 0 then
    raise exception 'wrapper message shape: %', v_res;
  end if;
end $$;

do $$
begin
  perform public.kos_test_actor('11111111-1111-4111-8111-111111111117', 'drew.example@example.com');
  execute 'set role authenticated';
  begin
    insert into public.dues_payments (member_id, membership_year, amount)
    values ('22222222-2222-4222-8222-222222222229', 2025, 1);
    raise exception 'authenticated insert into dues_payments should have failed';
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform public.kos_log_dues_event('payment_recorded', null, 2026, '{}'::jsonb);
    raise exception 'authenticated should not execute kos_log_dues_event';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';
end $$;

create or replace function public.kos_simulate_zeffy_renewal(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dues_payments
     set paid = true,
         paid_date = current_date,
         payment_method = 'card'
   where member_id = p_member
     and membership_year = 2026
     and paid = false
     and coalesce(waiver_status, '') <> 'applied';
  update public.members
     set membership_status = 'active',
         updated_at = now()
   where id = p_member
     and lower(coalesce(membership_status, '')) in ('lapsed', 'pending-renewal');
  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status, actor_name
  ) values (
    p_member,
    'renewed',
    'Renewed via Zeffy dues payment',
    'pending-renewal',
    'active',
    'zeffy-webhook'
  );
end;
$$;

revoke all on function public.kos_simulate_zeffy_renewal(uuid) from public, anon;
grant execute on function public.kos_simulate_zeffy_renewal(uuid) to authenticated;

do $$
declare
  v_status text;
  v_paid boolean;
  v_report jsonb;
  v_rows integer;
  v_mis integer;
begin
  perform public.kos_test_actor('11111111-1111-4111-8111-111111111117', 'drew.example@example.com');
  execute 'set role authenticated';
  perform public.kos_simulate_zeffy_renewal('22222222-2222-4222-8222-222222222226');
  execute 'reset role';

  select m.membership_status into v_status
    from public.members m
   where m.id = '22222222-2222-4222-8222-222222222226';
  select d.paid into v_paid
    from public.dues_payments d
   where d.member_id = '22222222-2222-4222-8222-222222222226'
     and d.membership_year = 2026;
  if v_status <> 'active' or v_paid is distinct from true then
    raise exception 'simulated Zeffy payment did not activate Blake, status=% paid=%', v_status, v_paid;
  end if;
  if not exists (
    select 1 from public.membership_application_actions a
     where a.member_id = '22222222-2222-4222-8222-222222222226'
       and a.action = 'renewed'
       and a.note = 'Renewed via Zeffy dues payment'
  ) then
    raise exception 'missing Renewed via Zeffy dues payment action';
  end if;

  perform public.kos_test_actor('11111111-1111-4111-8111-111111111111', 'pat.example@example.com');
  v_report := public.kos_dues_season_report(2026);
  select count(*)::int into v_rows from public.kos_renewal_rows(2026);
  if coalesce(v_report->>'ok', '') <> 'true' then
    raise exception 'season report failed: %', v_report;
  end if;
  if (v_report->>'owing_total')::int <> v_rows then
    raise exception 'owing_total % <> kos_renewal_rows %', v_report->>'owing_total', v_rows;
  end if;
  -- v6 exempts only the four elected titles. Do not replace kos_is_dues_exempt.
  if public.kos_is_dues_exempt('11111111-1111-4111-8111-111111111111', 2026) is distinct from true
     or public.kos_is_dues_exempt('11111111-1111-4111-8111-111111111114', 2026) is distinct from true then
    raise exception 'treasurer and secretary should be exempt';
  end if;
  if public.kos_is_dues_exempt('11111111-1111-4111-8111-111111111115', 2026)
     or public.kos_is_dues_exempt('11111111-1111-4111-8111-111111111116', 2026)
     or public.kos_is_dues_exempt('11111111-1111-4111-8111-111111111113', 2026) then
    raise exception 'board, finance chair, and membership chair should owe dues';
  end if;
  if not exists (
    select 1 from public.kos_renewal_rows(2026) r
     where r.member_id = '11111111-1111-4111-8111-111111111115'
  ) then
    raise exception 'board member missing from kos_renewal_rows';
  end if;
  if (v_report->'invoiced_unpaid'->'renewal'->>'count')::int
     + (v_report->'not_invoiced'->>'count')::int
     <> (v_report->>'owing_total')::int then
    raise exception 'owing parts do not add up: %', v_report;
  end if;

  insert into public.payments (
    amount_cents, status, product_kind, description, payer_name, created_at
  ) values (
    37500, 'succeeded', 'event', 'Dues', 'Guest Example', timestamptz '2026-07-04 15:00:00+00'
  );
  v_report := public.kos_dues_reconcile(2026);
  select count(*)::int into v_mis
    from jsonb_array_elements(v_report->'possible_misfiled') f
   where f->>'description' = 'Dues'
     and (f->>'amount_cents')::int = 37500
     and f->>'product_kind' = 'event';
  if v_mis <> 1 then
    raise exception 'reconcile should flag the mock Dues event payment: %', v_report->'possible_misfiled';
  end if;
end $$;

rollback;
