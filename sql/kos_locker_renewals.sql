-- Krewe of Shamrock: renew a locker you already hold.
-- APPLY IN THE SUPABASE SQL EDITOR after sql/kos_locker_rentals.sql.
-- The website does not run this file. Do not apply it from the app.
-- Project: oazwkwflgbthojvnclfc. Safe to re-run.
--
-- If you re-run sql/kos_locker_rentals.sql, run this file again afterward.
-- That older file replaces the claim function with the single-locker version.
--
-- What this changes:
--   * A signed-in member who holds a locker (paid or assigned, matched by
--     member id or holder email) can save a renewal on that locker.
--   * The renewal is a locker_reservations row with is_renewal and locker_id
--     set, so the Zeffy auto-flip marks THAT locker paid.
--   * One Zeffy payment can cover several lockers of the same size.
--     Quantity comes from the ticket count when the amount agrees, otherwise
--     from how many $75 or $200 prices fit in the amount (up to a $20 tip).
--   * A member cannot change a locker. Only an officer can mark one available.

-- ---------------------------------------------------------------------------
-- 1) Renewal flag, and room for more than one open row per size
-- ---------------------------------------------------------------------------
alter table public.locker_reservations
  add column if not exists is_renewal boolean not null default false;

comment on column public.locker_reservations.is_renewal is
  'True when the member is paying to keep a locker they already hold.';

-- The old unique indexes allowed one open reservation per member and size,
-- and one payment id on one reservation. A member with RS1 and RS2 needs
-- two small renewals, and one checkout has to mark both paid.
alter table public.locker_reservations
  drop constraint if exists locker_reservations_payment_id_key;

drop index if exists public.locker_reservations_payment_id_key;
drop index if exists public.locker_reservations_open_member_size;
drop index if exists public.locker_reservations_open_email_size;
drop index if exists public.locker_reservations_open_locker;

-- If two unpaid rows already point at one locker, keep the oldest.
with ranked as (
  select
    id,
    row_number() over (partition by locker_id order by created_at, id) as n
  from public.locker_reservations
  where locker_id is not null
    and status in ('queued', 'assigned')
    and paid_at is null
)
update public.locker_reservations r
   set status = 'cancelled'
  from ranked
 where r.id = ranked.id
   and ranked.n > 1;

create unique index if not exists locker_reservations_open_member_size
  on public.locker_reservations (member_id, size)
  where member_id is not null
    and locker_id is null
    and status in ('queued', 'assigned');

create unique index if not exists locker_reservations_open_email_size
  on public.locker_reservations (lower(requester_email), size)
  where requester_email is not null
    and locker_id is null
    and status in ('queued', 'assigned');

create unique index locker_reservations_open_locker
  on public.locker_reservations (locker_id)
  where locker_id is not null
    and status in ('queued', 'assigned')
    and paid_at is null;

create index if not exists locker_reservations_payment_id_idx
  on public.locker_reservations (payment_id)
  where payment_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Member inserts still cannot pick a locker. The renewal function can.
-- ---------------------------------------------------------------------------
create or replace function public.locker_reservation_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if tg_op = 'INSERT'
     and current_setting('kos.locker_renewal', true) = '1' then
    if new.locker_id is null then
      raise exception 'Renewal requires a locker';
    end if;
    new.status := 'assigned';
    new.is_renewal := true;
    new.paid_at := null;
    new.payment_id := null;
    if auth.uid() is not null and not public.is_krewe_officer() then
      new.member_id := coalesce(public.kos_current_member_id(), new.member_id);
    end if;
  elsif tg_op = 'INSERT'
     and auth.uid() is not null
     and not public.is_krewe_officer() then
    new.member_id := public.kos_current_member_id();
    new.status := 'queued';
    new.is_renewal := false;
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

-- ---------------------------------------------------------------------------
-- 3) Members cannot edit lockers. Officers still can, including Free.
-- ---------------------------------------------------------------------------
create or replace function public.lockers_block_member_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if auth.uid() is not null and not coalesce(public.is_krewe_officer(), false) then
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

