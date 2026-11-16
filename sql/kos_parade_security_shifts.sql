-- NOT APPLIED. Review, then run in the Supabase SQL editor on oazwkwflgbthojvnclfc.
-- Parade security shifts and member sign-up. Safe to re-run. Do not seed shifts.
--
-- Members pick a shift in the Member Hub. Officers with has_tool('parade_security')
-- add shifts and read the roster (name, phone, email). Phones stay off public pages.
--
-- The tool is on the Committee Chair of Parade bundle, and on every title that
-- already manages parades (the parade_guests bundle). Site admins and webmasters
-- already pass has_tool for every tool, including this one, through kos_is_site_admin().
-- Patrick Pustay (ppustay1@gmail.com) stays Treasurer and Finance chair. This file
-- grants him parade_security. It does not change his title.

-- ---------------------------------------------------------------------------
-- A. Tool
-- ---------------------------------------------------------------------------
insert into public.officer_tools (tool_key, label, description, section, sort_order, report_group, sensitive)
values (
  'parade_security',
  'Parade security',
  'Security shifts and the signup roster for each parade.',
  'Events',
  75,
  null,
  false
)
on conflict (tool_key) do update set
  label = excluded.label,
  description = excluded.description,
  section = excluded.section,
  sort_order = excluded.sort_order,
  report_group = excluded.report_group,
  sensitive = excluded.sensitive;

insert into public.officer_title_tools (title_key, tool_key)
select tt.title_key, 'parade_security'
from public.officer_title_tools tt
where tt.tool_key = 'parade_guests'
on conflict (title_key, tool_key) do nothing;

insert into public.officer_title_tools (title_key, tool_key)
values ('chair_parade', 'parade_security')
on conflict (title_key, tool_key) do nothing;

