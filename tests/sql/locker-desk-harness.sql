-- TEST ONLY. Do not run this on the live database.
-- Builds a tiny schema, applies the locker desk SQL, and checks assignments,
-- payments, the officer gate, and the audit. From the repository root:
--   createdb kos_locker_desk_test
--   psql -v ON_ERROR_STOP=1 -d kos_locker_desk_test -f tests/sql/locker-desk-harness.sql
-- Mock names only. No live emails.

\set ON_ERROR_STOP on
create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.jwt()
returns jsonb language sql stable as $$ select '{}'::jsonb; $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create table public.members (
  id uuid primary key,
  first_name text,
  last_name text,
  email text,
  officer_title text,
  member_role text,
  membership_status text,
  merged_into uuid,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'zeffy',
  provider_event_id text unique,
  provider_payment_id text,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null default 'succeeded',
  payer_email text,
  payer_name text,
  description text,
  product_kind text not null default 'other',
  member_id uuid references public.members(id),
  event_id uuid,
  membership_year integer,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table public.lockers (
  id uuid primary key default gen_random_uuid(),
  locker_number text unique,
  size text,
  holder_name text,
  holder_email text,
  status text,
  notes text,
  member_id uuid references public.members(id),
  is_demo boolean default false,
  created_at timestamptz not null default now()
);

create table public.locker_reservations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id),
  requester_name text not null,
  requester_email text,
  size text not null,
  notes text,
  status text not null default 'queued',
  locker_id uuid references public.lockers(id),
  paid_at timestamptz,
  payment_id uuid references public.payments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locker_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table public.locker_units (
  id uuid primary key default gen_random_uuid(),
  label text
);

create or replace function public.is_krewe_officer()
returns boolean language sql stable as $$
  select coalesce(current_setting('kos.test_officer', true), '') = '1';
$$;
create or replace function public.has_tool(p_tool text)
returns boolean language sql stable as $$
  select coalesce(current_setting('kos.test_tool', true), '') = coalesce(p_tool, '');
$$;
create or replace function public.kos_is_site_admin()
returns boolean language sql stable as $$
  select coalesce(current_setting('kos.test_admin', true), '') = '1';
$$;
create or replace function public.kos_current_member_id()
returns uuid language sql stable as $$
  select nullif(current_setting('kos.test_member', true), '')::uuid;
$$;

create or replace function public.officer_save_locker(p_id uuid)
returns void language sql as $$ select null::void; $$;
create or replace function public.my_locker_board()
returns jsonb language sql as $$ select '{}'::jsonb; $$;

\ir ../../sql/kos_locker_desk.sql

grant execute on all functions in schema public to current_user;

insert into public.members (id, first_name, last_name) values
  ('11111111-1111-4111-8111-111111111101', 'Avery', 'Quinn'),
  ('11111111-1111-4111-8111-111111111102', 'Casey', 'Morgan'),
  ('11111111-1111-4111-8111-111111111103', 'Kim', 'Kelly'),
  ('11111111-1111-4111-8111-111111111104', 'Peter', 'Caughey'),
  ('11111111-1111-4111-8111-111111111105', 'Sam', 'Example'),
  ('11111111-1111-4111-8111-111111111106', 'Drew', 'Holder');

