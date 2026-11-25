-- Krewe of Shamrock: one locker desk.
-- NOT APPLIED. The website does not run this file.
-- Project: oazwkwflgbthojvnclfc. Safe to re-run.
--
-- Run order:
--   1. This file.
--   2. sql/kos_locker_desk_audit.sql
--   3. sql/kos_locker_retire_legacy.sql
-- If you re-run sql/kos_locker_renewals.sql afterward, run this file again
-- so the write guard and held-locker list stay on the new statuses.
--
-- One row in public.lockers is the locker: number, size, holder, and status
-- (available, assigned, comp, pending_payment). The waiting list is
-- locker_reservations with no locker. Paid date and amount come from
-- public.payments. A note is never a paid date.
-- Comp is its own status and is not a payment.
-- Each member holds at most one active locker. Each locker has one holder.
-- Moves are kept in public.locker_assignment_history.
--
-- Officer RPCs are security definer. The caller must be an officer, hold the
-- lockers tool, or be a site admin (webmaster). Same gate as the other
-- locker tools, plus the site-admin check has_tool already uses.

alter table public.locker_reservations
  add column if not exists is_renewal boolean not null default false,
  add column if not exists amount_cents integer,
  add column if not exists source text;

alter table public.lockers
  add column if not exists payment_id uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists payment_unverified boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lockers_payment_id_fkey'
      and conrelid = 'public.lockers'::regclass
  ) then
    alter table public.lockers
      add constraint lockers_payment_id_fkey
      foreign key (payment_id) references public.payments(id) on delete set null;
  end if;
end $$;

comment on column public.lockers.payment_id is
  'Payment that covers this assignment. Paid date and amount are read from payments, not from notes.';
comment on column public.lockers.assigned_at is
  'When the current holder was assigned. Blank on rows imported before the locker desk.';
comment on column public.lockers.payment_unverified is
  'Holder says they paid, and no locker payment is linked. Not a paid date.';

create index if not exists lockers_payment_id_idx
  on public.lockers (payment_id)
  where payment_id is not null;

create index if not exists locker_reservations_locker_open_idx
  on public.locker_reservations (locker_id)
  where locker_id is not null and status <> 'cancelled';