-- ---------------------------------------------------------------------------
-- B. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.parade_security_shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null,
  sort_order integer not null default 0,
  notes text not null default '',
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parade_security_signups (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.parade_security_shifts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  phone text not null,
  status text not null default 'signed_up',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parade_security_shifts
  add column if not exists event_id uuid,
  add column if not exists label text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists capacity integer,
  add column if not exists sort_order integer not null default 0,
  add column if not exists notes text not null default '',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.parade_security_signups
  add column if not exists shift_id uuid,
  add column if not exists member_id uuid,
  add column if not exists phone text,
  add column if not exists status text not null default 'signed_up',
  add column if not exists notes text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'parade_security_shifts_capacity_check'
  ) then
    alter table public.parade_security_shifts
      add constraint parade_security_shifts_capacity_check check (capacity > 0 and capacity <= 500);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'parade_security_shifts_time_check'
  ) then
    alter table public.parade_security_shifts
      add constraint parade_security_shifts_time_check check (ends_at > starts_at);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'parade_security_shifts_label_check'
  ) then
    alter table public.parade_security_shifts
      add constraint parade_security_shifts_label_check check (length(btrim(label)) > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'parade_security_signups_status_check'
  ) then
    alter table public.parade_security_signups
      add constraint parade_security_signups_status_check
      check (status in ('signed_up', 'cancelled'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'parade_security_signups_shift_member'
  ) then
    alter table public.parade_security_signups
      add constraint parade_security_signups_shift_member unique (shift_id, member_id);
  end if;
end $$;

create index if not exists parade_security_shifts_event_idx
  on public.parade_security_shifts (event_id, sort_order, starts_at);

create index if not exists parade_security_signups_shift_idx
  on public.parade_security_signups (shift_id, status);

create index if not exists parade_security_signups_member_idx
  on public.parade_security_signups (member_id);

comment on table public.parade_security_shifts is
  'Named security shifts on a krewe parade. Officers post these. Members sign up in the Hub.';

comment on table public.parade_security_signups is
  'One row per member per shift. status is signed_up or cancelled. Phone is the number the member confirmed.';

-- ---------------------------------------------------------------------------
-- C. Capacity guard
-- ---------------------------------------------------------------------------
create or replace function public.kos_guard_parade_security_cap()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_cap integer;
  v_used integer;
begin
  if new.status is distinct from 'signed_up' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status = 'signed_up'
     and old.shift_id is not distinct from new.shift_id then
    return new;
  end if;

  select s.capacity into v_cap
  from public.parade_security_shifts s
  where s.id = new.shift_id
  for update;

  if v_cap is null then
    raise exception 'That security shift is no longer available.';
  end if;

  select count(*)::int into v_used
  from public.parade_security_signups u
  where u.shift_id = new.shift_id
    and u.status = 'signed_up'
    and u.id is distinct from new.id;

  if v_used >= v_cap then
    raise exception 'That shift is full. Pick another time or check back if a spot opens.';
  end if;
  return new;
end;
$$;

drop trigger if exists kos_guard_parade_security_cap on public.parade_security_signups;
create trigger kos_guard_parade_security_cap
  before insert or update of status, shift_id
  on public.parade_security_signups
  for each row
  execute function public.kos_guard_parade_security_cap();

create or replace function public.kos_parade_security_touch()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists kos_parade_security_touch_shifts on public.parade_security_shifts;
create trigger kos_parade_security_touch_shifts
  before update on public.parade_security_shifts
  for each row
  execute function public.kos_parade_security_touch();

drop trigger if exists kos_parade_security_touch_signups on public.parade_security_signups;
create trigger kos_parade_security_touch_signups
  before update on public.parade_security_signups
  for each row
  execute function public.kos_parade_security_touch();

-- ---------------------------------------------------------------------------
-- D. RLS. Writes go through the functions below.
-- ---------------------------------------------------------------------------
alter table public.parade_security_shifts enable row level security;
alter table public.parade_security_signups enable row level security;

drop policy if exists parade_security_shifts_read on public.parade_security_shifts;
create policy parade_security_shifts_read
  on public.parade_security_shifts
  for select
  to authenticated
  using (true);

drop policy if exists parade_security_signups_read_own on public.parade_security_signups;
create policy parade_security_signups_read_own
  on public.parade_security_signups
  for select
  to authenticated
  using (
    member_id = public.kos_current_member_id()
    or public.has_tool('parade_security')
  );

revoke all on table public.parade_security_shifts from public, anon;
revoke all on table public.parade_security_signups from public, anon;
grant select on table public.parade_security_shifts to authenticated;
grant select on table public.parade_security_signups to authenticated;

-- ---------------------------------------------------------------------------
-- E. Member Hub
-- ---------------------------------------------------------------------------
create or replace function public.member_parade_security_shifts()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_mid uuid;
  v_phone text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to sign up for parade security.', 'parades', '[]'::jsonb);
  end if;
  v_mid := public.kos_current_member_id();
  if v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Your login is not linked to a krewe member record yet.', 'parades', '[]'::jsonb);
  end if;

  select nullif(btrim(coalesce(m.phone, '')), '') into v_phone
  from public.members m
  where m.id = v_mid;

  return jsonb_build_object(
    'ok', true,
    'phone', v_phone,
    'parades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', e.id,
        'name', e.name,
        'start_time', e.start_time,
        'shifts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id,
            'label', s.label,
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'capacity', s.capacity,
            'sort_order', s.sort_order,
            'notes', s.notes,
            'spots_left', greatest(
              s.capacity - (
                select count(*)::int
                from public.parade_security_signups u
                where u.shift_id = s.id
                  and u.status = 'signed_up'
              ),
              0
            ),
            'my_status', (
              select u.status
              from public.parade_security_signups u
              where u.shift_id = s.id
                and u.member_id = v_mid
            ),
            'my_phone', (
              select u.phone
              from public.parade_security_signups u
              where u.shift_id = s.id
                and u.member_id = v_mid
            )
          ) order by s.sort_order, s.starts_at)
          from public.parade_security_shifts s
          where s.event_id = e.id
            and s.ends_at > now()
        ), '[]'::jsonb)
      ) order by e.start_time nulls last)
      from public.events e
      where e.event_type = 'parade'
        and coalesce(e.source, 'krewe') = 'krewe'
        and lower(coalesce(e.status, 'published')) in ('published', 'live')
        and exists (
          select 1
          from public.parade_security_shifts s
          where s.event_id = e.id
            and s.ends_at > now()
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.member_signup_parade_security(p_shift_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mid uuid;
  v_status text;
  v_phone text;
  v_shift public.parade_security_shifts%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to sign up for parade security.');
  end if;
  v_mid := public.kos_current_member_id();
  if v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Your login is not linked to a krewe member record yet.');
  end if;

  select m.membership_status into v_status
  from public.members m
  where m.id = v_mid
    and m.merged_into is null;
  if not found or not public.kos_member_is_active_status(v_status) then
    return jsonb_build_object('ok', false, 'message', 'Security sign-up is for active members. Renew first, then pick a shift.');
  end if;

  v_phone := nullif(left(btrim(coalesce(p_phone, '')), 40), '');
  if v_phone is null or length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then
    return jsonb_build_object('ok', false, 'message', 'Add a phone number so the parade chairs can reach you.');
  end if;

  select * into v_shift
  from public.parade_security_shifts s
  where s.id = p_shift_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That shift is no longer posted.');
  end if;
  if v_shift.ends_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'That shift has already ended.');
  end if;
  if not exists (
    select 1 from public.events e
    where e.id = v_shift.event_id
      and e.event_type = 'parade'
      and coalesce(e.source, 'krewe') = 'krewe'
      and lower(coalesce(e.status, 'published')) in ('published', 'live')
  ) then
    return jsonb_build_object('ok', false, 'message', 'That parade is not open for security sign-up.');
  end if;

  insert into public.parade_security_signups (shift_id, member_id, phone, status)
  values (v_shift.id, v_mid, v_phone, 'signed_up')
  on conflict (shift_id, member_id) do update
    set phone = excluded.phone,
        status = 'signed_up',
        updated_at = now();

  return jsonb_build_object('ok', true, 'message', 'You are signed up. The parade chairs have your phone number.');
exception
  when others then
    if sqlerrm ilike '%shift is full%' or sqlerrm ilike '%no longer available%' then
      return jsonb_build_object('ok', false, 'message', sqlerrm);
    end if;
    raise;
end;
$$;

create or replace function public.member_cancel_parade_security(p_shift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mid uuid;
  v_n integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to change your security signup.');
  end if;
  v_mid := public.kos_current_member_id();
  if v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Your login is not linked to a krewe member record yet.');
  end if;

  update public.parade_security_signups
  set status = 'cancelled',
      updated_at = now()
  where shift_id = p_shift_id
    and member_id = v_mid
    and status = 'signed_up';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'message', 'You are not signed up for that shift.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Signup cancelled. The spot is open for another member.');
end;
$$;

-- ---------------------------------------------------------------------------
-- F. Officer Desk
-- ---------------------------------------------------------------------------
create or replace function public.officer_parade_security_roster()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to open parade security.');
  end if;
  if not public.has_tool('parade_security') then
    return jsonb_build_object('ok', false, 'message', 'Parade security is limited to parade chairs and the officers who manage parades.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'parade_choices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', e.id,
        'name', e.name,
        'start_time', e.start_time
      ) order by e.start_time nulls last)
      from public.events e
      where e.event_type = 'parade'
        and coalesce(e.source, 'krewe') = 'krewe'
        and lower(coalesce(e.status, 'published')) in ('published', 'live')
        and e.start_time >= now() - interval '14 days'
        and e.start_time < now() + interval '400 days'
    ), '[]'::jsonb),
    'parades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', e.id,
        'name', e.name,
        'start_time', e.start_time,
        'shifts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id,
            'label', s.label,
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'capacity', s.capacity,
            'sort_order', s.sort_order,
            'notes', coalesce(s.notes, ''),
            'spots_left', greatest(
              s.capacity - (
                select count(*)::int
                from public.parade_security_signups u
                where u.shift_id = s.id
                  and u.status = 'signed_up'
              ),
              0
            ),
            'signups', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', u.id,
                'member_id', u.member_id,
                'name', coalesce(
                  nullif(btrim(concat_ws(' ', m.first_name, m.last_name)), ''),
                  m.email,
                  'Member'
                ),
                'phone', coalesce(nullif(btrim(u.phone), ''), nullif(btrim(m.phone), ''), ''),
                'email', coalesce(m.email, ''),
                'status', u.status,
                'notes', coalesce(u.notes, '')
              ) order by case when u.status = 'signed_up' then 0 else 1 end, m.last_name, m.first_name)
              from public.parade_security_signups u
              join public.members m on m.id = u.member_id
              where u.shift_id = s.id
            ), '[]'::jsonb)
          ) order by s.sort_order, s.starts_at)
          from public.parade_security_shifts s
          where s.event_id = e.id
        ), '[]'::jsonb)
      ) order by e.start_time nulls last)
      from public.events e
      where e.event_type = 'parade'
        and coalesce(e.source, 'krewe') = 'krewe'
        and exists (
          select 1 from public.parade_security_shifts s where s.event_id = e.id
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.officer_save_parade_security_shift(
  p_id uuid,
  p_event_id uuid,
  p_label text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_label text;
  v_notes text;
  v_used integer;
  v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to edit security shifts.');
  end if;
  if not public.has_tool('parade_security') then
    return jsonb_build_object('ok', false, 'message', 'Parade security is limited to parade chairs and the officers who manage parades.');
  end if;

  v_label := nullif(left(btrim(coalesce(p_label, '')), 120), '');
  v_notes := left(btrim(coalesce(p_notes, '')), 1000);
  if v_label is null then
    return jsonb_build_object('ok', false, 'message', 'Give the shift a name, such as Route walk or Staging detail.');
  end if;
  if p_event_id is null or not exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.event_type = 'parade'
      and coalesce(e.source, 'krewe') = 'krewe'
  ) then
    return jsonb_build_object('ok', false, 'message', 'Pick a parade.');
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    return jsonb_build_object('ok', false, 'message', 'The shift needs a start and an end, and the end has to be later.');
  end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 500 then
    return jsonb_build_object('ok', false, 'message', 'Capacity needs to be at least 1.');
  end if;

  if p_id is not null then
    select count(*)::int into v_used
    from public.parade_security_signups u
    where u.shift_id = p_id
      and u.status = 'signed_up';
    if p_capacity < coalesce(v_used, 0) then
      return jsonb_build_object(
        'ok', false,
        'message', 'Capacity cannot be lower than the ' || v_used || ' members already signed up.'
      );
    end if;

    update public.parade_security_shifts
    set event_id = p_event_id,
        label = v_label,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        capacity = p_capacity,
        notes = v_notes
    where id = p_id
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'message', 'That shift is no longer posted.');
    end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'message', 'Shift updated.');
  end if;

  insert into public.parade_security_shifts (
    event_id, label, starts_at, ends_at, capacity, notes, created_by
  ) values (
    p_event_id, v_label, p_starts_at, p_ends_at, p_capacity, v_notes, public.kos_current_member_id()
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'message', 'Shift posted. Members can sign up in the Hub.');
end;
$$;

