-- ============================================================================
-- Krewe of Shamrock — Locker inventory (Tim Fitzpatrick, 2026-09-30).
--
-- Apply in the Supabase SQL editor for project oazwkwflgbthojvnclfc
-- (Krewe of Shamrock). Safe to run more than once: the seed inserts a code
-- only when that locker is not already there, so a second run will not
-- overwrite officer edits.
--
-- What this adds
--   public.locker_units — one row per physical locker (LL/RL/RS codes).
--   Members read only their own assignment plus open lockers (no one else's
--   name). Officers (is_krewe_officer: President, Secretary, board, and the
--   same non-merchandise chairs as the rest of the officer desk) read the
--   full board and save through officer_save_locker().
--
-- The older public.lockers table stays as the request queue (three rows were
-- already in it). This script does not change that table or its policies, so
-- the live request form keeps working until this Hub build is deployed.
-- Officers see those requests inside Locker board.
--
-- Name links (owner_name is always Tim's label; member_id is set only when
-- one roster row is a clear match):
--   Linked: Chuck Powers (lapsed), Douglas Tully, Tim Fitzpatrick,
--   Debbie Fitzpatrick, Leslie Skrodzki, Joy Perkins (not lapsed David),
--   Sharon Stevens, Jim Sugrue + Lisa Sugrue, Anna Peterson, Tim Hubbell
--   (inventory spelled Hubbel), Jeff Carney + Pam Carney.
--   Left as free text: Lisa & Stephanie (Lisa Sleek + Stephanie Jones is
--   likely, because Lisa Sugrue is already on RS6 — confirm before linking),
--   King & Queen, Jeannette, Patrick & Scott (two Patricks and two Scotts),
--   Tess.
--   RL3 and RL6 had a blank owner. They are seeded open, not assigned.
-- ============================================================================

create table if not exists public.locker_units (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  size text not null default 'small',
  owner_name text,
  member_id uuid references public.members(id) on delete set null,
  co_member_id uuid references public.members(id) on delete set null,
  cost_cents integer not null default 0,
  paid boolean not null default false,
  status text not null default 'open',
  notes text,
  sort_key integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locker_units
  add column if not exists code text,
  add column if not exists size text not null default 'small',
  add column if not exists owner_name text,
  add column if not exists member_id uuid references public.members(id) on delete set null,
  add column if not exists co_member_id uuid references public.members(id) on delete set null,
  add column if not exists cost_cents integer not null default 0,
  add column if not exists paid boolean not null default false,
  add column if not exists status text not null default 'open',
  add column if not exists notes text,
  add column if not exists sort_key integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists locker_units_code_key on public.locker_units (code);
create index if not exists locker_units_member_idx on public.locker_units (member_id);
create index if not exists locker_units_co_member_idx on public.locker_units (co_member_id);
create index if not exists locker_units_status_idx on public.locker_units (status);

alter table public.locker_units drop constraint if exists locker_units_size_check;
alter table public.locker_units add constraint locker_units_size_check
  check (size in ('large', 'small'));

alter table public.locker_units drop constraint if exists locker_units_status_check;
alter table public.locker_units add constraint locker_units_status_check
  check (status in ('open', 'assigned'));

alter table public.locker_units drop constraint if exists locker_units_cost_check;
alter table public.locker_units add constraint locker_units_cost_check
  check (cost_cents >= 0);

alter table public.locker_units drop constraint if exists locker_units_open_clear_check;
alter table public.locker_units add constraint locker_units_open_clear_check
  check (
    status != 'open'
    or (
      owner_name is null
      and member_id is null
      and co_member_id is null
      and paid = false
    )
  );

comment on table public.locker_units is
  'Physical krewe lockers. owner_name is the inventory label; member_id / co_member_id link roster profiles when the name is unambiguous.';

-- Member desk: own locker(s) plus open lockers. Never other people's names.
create or replace function public.my_locker_board()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  mid uuid := public.kos_current_member_id();
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to see lockers.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', u.code,
        'size', u.size,
        'owner_name', u.owner_name,
        'cost_cents', u.cost_cents,
        'paid', u.paid,
        'status', u.status
      ) order by u.sort_key)
      from public.locker_units u
      where mid is not null
        and u.status = 'assigned'
        and (u.member_id = mid or u.co_member_id = mid)
    ), '[]'::jsonb),
    'open', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', u.code,
        'size', u.size,
        'cost_cents', u.cost_cents
      ) order by u.sort_key)
      from public.locker_units u
      where u.status = 'open'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_locker_board() from public, anon;
