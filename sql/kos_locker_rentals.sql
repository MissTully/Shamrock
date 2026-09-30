-- Krewe of Shamrock: locker inventory, FCFS reservations, Zeffy pay links.
-- APPLY IN THE SUPABASE SQL EDITOR. The website does not run this file.
-- Project: oazwkwflgbthojvnclfc. Safe to re-run.
--
-- Re-running resets the four Zeffy keys below to the URLs in this file.
-- Re-running does not overwrite a physical locker that already has that number
-- (officer assignments stay). It does replace kos_record_payment with the
-- live 2026-09-30 body (dues, event RSVP, raffle credit) plus locker claiming.
--
-- Zeffy pay links (the one place to change them):
--   ZEFFY_LOCKER_SMALL_URL
--     https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-small
--   ZEFFY_LOCKER_LARGE_URL
--     https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-large
-- Campaign names:
--   ZEFFY_LOCKER_SMALL_CAMPAIGN  Krewe locker rental – Small
--   ZEFFY_LOCKER_LARGE_CAMPAIGN  Krewe locker rental – Large
-- The same URLs are the fallback in assets/kos-lockers.js.

-- ---------------------------------------------------------------------------
-- 1) Settings
-- ---------------------------------------------------------------------------
create table if not exists public.locker_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.locker_settings is
  'Locker rental config. ZEFFY_LOCKER_SMALL_URL and ZEFFY_LOCKER_LARGE_URL are the pay links.';

insert into public.locker_settings (key, value) values
  ('ZEFFY_LOCKER_SMALL_URL', 'https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-small'),
  ('ZEFFY_LOCKER_LARGE_URL', 'https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-large'),
  ('ZEFFY_LOCKER_SMALL_CAMPAIGN', 'Krewe locker rental – Small'),
  ('ZEFFY_LOCKER_LARGE_CAMPAIGN', 'Krewe locker rental – Large')
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

alter table public.locker_settings enable row level security;

drop policy if exists locker_settings_read on public.locker_settings;
create policy locker_settings_read on public.locker_settings
  for select to authenticated
  using (true);

drop policy if exists locker_settings_officer_write on public.locker_settings;
create policy locker_settings_officer_write on public.locker_settings
  for all to authenticated
  using (public.is_krewe_officer())
  with check (public.is_krewe_officer());

revoke all on public.locker_settings from anon;
grant select, insert, update, delete on public.locker_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Physical lockers: allow a blank holder, keep small/medium/large
-- ---------------------------------------------------------------------------
alter table public.lockers alter column holder_name drop not null;

-- Status check already allows requested, assigned, paid, available.
-- Size check already allows small, medium, large. The Hub only offers small and large.

create unique index if not exists lockers_locker_number_key
  on public.lockers (locker_number);

-- ---------------------------------------------------------------------------
-- 3) FCFS reservations (lockers stay the physical inventory)
-- ---------------------------------------------------------------------------
create table if not exists public.locker_reservations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  requester_name text not null,
  requester_email text,
  size text not null,
  notes text,
  status text not null default 'queued',
  locker_id uuid references public.lockers(id) on delete set null,
  paid_at timestamptz,
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locker_reservations
  add column if not exists paid_at timestamptz,
  add column if not exists payment_id uuid references public.payments(id) on delete set null;

alter table public.locker_reservations drop constraint if exists locker_reservations_size_check;
alter table public.locker_reservations
  add constraint locker_reservations_size_check check (size in ('small', 'large'));

alter table public.locker_reservations drop constraint if exists locker_reservations_status_check;
alter table public.locker_reservations
  add constraint locker_reservations_status_check
  check (status in ('queued', 'assigned', 'cancelled'));

create unique index if not exists locker_reservations_payment_id_key
  on public.locker_reservations (payment_id)
  where payment_id is not null;

create unique index if not exists locker_reservations_open_member_size
  on public.locker_reservations (member_id, size)
  where member_id is not null and status in ('queued', 'assigned');

create unique index if not exists locker_reservations_open_email_size
  on public.locker_reservations (lower(requester_email), size)
  where requester_email is not null and status in ('queued', 'assigned');

