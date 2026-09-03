-- ============================================================================
-- Krewe of Shamrock — Role approvals, first-login questionnaire, and
-- duplicate-record (merge) queue.
--
-- Design (approved by the board direction: approvals happen ON THE WEBSITE):
--   * Members prove their identity by email only for password create/reset
--     (handled by Supabase Auth automatically).
--   * The first-login profile screen asks "are you a member" plus an optional
--     role claim. A roster email match grants ordinary member access with no
--     human involved. Only elevated role claims create a pending request.
--   * Officers see an Approvals queue inside the Member Hub (Officer desk tab)
--     and decide with one click. Every decision records who decided and when.
--   * Possible duplicate roster records are flagged automatically but merged
--     only when an officer confirms. Merges re-point history and never delete.
--
-- All writes go through SECURITY DEFINER functions; the tables themselves
-- have read-only Row Level Security policies and no write policies at all.
-- ============================================================================

-- 1) Columns used by the first-login form and by merges -----------------------
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text,
  add column if not exists phone      text,
  add column if not exists bio        text;

alter table public.members
  add column if not exists merged_into uuid references public.members(id);

-- 2) Explicit role grants (the source of truth for elevated access) -----------
create table if not exists public.member_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('board','officer','treasurer','secretary','captain','committee')),
  committee  text,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.member_roles enable row level security;

-- 3) Role requests: the first-login questionnaire lands here ------------------
create table if not exists public.role_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  claimed_member  boolean not null default false,
  requested_roles text[] not null default '{}',
  answers         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_by      uuid references auth.users(id),
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz not null default now()
);
alter table public.role_requests enable row level security;

-- 4) Possible duplicate roster records (the merge queue) ----------------------
create table if not exists public.possible_duplicates (
  id         uuid primary key default gen_random_uuid(),
  member_a   uuid not null references public.members(id) on delete cascade,
  member_b   uuid not null references public.members(id) on delete cascade,
  reason     text not null,
  status     text not null default 'open' check (status in ('open','merged','dismissed')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (member_a, member_b),
  check (member_a <> member_b)
);
alter table public.possible_duplicates enable row level security;

-- 5) Officer check now honors explicit grants as well as the roster -----------
create or replace function public.is_krewe_officer()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.member_roles r
    where r.user_id = auth.uid() and r.role in ('board','officer','captain')
  ) or exists (
    select 1
    from public.members m
    join public.profiles p on p.member_id = m.id
    where p.id = auth.uid()
      and m.member_role in ('officer','captain','board')
      and m.membership_status = 'active'
  );
$$;

create or replace function public.has_role(p_role text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.member_roles where user_id = auth.uid() and role = p_role
  );
$$;

-- Read-only Row Level Security. There are deliberately NO insert/update/delete
-- policies: the only write paths are the SECURITY DEFINER functions below.
drop policy if exists member_roles_read on public.member_roles;
create policy member_roles_read on public.member_roles
  for select using (user_id = auth.uid() or public.is_krewe_officer());

drop policy if exists role_requests_read on public.role_requests;
create policy role_requests_read on public.role_requests
  for select using (user_id = auth.uid() or public.is_krewe_officer());

drop policy if exists possible_duplicates_read on public.possible_duplicates;
create policy possible_duplicates_read on public.possible_duplicates
  for select using (public.is_krewe_officer());

-- 6) Duplicate detection: compare one roster record against the rest ----------
create or replace function public.kos_flag_duplicates(p_member uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer := 0;
begin
  if p_member is null then return 0; end if;
  insert into public.possible_duplicates (member_a, member_b, reason)
  select least(m1.id, m2.id), greatest(m1.id, m2.id),
         case
           when lower(m1.first_name) = lower(m2.first_name)
            and lower(m1.last_name)  = lower(m2.last_name)
           then 'Same first and last name'
           else 'Same phone number'
         end
  from public.members m1
  join public.members m2
    on m2.id <> m1.id and m2.merged_into is null
  where m1.id = p_member and m1.merged_into is null
    and (
      (lower(m1.first_name) = lower(m2.first_name)
       and lower(m1.last_name) = lower(m2.last_name))
      or (nullif(regexp_replace(coalesce(m1.phone,''), '\D', '', 'g'), '') is not null
          and regexp_replace(coalesce(m1.phone,''), '\D', '', 'g')
            = regexp_replace(coalesce(m2.phone,''), '\D', '', 'g'))
    )
  on conflict (member_a, member_b) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- 7) Profile read/write used by members.html ----------------------------------
create or replace function public.get_my_krewe_profile()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'user_id',            p.id,
    'member_id',          p.member_id,
    'first_name',         coalesce(p.first_name, m.first_name),
    'last_name',          coalesce(p.last_name,  m.last_name),
    'display_name',       coalesce(p.full_name,
                            nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')),
    'phone',              coalesce(p.phone, m.phone),
    'bio',                p.bio,
    'membership_status',  m.membership_status,
    'member_role',        m.member_role,
    'officer_title',      m.officer_title,
    'roles',              coalesce((select jsonb_agg(r.role)
                                    from public.member_roles r where r.user_id = p.id), '[]'::jsonb),
    'pending_role_request', exists (select 1 from public.role_requests q
                                    where q.user_id = p.id and q.status = 'pending'),
    'profile_complete',   (coalesce(p.first_name, m.first_name) is not null
                           and coalesce(p.last_name, m.last_name) is not null)
  )
  from public.profiles p
  left join public.members m on m.id = p.member_id and m.merged_into is null
  where p.id = auth.uid();