grant execute on function public.my_locker_board() to authenticated;

-- Officer saves. Open clears the holder and the paid flag.
create or replace function public.officer_save_locker(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code text := upper(btrim(coalesce(p->>'code', '')));
  v_status text := lower(btrim(coalesce(p->>'status', 'open')));
  v_size text := lower(btrim(coalesce(p->>'size', '')));
  v_owner text := nullif(btrim(coalesce(p->>'owner_name', '')), '');
  v_member uuid;
  v_co uuid;
  v_cost integer;
  v_paid boolean;
  v_notes text := nullif(btrim(coalesce(p->>'notes', '')), '');
  v_row public.locker_units%rowtype;
  v_num integer;
begin
  v_paid := coalesce((p->>'paid')::boolean, false);
  v_member := nullif(btrim(coalesce(p->>'member_id', '')), '')::uuid;
  v_co := nullif(btrim(coalesce(p->>'co_member_id', '')), '')::uuid;
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Only officers can update lockers.');
  end if;
  if v_code !~ '^[A-Z]{1,4}[0-9]{1,3}$' then
    return jsonb_build_object('ok', false, 'message', 'Locker code should look like LL1 or RS12.');
  end if;
  if v_status not in ('open', 'assigned') then
    return jsonb_build_object('ok', false, 'message', 'Status must be open or assigned.');
  end if;
  if v_size != '' and v_size not in ('large', 'small') then
    return jsonb_build_object('ok', false, 'message', 'Size must be large or small.');
  end if;
  if p ? 'cost_cents' and nullif(btrim(coalesce(p->>'cost_cents', '')), '') is not null then
    v_cost := round((p->>'cost_cents')::numeric)::integer;
  elsif p ? 'cost_dollars' and nullif(btrim(coalesce(p->>'cost_dollars', '')), '') is not null then
    v_cost := round((p->>'cost_dollars')::numeric * 100)::integer;
  else
    v_cost := null;
  end if;
  if v_cost is not null and v_cost < 0 then
    return jsonb_build_object('ok', false, 'message', 'Cost cannot be negative.');
  end if;
  if v_status = 'open' then
    v_owner := null;
    v_member := null;
    v_co := null;
    v_paid := false;
  elsif v_owner is null and v_member is null then
    return jsonb_build_object('ok', false, 'message', 'An assigned locker needs an owner label or a member.');
  end if;
  if v_member is not null and not exists (
    select 1 from public.members m where m.id = v_member and m.merged_into is null
  ) then
    return jsonb_build_object('ok', false, 'message', 'That member is not on the roster.');
  end if;
  if v_co is not null and not exists (
    select 1 from public.members m where m.id = v_co and m.merged_into is null
  ) then
    return jsonb_build_object('ok', false, 'message', 'That second member is not on the roster.');
  end if;
  if v_member is not null and v_co is not null and v_member = v_co then
    v_co := null;
  end if;

  update public.locker_units u set
    owner_name = v_owner,
    member_id = v_member,
    co_member_id = v_co,
    cost_cents = coalesce(v_cost, u.cost_cents),
    paid = v_paid,
    status = v_status,
    notes = case when p ? 'notes' then v_notes else u.notes end,
    size = case when v_size in ('large', 'small') then v_size else u.size end,
    updated_at = now()
  where u.code = v_code
  returning * into v_row;

  if not found then
    if v_size not in ('large', 'small') then
      return jsonb_build_object('ok', false, 'message', 'Choose large or small for a new locker.');
    end if;
    v_num := coalesce(substring(v_code from '[0-9]+')::integer, 0);
    insert into public.locker_units (
      code, size, owner_name, member_id, co_member_id, cost_cents, paid, status, notes, sort_key
    ) values (
      v_code,
      v_size,
      v_owner,
      v_member,
      v_co,
      coalesce(v_cost, case when v_size = 'large' then 20000 else 7500 end),
      v_paid,
      v_status,
      v_notes,
      case
        when v_code like 'LL%' then 1000
        when v_code like 'RL%' then 2000
        else 3000
      end + v_num
    )
    returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'locker', to_jsonb(v_row));
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'message', 'That member link was not a valid id.');
  when others then
    return jsonb_build_object('ok', false, 'message', 'Could not save that locker.');