insert into public.lockers (id, locker_number, size, holder_name, status, notes, member_id, created_at) values
  ('22222222-2222-4222-8222-222222222201', 'LL2', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', null, '2026-09-30'),
  ('22222222-2222-4222-8222-222222222202', 'LL4', 'large', 'King and Queen', 'assigned', 'Comp / officer special. Unpaid.', null, '2026-09-30'),
  ('22222222-2222-4222-8222-222222222203', 'RL2', 'large', 'Peter Caughey', 'assigned', 'Unpaid.', '11111111-1111-4111-8111-111111111104', '2026-09-30'),
  ('22222222-2222-4222-8222-222222222204', 'RL3', 'large', 'Kim Kelly', 'paid', 'Unpaid.', '11111111-1111-4111-8111-111111111103', '2026-09-30'),
  ('22222222-2222-4222-8222-222222222205', 'RL5', 'large', 'Sam Example', 'assigned', null, '11111111-1111-4111-8111-111111111105', '2026-09-30'),
  ('22222222-2222-4222-8222-222222222206', 'RS1', 'small', null, 'available', null, null, '2026-09-30'),
  ('22222222-2222-4222-8222-222222222207', 'LL6', 'large', null, 'available', null, null, '2026-09-30'),
  ('22222222-2222-4222-8222-222222222208', 'RS2', 'small', null, 'available', null, null, '2026-09-30'),
  ('22222222-2222-4222-8222-222222222209', 'RL7', 'large', 'Drew Holder', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', '11111111-1111-4111-8111-111111111106', '2026-09-30');

insert into public.payments (id, provider, provider_event_id, amount_cents, status, payer_name, description, product_kind, member_id, created_at) values
  ('33333333-3333-4333-8333-333333333301', 'zeffy', 'evt-casey', 7500, 'succeeded', 'Casey Morgan', 'Krewe locker rental small', 'other', '11111111-1111-4111-8111-111111111102', '2026-10-06 16:00+00'),
  ('33333333-3333-4333-8333-333333333302', 'zeffy', 'evt-kate', 20000, 'succeeded', 'Kate Example', 'Krewe locker rental large', 'other', null, '2026-10-03 16:00+00'),
  ('33333333-3333-4333-8333-333333333303', 'zeffy', 'evt-drew', 20000, 'succeeded', 'Drew Holder', 'Krewe locker rental large', 'other', null, '2026-11-10 16:00+00');

alter table public.locker_reservations disable trigger locker_reservation_paid_from_payment;
insert into public.locker_reservations (id, member_id, requester_name, size, status, locker_id, paid_at, payment_id, created_at) values
  ('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111104', 'Peter Caughey', 'large', 'assigned', '22222222-2222-4222-8222-222222222203', '2026-09-30', null, '2026-09-01'),
  ('44444444-4444-4444-8444-444444444402', '11111111-1111-4111-8111-111111111104', 'Peter Caughey', 'large', 'assigned', '22222222-2222-4222-8222-222222222203', '2026-09-30', null, '2026-09-02'),
  ('44444444-4444-4444-8444-444444444403', '11111111-1111-4111-8111-111111111102', 'Casey Morgan', 'small', 'queued', null, null, '33333333-3333-4333-8333-333333333301', '2026-10-01'),
  ('44444444-4444-4444-8444-444444444404', null, 'Kate Example', 'large', 'assigned', '22222222-2222-4222-8222-222222222201', '2026-09-30', null, '2026-09-20'),
  ('44444444-4444-4444-8444-444444444405', '11111111-1111-4111-8111-111111111105', 'Sam Example', 'small', 'queued', null, null, null, '2026-09-15'),
  -- Holder of a large locker whose old small request was cancelled.
  ('44444444-4444-4444-8444-444444444406', '11111111-1111-4111-8111-111111111106', 'Drew Holder', 'small', 'cancelled', null, null, null, '2026-09-13');
alter table public.locker_reservations enable trigger locker_reservation_paid_from_payment;

select set_config('kos.test_officer', '0', false);
select set_config('kos.test_tool', '', false);
select set_config('kos.test_admin', '0', false);

do $$
declare v jsonb;
begin
  v := public.officer_locker_board();
  if v->>'ok' <> 'false' then raise exception 'member should not open the desk'; end if;

  perform set_config('kos.test_tool', 'lockers', false);
  v := public.officer_locker_assign(null, '44444444-4444-4444-8444-444444444403', 'RS1', false);
  if v->>'ok' <> 'true' then raise exception 'locker tool should assign: %', v; end if;
  if (select status from public.lockers where locker_number = 'RS1') <> 'assigned' then
    raise exception 'paid waiting member should be assigned when the size matches';
  end if;
  v := public.officer_locker_board();
  if not exists (
    select 1
    from jsonb_array_elements(v->'lockers') e
    where e->>'locker_number' = 'RS1'
      and e->>'paid' = 'true'
      and (e->>'paid_at')::timestamptz = '2026-10-06 16:00+00'::timestamptz
      and e->>'source' = 'Zeffy'
  ) then
    raise exception 'paid date on the board must come from the payment, got %', v->'lockers';
  end if;

  v := public.officer_locker_move('RS1', 'RS2', false);
  if v->>'ok' <> 'true' then raise exception 'same size move failed: %', v; end if;
  if (select count(*) from public.locker_assignment_history where action = 'move') < 1 then
    raise exception 'move should keep history';
  end if;
  if (select status from public.lockers where locker_number = 'RS1') <> 'available' then
    raise exception 'old locker should be open';
  end if;
  if (select payment_id from public.lockers where locker_number = 'RS2') is null then
    raise exception 'same size move should keep the payment';
  end if;
  v := public.officer_locker_move('RS2', 'LL6', false);
  if v->>'code' <> 'size_mismatch' then raise exception 'size mismatch should warn: %', v; end if;

  v := public.officer_locker_assign('11111111-1111-4111-8111-111111111101', null, 'LL6', false);
  if v->>'ok' <> 'true' then raise exception 'roster assign failed: %', v; end if;
  v := public.officer_locker_record_payment('2026-11-02', 20000, '', 'LL6', null);
  if v->>'message' not like '%note is required%' then raise exception 'note should be required: %', v; end if;
  v := public.officer_locker_record_payment('2026-11-02', 20000, 'Check at the barn', 'LL6', null);
  if v->>'ok' <> 'true' then raise exception 'off zeffy record failed: %', v; end if;
  if (select product_kind from public.payments where provider = 'off_zeffy') <> 'other' then
    raise exception 'off zeffy payment must stay product_kind other';
  end if;
  if (select created_at::date from public.payments where provider = 'off_zeffy') <> date '2026-11-02' then
    raise exception 'off zeffy paid date must be the date the officer entered';
  end if;

  perform set_config('kos.test_tool', '', false);
  perform set_config('kos.test_admin', '1', false);
  v := public.officer_locker_mark_comp('LL4', 'Parade Comp');
  if v->>'ok' <> 'true' then raise exception 'site admin should mark comp: %', v; end if;
  if (select payment_id from public.lockers where locker_number = 'LL4') is not null then
    raise exception 'comp locker must not keep a payment';
  end if;
end $$;

\ir ../../sql/kos_locker_desk_audit.sql

do $$
declare
  v_dup int;
  v_comp text;
  v_kim boolean;
  v_kate text;
  v_paid date;
begin
  select count(*) into v_dup
  from public.locker_reservations
  where requester_name = 'Peter Caughey' and status <> 'cancelled';
  if v_dup <> 1 then raise exception 'Peter duplicate should be one row, found %', v_dup; end if;

  select status into v_comp from public.lockers where locker_number = 'LL4';
  if v_comp <> 'comp' then raise exception 'LL4 should be comp, found %', v_comp; end if;

  select payment_unverified into v_kim from public.lockers where locker_number = 'RL3';
  if v_kim is not true then raise exception 'Kim Kelly RL3 should be unverified'; end if;

  select status into v_kate from public.lockers where locker_number = 'LL2';
  if v_kate <> 'assigned' then raise exception 'LL2 should be assigned from the linked payment, found %', v_kate; end if;
  if (select holder_name from public.lockers where locker_number = 'LL2') <> 'Kate Example' then
    raise exception 'LL2 holder should be restored from the reservation';
  end if;

  select paid_at::date into v_paid
  from public.locker_reservations
  where requester_name = 'Kate Example';
  if v_paid = date '2026-09-30' then raise exception 'invented Sep 30 paid date should be gone'; end if;

  if not exists (
    select 1 from locker_audit_report
    where kind = 'size_mismatch' and locker_number = 'RL5' and member_name = 'Sam Example'
  ) then
    raise exception 'size mismatch should stay on the exception list';
  end if;
  if not exists (
    select 1 from locker_audit_report
    where kind = 'unverified' and locker_number = 'RL3'
  ) then
    raise exception 'unverified exception missing';
  end if;

  -- Holder paid with no open reservation: payment goes straight to the locker.
  if (select payment_id from public.lockers where locker_number = 'RL7')
     is distinct from '33333333-3333-4333-8333-333333333303'::uuid then
    raise exception 'RL7 should carry the holder''s large locker payment';
  end if;
  if (select status from public.lockers where locker_number = 'RL7') <> 'assigned' then
    raise exception 'RL7 should be assigned once its payment is linked';
  end if;
  if not exists (
    select 1 from locker_audit_report
    where kind = 'payment_linked' and locker_number = 'RL7'
  ) then
    raise exception 'RL7 link should be on the officer list';
  end if;
  -- Kate's payment must not jump to another locker.
  if (select count(*) from public.lockers where payment_id = '33333333-3333-4333-8333-333333333302') > 1 then
    raise exception 'one payment must cover at most one locker';
  end if;
end $$;

-- Legacy objects go away when nothing else uses them.
\ir ../../sql/kos_locker_retire_legacy.sql

do $$
begin
  if to_regclass('public.locker_units') is not null then
    raise exception 'locker_units should be retired';
  end if;
  if to_regprocedure('public.officer_save_locker(uuid)') is not null then
    raise exception 'officer_save_locker should be retired';
  end if;
  if to_regprocedure('public.my_locker_board()') is not null then
    raise exception 'my_locker_board should be retired';
  end if;
  if to_regclass('public.lockers') is null then
    raise exception 'lockers table must stay';
  end if;
end $$;