revoke insert, update, delete, truncate on public.lockers from authenticated, anon;
revoke all on public.lockers from anon;
grant select on public.lockers to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Lockers this member already holds
-- ---------------------------------------------------------------------------
create or replace function public.my_held_lockers()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_prefix, x.sort_num, x.locker_number), '[]'::jsonb)
  from (
    select
      l.id,
      l.locker_number,
      l.size,
      l.status,
      l.holder_name,
      coalesce(r.renewal_open, false) as renewal_open,
      coalesce(r.renewal_paid, false) as renewal_paid,
      case upper(substring(l.locker_number from '^[A-Za-z]+'))
        when 'LL' then 0
        when 'RL' then 1
        when 'RS' then 2
        else 3
      end as sort_prefix,
      coalesce((substring(l.locker_number from '[0-9]+'))::integer, 0) as sort_num
    from public.lockers l
    left join lateral (
      select
        coalesce(bool_or(rr.paid_at is null), false) as renewal_open,
        coalesce(bool_or(rr.paid_at is not null), false) as renewal_paid
      from public.locker_reservations rr
      where rr.locker_id = l.id
        and rr.is_renewal
        and rr.status <> 'cancelled'
    ) r on true
    where l.status in ('paid', 'assigned')
      and auth.uid() is not null
      and (
        (public.kos_current_member_id() is not null and l.member_id = public.kos_current_member_id())
        or (
          coalesce(auth.jwt() ->> 'email', '') <> ''
          and lower(btrim(coalesce(l.holder_email, ''))) = lower(btrim(auth.jwt() ->> 'email'))
        )
      )
  ) x;
$fn$;

-- ---------------------------------------------------------------------------
-- 5) Save a renewal for specific lockers, then the page opens Zeffy
-- ---------------------------------------------------------------------------
create or replace function public.member_request_locker_renewal(p_locker_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_member uuid := public.kos_current_member_id();
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_name text;
  v_id uuid;
  v_seen uuid[] := '{}';
  v_lock public.lockers%rowtype;
  v_existing uuid;
  v_paid boolean;
  v_ids uuid[] := '{}';
  v_numbers text[] := '{}';
  v_primary uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to renew a locker.');
  end if;
  if p_locker_ids is null or coalesce(array_length(p_locker_ids, 1), 0) < 1 then
    return jsonb_build_object('ok', false, 'message', 'Choose a locker to renew.');
  end if;
  if coalesce(array_length(p_locker_ids, 1), 0) > 20 then
    return jsonb_build_object('ok', false, 'message', 'Too many lockers in one renewal.');
  end if;

  select nullif(btrim(concat_ws(' ', nullif(btrim(m.first_name), ''), nullif(btrim(m.last_name), ''))), '')
    into v_name
  from public.members m
  where m.id = v_member
    and position('@' in btrim(concat_ws(' ', coalesce(m.first_name, ''), coalesce(m.last_name, '')))) = 0;

  perform set_config('kos.locker_renewal', '1', true);

  foreach v_id in array p_locker_ids loop
    if v_id is null or v_id = any (v_seen) then
      continue;
    end if;
    v_seen := array_append(v_seen, v_id);

    select *
      into v_lock
    from public.lockers
    where id = v_id
      and status in ('paid', 'assigned')
      and (
        (v_member is not null and member_id = v_member)
        or (v_email <> '' and lower(btrim(coalesce(holder_email, ''))) = v_email)
      )
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'message', 'That locker is not yours to renew.');
    end if;
    if v_lock.size not in ('small', 'large') then
      return jsonb_build_object('ok', false, 'message', 'This locker size cannot be renewed online.');
    end if;

    select exists (
      select 1
      from public.locker_reservations rr
      where rr.locker_id = v_lock.id
        and rr.is_renewal
        and rr.status <> 'cancelled'
        and rr.paid_at is not null
    ) into v_paid;

    select rr.id
      into v_existing
    from public.locker_reservations rr
    where rr.locker_id = v_lock.id
      and rr.status in ('queued', 'assigned')
      and rr.paid_at is null
    order by rr.created_at, rr.id
    limit 1;

    if v_existing is null and v_paid then
      continue;
    end if;

    if v_name is null then
      v_name := nullif(btrim(coalesce(v_lock.holder_name, '')), '');
      if v_name is not null and position('@' in v_name) > 0 then
        v_name := null;
      end if;
    end if;
    if v_name is null then
      v_name := coalesce(nullif(v_email, ''), 'Member');
    end if;

    if v_existing is null then
      insert into public.locker_reservations (
        member_id, requester_name, requester_email, size, notes, status, locker_id, is_renewal
      ) values (
        coalesce(v_member, v_lock.member_id),
        v_name,
        coalesce(nullif(v_email, ''), nullif(lower(btrim(coalesce(v_lock.holder_email, ''))), '')),
        v_lock.size,
        'Renewal for next season',
        'assigned',
        v_lock.id,
        true
      )
      returning id into v_existing;
    else
      update public.locker_reservations
         set is_renewal = true,
             status = 'assigned',
             member_id = coalesce(member_id, v_member, v_lock.member_id),
             requester_email = coalesce(
               requester_email,
               nullif(v_email, ''),
               nullif(lower(btrim(coalesce(v_lock.holder_email, ''))), '')
             ),
             notes = coalesce(nullif(btrim(notes), ''), 'Renewal for next season')
       where id = v_existing;
    end if;

    if v_primary is null then
      v_primary := v_existing;
    end if;
    v_ids := array_append(v_ids, v_existing);
    v_numbers := array_append(v_numbers, v_lock.locker_number);
  end loop;

  if coalesce(array_length(v_ids, 1), 0) < 1 then
    return jsonb_build_object('ok', false, 'message', 'Those lockers are already paid for next season.');
  end if;

  -- The locker the member clicked is first, so a quantity of 1 pays that one.
  if coalesce(array_length(v_ids, 1), 0) > 1 and v_primary is not null then
    update public.locker_reservations
       set created_at = (
         select min(created_at) - interval '1 millisecond'
         from public.locker_reservations
         where id = any (v_ids)
       )
     where id = v_primary
       and paid_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reservation_ids', to_jsonb(v_ids),
    'locker_numbers', to_jsonb(v_numbers)
  );