end;
$$;

revoke all on function public.officer_save_locker(jsonb) from public, anon;
grant execute on function public.officer_save_locker(jsonb) to authenticated;

create or replace function public.officer_locker_roster()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_krewe_officer() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'first_name', m.first_name,
      'last_name', m.last_name,
      'membership_status', m.membership_status
    ) order by m.last_name, m.first_name)
    from public.members m
    where m.merged_into is null
      and coalesce(m.membership_status, 'active') != 'merged'
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;

revoke all on function public.officer_locker_roster() from public, anon;
grant execute on function public.officer_locker_roster() to authenticated;

-- Earlier "request a locker" rows, for the officer board only.
create or replace function public.officer_locker_requests()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_krewe_officer() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'size', l.size,
      'holder_name', l.holder_name,
      'holder_email', l.holder_email,
      'notes', l.notes,
      'status', l.status,
      'created_at', l.created_at
    ) order by l.created_at)
    from public.lockers l
    where l.status = 'requested'
      and nullif(btrim(coalesce(l.locker_number, '')), '') is null
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;

revoke all on function public.officer_locker_requests() from public, anon;
grant execute on function public.officer_locker_requests() to authenticated;

alter table public.locker_units enable row level security;

revoke all on table public.locker_units from anon, authenticated, public;
grant select on table public.locker_units to authenticated;

drop policy if exists locker_units_select_scoped on public.locker_units;
create policy locker_units_select_scoped on public.locker_units
  for select to authenticated
  using (
    public.is_krewe_officer()
    or status = 'open'
    or member_id = public.kos_current_member_id()
    or co_member_id = public.kos_current_member_id()
  );

-- Seed Tim's 2026-09-30 inventory. Skips codes that already exist.
insert into public.locker_units (
  code, size, owner_name, member_id, co_member_id, cost_cents, paid, status, notes, sort_key
)
select
  s.code,
  s.size,
  nullif(s.owner_name, ''),
  (
    select m.id from public.members m
    where s.member_email is not null
      and m.merged_into is null
      and lower(m.email) = lower(s.member_email)
    order by case when coalesce(m.membership_status, 'active') = 'active' then 0 else 1 end
    limit 1
  ),
  (
    select m.id from public.members m
    where s.co_email is not null
      and m.merged_into is null
      and lower(m.email) = lower(s.co_email)
    order by case when coalesce(m.membership_status, 'active') = 'active' then 0 else 1 end
    limit 1
  ),
  s.cost_cents,
  s.paid,
  s.status,
  nullif(s.notes, ''),
  s.sort_key