$$;

create or replace function public.complete_krewe_profile(
  p_first text, p_last text, p_phone text default null, p_bio text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid    uuid := auth.uid();
  v_member uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if coalesce(trim(p_first),'') = '' or coalesce(trim(p_last),'') = '' then
    raise exception 'First and last name are required';
  end if;
  -- link to the roster by exact email match (same rule as signup)
  select id into v_member from public.members
  where lower(email) = lower(coalesce(auth.email(), '')) and merged_into is null
  order by created_at limit 1;

  insert into public.profiles (id, member_id, full_name, first_name, last_name, phone, bio)
  values (v_uid, v_member,
          trim(p_first) || ' ' || trim(p_last),
          trim(p_first), trim(p_last),
          nullif(trim(coalesce(p_phone,'')), ''),
          nullif(trim(coalesce(p_bio,'')), ''))
  on conflict (id) do update set
    member_id  = coalesce(public.profiles.member_id, excluded.member_id),
    full_name  = excluded.full_name,
    first_name = excluded.first_name,
    last_name  = excluded.last_name,
    phone      = coalesce(excluded.phone, public.profiles.phone),
    bio        = coalesce(excluded.bio,   public.profiles.bio),
    updated_at = now();

  -- automatic record check: flag lookalike roster records for officer review
  select member_id into v_member from public.profiles where id = v_uid;
  if v_member is not null then
    perform public.kos_flag_duplicates(v_member);
  end if;
  return public.get_my_krewe_profile();
end $$;

-- 8) First-login questionnaire submission -------------------------------------
create or replace function public.submit_role_request(
  p_claimed_member boolean, p_roles text[], p_answers jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := coalesce(auth.email(), '');
  v_name   text;
  v_roles  text[];
  v_id     uuid;
  v_linked boolean;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  -- keep only recognized role names, drop anything else the client sent
  select coalesce(array_agg(distinct r), '{}') into v_roles
  from unnest(coalesce(p_roles, '{}')) as r
  where r in ('board','officer','treasurer','secretary','captain','committee');

  select exists (select 1 from public.profiles
                 where id = v_uid and member_id is not null) into v_linked;

  -- ordinary membership with a roster email match needs no human approval
  if coalesce(array_length(v_roles, 1), 0) = 0 then
    return jsonb_build_object('needs_approval', false, 'linked', v_linked);
  end if;

  -- one pending request at a time per person
  if exists (select 1 from public.role_requests
             where user_id = v_uid and status = 'pending') then
    return jsonb_build_object('needs_approval', true, 'already_pending', true);
  end if;

  select coalesce(full_name, v_email) into v_name
  from public.profiles where id = v_uid;

  insert into public.role_requests
    (user_id, email, full_name, claimed_member, requested_roles, answers)
  values
    (v_uid, v_email, coalesce(v_name, v_email), coalesce(p_claimed_member, false),
     v_roles, coalesce(p_answers, '{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('needs_approval', true, 'request_id', v_id, 'linked', v_linked);
end $$;

-- 9) Officer decisions (called by the in-hub Approvals queue) -----------------
create or replace function public.approve_role_request(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_user      uuid;
  v_roles     text[];
  v_committee text;
begin
  if not public.is_krewe_officer() then raise exception 'Officers only'; end if;
  update public.role_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending'
   returning user_id, requested_roles, answers->>'committee'
        into v_user, v_roles, v_committee;
  if v_user is null then raise exception 'Request not found or already decided'; end if;
  insert into public.member_roles (user_id, role, committee, granted_by)
  select v_user, r, case when r = 'committee' then v_committee end, auth.uid()
  from unnest(v_roles) as r
  on conflict (user_id, role) do nothing;
end $$;

create or replace function public.deny_role_request(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_krewe_officer() then raise exception 'Officers only'; end if;
  update public.role_requests
     set status = 'denied', decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where id = p_id and status = 'pending';
  if not found then raise exception 'Request not found or already decided'; end if;
end $$;

-- 10) Merge queue decisions ----------------------------------------------------
create or replace function public.merge_members(p_keep uuid, p_duplicate uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_krewe_officer() then raise exception 'Officers only'; end if;
  if p_keep is null or p_duplicate is null or p_keep = p_duplicate then
    raise exception 'Pick two different records';
  end if;
  if exists (select 1 from public.members
             where id in (p_keep, p_duplicate) and merged_into is not null) then
    raise exception 'One of these records was already merged';
  end if;

  -- re-point history, skipping rows that would collide with an existing row
  update public.dues_payments d set member_id = p_keep
   where d.member_id = p_duplicate
     and not exists (select 1 from public.dues_payments k
                     where k.member_id = p_keep
                       and k.membership_year = d.membership_year);
  update public.event_signups s set member_id = p_keep
   where s.member_id = p_duplicate
     and not exists (select 1 from public.event_signups k
                     where k.member_id = p_keep and k.event_id = s.event_id);
  update public.profiles set member_id = p_keep where member_id = p_duplicate;

  -- fill blanks on the surviving record from the duplicate, then retire it
  update public.members k set
    phone        = coalesce(k.phone, d.phone),
    bio          = coalesce(k.bio, d.bio),
    hometown     = coalesce(k.hometown, d.hometown),
    parade_since = coalesce(k.parade_since, d.parade_since),
    interests    = coalesce(k.interests, d.interests),
    photo_url    = coalesce(k.photo_url, d.photo_url),
    updated_at   = now()
  from public.members d
  where k.id = p_keep and d.id = p_duplicate;

  update public.members
     set merged_into = p_keep, membership_status = 'merged', updated_at = now()
   where id = p_duplicate;

  update public.possible_duplicates
     set status = 'merged', decided_by = auth.uid(), decided_at = now()
   where status = 'open'
     and member_a in (p_keep, p_duplicate)
     and member_b in (p_keep, p_duplicate);
end $$;

create or replace function public.dismiss_duplicate(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_krewe_officer() then raise exception 'Officers only'; end if;
  update public.possible_duplicates
     set status = 'dismissed', decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'open';
  if not found then raise exception 'Duplicate pair not found or already decided'; end if;
end $$;

-- 11) One call feeds the Officer desk Approvals panel and its badge -----------
create or replace function public.officer_pending_counts()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when public.is_krewe_officer() then jsonb_build_object(
    'role_requests', (select count(*) from public.role_requests where status = 'pending'),
    'duplicates',    (select count(*) from public.possible_duplicates where status = 'open'))
  else jsonb_build_object('role_requests', 0, 'duplicates', 0) end;
$$;

create or replace function public.list_officer_approvals()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when public.is_krewe_officer() then jsonb_build_object(
    'role_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'email', q.email, 'full_name', q.full_name,
        'claimed_member', q.claimed_member,
        'requested_roles', to_jsonb(q.requested_roles),
        'answers', q.answers, 'created_at', q.created_at,
        'linked', exists (select 1 from public.profiles p
                          where p.id = q.user_id and p.member_id is not null)
      ) order by q.created_at)
      from public.role_requests q where q.status = 'pending'), '[]'::jsonb),
    'duplicates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pd.id, 'reason', pd.reason, 'created_at', pd.created_at,
        'a', jsonb_build_object('id', ma.id, 'name', ma.first_name || ' ' || ma.last_name,
                                'email', ma.email, 'phone', ma.phone, 'joined', ma.join_date),
        'b', jsonb_build_object('id', mb.id, 'name', mb.first_name || ' ' || mb.last_name,
                                'email', mb.email, 'phone', mb.phone, 'joined', mb.join_date)
      ) order by pd.created_at)
      from public.possible_duplicates pd
      join public.members ma on ma.id = pd.member_a
      join public.members mb on mb.id = pd.member_b
      where pd.status = 'open'), '[]'::jsonb))
  else null end;