-- Allow the new statuses without forcing a rewrite of existing rows.
-- The audit file tightens this after it reconciles payments.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'lockers'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
      and con.conname <> 'lockers_assignment_consistent'
  loop
    execute format('alter table public.lockers drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.lockers drop constraint if exists lockers_status_check;
alter table public.lockers
  add constraint lockers_status_check
  check (status in (
    'available', 'assigned', 'comp', 'pending_payment', 'paid', 'requested'
  ));

-- One active locker per member, once the audit has cleared duplicates.
do $$
begin
  if exists (
    select 1
    from public.lockers
    where member_id is not null
      and status in ('assigned', 'pending_payment', 'comp', 'paid')
    group by member_id
    having count(*) > 1
  ) then
    raise notice 'Locker desk: skipped lockers_one_active_member. Run sql/kos_locker_desk_audit.sql, then run this file again.';
  elsif to_regclass('public.lockers_one_active_member') is null then
    create unique index lockers_one_active_member
      on public.lockers (member_id)
      where member_id is not null
        and status in ('assigned', 'pending_payment', 'comp');
  end if;
end $$;

create table if not exists public.locker_assignment_history (
  id uuid primary key default gen_random_uuid(),
  locker_id uuid references public.lockers(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  holder_name text,
  action text not null,
  from_locker_number text,
  to_locker_number text,
  payment_id uuid references public.payments(id) on delete set null,
  note text,
  performed_by uuid,
  created_at timestamptz not null default now(),
  constraint locker_assignment_history_action_check
    check (action in ('assign', 'move', 'free', 'comp', 'link_payment', 'record_payment'))
);

create index if not exists locker_assignment_history_locker_idx
  on public.locker_assignment_history (locker_id, created_at);

alter table public.locker_assignment_history enable row level security;
revoke all on public.locker_assignment_history from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Names, payments, and the officer gate
-- ---------------------------------------------------------------------------
create or replace function public.kos_locker_person_name(p_member uuid, p_raw text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(
    (
      select nullif(btrim(concat_ws(
        ' ',
        nullif(btrim(m.first_name), ''),
        nullif(btrim(m.last_name), '')
      )), '')
      from public.members m
      where m.id = p_member
        and position('@' in concat_ws(' ', coalesce(m.first_name, ''), coalesce(m.last_name, ''))) = 0
    ),
    case
      when nullif(btrim(coalesce(p_raw, '')), '') is not null
       and position('@' in btrim(p_raw)) = 0
      then btrim(p_raw)
      else null
    end
  );
$fn$;

create or replace function public.kos_locker_payment_size_safe(
  p_description text,
  p_amount integer,
  p_raw jsonb
)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_size text;
  v_blob text;
begin
  if to_regprocedure('public.kos_locker_payment_size(jsonb)') is not null then
    execute 'select public.kos_locker_payment_size($1)'
      into v_size
      using jsonb_build_object(
        'description', p_description,
        'amount_cents', p_amount,
        'raw', p_raw
      );
    if v_size is not null then
      return v_size;
    end if;
  end if;
  v_blob := lower(coalesce(p_description, '') || ' ' || coalesce(p_raw::text, ''));
  if position('locker' in v_blob) = 0 and coalesce(p_description, '') not ilike '%locker%' then
    return null;
  end if;
  if p_amount = 7500 or v_blob ~ 'small' then
    return 'small';
  end if;
  if p_amount = 20000 or v_blob ~ 'large' then
    return 'large';
  end if;
  return 'unknown';
end;
$fn$;

create or replace function public.kos_can_manage_lockers()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if to_regprocedure('public.is_krewe_officer()') is not null
     and coalesce(public.is_krewe_officer(), false) then
    return true;
  end if;
  if to_regprocedure('public.has_tool(text)') is not null then
    begin
      if public.has_tool('lockers') then
        return true;
      end if;
    exception when others then
      null;
    end;
  end if;
  if to_regprocedure('public.kos_is_site_admin()') is not null
     and coalesce(public.kos_is_site_admin(), false) then
    return true;
  end if;
  return false;
end;
$fn$;

create or replace function public.kos_locker_history(
  p_locker uuid,
  p_member uuid,
  p_holder text,
  p_action text,
  p_from text,
  p_to text,
  p_payment uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  insert into public.locker_assignment_history (
    locker_id, member_id, holder_name, action,
    from_locker_number, to_locker_number, payment_id, note, performed_by
  ) values (
    p_locker, p_member, p_holder, p_action,
    p_from, p_to, p_payment, left(p_note, 500),
    case
      when to_regprocedure('public.kos_current_member_id()') is not null
        then public.kos_current_member_id()
      else null
    end
  );
end;
$fn$;

revoke all on function public.kos_locker_person_name(uuid, text) from public, anon, authenticated;
revoke all on function public.kos_locker_payment_size_safe(text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.kos_can_manage_lockers() from public, anon, authenticated;
revoke all on function public.kos_locker_history(uuid, uuid, text, text, text, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keep paid dates on the payment row
-- ---------------------------------------------------------------------------
create or replace function public.lockers_normalize_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.status = 'requested' then
    new.status := 'pending_payment';
  end if;
  if new.status = 'paid' then
    new.status := case when new.payment_id is not null then 'assigned' else 'pending_payment' end;
  end if;
  if new.status = 'assigned' and new.payment_id is null then
    new.status := 'pending_payment';
  elsif new.status = 'pending_payment' and new.payment_id is not null then
    new.status := 'assigned';
  end if;
  if new.status = 'available' then
    new.holder_name := null;
    new.holder_email := null;
    new.member_id := null;
    new.payment_id := null;
    new.payment_unverified := false;
    new.assigned_at := null;
  elsif new.status = 'comp' then
    new.payment_id := null;
    new.payment_unverified := false;
  end if;
  return new;
end;
$fn$;

drop trigger if exists lockers_normalize_assignment on public.lockers;
create trigger lockers_normalize_assignment
  before insert or update on public.lockers
  for each row execute function public.lockers_normalize_assignment();

create or replace function public.lockers_block_member_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if auth.uid() is not null
     and current_setting('kos.locker_officer', true) is distinct from '1'
     and not coalesce(public.is_krewe_officer(), false)
     and not coalesce(public.kos_can_manage_lockers(), false) then
    raise exception 'Only an officer can change a locker';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

drop trigger if exists lockers_block_member_write on public.lockers;
create trigger lockers_block_member_write
  before insert or update or delete on public.lockers
  for each row execute function public.lockers_block_member_write();

create or replace function public.locker_reservation_paid_from_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_paid timestamptz;
begin
  if new.payment_id is null then
    new.paid_at := null;
    return new;
  end if;
  select created_at into v_paid
  from public.payments
  where id = new.payment_id;
  new.paid_at := v_paid;
  return new;
end;
$fn$;

drop trigger if exists locker_reservation_paid_from_payment on public.locker_reservations;
create trigger locker_reservation_paid_from_payment
  before insert or update of payment_id, paid_at on public.locker_reservations
  for each row execute function public.locker_reservation_paid_from_payment();

create or replace function public.locker_reservation_apply_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.locker_id is null or new.payment_id is null or new.status = 'cancelled' then
    return new;
  end if;
  perform set_config('kos.locker_officer', '1', true);
  update public.lockers l
     set payment_id = new.payment_id,
         payment_unverified = false
   where l.id = new.locker_id
     and l.status is distinct from 'comp'
     and l.status is distinct from 'available'
     and (l.size = new.size or coalesce(new.is_renewal, false));
  return new;
end;
$fn$;

drop trigger if exists locker_reservation_apply_payment on public.locker_reservations;
create trigger locker_reservation_apply_payment
  after insert or update of payment_id, locker_id, status on public.locker_reservations
  for each row execute function public.locker_reservation_apply_payment();

revoke all on function public.lockers_normalize_assignment() from public, anon, authenticated;
revoke all on function public.lockers_block_member_write() from public, anon, authenticated;
revoke all on function public.locker_reservation_paid_from_payment() from public, anon, authenticated;
revoke all on function public.locker_reservation_apply_payment() from public, anon, authenticated;

-- Officer writes must not be rewritten as a member joining the list.
do $$
declare
  v_def text;
begin
  if to_regprocedure('public.locker_reservation_before_write()') is not null then
    v_def := pg_get_functiondef('public.locker_reservation_before_write()'::regprocedure);
    if position('kos.locker_officer' in v_def) = 0 then
      v_def := replace(
        v_def,
        'and not public.is_krewe_officer() then',
        'and current_setting(''kos.locker_officer'', true) is distinct from ''1''' ||
        ' and not public.is_krewe_officer() then'
      );
      execute v_def;
    end if;
  end if;
end $$;

-- Members still see a locker that is assigned or waiting on payment.
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('my_held_lockers', 'member_request_locker_renewal')
  loop
    v_def := pg_get_functiondef(r.sig);
    if position('pending_payment' in v_def) = 0
       and position('status in (''paid'', ''assigned'')' in v_def) > 0 then
      execute replace(
        v_def,
        'status in (''paid'', ''assigned'')',
        'status in (''paid'', ''assigned'', ''pending_payment'')'
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Officer board: one list, paid facts from payments
-- ---------------------------------------------------------------------------
create or replace function public.officer_locker_board()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_lockers jsonb;
  v_waiting jsonb;
  v_summary jsonb;
  v_urls jsonb;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;

  with base as (
    select
      l.id,
      l.locker_number,
      l.size,
      l.member_id,
      l.assigned_at,
      l.payment_unverified,
      coalesce(
        public.kos_locker_person_name(l.member_id, l.holder_name),
        public.kos_locker_person_name(l.member_id, linked.requester_name)
      ) as holder_name,
      case
        when l.status = 'comp'
          or (
            upper(l.locker_number) = 'LL4'
            and coalesce(l.holder_name, '') ~* 'king'
            and coalesce(l.holder_name, '') ~* 'queen'
          )
          then 'comp'
        when coalesce(
          public.kos_locker_person_name(l.member_id, l.holder_name),
          public.kos_locker_person_name(l.member_id, linked.requester_name)
        ) is null
          and nullif(btrim(coalesce(l.holder_name, '')), '') is null
          then 'available'
        when pay.id is not null then 'assigned'
        else 'pending_payment'
      end as status,
      pay.id as payment_id,
      pay.created_at as paid_at,
      pay.amount_cents,
      case
        when pay.id is null then ''
        when pay.provider = 'off_zeffy' then 'Off Zeffy'
        else 'Zeffy'
      end as source,
      mismatch.reserved_size,
      coalesce(renew.renewal_open, false) as renewal_open
    from public.lockers l
    left join lateral (
      select r.requester_name, r.member_id
      from public.locker_reservations r
      where r.locker_id = l.id
        and r.status <> 'cancelled'
        and coalesce(r.is_renewal, false) = false
      order by (r.payment_id is not null) desc, r.created_at, r.id
      limit 1
    ) linked on true
    left join lateral (
      select p.id, p.created_at, p.amount_cents, p.provider
      from public.payments p
      where p.id = coalesce(
        l.payment_id,
        (
          select r.payment_id
          from public.locker_reservations r
          where r.locker_id = l.id
            and r.payment_id is not null
            and r.status <> 'cancelled'
            and r.size = l.size
          order by r.created_at desc
          limit 1
        )
      )
        and lower(p.status) in ('succeeded', 'paid', 'complete', 'completed')
    ) pay on true
    left join lateral (
      select r.size as reserved_size
      from public.locker_reservations r
      where r.status <> 'cancelled'
        and coalesce(r.is_renewal, false) = false
        and r.size is distinct from l.size
        and (
          r.locker_id = l.id
          or (
            r.locker_id is null
            and l.member_id is not null
            and r.member_id = l.member_id
          )
        )
      order by r.created_at, r.id
      limit 1
    ) mismatch on true
    left join lateral (
      select true as renewal_open
      from public.locker_reservations r
      where r.locker_id = l.id
        and coalesce(r.is_renewal, false)
        and r.status <> 'cancelled'
        and r.payment_id is null
      limit 1
    ) renew on true
  ),
  shown as (
    select
      b.*,
      case
        when b.status = 'comp' then null
        else b.payment_id
      end as show_payment_id,
      case
        when b.status = 'comp' then null
        else b.paid_at
      end as show_paid_at,
      case
        when b.status = 'comp' then null
        else b.amount_cents
      end as show_amount,
      case
        when b.status = 'comp' then ''
        else b.source
      end as show_source,
      (
        b.status = 'pending_payment'
        and (
          coalesce(b.payment_unverified, false)
          or (
            upper(b.locker_number) = 'RL3'
            and coalesce(b.holder_name, '') ~* 'kim'
            and coalesce(b.holder_name, '') ~* 'kelly'
          )
        )
      ) as unverified
    from base b
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_prefix, x.sort_num, x.locker_number), '[]'::jsonb)
    into v_lockers
  from (
    select
      s.id,
      s.locker_number,
      s.size,
      s.member_id,
      case when s.status = 'available' then null else coalesce(s.holder_name, 'Name missing') end as holder_name,
      s.status,
      (s.status = 'assigned') as paid,
      s.show_paid_at as paid_at,
      s.show_amount as amount_cents,
      s.show_payment_id as payment_id,
      s.show_source as source,
      case when s.status = 'available' then null else s.assigned_at end as assigned_at,
      s.unverified,
      (s.reserved_size is not null and s.status <> 'available') as size_mismatch,
      s.reserved_size,
      s.renewal_open,
      case upper(substring(s.locker_number from '^[A-Za-z]+'))
        when 'LL' then 0 when 'RL' then 1 when 'RS' then 2 else 3
      end as sort_prefix,
      coalesce((substring(s.locker_number from '[0-9]+'))::integer, 0) as sort_num
    from shown s
  ) x;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at, w.id), '[]'::jsonb)
    into v_waiting
  from (
    select
      r.id,
      r.member_id,
      coalesce(public.kos_locker_person_name(r.member_id, r.requester_name), 'Name missing') as holder_name,
      r.size,
      'waiting'::text as status,
      (pay.id is not null) as paid,
      pay.created_at as paid_at,
      pay.amount_cents,
      pay.id as payment_id,
      case
        when pay.id is null then ''
        when pay.provider = 'off_zeffy' then 'Off Zeffy'
        else 'Zeffy'
      end as source,
      r.created_at
    from public.locker_reservations r
    left join public.payments pay
      on pay.id = r.payment_id
     and lower(pay.status) in ('succeeded', 'paid', 'complete', 'completed')
    where r.locker_id is null
      and r.status in ('queued', 'assigned')
      and coalesce(r.is_renewal, false) = false
  ) w;

  select coalesce(jsonb_agg(to_jsonb(s) order by case s.size when 'large' then 0 else 1 end), '[]'::jsonb)
    into v_summary
  from (
    select
      sizes.size,
      count(l.size)::int as total,
      count(l.size) filter (where l.status in ('assigned', 'pending_payment'))::int as assigned,
      count(l.size) filter (where l.status = 'available')::int as available,
      count(l.size) filter (where l.status = 'assigned')::int as paid,
      count(l.size) filter (where l.status = 'pending_payment')::int as unpaid,
      count(l.size) filter (where l.status = 'comp')::int as comp,
      (
        select count(*)::int
        from jsonb_array_elements(v_waiting) e
        where e->>'size' = sizes.size
      ) as waiting
    from (values ('large'), ('small')) as sizes(size)
    left join jsonb_to_recordset(v_lockers) as l(
      size text, status text
    ) on l.size = sizes.size
    group by sizes.size
  ) s;

  select jsonb_build_object(
    'small', coalesce(
      (select value from public.locker_settings where key = 'ZEFFY_LOCKER_SMALL_URL'),
      'https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-small'
    ),
    'large', coalesce(
      (select value from public.locker_settings where key = 'ZEFFY_LOCKER_LARGE_URL'),
      'https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-large'
    ),
    'smallCampaign', coalesce(
      (select value from public.locker_settings where key = 'ZEFFY_LOCKER_SMALL_CAMPAIGN'),
      'Krewe locker rental – Small'
    ),
    'largeCampaign', coalesce(
      (select value from public.locker_settings where key = 'ZEFFY_LOCKER_LARGE_CAMPAIGN'),
      'Krewe locker rental – Large'
    )
  ) into v_urls;

  return jsonb_build_object(
    'ok', true,
    'summary', v_summary,
    'lockers', v_lockers,
    'waiting', v_waiting,
    'urls', v_urls
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Officer actions
-- ---------------------------------------------------------------------------
create or replace function public.kos_locker_apply_payment(
  p_payment_id uuid,
  p_locker_id uuid,
  p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_pay public.payments%rowtype;
  v_lock public.lockers%rowtype;
  v_res public.locker_reservations%rowtype;
  v_other text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found or lower(v_pay.status) not in ('succeeded', 'paid', 'complete', 'completed') then
    return jsonb_build_object('ok', false, 'message', 'That payment was not found.');
  end if;

  select l.locker_number into v_other
  from public.lockers l
  where l.payment_id = p_payment_id
    and (p_locker_id is null or l.id <> p_locker_id)
  limit 1;
  if v_other is not null then
    return jsonb_build_object('ok', false, 'message', 'That payment is already linked to ' || v_other || '.');
  end if;

  if p_locker_id is not null then
    select * into v_lock from public.lockers where id = p_locker_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'Locker not found.');
    end if;
    if v_lock.status = 'comp' or (
      upper(v_lock.locker_number) = 'LL4'
      and coalesce(v_lock.holder_name, '') ~* 'king'
      and coalesce(v_lock.holder_name, '') ~* 'queen'
    ) then
      return jsonb_build_object('ok', false, 'message', 'A comp locker does not take a payment. Free it first if this payment belongs to someone else.');
    end if;
    if v_lock.member_id is null and nullif(btrim(coalesce(v_lock.holder_name, '')), '') is null then
      return jsonb_build_object('ok', false, 'message', 'Assign someone to the locker before linking a payment.');
    end if;
    update public.lockers
       set payment_id = p_payment_id,
           payment_unverified = false
     where id = v_lock.id;
    update public.locker_reservations r
       set payment_id = p_payment_id
     where r.locker_id = v_lock.id
       and r.status <> 'cancelled'
       and r.payment_id is null
       and r.size = v_lock.size
       and (
         r.member_id is not distinct from v_lock.member_id
         or public.kos_locker_person_name(r.member_id, r.requester_name)
            = public.kos_locker_person_name(v_lock.member_id, v_lock.holder_name)
       );
  end if;

  if p_reservation_id is not null then
    select * into v_res from public.locker_reservations where id = p_reservation_id for update;
    if not found or v_res.status = 'cancelled' then
      return jsonb_build_object('ok', false, 'message', 'Waiting list row not found.');
    end if;
    update public.locker_reservations
       set payment_id = p_payment_id
     where id = v_res.id;
  end if;

  return jsonb_build_object('ok', true, 'payment_id', p_payment_id, 'paid_at', v_pay.created_at, 'amount_cents', v_pay.amount_cents);
end;
$fn$;

create or replace function public.officer_locker_assign(
  p_member_id uuid default null,
  p_reservation_id uuid default null,
  p_locker_number text default null,
  p_confirm_size boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_res public.locker_reservations%rowtype;
  v_lock public.lockers%rowtype;
  v_member uuid;
  v_name text;
  v_size text;
  v_payment uuid;
  v_res_id uuid;
  v_held text;
  v_num text := upper(btrim(coalesce(p_locker_number, '')));
  v_open int;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  perform set_config('kos.locker_officer', '1', true);

  if p_reservation_id is not null then
    select * into v_res
    from public.locker_reservations
    where id = p_reservation_id and status <> 'cancelled'
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'That waiting list row was not found.');
    end if;
    if v_res.locker_id is not null and not coalesce(v_res.is_renewal, false) then
      return jsonb_build_object('ok', false, 'message', 'That person already has a locker. Change their locker instead.');
    end if;
    v_member := coalesce(p_member_id, v_res.member_id);
    v_name := public.kos_locker_person_name(v_member, v_res.requester_name);
    v_size := v_res.size;
    v_payment := v_res.payment_id;
    v_res_id := v_res.id;
  elsif p_member_id is not null then
    v_member := p_member_id;
    if not exists (
      select 1 from public.members m
      where m.id = v_member and m.merged_into is null
    ) then
      return jsonb_build_object('ok', false, 'message', 'That member is not on the roster.');
    end if;
    v_name := public.kos_locker_person_name(v_member, null);
    select count(*) into v_open
    from public.locker_reservations r
    where r.member_id = v_member
      and r.locker_id is null
      and r.status in ('queued', 'assigned')
      and coalesce(r.is_renewal, false) = false;
    if v_open > 1 then
      return jsonb_build_object('ok', false, 'message', 'That member has more than one waiting row. Pick the waiting list entry.');
    end if;
    select * into v_res
    from public.locker_reservations r
    where r.member_id = v_member
      and r.locker_id is null
      and r.status in ('queued', 'assigned')
      and coalesce(r.is_renewal, false) = false
    order by r.created_at, r.id
    limit 1;
    if found then
      v_size := v_res.size;
      v_payment := v_res.payment_id;
      v_res_id := v_res.id;
    end if;
  else
    return jsonb_build_object('ok', false, 'message', 'Choose a roster member or someone on the waiting list.');
  end if;

  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'That person needs a name on the roster before a locker can be assigned.');
  end if;
  if v_num = '' then
    return jsonb_build_object('ok', false, 'message', 'Choose an open locker.');
  end if;

  if v_member is not null then
    select locker_number into v_held
    from public.lockers
    where member_id = v_member
      and status in ('assigned', 'pending_payment', 'comp', 'paid')
    limit 1;
    if v_held is not null then
      return jsonb_build_object('ok', false, 'message', 'This member already has locker ' || v_held || '. Change their locker instead.');
    end if;
  end if;

  select * into v_lock from public.lockers where locker_number = v_num for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
  end if;
  if v_lock.status = 'comp' then
    return jsonb_build_object('ok', false, 'message', 'That locker is comp. Free it before assigning someone else.');
  end if;
  if v_lock.status <> 'available'
     or v_lock.member_id is not null
     or nullif(btrim(coalesce(v_lock.holder_name, '')), '') is not null then
    return jsonb_build_object('ok', false, 'message', 'That locker is not open.');
  end if;
  if v_size is not null and v_size <> v_lock.size and not coalesce(p_confirm_size, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'size_mismatch',
      'message', 'This person asked for a ' || v_size || ' locker. ' || v_num || ' is ' || v_lock.size || '. Confirm to assign it anyway.'
    );
  end if;

  update public.lockers
     set member_id = v_member,
         holder_name = v_name,
         holder_email = null,
         payment_id = case when v_size is null or v_size = v_lock.size then v_payment else null end,
         payment_unverified = false,
         assigned_at = now(),
         status = case
           when (v_size is null or v_size = v_lock.size) and v_payment is not null then 'assigned'
           else 'pending_payment'
         end
   where id = v_lock.id;

  if v_res_id is not null then
    update public.locker_reservations
       set locker_id = v_lock.id,
           status = 'assigned',
           member_id = coalesce(member_id, v_member),
           requester_name = v_name
     where id = v_res_id;
  end if;

  update public.locker_reservations
     set status = 'cancelled',
         notes = left(btrim(coalesce(notes, '') || ' Closed because a locker was assigned.'), 500)
   where id is distinct from v_res_id
     and status in ('queued', 'assigned')
     and coalesce(is_renewal, false) = false
     and locker_id is null
     and member_id = v_member
     and (v_size is null or size = v_lock.size);

  perform public.kos_locker_history(
    v_lock.id, v_member, v_name, 'assign', null, v_num,
    case when v_size is null or v_size = v_lock.size then v_payment else null end,
    case when v_size is not null and v_size <> v_lock.size then 'Assigned across sizes.' else null end
  );

  return jsonb_build_object('ok', true, 'locker_number', v_num, 'holder_name', v_name, 'message', 'Assigned ' || v_num || ' to ' || v_name || '.');
end;
$fn$;

create or replace function public.officer_locker_move(
  p_from_locker_number text,
  p_to_locker_number text,
  p_confirm_size boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_from public.lockers%rowtype;
  v_to public.lockers%rowtype;
  v_from_num text := upper(btrim(coalesce(p_from_locker_number, '')));
  v_to_num text := upper(btrim(coalesce(p_to_locker_number, '')));
  v_name text;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  perform set_config('kos.locker_officer', '1', true);
  if v_from_num = '' or v_to_num = '' then
    return jsonb_build_object('ok', false, 'message', 'Choose the current locker and the new locker.');
  end if;
  if v_from_num = v_to_num then
    return jsonb_build_object('ok', false, 'message', 'Choose a different locker.');
  end if;

  select * into v_from from public.lockers where locker_number = v_from_num for update;
  select * into v_to from public.lockers where locker_number = v_to_num for update;
  if v_from.id is null or v_to.id is null then
    return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
  end if;
  v_name := public.kos_locker_person_name(v_from.member_id, v_from.holder_name);
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'That locker does not have a holder to move.');
  end if;
  if v_to.status = 'comp' or v_to.status not in ('available')
     or v_to.member_id is not null
     or nullif(btrim(coalesce(v_to.holder_name, '')), '') is not null then
    return jsonb_build_object('ok', false, 'message', 'The new locker is not open.');
  end if;
  if v_from.size <> v_to.size and not coalesce(p_confirm_size, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'size_mismatch',
      'message', v_from_num || ' is ' || v_from.size || '. ' || v_to_num || ' is ' || v_to.size || '. Confirm to move anyway.'
    );
  end if;

  update public.lockers
     set status = 'available'
   where id = v_from.id;

  if v_from.status = 'comp' then
    update public.lockers
       set status = 'comp',
           holder_name = v_name,
           member_id = v_from.member_id,
           holder_email = null,
           payment_id = null,
           payment_unverified = false,
           assigned_at = v_from.assigned_at
     where id = v_to.id;
  else
    update public.lockers
       set member_id = v_from.member_id,
           holder_name = v_name,
           holder_email = null,
           payment_id = case when v_from.size = v_to.size then v_from.payment_id else null end,
           payment_unverified = case when v_from.size = v_to.size then v_from.payment_unverified else false end,
           assigned_at = coalesce(v_from.assigned_at, now()),
           status = case
             when v_from.size = v_to.size and v_from.payment_id is not null then 'assigned'
             else 'pending_payment'
           end
     where id = v_to.id;
  end if;

  update public.locker_reservations
     set locker_id = v_to.id
   where locker_id = v_from.id
     and status <> 'cancelled';

  perform public.kos_locker_history(
    v_to.id, v_from.member_id, v_name, 'move', v_from_num, v_to_num,
    case when v_from.size = v_to.size then v_from.payment_id else null end,
    null
  );

  return jsonb_build_object(
    'ok', true,
    'locker_number', v_to_num,
    'message', 'Moved ' || v_name || ' from ' || v_from_num || ' to ' || v_to_num || '.'
  );
end;
$fn$;

create or replace function public.officer_locker_free(p_locker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_lock public.lockers%rowtype;
  v_name text;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  perform set_config('kos.locker_officer', '1', true);
  select * into v_lock from public.lockers where id = p_locker_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Locker not found.');
  end if;
  v_name := public.kos_locker_person_name(v_lock.member_id, v_lock.holder_name);

  update public.locker_reservations
     set status = 'cancelled'
   where locker_id = v_lock.id
     and coalesce(is_renewal, false)
     and status <> 'cancelled';

  update public.locker_reservations r
     set locker_id = null,
         status = 'queued',
         payment_id = coalesce(r.payment_id, case when r.size = v_lock.size then v_lock.payment_id else null end)
   where r.locker_id = v_lock.id
     and r.status <> 'cancelled'
     and coalesce(r.is_renewal, false) = false;

  if v_lock.member_id is not null
     and v_lock.payment_id is not null
     and not exists (
       select 1 from public.locker_reservations r
       where r.member_id = v_lock.member_id
         and r.locker_id is null
         and r.status in ('queued', 'assigned')
         and r.payment_id = v_lock.payment_id
     ) then
    insert into public.locker_reservations (
      member_id, requester_name, size, status, payment_id, is_renewal, source
    ) values (
      v_lock.member_id,
      coalesce(v_name, 'Name missing'),
      v_lock.size,
      'queued',
      v_lock.payment_id,
      false,
      case when exists (
        select 1 from public.payments p where p.id = v_lock.payment_id and p.provider = 'off_zeffy'
      ) then 'manual' else 'zeffy' end
    );
  end if;

  update public.lockers
     set status = 'available'
   where id = v_lock.id;

  perform public.kos_locker_history(
    v_lock.id, v_lock.member_id, v_name, 'free', v_lock.locker_number, null, v_lock.payment_id, null
  );

  return jsonb_build_object('ok', true, 'locker_number', v_lock.locker_number, 'message', v_lock.locker_number || ' is open.');
end;
$fn$;

create or replace function public.officer_locker_mark_comp(
  p_locker_number text,
  p_holder_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_num text := upper(btrim(coalesce(p_locker_number, '')));
  v_name text := nullif(btrim(coalesce(p_holder_name, '')), '');
  v_lock public.lockers%rowtype;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  perform set_config('kos.locker_officer', '1', true);
  if v_num = '' then
    return jsonb_build_object('ok', false, 'message', 'Choose a locker.');
  end if;
  if v_name is null or position('@' in v_name) > 0 then
    return jsonb_build_object('ok', false, 'message', 'Enter the comp holder name.');
  end if;
  select * into v_lock from public.lockers where locker_number = v_num for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
  end if;

  if v_lock.member_id is not null and public.kos_locker_person_name(v_lock.member_id, v_lock.holder_name) is distinct from v_name then
    update public.locker_reservations
       set locker_id = null, status = 'queued'
     where locker_id = v_lock.id
       and status <> 'cancelled'
       and coalesce(is_renewal, false) = false;
  end if;

  update public.lockers
     set status = 'comp',
         holder_name = v_name,
         member_id = case
           when public.kos_locker_person_name(v_lock.member_id, v_lock.holder_name) = v_name then v_lock.member_id
           else null
         end,
         holder_email = null,
         payment_id = null,
         payment_unverified = false,
         assigned_at = coalesce(v_lock.assigned_at, now())
   where id = v_lock.id;

  perform public.kos_locker_history(v_lock.id, null, v_name, 'comp', null, v_num, null, null);
  return jsonb_build_object('ok', true, 'locker_number', v_num, 'message', v_num || ' is a comp locker for ' || v_name || '.');
end;
$fn$;

create or replace function public.officer_locker_link_payment(
  p_payment_id uuid,
  p_locker_number text default null,
  p_reservation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_lock public.lockers%rowtype;
  v_lock_id uuid;
  v_num text := upper(btrim(coalesce(p_locker_number, '')));
  v_applied jsonb;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  perform set_config('kos.locker_officer', '1', true);
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'message', 'Choose a payment.');
  end if;
  if v_num <> '' then
    select * into v_lock from public.lockers where locker_number = v_num;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
    end if;
    v_lock_id := v_lock.id;
  end if;
  if v_lock_id is null and p_reservation_id is null then
    return jsonb_build_object('ok', false, 'message', 'Choose a locker or a waiting list row.');
  end if;
  v_applied := public.kos_locker_apply_payment(p_payment_id, v_lock_id, p_reservation_id);
  if coalesce(v_applied->>'ok', 'false') <> 'true' then
    return v_applied;
  end if;
  perform public.kos_locker_history(
    coalesce(v_lock_id, (select r.locker_id from public.locker_reservations r where r.id = p_reservation_id)),
    coalesce(
      case when v_lock_id is not null then v_lock.member_id else null end,
      (select r.member_id from public.locker_reservations r where r.id = p_reservation_id)
    ),
    coalesce(
      case when v_lock_id is not null then public.kos_locker_person_name(v_lock.member_id, v_lock.holder_name) else null end,
      (select public.kos_locker_person_name(r.member_id, r.requester_name) from public.locker_reservations r where r.id = p_reservation_id)
    ),
    'link_payment', null, nullif(v_num, ''), p_payment_id, null
  );
  return v_applied || jsonb_build_object('message', 'Payment linked. The paid date is the payment date.');
end;
$fn$;

create or replace function public.officer_locker_record_payment(
  p_paid_on date,
  p_amount_cents integer,
  p_note text,
  p_locker_number text default null,
  p_reservation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_lock public.lockers%rowtype;
  v_res public.locker_reservations%rowtype;
  v_lock_ok boolean := false;
  v_res_ok boolean := false;
  v_num text := upper(btrim(coalesce(p_locker_number, '')));
  v_name text;
  v_member uuid;
  v_applied jsonb;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  perform set_config('kos.locker_officer', '1', true);
  if v_note is null then
    return jsonb_build_object('ok', false, 'message', 'A note is required for an off-Zeffy payment.');
  end if;
  if p_paid_on is null then
    return jsonb_build_object('ok', false, 'message', 'Enter the date the payment was received.');
  end if;
  if p_paid_on > (timezone('America/New_York', now()))::date then
    return jsonb_build_object('ok', false, 'message', 'Paid date cannot be in the future.');
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000 then
    return jsonb_build_object('ok', false, 'message', 'Enter the amount in dollars. Use Mark as comp for a locker that is not charged.');
  end if;
  if v_num <> '' then
    select * into v_lock from public.lockers where locker_number = v_num;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
    end if;
    v_lock_ok := true;
  end if;
  if p_reservation_id is not null then
    select * into v_res from public.locker_reservations where id = p_reservation_id and status <> 'cancelled';
    v_res_ok := found;
  end if;
  if not v_lock_ok and not v_res_ok then
    return jsonb_build_object('ok', false, 'message', 'Choose a locker or a waiting list row.');
  end if;
  if v_lock_ok and v_lock.status = 'comp' then
    return jsonb_build_object('ok', false, 'message', 'A comp locker does not take a payment.');
  end if;
  if v_lock_ok then
    v_member := v_lock.member_id;
  end if;
  if v_member is null and v_res_ok then
    v_member := v_res.member_id;
  end if;
  if v_lock_ok then
    v_name := public.kos_locker_person_name(v_member, v_lock.holder_name);
  end if;
  if v_name is null and v_res_ok then
    v_name := public.kos_locker_person_name(v_member, v_res.requester_name);
  end if;
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'Assign a named holder before recording a payment.');
  end if;

  insert into public.payments (
    provider, provider_event_id, amount_cents, currency, status,
    payer_name, description, product_kind, member_id, created_at, raw
  ) values (
    'off_zeffy',
    'off-zeffy-locker-' || gen_random_uuid()::text,
    p_amount_cents,
    'usd',
    'succeeded',
    v_name,
    left(v_note, 500),
    'other',
    v_member,
    (p_paid_on::timestamp + time '12:00') at time zone 'America/New_York',
    jsonb_build_object('source', 'off_zeffy', 'note', left(v_note, 500))
  )
  returning id into v_id;

  v_applied := public.kos_locker_apply_payment(
    v_id,
    case when v_lock_ok then v_lock.id else null end,
    case when v_res_ok then v_res.id else null end
  );
  if coalesce(v_applied->>'ok', 'false') <> 'true' then
    return v_applied;
  end if;
  perform public.kos_locker_history(
    case
      when v_lock_ok then v_lock.id
      when v_res_ok then v_res.locker_id
      else null
    end,
    v_member, v_name, 'record_payment', null, nullif(v_num, ''), v_id, left(v_note, 500)
  );
  return jsonb_build_object(
    'ok', true,
    'payment_id', v_id,
    'message', 'Off-Zeffy payment recorded for ' || v_name || '.'
  );
end;
$fn$;

create or replace function public.officer_locker_find_payments(p_query text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_rows jsonb;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.', 'payments', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select
      p.id,
      coalesce(nullif(btrim(p.payer_name), ''), 'Name missing') as payer_name,
      p.amount_cents,
      p.created_at,
      case when p.provider = 'off_zeffy' then 'Off Zeffy' else 'Zeffy' end as source,
      left(regexp_replace(coalesce(p.description, ''), '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', '', 'gi'), 80) as description,
      (
        select l.locker_number
        from public.lockers l
        where l.payment_id = p.id
        limit 1
      ) as linked_locker_number
    from public.payments p
    where (
      p.provider = 'off_zeffy'
      or public.kos_locker_payment_size_safe(p.description, p.amount_cents, p.raw) is not null
    )
      and (
        v_q = ''
        or lower(coalesce(p.payer_name, '')) like '%' || v_q || '%'
        or lower(coalesce(p.description, '')) like '%' || v_q || '%'
      )
    order by p.created_at desc
    limit 20
  ) x;
  return jsonb_build_object('ok', true, 'payments', v_rows);
end;
$fn$;

create or replace function public.officer_locker_set_setting(p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_key text := btrim(coalesce(p_key, ''));
  v_value text := btrim(coalesce(p_value, ''));
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if v_key not in (
    'ZEFFY_LOCKER_SMALL_URL',
    'ZEFFY_LOCKER_LARGE_URL',
    'ZEFFY_LOCKER_SMALL_CAMPAIGN',
    'ZEFFY_LOCKER_LARGE_CAMPAIGN'
  ) then
    return jsonb_build_object('ok', false, 'message', 'Unknown locker setting.');
  end if;
  if v_value = '' then
    return jsonb_build_object('ok', false, 'message', 'A value is required.');
  end if;
  if right(v_key, 4) = '_URL' and v_value !~ '^https://www\.zeffy\.com/' then
    return jsonb_build_object('ok', false, 'message', 'Pay link must start with https://www.zeffy.com/');
  end if;
  insert into public.locker_settings (key, value)
  values (v_key, v_value)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
  return jsonb_build_object('ok', true, 'key', v_key);
end;
$fn$;

-- Old buttons must not stamp a paid date that is not a payment.
create or replace function public.officer_locker_mark_paid(
  p_reservation_id uuid default null,
  p_locker_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object(
    'ok', false,
    'message', 'Paid date and amount come from a payment. Link a Zeffy payment or record an off-Zeffy payment.'
  );
end;
$fn$;

create or replace function public.officer_locker_add_existing(
  p_locker_number text,
  p_member_id uuid default null,
  p_holder_name text default null,
  p_holder_email text default null,
  p_paid_at timestamptz default null,
  p_amount_cents integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object(
    'ok', false,
    'message', 'Assign the locker, then link a Zeffy payment or record an off-Zeffy payment. A typed date is not a payment.'
  );
end;
$fn$;

revoke all on function public.kos_locker_apply_payment(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.officer_locker_board() from public, anon;
revoke all on function public.officer_locker_assign(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.officer_locker_move(text, text, boolean) from public, anon;
revoke all on function public.officer_locker_free(uuid) from public, anon;
revoke all on function public.officer_locker_mark_comp(text, text) from public, anon;
revoke all on function public.officer_locker_link_payment(uuid, text, uuid) from public, anon;
revoke all on function public.officer_locker_record_payment(date, integer, text, text, uuid) from public, anon;
revoke all on function public.officer_locker_find_payments(text) from public, anon;
revoke all on function public.officer_locker_set_setting(text, text) from public, anon;
revoke all on function public.officer_locker_mark_paid(uuid, uuid) from public, anon;
revoke all on function public.officer_locker_add_existing(text, uuid, text, text, timestamptz, integer, text) from public, anon;

grant execute on function public.officer_locker_board() to authenticated;
grant execute on function public.officer_locker_assign(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.officer_locker_move(text, text, boolean) to authenticated;
grant execute on function public.officer_locker_free(uuid) to authenticated;
grant execute on function public.officer_locker_mark_comp(text, text) to authenticated;
grant execute on function public.officer_locker_link_payment(uuid, text, uuid) to authenticated;
grant execute on function public.officer_locker_record_payment(date, integer, text, text, uuid) to authenticated;
grant execute on function public.officer_locker_find_payments(text) to authenticated;
grant execute on function public.officer_locker_set_setting(text, text) to authenticated;
grant execute on function public.officer_locker_mark_paid(uuid, uuid) to authenticated;
grant execute on function public.officer_locker_add_existing(text, uuid, text, text, timestamptz, integer, text) to authenticated;

drop function if exists public.officer_locker_assign(uuid, text);

do $$
begin
  if to_regclass('public.officer_tools') is not null then
    update public.officer_tools
       set description = 'Assign lockers, match payments, and download the locker list.'
     where tool_key = 'lockers';
  end if;
end $$;