from (
  values
    ('LL1'::text, 'large'::text, 'Lisa & Stephanie'::text, null::text, null::text, 20000, false, 'assigned'::text,
      'Unmatched on purpose. Lisa Sugrue is already on RS6, so this may be Lisa Sleek and Stephanie Jones. Confirm before linking profiles.'::text, 1001),
    ('LL2', 'large', null, null, null, 20000, false, 'open', null, 1002),
    ('LL3', 'large', null, null, null, 20000, false, 'open', null, 1003),
    ('LL4', 'large', 'King & Queen', null, null, 0, false, 'assigned',
      'Ceremonial locker from the 2026-09-30 inventory. Not a member profile.', 1004),
    ('LL5', 'large', null, null, null, 20000, false, 'open', null, 1005),
    ('LL6', 'large', 'Jeannette', null, null, 20000, false, 'assigned',
      'No Jeannette on the roster. Left as a free-text owner.', 1006),
    ('RL1', 'large', 'Chuck Powers', 'chuckpowers11@aol.com', null, 20000, true, 'assigned',
      'Linked to Chuck Powers. That roster row is lapsed — confirm he still holds RL1.', 2001),
    ('RL2', 'large', null, null, null, 20000, false, 'open', null, 2002),
    ('RL3', 'large', null, null, null, 20000, false, 'open',
      'Owner was blank on the 2026-09-30 inventory. Seeded as open.', 2003),
    ('RL4', 'large', 'Patrick & Scott', null, null, 20000, false, 'assigned',
      'Unmatched. The roster has Patrick Burke and Patrick Pustay, and Scott Bosch and Scott Ware.', 2004),
    ('RL5', 'large', null, null, null, 20000, false, 'open', null, 2005),
    ('RL6', 'large', null, null, null, 20000, false, 'open',
      'Owner was blank on the 2026-09-30 inventory. Seeded as open.', 2006),
    ('RL7', 'large', 'Doug Tully', 'dougtully@protonmail.com', null, 20000, true, 'assigned',
      'Inventory label Doug Tully; linked to Douglas Tully.', 2007),
    ('RL8', 'large', null, null, null, 20000, false, 'open', null, 2008),
    ('RS1', 'small', 'Tim Fitz', 'timfitz@verizon.net', null, 7500, true, 'assigned',
      'Inventory label Tim Fitz; linked to Tim Fitzpatrick.', 3001),
    ('RS2', 'small', 'Debbie Fitz', 'dgfitzpa@gmail.com', null, 7500, true, 'assigned',
      'Inventory label Debbie Fitz; linked to Debbie Fitzpatrick.', 3002),
    ('RS3', 'small', 'Leslie', 'lscuseny@gmail.com', null, 7500, false, 'assigned',
      'First-name match to Leslie Skrodzki. Confirm if that is the right Leslie.', 3003),
    ('RS4', 'small', 'Perkins', 'jperktmh@hotmail.com', null, 7500, true, 'assigned',
      'Linked to Joy Perkins (active). David Perkins is lapsed and was not linked.', 3004),
    ('RS5', 'small', 'Sharon', 'sharon83stevens@gmail.com', null, 7500, true, 'assigned',
      'First-name match to Sharon Stevens.', 3005),
    ('RS6', 'small', 'Jim & Lisa Sugrue', 'jimsugruemtm@gmail.com', 'lsugrue99@gmail.com', 7500, true, 'assigned', null, 3006),
    ('RS7', 'small', 'Tess', null, null, 7500, true, 'assigned',
      'No Tess on the roster. Left as a free-text owner.', 3007),
    ('RS8', 'small', 'Anna', 'shamrock802@yahoo.com', null, 7500, false, 'assigned',
      'First-name match to Anna Peterson.', 3008),
    ('RS9', 'small', 'Tim Hubbel', 'tahubbell@hotmail.com', null, 7500, false, 'assigned',
      'Inventory spelled Hubbel; linked to Tim Hubbell.', 3009),
    ('RS10', 'small', null, null, null, 7500, false, 'open', null, 3010),
    ('RS11', 'small', 'Jeff & Pam Carney', 'jcarney1218@gmail.com', 'pcarney2000@yahoo.com', 7500, true, 'assigned', null, 3011),
    ('RS12', 'small', null, null, null, 7500, false, 'open', null, 3012),
    ('RS13', 'small', null, null, null, 7500, false, 'open', null, 3013),
    ('RS14', 'small', null, null, null, 0, false, 'open',
      'Open at $0 on the 2026-09-30 inventory.', 3014),
    ('RS15', 'small', null, null, null, 0, false, 'open',
      'Open at $0 on the 2026-09-30 inventory.', 3015)
) as s(code, size, owner_name, member_email, co_email, cost_cents, paid, status, notes, sort_key)
where not exists (
  select 1 from public.locker_units u where u.code = s.code
);