end;
$fn$;

-- Hide renewals from the "place in line" list. They show on My lockers.
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
          and q.locker_id is null
          and coalesce(q.is_renewal, false) = false
          and (
            q.created_at < r.created_at
            or (q.created_at = r.created_at and q.id <= r.id)
          )
      ) end as queue_position
    from public.locker_reservations r
    left join public.lockers l on l.id = r.locker_id
    where r.status <> 'cancelled'
      and coalesce(r.is_renewal, false) = false
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

revoke all on function public.my_held_lockers() from public, anon;
revoke all on function public.my_locker_reservations() from public, anon;
revoke all on function public.member_request_locker_renewal(uuid[]) from public, anon;
grant execute on function public.my_held_lockers() to authenticated;
grant execute on function public.my_locker_reservations() to authenticated;
grant execute on function public.member_request_locker_renewal(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Size and quantity for a multi-locker Zeffy payment
--    $75 small, $200 large. A tip of up to $20 still counts as that quantity.
--    Two small lockers are $150. Two large lockers are $400.
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
  v_small_rem int;
  v_large_rem int;
  v_small_ok boolean;
  v_large_ok boolean;
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
  v_small_rem := case when v_amount >= 7500 then v_amount % 7500 else null end;
  v_large_rem := case when v_amount >= 20000 then v_amount % 20000 else null end;
  v_small_ok := v_small_rem is not null and v_small_rem <= 2000;
  v_large_ok := v_large_rem is not null and v_large_rem <= 2000;
  if v_large_ok and (not v_small_ok or v_large_rem <= v_small_rem) then
    return 'large';
  end if;
  if v_small_ok then
    return 'small';
  end if;
  return 'unknown';
end;
$fn$;

create or replace function public.kos_locker_payment_quantity(p jsonb, p_size text)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_ticket int;
  v_explicit int;
  v_amount int;
  v_unit int;
  v_from_amount int := 0;
begin
  if p is null then
    return 1;
  end if;
  v_ticket := greatest(coalesce(nullif(p->>'ticket_count', '')::integer, 0), 0);
  v_explicit := greatest(coalesce(nullif(p->>'quantity', '')::integer, 0), 0);
  v_amount := coalesce((p->>'amount_cents')::integer, 0);
  v_unit := case p_size when 'small' then 7500 when 'large' then 20000 else 0 end;
  if v_unit > 0 and v_amount >= v_unit and (v_amount % v_unit) <= 2000 then
    v_from_amount := v_amount / v_unit;
  end if;
  -- The amount is the ceiling. A $75 payment does not cover two lockers
  -- even if a ticket count says 2. A $150 payment covers two small lockers
  -- even when the webhook ticket count defaulted to 1.
  if v_from_amount >= 1 and (v_ticket > v_from_amount or v_explicit > v_from_amount) then
    return least(v_from_amount, 20);
  end if;
  return least(greatest(v_ticket, v_explicit, v_from_amount, 1), 20);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7) Auto-flip. Same match as before, but a quantity of N marks N reservations.