$$;

-- 12) Bootstrap: the admin mailbox account is always board + officer ----------
create or replace function public.kos_bootstrap_admin()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if lower(new.email) = 'kreweofshamrocktampa@gmail.com' then
    insert into public.member_roles (user_id, role)
    values (new.id, 'board'), (new.id, 'officer')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists kos_bootstrap_admin_trigger on auth.users;
create trigger kos_bootstrap_admin_trigger
  after insert on auth.users
  for each row execute function public.kos_bootstrap_admin();

-- backfill in case the admin account already exists
insert into public.member_roles (user_id, role)
select u.id, roles.r
from auth.users u
cross join (values ('board'), ('officer')) as roles(r)
where lower(u.email) = 'kreweofshamrocktampa@gmail.com'
on conflict (user_id, role) do nothing;

-- 13) Defense in depth: no anonymous execute; internal helpers are not part
--     of the signed-in API surface (they run inside SECURITY DEFINER
--     functions or triggers with owner privileges).
revoke execute on function public.get_my_krewe_profile() from anon;
revoke execute on function public.complete_krewe_profile(text, text, text, text) from anon;
revoke execute on function public.submit_role_request(boolean, text[], jsonb) from anon;
revoke execute on function public.approve_role_request(uuid) from anon;
revoke execute on function public.deny_role_request(uuid, text) from anon;
revoke execute on function public.merge_members(uuid, uuid) from anon;
revoke execute on function public.dismiss_duplicate(uuid) from anon;
revoke execute on function public.officer_pending_counts() from anon;
revoke execute on function public.list_officer_approvals() from anon;
revoke execute on function public.has_role(text) from anon;
revoke execute on function public.is_krewe_officer() from anon;
revoke execute on function public.kos_current_member_id() from anon;
revoke execute on function public.kos_flag_duplicates(uuid) from anon, authenticated;
revoke execute on function public.kos_bootstrap_admin() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