create or replace function public.officer_delete_parade_security_shift(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
  v_signed integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to edit security shifts.');
  end if;
  if not public.has_tool('parade_security') then
    return jsonb_build_object('ok', false, 'message', 'Parade security is limited to parade chairs and the officers who manage parades.');
  end if;

  select count(*)::int into v_signed
  from public.parade_security_signups
  where shift_id = p_id
    and status = 'signed_up';

  delete from public.parade_security_shifts where id = p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'message', 'That shift is no longer posted.');
  end if;
  if coalesce(v_signed, 0) > 0 then
    return jsonb_build_object(
      'ok', true,
      'message', 'Shift deleted. ' || v_signed || ' signed-up member' ||
        case when v_signed = 1 then ' was' else 's were' end || ' removed from it.'
    );
  end if;
  return jsonb_build_object('ok', true, 'message', 'Shift deleted.');
end;
$$;

revoke all on function public.kos_guard_parade_security_cap() from public, anon, authenticated;
revoke all on function public.kos_parade_security_touch() from public, anon, authenticated;

revoke all on function public.member_parade_security_shifts() from public, anon;
revoke all on function public.member_signup_parade_security(uuid, text) from public, anon;
revoke all on function public.member_cancel_parade_security(uuid) from public, anon;
revoke all on function public.officer_parade_security_roster() from public, anon;
revoke all on function public.officer_save_parade_security_shift(uuid, uuid, text, timestamptz, timestamptz, integer, text) from public, anon;
revoke all on function public.officer_delete_parade_security_shift(uuid) from public, anon;