create index if not exists locker_reservations_queue_idx
  on public.locker_reservations (size, status, created_at);

-- Signed-in members cannot file a row under someone else's member id.
-- The SQL editor (no auth.uid()) can seed migrated requests.
create or replace function public.locker_reservation_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if tg_op = 'INSERT'
     and auth.uid() is not null
     and not public.is_krewe_officer() then
    new.member_id := public.kos_current_member_id();
    new.status := 'queued';
    new.locker_id := null;
    new.paid_at := null;
    new.payment_id := null;
    if nullif(btrim(coalesce(new.requester_name, '')), '') is null then
      raise exception 'Name is required';
    end if;
    if new.size not in ('small', 'large') then
      raise exception 'Locker size must be small or large';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists locker_reservations_before_write on public.locker_reservations;
create trigger locker_reservations_before_write
  before insert or update on public.locker_reservations
  for each row execute function public.locker_reservation_before_write();

alter table public.locker_reservations enable row level security;

drop policy if exists locker_reservations_select on public.locker_reservations;
create policy locker_reservations_select on public.locker_reservations
  for select to authenticated
  using (
    public.is_krewe_officer()
    or member_id = public.kos_current_member_id()
    or (
      member_id is null
      and requester_email is not null
      and coalesce(auth.jwt() ->> 'email', '') <> ''
      and lower(requester_email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists locker_reservations_insert on public.locker_reservations;
create policy locker_reservations_insert on public.locker_reservations
  for insert to authenticated
  with check (
    status = 'queued'
    and locker_id is null
    and paid_at is null
    and payment_id is null
    and size in ('small', 'large')
    and nullif(btrim(requester_name), '') is not null
    and (member_id is null or member_id = public.kos_current_member_id())
  );

drop policy if exists locker_reservations_officer_update on public.locker_reservations;
create policy locker_reservations_officer_update on public.locker_reservations
  for update to authenticated
  using (public.is_krewe_officer())
  with check (public.is_krewe_officer());

drop policy if exists locker_reservations_officer_delete on public.locker_reservations;
create policy locker_reservations_officer_delete on public.locker_reservations
  for delete to authenticated
  using (public.is_krewe_officer());

revoke all on public.locker_reservations from anon;
grant select, insert, update, delete on public.locker_reservations to authenticated;

-- Members read their own locker and officers read the inventory.
-- Open counts come from locker_availability(), not from listing every row.
drop policy if exists lockers_member_access on public.lockers;
drop policy if exists lockers_select on public.lockers;
create policy lockers_select on public.lockers
  for select to authenticated
  using (
    public.is_krewe_officer()
    or member_id = public.kos_current_member_id()
  );

drop policy if exists lockers_officer_write on public.lockers;
create policy lockers_officer_write on public.lockers
  for all to authenticated
  using (public.is_krewe_officer())
  with check (public.is_krewe_officer());

revoke all on public.lockers from anon;

-- ---------------------------------------------------------------------------
-- 4) Keep early "request a locker" rows, then seed Tim Fitzpatrick's sheet
--    (2026-09-30). Names below are the owners Tim listed. No emails invented.
-- ---------------------------------------------------------------------------
insert into public.locker_reservations (
  member_id, requester_name, requester_email, size, notes, status, created_at
)
select
  m.id,
  l.holder_name,
  coalesce(
    nullif(btrim(l.holder_email), ''),
    case when position('@' in l.holder_name) > 0 then l.holder_name else null end
  ),
  case when l.size in ('small', 'large') then l.size else 'small' end,
  l.notes,
  'queued',
  l.created_at
from public.lockers l
left join lateral (
  select id
  from public.members
  where lower(btrim(coalesce(email, ''))) = lower(coalesce(
    nullif(btrim(l.holder_email), ''),
    case when position('@' in l.holder_name) > 0 then l.holder_name else '' end
  ))
  order by id
  limit 1
) m on true
where l.locker_number is null
  and l.status = 'requested'
  and not exists (
    select 1
    from public.locker_reservations r
    where r.requester_name = l.holder_name
      and r.created_at = l.created_at
      and r.size = case when l.size in ('small', 'large') then l.size else 'small' end
  );

delete from public.lockers
 where locker_number is null
    or is_demo is true;

insert into public.lockers (locker_number, size, holder_name, status, notes, is_demo)
values
  ('LL1', 'large', 'Lisa & Stephanie', 'assigned', 'Tim Fitzpatrick inventory 2026-09-30. Unpaid.', false),
  ('LL2', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('LL3', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('LL4', 'large', 'King & Queen', 'assigned', 'Tim Fitzpatrick inventory 2026-09-30. Comp / officer special (King and Queen, $0). Not sold on the public Zeffy page.', false),
  ('LL5', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('LL6', 'large', 'Jeannette', 'assigned', 'Tim Fitzpatrick inventory 2026-09-30. Unpaid.', false),
  ('RL1', 'large', 'Chuck Powers', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RL2', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RL3', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RL4', 'large', 'Patrick & Scott', 'assigned', 'Tim Fitzpatrick inventory 2026-09-30. Unpaid.', false),
  ('RL5', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RL6', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RL7', 'large', 'Doug Tully', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RL8', 'large', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS1', 'small', 'Tim Fitz', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS2', 'small', 'Debbie Fitz', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS3', 'small', 'Leslie', 'assigned', 'Tim Fitzpatrick inventory 2026-09-30. Unpaid.', false),
  ('RS4', 'small', 'Perkins', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS5', 'small', 'Sharon', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS6', 'small', 'Jim & Lisa Sugrue', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS7', 'small', 'Tess', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS8', 'small', 'Anna', 'assigned', 'Tim Fitzpatrick inventory 2026-09-30. Unpaid.', false),
  ('RS9', 'small', 'Tim Hubbel', 'assigned', 'Tim Fitzpatrick inventory 2026-09-30. Unpaid.', false),
  ('RS10', 'small', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS11', 'small', 'Jeff & Pam Carney', 'paid', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS12', 'small', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS13', 'small', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30.', false),
  ('RS14', 'small', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30. Listed at $0. Treated as a small locker at $75 unless an officer says otherwise.', false),
  ('RS15', 'small', null, 'available', 'Tim Fitzpatrick inventory 2026-09-30. Listed at $0. Treated as a small locker at $75 unless an officer says otherwise.', false)
on conflict (locker_number) do nothing;

-- ---------------------------------------------------------------------------
-- 5) Member reads: open counts, and my place in line
-- ---------------------------------------------------------------------------
create or replace function public.locker_availability()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select jsonb_build_object(
    'small', count(*) filter (where size = 'small' and status = 'available'),
    'large', count(*) filter (where size = 'large' and status = 'available')
  )
  from public.lockers;
$fn$;

create or replace function public.my_locker_reservations()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
  from (
    select
      r.id,
      r.size,
      r.status,
      r.notes,
      r.created_at,
      r.paid_at,
      l.locker_number,
      case when r.status = 'queued' then (
        select count(*)::int
        from public.locker_reservations q
        where q.size = r.size
          and q.status = 'queued'
          and (
            q.created_at < r.created_at
            or (q.created_at = r.created_at and q.id <= r.id)
          )
      ) end as queue_position
    from public.locker_reservations r
    left join public.lockers l on l.id = r.locker_id
    where r.status <> 'cancelled'
      and (
        r.member_id = public.kos_current_member_id()
        or (
          r.member_id is null
          and coalesce(auth.jwt() ->> 'email', '') <> ''
          and lower(coalesce(r.requester_email, '')) = lower(auth.jwt() ->> 'email')
        )
      )
  ) x;
$fn$;

revoke all on function public.locker_availability() from public, anon;
revoke all on function public.my_locker_reservations() from public, anon;
grant execute on function public.locker_availability() to authenticated;
grant execute on function public.my_locker_reservations() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Zeffy locker match
--    A payment is a locker rental when the campaign name, slug, description,
--    or URL contains "locker", or the URL/slug contains
--    krewe-locker-rental-small / krewe-locker-rental-large.
--    Size: URL or campaign wording wins. Amount is the fallback
--    ($75 = 7500 cents small, $200 = 20000 cents large).
--    The same payment id never claims a second locker.
-- ---------------------------------------------------------------------------
create or replace function public.kos_locker_payment_size(p jsonb)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_blob text;
  v_amount int;
  v_small_url boolean;
  v_large_url boolean;
  v_small_word boolean;
  v_large_word boolean;
  v_locker boolean;
begin
  if p is null then
    return null;
  end if;
  v_blob := lower(concat_ws(' ',
    p->>'description',
    p->>'campaign_slug',
    p->>'campaign_name',
    p->>'campaign_url',
    p->>'campaign_id',
    p->'raw'
  ));
  v_amount := coalesce((p->>'amount_cents')::integer, 0);
  v_small_url := position('krewe-locker-rental-small' in v_blob) > 0;
  v_large_url := position('krewe-locker-rental-large' in v_blob) > 0;
  v_small_word := v_blob ~ '(locker[^a-z0-9]{0,24}small)|(small[^a-z0-9]{0,24}locker)';
  v_large_word := v_blob ~ '(locker[^a-z0-9]{0,24}large)|(large[^a-z0-9]{0,24}locker)';
  v_locker := v_small_url or v_large_url or position('locker' in v_blob) > 0;
  if not v_locker then
    return null;
  end if;
  if v_small_url and not v_large_url then
    return 'small';
  end if;
  if v_large_url and not v_small_url then
    return 'large';
  end if;
  if v_small_word and not v_large_word then
    return 'small';
  end if;
  if v_large_word and not v_small_word then
    return 'large';
  end if;
  if v_amount = 7500 then
    return 'small';
  end if;
  if v_amount = 20000 then
    return 'large';
  end if;
  return 'unknown';
end;
$fn$;

create or replace function public.kos_claim_locker_from_payment(p_payment_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_size text;
  v_emails text[] := '{}';
  v_email text;
  v_pay_email text;
  v_pay_name text;
  v_pay_member uuid;
  v_amount int;
  v_existing public.locker_reservations%rowtype;
  v_res public.locker_reservations%rowtype;
  v_lock public.lockers%rowtype;
  v_count int;
  v_holder text;
  v_holder_email text;
  v_number text;
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'locker', false, 'reason', 'missing_payment');
  end if;

  perform pg_advisory_xact_lock(hashtext('locker-pay'), hashtext(p_payment_id::text));

  select *
    into v_existing
  from public.locker_reservations
  where payment_id = p_payment_id
  limit 1;

  if found then
    select locker_number into v_number
    from public.lockers
    where id = v_existing.locker_id;
    return jsonb_build_object(
      'ok', true,
      'locker', true,
      'duplicate', true,
      'reason', 'already_applied',
      'reservation_id', v_existing.id,
      'locker_id', v_existing.locker_id,
      'locker_number', v_number,
      'size', v_existing.size,
      'assigned', v_existing.locker_id is not null
    );
  end if;

  v_size := public.kos_locker_payment_size(p);
  if v_size is null then
    return jsonb_build_object('ok', true, 'locker', false);
  end if;

  select payer_email, payer_name, member_id, amount_cents
    into v_pay_email, v_pay_name, v_pay_member, v_amount
  from public.payments
  where id = p_payment_id;

  if coalesce(p->>'payer_email', '') <> '' then
    v_emails := array_append(v_emails, lower(btrim(p->>'payer_email')));
  end if;
  if v_pay_email is not null and not (lower(v_pay_email) = any (v_emails)) then
    v_emails := array_append(v_emails, lower(v_pay_email));
  end if;
  if jsonb_typeof(p->'payer_emails') = 'array' then
    for v_email in
      select lower(btrim(x))
      from jsonb_array_elements_text(p->'payer_emails') as t(x)
      where position('@' in x) > 0
    loop
      if not (v_email = any (v_emails)) then
        v_emails := array_append(v_emails, v_email);
      end if;
    end loop;
  end if;
  if jsonb_typeof(p->'attendee_emails') = 'array' then
    for v_email in
      select lower(btrim(x))
      from jsonb_array_elements_text(p->'attendee_emails') as t(x)
      where position('@' in x) > 0
    loop
      if not (v_email = any (v_emails)) then
        v_emails := array_append(v_emails, v_email);
      end if;
    end loop;
  end if;

  if v_size = 'unknown' then
    select count(*) into v_count
    from public.locker_reservations r
    where r.payment_id is null
      and r.paid_at is null
      and r.status in ('queued', 'assigned')
      and (
        lower(btrim(coalesce(r.requester_email, ''))) = any (v_emails)
        or lower(btrim(coalesce(r.requester_name, ''))) = any (v_emails)
        or r.member_id = v_pay_member
        or r.member_id in (
          select m.id from public.members m
          where lower(btrim(coalesce(m.email, ''))) = any (v_emails)
        )
      );
    if v_count <> 1 then
      return jsonb_build_object(
        'ok', true,
        'locker', true,
        'matched', false,
        'reason', case when v_count = 0 then 'no_open_reservation' else 'size_ambiguous' end,
        'size', 'unknown'
      );
    end if;
  end if;

  select r.*
    into v_res
  from public.locker_reservations r
  where r.payment_id is null
    and r.paid_at is null
    and r.status in ('queued', 'assigned')
    and (v_size = 'unknown' or r.size = v_size)
    and (
      lower(btrim(coalesce(r.requester_email, ''))) = any (v_emails)
      or lower(btrim(coalesce(r.requester_name, ''))) = any (v_emails)
      or r.member_id = v_pay_member
      or r.member_id in (
        select m.id from public.members m
        where lower(btrim(coalesce(m.email, ''))) = any (v_emails)
      )
    )
  order by
    case when r.status = 'assigned' and r.locker_id is not null then 0 else 1 end,
    r.created_at,
    r.id
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'locker', true,
      'matched', false,
      'reason', 'no_open_reservation',
      'size', v_size
    );
  end if;

  v_holder := coalesce(
    nullif(btrim(coalesce(p->>'payer_name', '')), ''),
    nullif(btrim(coalesce(v_pay_name, '')), ''),
    nullif(btrim(v_res.requester_name), '')
  );
  v_holder_email := coalesce(
    nullif(lower(btrim(coalesce(p->>'payer_email', ''))), ''),
    nullif(lower(btrim(coalesce(v_pay_email, ''))), ''),
    nullif(lower(btrim(coalesce(v_res.requester_email, ''))), '')
  );

  if v_res.locker_id is not null then
    update public.lockers
       set status = 'paid',
           holder_name = coalesce(nullif(btrim(holder_name), ''), v_holder),
           holder_email = coalesce(holder_email, v_holder_email),
           member_id = coalesce(member_id, v_res.member_id, v_pay_member)
     where id = v_res.locker_id
     returning locker_number into v_number;

    update public.locker_reservations
       set paid_at = coalesce(paid_at, now()),
           payment_id = p_payment_id,
           status = 'assigned'
     where id = v_res.id;

    return jsonb_build_object(
      'ok', true,
      'locker', true,
      'matched', true,
      'assigned', true,
      'reason', 'paid_existing',
      'reservation_id', v_res.id,
      'locker_id', v_res.locker_id,
      'locker_number', v_number,
      'size', v_res.size
    );
  end if;

  select *
    into v_lock
  from public.lockers
  where status = 'available'
    and size = v_res.size
  order by
    coalesce(substring(locker_number from '^[A-Za-z]+'), ''),
    coalesce((substring(locker_number from '[0-9]+'))::integer, 0),
    locker_number
  limit 1
  for update skip locked;

  if found then
    update public.lockers
       set status = 'paid',
           holder_name = v_holder,
           holder_email = v_holder_email,
           member_id = coalesce(v_res.member_id, v_pay_member)
     where id = v_lock.id;

    update public.locker_reservations
       set paid_at = coalesce(paid_at, now()),
           payment_id = p_payment_id,
           locker_id = v_lock.id,
           status = 'assigned'
     where id = v_res.id;

    return jsonb_build_object(
      'ok', true,
      'locker', true,
      'matched', true,
      'assigned', true,
      'reason', 'assigned',
      'reservation_id', v_res.id,
      'locker_id', v_lock.id,
      'locker_number', v_lock.locker_number,
      'size', v_res.size
    );
  end if;

  update public.locker_reservations
     set paid_at = coalesce(paid_at, now()),
         payment_id = p_payment_id
   where id = v_res.id;

  return jsonb_build_object(
    'ok', true,
    'locker', true,
    'matched', true,
    'assigned', false,
    'reason', 'paid_waiting',
    'reservation_id', v_res.id,
    'size', v_res.size,
    'amount_cents', v_amount
  );
end;
$fn$;

revoke all on function public.kos_locker_payment_size(jsonb) from public, anon, authenticated;
revoke all on function public.kos_claim_locker_from_payment(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kos_locker_payment_size(jsonb) to service_role;
grant execute on function public.kos_claim_locker_from_payment(uuid, jsonb) to service_role;

-- Live kos_record_payment as of 2026-09-30, plus locker claiming.
-- Locker campaigns skip dues, event RSVP, and raffle side effects.
-- A duplicate webhook calls the claim again; the payment id lock makes that a no-op.
create or replace function public.kos_record_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_member uuid;
  v_id uuid;
  v_kind text;
  v_year integer;
  v_event uuid;
  v_emails text[] := '{}';
  v_email text;
  v_matched uuid[] := '{}';
  v_mid uuid;
  v_ticket_count int;
  v_rsvp_results jsonb := '[]'::jsonb;
  v_rsvp jsonb;
  v_i int := 0;
  v_guests int := 0;
  v_amount int;
  v_share int;
  v_duplicate boolean := false;
  v_raffle_qty int := 0;
  v_admission_qty int := 0;
  v_raffle uuid;
  v_raffle_result jsonb;
  v_locker_size text;
  v_locker jsonb;
begin
  v_kind := coalesce(p->>'product_kind', 'other');
  if v_kind not in ('store', 'event', 'dues', 'donation', 'raffle', 'other') then
    v_kind := 'other';
  end if;
  v_year := coalesce(
    nullif(p->>'membership_year', '')::integer,
    extract(year from current_date)::integer
  );
  v_amount := coalesce((p->>'amount_cents')::integer, 0);
  v_locker_size := public.kos_locker_payment_size(p);

  if coalesce(p->>'payer_email', '') <> '' then
    v_emails := array_append(v_emails, lower(btrim(p->>'payer_email')));
  end if;
  if jsonb_typeof(p->'payer_emails') = 'array' then
    for v_email in
      select lower(btrim(x))
      from jsonb_array_elements_text(p->'payer_emails') as t(x)
      where position('@' in x) > 0
    loop
      if not (v_email = any (v_emails)) then
        v_emails := array_append(v_emails, v_email);
      end if;
    end loop;
  end if;
  if jsonb_typeof(p->'attendee_emails') = 'array' then
    for v_email in
      select lower(btrim(x))
      from jsonb_array_elements_text(p->'attendee_emails') as t(x)
      where position('@' in x) > 0
    loop
      if not (v_email = any (v_emails)) then
        v_emails := array_append(v_emails, v_email);
      end if;
    end loop;
  end if;

  foreach v_email in array v_emails loop
    v_mid := public.kos_match_member_by_email(v_email);
    if v_mid is not null and not (v_mid = any (v_matched)) then
      v_matched := array_append(v_matched, v_mid);
    end if;
  end loop;

  if coalesce(array_length(v_matched, 1), 0) = 0 then
    v_mid := public.kos_match_member_by_name(p->>'payer_name');
    if v_mid is not null then
      v_matched := array_append(v_matched, v_mid);
    end if;
  end if;

  v_member := case when coalesce(array_length(v_matched, 1), 0) > 0 then v_matched[1] else null end;
  v_event := public.kos_find_event_for_payment(p);
  v_raffle_qty := greatest(coalesce(nullif(p->>'raffle_qty', '')::integer, 0), 0);
  v_admission_qty := greatest(coalesce(nullif(p->>'admission_qty', '')::integer, 0), 0);
  v_ticket_count := greatest(
    coalesce(nullif(p->>'ticket_count', '')::integer, 0),
    v_admission_qty,
    0
  );
  if v_ticket_count < 1 then
    v_ticket_count := 1;
  end if;
  if v_admission_qty > 0 then
    v_ticket_count := v_admission_qty;
  elsif v_raffle_qty > 0 and v_kind = 'raffle' then
    v_ticket_count := 0;
  end if;

  insert into public.payments (
    provider, provider_event_id, provider_payment_id, amount_cents, currency,
    status, payer_email, payer_name, description, product_kind, member_id,
    event_id, membership_year, raw
  ) values (
    coalesce(p->>'provider', 'stripe'),
    p->>'provider_event_id',
    p->>'provider_payment_id',
    v_amount,
    coalesce(p->>'currency', 'usd'),
    coalesce(p->>'status', 'succeeded'),
    nullif(lower(btrim(coalesce(p->>'payer_email', ''))), ''),
    nullif(btrim(coalesce(p->>'payer_name', '')), ''),
    p->>'description',
    v_kind,
    v_member,
    case when v_locker_size is null then v_event else null end,
    v_year,
    p->'raw'
  )
  on conflict (provider_event_id) do nothing
  returning id into v_id;

  if v_id is null then
    v_duplicate := true;
    select id, member_id, event_id
      into v_id, v_member, v_event
    from public.payments
    where provider_event_id = p->>'provider_event_id'
    limit 1;
  end if;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_recorded');
  end if;

  v_locker := public.kos_claim_locker_from_payment(v_id, p);

  if not v_duplicate and v_locker_size is null then
    if v_kind = 'dues' and v_member is not null then
      update public.dues_payments
         set paid = true, paid_date = current_date, payment_method = 'card'
       where member_id = v_member
         and membership_year = v_year
         and paid = false;
    end if;

    if v_event is not null
       and coalesce(array_length(v_matched, 1), 0) > 0
       and (v_kind = 'event' or v_admission_qty > 0)
    then
      for v_i in 1 .. array_length(v_matched, 1) loop
        v_guests := case
          when v_i = 1 and array_length(v_matched, 1) = 1
            then greatest(v_ticket_count - 1, 0)
          else 0
        end;
        v_share := case when v_i = 1 then v_amount else null end;
        v_rsvp := public.kos_auto_rsvp_from_payment(
          v_event,
          v_matched[v_i],
          v_guests,
          'Tickets purchased via Zeffy',
          v_id,
          v_share
        );
        v_rsvp_results := v_rsvp_results || jsonb_build_array(v_rsvp);
      end loop;
    end if;
  end if;

  if v_locker_size is null and (v_raffle_qty > 0 or v_kind = 'raffle') then
    if v_raffle_qty < 1 then
      v_raffle_qty := greatest(coalesce(nullif(p->>'ticket_count', '')::integer, 1), 1);
    end if;
    v_raffle := public.kos_find_raffle_for_payment(p, v_event);
    if v_raffle is not null and v_raffle_qty > 0 then
      v_raffle_result := public.kos_credit_raffle_from_payment(
        v_id,
        v_raffle,
        v_raffle_qty,
        v_member,
        coalesce(nullif(btrim(coalesce(p->>'payer_name', '')), ''), 'Zeffy guest'),
        p->>'payer_email'
      );
    else
      v_raffle_result := jsonb_build_object(
        'ok', false,
        'reason', case when v_raffle is null then 'raffle_not_linked' else 'no_qty' end,
        'hint', 'Link this raffle to the krewe event in Member Hub, or name the Zeffy raffle line so the webhook can match it.'
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', v_duplicate,
    'payment_id', v_id,
    'member_matched', v_member is not null,
    'member_id', v_member,
    'event_id', case when v_locker_size is null then v_event else null end,
    'matched_members', to_jsonb(v_matched),
    'rsvps', v_rsvp_results,
    'raffle_id', v_raffle,
    'raffle_qty', v_raffle_qty,
    'raffle', v_raffle_result,
    'locker', v_locker
  );
end;
$fn$;

revoke all on function public.kos_record_payment(jsonb) from public, anon, authenticated;
grant execute on function public.kos_record_payment(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 7) Officer actions (manual fallback)
-- ---------------------------------------------------------------------------
create or replace function public.officer_locker_mark_paid(
  p_reservation_id uuid default null,
  p_locker_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_res public.locker_reservations%rowtype;
  v_number text;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_reservation_id is not null then
    select * into v_res from public.locker_reservations where id = p_reservation_id;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'Reservation not found.');
    end if;
    update public.locker_reservations
       set paid_at = coalesce(paid_at, now())
     where id = p_reservation_id;
    if v_res.locker_id is not null then
      update public.lockers
         set status = 'paid'
       where id = v_res.locker_id
       returning locker_number into v_number;
    end if;
    return jsonb_build_object('ok', true, 'locker_number', v_number);
  end if;
  if p_locker_id is not null then
    update public.lockers
       set status = 'paid'
     where id = p_locker_id
       and status in ('assigned', 'paid')
     returning locker_number into v_number;
    if v_number is null then
      return jsonb_build_object('ok', false, 'message', 'That locker is not assigned.');
    end if;
    update public.locker_reservations
       set paid_at = coalesce(paid_at, now())
     where locker_id = p_locker_id
       and status <> 'cancelled';
    return jsonb_build_object('ok', true, 'locker_number', v_number);
  end if;
  return jsonb_build_object('ok', false, 'message', 'Nothing to mark paid.');
end;
$fn$;

create or replace function public.officer_locker_assign(
  p_reservation_id uuid,
  p_locker_number text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_res public.locker_reservations%rowtype;
  v_lock public.lockers%rowtype;
  v_num text := upper(btrim(coalesce(p_locker_number, '')));
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  select * into v_res from public.locker_reservations where id = p_reservation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Reservation not found.');
  end if;
  if v_res.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'message', 'That reservation was cancelled.');
  end if;
  select * into v_lock from public.lockers where locker_number = v_num for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
  end if;
  if v_lock.size <> v_res.size then
    return jsonb_build_object('ok', false, 'message', 'That locker is a different size.');
  end if;
  if v_lock.status <> 'available' and v_lock.id is distinct from v_res.locker_id then
    return jsonb_build_object('ok', false, 'message', 'That locker is not available.');
  end if;
  if v_res.locker_id is not null and v_res.locker_id <> v_lock.id then
    update public.lockers
       set status = 'available',
           holder_name = null,
           holder_email = null,
           member_id = null
     where id = v_res.locker_id;
  end if;
  update public.lockers
     set status = case when v_res.paid_at is not null then 'paid' else 'assigned' end,
         holder_name = coalesce(nullif(btrim(v_res.requester_name), ''), holder_name),
         holder_email = coalesce(v_res.requester_email, holder_email),
         member_id = coalesce(v_res.member_id, member_id)
   where id = v_lock.id;
  update public.locker_reservations
     set locker_id = v_lock.id,
         status = 'assigned'
   where id = v_res.id;
  return jsonb_build_object('ok', true, 'locker_number', v_num);
end;
$fn$;

create or replace function public.officer_locker_free(p_locker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_number text;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  update public.lockers
     set status = 'available',
         holder_name = null,
         holder_email = null,
         member_id = null
   where id = p_locker_id
   returning locker_number into v_number;
  if v_number is null then
    return jsonb_build_object('ok', false, 'message', 'Locker not found.');
  end if;
  update public.locker_reservations
     set locker_id = null,
         status = 'queued'
   where locker_id = p_locker_id
     and status = 'assigned';
  return jsonb_build_object('ok', true, 'locker_number', v_number);
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
  if not public.is_krewe_officer() then
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

revoke all on function public.officer_locker_mark_paid(uuid, uuid) from public, anon;
revoke all on function public.officer_locker_assign(uuid, text) from public, anon;
revoke all on function public.officer_locker_free(uuid) from public, anon;
revoke all on function public.officer_locker_set_setting(text, text) from public, anon;
grant execute on function public.officer_locker_mark_paid(uuid, uuid) to authenticated;
grant execute on function public.officer_locker_assign(uuid, text) to authenticated;
grant execute on function public.officer_locker_free(uuid) to authenticated;
grant execute on function public.officer_locker_set_setting(text, text) to authenticated;

revoke all on function public.locker_reservation_before_write() from public, anon, authenticated;