--    Renewals (locker_id already set) are first, oldest first. The locker
--    the member clicked is saved with the earliest time, so quantity 1 pays
--    that locker. Extra quantity never grabs a locker that has no reservation.
-- ---------------------------------------------------------------------------
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
  v_qty int;
  v_applied int;
  v_res public.locker_reservations%rowtype;
  v_lock public.lockers%rowtype;
  v_holder text;
  v_holder_email text;
  v_number text;
  v_saved uuid;
  v_claimed jsonb := '[]'::jsonb;
  v_one jsonb;
  v_reason text;
  v_sizes int;
  v_inferred text;
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'locker', false, 'reason', 'missing_payment');
  end if;

  perform pg_advisory_xact_lock(hashtext('locker-pay'), hashtext(p_payment_id::text));

  select count(*)::int
    into v_applied
  from public.locker_reservations
  where payment_id = p_payment_id;

  v_size := public.kos_locker_payment_size(p);
  v_qty := public.kos_locker_payment_quantity(p, v_size);

  if v_applied > 0 and (v_size is null or v_applied >= v_qty) then
    select coalesce(jsonb_agg(jsonb_build_object(
        'reservation_id', r.id,
        'locker_id', r.locker_id,
        'locker_number', l.locker_number,
        'size', r.size,
        'reason', 'already_applied'
      ) order by r.created_at, r.id), '[]'::jsonb)
      into v_claimed
    from public.locker_reservations r
    left join public.lockers l on l.id = r.locker_id
    where r.payment_id = p_payment_id;

    return jsonb_build_object(
      'ok', true,
      'locker', true,
      'duplicate', true,
      'matched', true,
      'reason', 'already_applied',
      'quantity', v_qty,
      'claimed', v_applied,
      'reservation_id', v_claimed->0->>'reservation_id',
      'locker_id', v_claimed->0->>'locker_id',
      'locker_number', v_claimed->0->>'locker_number',
      'size', v_claimed->0->>'size',
      'assigned', nullif(v_claimed->0->>'locker_id', '') is not null,
      'lockers', v_claimed
    );
  end if;

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
    select count(distinct r.size)::int
      into v_sizes
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
    if v_sizes = 0 then
      return jsonb_build_object(
        'ok', true,
        'locker', true,
        'matched', false,
        'reason', 'no_open_reservation',
        'size', 'unknown',
        'quantity', v_qty
      );
    end if;
    if v_sizes <> 1 then
      return jsonb_build_object(
        'ok', true,
        'locker', true,
        'matched', false,
        'reason', 'size_ambiguous',
        'size', 'unknown',
        'quantity', v_qty
      );
    end if;
    select min(r.size)
      into v_inferred
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
    v_size := v_inferred;
    v_qty := public.kos_locker_payment_quantity(p, v_size);
    if v_applied >= v_qty then
      return jsonb_build_object(
        'ok', true,
        'locker', true,
        'duplicate', true,
        'reason', 'already_applied',
        'quantity', v_qty,
        'claimed', v_applied,
        'size', v_size
      );
    end if;
  end if;

  for v_res in
    select r.*
    from public.locker_reservations r
    where r.payment_id is null
      and r.paid_at is null
      and r.status in ('queued', 'assigned')
      and r.size = v_size
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
      case when r.locker_id is not null then 0 else 1 end,
      r.created_at,
      r.id
    limit (v_qty - v_applied)
    for update of r skip locked
  loop
    v_number := null;
    v_lock := null;
    v_saved := v_res.locker_id;
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

      v_reason := 'paid_existing';
    else
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

        v_number := v_lock.locker_number;
        v_saved := v_lock.id;
        v_reason := 'assigned';
      else
        update public.locker_reservations
           set paid_at = coalesce(paid_at, now()),
               payment_id = p_payment_id
         where id = v_res.id;
        v_reason := 'paid_waiting';
      end if;
    end if;

    v_one := jsonb_build_object(
      'reservation_id', v_res.id,
      'locker_id', v_saved,
      'locker_number', v_number,
      'size', v_res.size,
      'reason', v_reason
    );
    v_claimed := v_claimed || jsonb_build_array(v_one);
    v_lock := null;
  end loop;

  if jsonb_array_length(v_claimed) = 0 then
    return jsonb_build_object(
      'ok', true,
      'locker', true,
      'matched', false,
      'reason', 'no_open_reservation',
      'size', v_size,
      'quantity', v_qty,
      'claimed', v_applied
    );
  end if;

  v_reason := v_claimed->0->>'reason';
  return jsonb_build_object(
    'ok', true,
    'locker', true,
    'matched', true,
    'assigned', v_claimed->0->>'locker_number' is not null and v_claimed->0->>'locker_number' <> '',
    'reason', v_reason,
    'reservation_id', v_claimed->0->>'reservation_id',
    'locker_id', v_claimed->0->>'locker_id',
    'locker_number', v_claimed->0->>'locker_number',
    'size', v_size,
    'quantity', v_qty,
    'claimed', v_applied + jsonb_array_length(v_claimed),
    'amount_cents', v_amount,
    'lockers', v_claimed
  );
end;
$fn$;

revoke all on function public.kos_locker_payment_size(jsonb) from public, anon, authenticated;
revoke all on function public.kos_locker_payment_quantity(jsonb, text) from public, anon, authenticated;
revoke all on function public.kos_claim_locker_from_payment(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kos_locker_payment_size(jsonb) to service_role;
grant execute on function public.kos_locker_payment_quantity(jsonb, text) to service_role;
grant execute on function public.kos_claim_locker_from_payment(uuid, jsonb) to service_role;

revoke all on function public.lockers_block_member_write() from public, anon, authenticated;
revoke all on function public.locker_reservation_before_write() from public, anon, authenticated;
