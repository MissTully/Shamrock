-- NOT APPLIED. Review, then run in the Supabase SQL editor on oazwkwflgbthojvnclfc.
-- Krewe of Shamrock: officer "Add existing paid locker" (Patrick / board request Nov 2026).
-- Safe to re-run.
--
-- Depends on: lockers, locker_reservations, members, is_krewe_officer().
-- Pattern: one-step paid reservation linked to an open locker, like the
-- hand-seeded rows in sql/kos_locker_existing_reservations.sql, but as an RPC.
--
-- What this adds:
--   * locker_reservations.amount_cents (optional dollars paid)
--   * locker_reservations.source (e.g. existing_paid, zeffy, renewal)
--   * officer_locker_add_existing(...) for Officer Desk > Locker rentals
-- Never public: anon cannot call it. Officers only.

alter table public.locker_reservations
  add column if not exists amount_cents integer,
  add column if not exists source text;

alter table public.locker_reservations drop constraint if exists locker_reservations_amount_cents_check;
alter table public.locker_reservations
  add constraint locker_reservations_amount_cents_check
  check (amount_cents is null or amount_cents >= 0);

alter table public.locker_reservations drop constraint if exists locker_reservations_source_check;
alter table public.locker_reservations
  add constraint locker_reservations_source_check
  check (source is null or source in ('existing_paid', 'zeffy', 'renewal', 'manual', 'import'));

comment on column public.locker_reservations.amount_cents is
  'Optional amount paid in cents (e.g. 7500 for $75 small). Used for CSV and existing-paid entries.';
comment on column public.locker_reservations.source is
  'Where the reservation came from: existing_paid, zeffy, renewal, manual, import.';

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
declare
  v_num text := upper(btrim(coalesce(p_locker_number, '')));
  v_name text := nullif(btrim(coalesce(p_holder_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_holder_email, ''))), '');
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_paid timestamptz := coalesce(p_paid_at, now());
  v_amount integer := p_amount_cents;
  v_lock public.lockers%rowtype;
  v_mem public.members%rowtype;
  v_res_id uuid;
  v_size text;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if v_num = '' then
    return jsonb_build_object('ok', false, 'message', 'Pick an open locker.');
  end if;
  if v_amount is not null and v_amount < 0 then
    return jsonb_build_object('ok', false, 'message', 'Amount cannot be negative.');
  end if;
  if v_email is not null and position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'That email does not look valid.');
  end if;

  select * into v_lock from public.lockers where locker_number = v_num for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
  end if;
  if v_lock.status is distinct from 'available' then
    return jsonb_build_object('ok', false, 'message', 'That locker is not open. Free it first, or pick another.');
  end if;
  v_size := v_lock.size;
  if v_size not in ('small', 'large') then
    return jsonb_build_object('ok', false, 'message', 'That locker has no size set.');
  end if;

  if p_member_id is not null then
    select * into v_mem from public.members
     where id = p_member_id and merged_into is null;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'That member is not on the roster.');
    end if;
    v_name := coalesce(
      nullif(btrim(coalesce(v_mem.first_name, '') || ' ' || coalesce(v_mem.last_name, '')), ''),
      v_name,
      'Member'
    );
    v_email := coalesce(v_email, nullif(lower(btrim(coalesce(v_mem.email, ''))), ''));
  end if;

  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'Pick a roster member, or type a name.');
  end if;

  -- Default amount from size when the officer leaves amount blank.
  if v_amount is null then
    v_amount := case when v_size = 'large' then 20000 else 7500 end;
  end if;

  insert into public.locker_reservations (
    member_id, requester_name, requester_email, size, notes, status,
    locker_id, paid_at, amount_cents, source, is_renewal
  ) values (
    p_member_id,
    v_name,
    v_email,
    v_size,
    coalesce(v_note, 'Paid earlier. Entered as an existing locker so it is not reassigned.'),
    'assigned',
    v_lock.id,
    v_paid,
    v_amount,
    'existing_paid',
    false
  )
  returning id into v_res_id;

  update public.lockers
     set status = 'paid',
         holder_name = v_name,
         holder_email = v_email,
         member_id = p_member_id,
         notes = case
           when v_note is null then notes
           when notes is null or btrim(notes) = '' then v_note
           else left(notes || ' | ' || v_note, 500)
         end
   where id = v_lock.id;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_res_id,
    'locker_number', v_num,
    'size', v_size,
    'holder_name', v_name,
    'holder_email', v_email,
    'paid_at', v_paid,
    'amount_cents', v_amount,
    'source', 'existing_paid',
    'message', 'Saved. ' || v_num || ' is paid and will not be reassigned.'
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'message', 'That member or email already has an open reservation for this size, or the locker is already linked. Check the list and try again.');
  when others then
    return jsonb_build_object('ok', false, 'message', 'Could not save that locker. Please try again.');
end;
$fn$;

revoke all on function public.officer_locker_add_existing(text, uuid, text, text, timestamptz, integer, text)
  from public, anon;
grant execute on function public.officer_locker_add_existing(text, uuid, text, text, timestamptz, integer, text)
  to authenticated;