grant execute on function public.member_parade_security_shifts() to authenticated;
grant execute on function public.member_signup_parade_security(uuid, text) to authenticated;
grant execute on function public.member_cancel_parade_security(uuid) to authenticated;
grant execute on function public.officer_parade_security_roster() to authenticated;
grant execute on function public.officer_save_parade_security_shift(uuid, uuid, text, timestamptz, timestamptz, integer, text) to authenticated;
grant execute on function public.officer_delete_parade_security_shift(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- G. Patrick Pustay, parade co-chair. Title is unchanged.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select m.id into v_id
  from public.members m
  where lower(btrim(m.email)) = 'ppustay1@gmail.com'
    and m.merged_into is null
  order by
    case when public.kos_member_is_active_status(m.membership_status) then 0 else 1 end,
    m.id
  limit 1;

  if v_id is null then
    raise notice 'parade_security grant skipped: no member with email ppustay1@gmail.com';
    return;
  end if;

  update public.member_tool_grants
  set ends_at = null,
      note = 'Parade co-chair. Title stays Treasurer and Committee Chair of Finance.',
      revoked_at = null
  where member_id = v_id
    and tool_key = 'parade_security'
    and revoked_at is null;

  if not found then
    insert into public.member_tool_grants (member_id, tool_key, note, starts_at, ends_at)
    values (
      v_id,
      'parade_security',
      'Parade co-chair. Title stays Treasurer and Committee Chair of Finance.',
      now(),
      null
    );
  end if;
end $$;
