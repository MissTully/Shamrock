-- NOT APPLIED. Review, then run in the Supabase SQL editor on oazwkwflgbthojvnclfc.
-- Committee chair assignment and member "Request to chair" flow.
-- Safe to re-run.
--
-- Who can use the Officer Desk tool:
--   * President (currently Tim Fitzpatrick)
--   * Membership Chair (currently Lisa Sugrue)
--   * Admins and webmasters (Melissa Tully and Doug Tully), matched by
--     known emails or a Technology / webmaster title
-- Members can request to chair a committee they have joined. They cannot
-- set a chair title on themselves. Approving a request, or assigning a
-- chair in the desk tool, writes the chair title.
--
-- This does not remove existing first-login "I hold a krewe title" claims
-- in Approvals. Approving a committee-chair claim there now also requires
-- the same restricted access.

create table if not exists public.committee_chair_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  committee text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create index if not exists committee_chair_requests_pending_idx
  on public.committee_chair_requests (status, created_at desc);

alter table public.committee_chair_requests enable row level security;

drop policy if exists chair_requests_select_own on public.committee_chair_requests;
create policy chair_requests_select_own
  on public.committee_chair_requests
  for select
  to authenticated
  using (member_id = public.kos_current_member_id());

revoke all on table public.committee_chair_requests from public, anon;
grant select on table public.committee_chair_requests to authenticated;

create or replace function public.kos_official_committee(p text)
returns text
language sql
stable
set search_path to 'public'
as $$
  select c
  from unnest(public.kos_committee_list()) c
  where lower(c) = lower(btrim(coalesce(p, '')))
  limit 1;
$$;

create or replace function public.kos_chair_title_for(p_committee text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select 'Committee Chair of ' || p_committee;
$$;

-- True when a title segment is a chair title for this official committee.
create or replace function public.kos_title_is_chair_of(p_title text, p_committee text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    when nullif(btrim(coalesce(p_committee, '')), '') is null then false
    when lower(btrim(coalesce(p_title, ''))) in (
      lower('committee chair of ' || p_committee),
      lower('chair of ' || p_committee),
      lower('co-chair of ' || p_committee),
      lower('co chair of ' || p_committee),
      lower(p_committee || ' chair'),
      lower(p_committee || ' committee chair')
    ) then true
    else false
  end;
$$;

create or replace function public.kos_member_chairs_committee(p_title text, p_committee text)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1
    from unnest(regexp_split_to_array(coalesce(p_title, ''), '\s*[·|,;]\s*')) t
    where public.kos_title_is_chair_of(t, p_committee)
  );
$$;

create or replace function public.kos_add_chair_title(p_title text, p_committee text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v text := btrim(coalesce(p_title, ''));
  v_add text := public.kos_chair_title_for(p_committee);
begin
  if public.kos_member_chairs_committee(v, p_committee) then
    return nullif(v, '');
  end if;
  if v = '' then
    return v_add;
  end if;
  return v || ' · ' || v_add;
end;
$$;

create or replace function public.kos_remove_chair_title(p_title text, p_committee text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(array_to_string(array(
    select btrim(t)
    from unnest(regexp_split_to_array(coalesce(p_title, ''), '\s*[·|,;]\s*')) t
    where btrim(t) <> '' and not public.kos_title_is_chair_of(t, p_committee)
  ), ' · '), '');
$$;

create or replace function public.kos_can_assign_chairs()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_title text;
  v_seg text;
begin
  select lower(coalesce(m.email, '')), coalesce(m.officer_title, '')
    into v_email, v_title
    from public.members m
   where m.id = public.kos_current_member_id();
  v_email := coalesce(nullif(v_email, ''), lower(coalesce(auth.jwt() ->> 'email', '')));
  if v_email in (
    'melissajotully@gmail.com',
    'melissa@encountive.com',
    'dougtully@protonmail.com',
    'doug@encountive.com',
    'doug@theonefor.ai'
  ) then
    return true;
  end if;
  if v_title ~* 'webmaster' then
    return true;
  end if;
  foreach v_seg in array regexp_split_to_array(coalesce(v_title, ''), '\s*[·|,;]\s*') loop
    v_seg := lower(btrim(v_seg));
    if v_seg = 'president' then
      return true;
    end if;
    if v_seg in (
      'committee chair of membership',
      'chair of membership',
      'co-chair of membership',
      'co chair of membership',
      'membership chair',
      'membership committee chair'
    ) then
      return true;
    end if;
    if v_seg in (
      'committee chair of technology',
      'chair of technology',
      'co-chair of technology',
      'co chair of technology',
      'technology chair',
      'technology committee chair'
    ) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

revoke all on function public.kos_can_assign_chairs() from public, anon;
grant execute on function public.kos_can_assign_chairs() to authenticated;

create or replace function public.request_committee_chair(p_committee text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid := public.kos_current_member_id();
  v_committee text := public.kos_official_committee(p_committee);
  v_title text;
  v_rid uuid;
begin
  if v_id is null then
    raise exception 'Sign in to request a chair role.';
  end if;
  if v_committee is null then
    raise exception 'Pick an official committee.';
  end if;
  select officer_title into v_title from public.members where id = v_id;
  if public.kos_member_chairs_committee(v_title, v_committee) then
    raise exception 'You already chair this committee.';
  end if;
  if not exists (
    select 1 from public.members m
     where m.id = v_id and v_committee = any (coalesce(m.committee_interests, '{}'))
  ) then
    raise exception 'Join the committee first, then you can request to chair it.';
  end if;
  if exists (
    select 1 from public.committee_chair_requests r
     where r.member_id = v_id and r.committee = v_committee and r.status = 'pending'
  ) then
    raise exception 'You already have a pending request for this committee.';
  end if;
  insert into public.committee_chair_requests (member_id, committee, note)
  values (v_id, v_committee, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_rid;
  return jsonb_build_object('ok', true, 'id', v_rid, 'committee', v_committee, 'status', 'pending');
end;
$$;

revoke all on function public.request_committee_chair(text, text) from public, anon;
grant execute on function public.request_committee_chair(text, text) to authenticated;

create or replace function public.list_my_chair_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_id uuid := public.kos_current_member_id();
begin
  if v_id is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'committee', r.committee,
      'status', r.status,
      'created_at', r.created_at
    ) order by r.created_at desc)
    from public.committee_chair_requests r
    where r.member_id = v_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_chair_requests() from public, anon;
grant execute on function public.list_my_chair_requests() to authenticated;

create or replace function public.kos_apply_chair_title(p_member_id uuid, p_committee text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_committee text := public.kos_official_committee(p_committee);
  v_title text;
  v_user uuid;
begin
  if v_committee is null then
    raise exception 'Pick an official committee.';
  end if;
  if p_member_id is null then
    raise exception 'Pick a member.';
  end if;
  update public.members m
     set officer_title = public.kos_add_chair_title(m.officer_title, v_committee),
         committee_interests = case
           when v_committee = any (coalesce(m.committee_interests, '{}')) then m.committee_interests
           else coalesce(m.committee_interests, '{}') || v_committee
         end,
         updated_at = now()
   where m.id = p_member_id
     and m.merged_into is null
  returning officer_title into v_title;
  if not found then
    raise exception 'Member not found.';
  end if;
  select p.id into v_user from public.profiles p where p.member_id = p_member_id;
  if v_user is not null then
    insert into public.member_roles (user_id, role, committee, granted_by)
    values (v_user, 'committee', v_committee, auth.uid())
    on conflict (user_id, role) do update
      set committee = coalesce(excluded.committee, public.member_roles.committee),
          granted_by = excluded.granted_by,
          granted_at = now();
  end if;
  if to_regprocedure('public.kos_sync_roster_role_grants(uuid)') is not null then
    perform public.kos_sync_roster_role_grants(p_member_id);
  end if;
end;
$$;

revoke all on function public.kos_apply_chair_title(uuid, text) from public, anon, authenticated;

create or replace function public.assign_committee_chair(p_member_id uuid, p_committee text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.kos_can_assign_chairs() then
    raise exception 'Only the President, the Membership Chair, and site admins can assign chairs.';
  end if;
  perform public.kos_apply_chair_title(p_member_id, p_committee);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.assign_committee_chair(uuid, text) from public, anon;
grant execute on function public.assign_committee_chair(uuid, text) to authenticated;

create or replace function public.unassign_committee_chair(p_member_id uuid, p_committee text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_committee text := public.kos_official_committee(p_committee);
begin
  if not public.kos_can_assign_chairs() then
    raise exception 'Only the President, the Membership Chair, and site admins can change chairs.';
  end if;
  if v_committee is null or p_member_id is null then
    raise exception 'Pick a member and a committee.';
  end if;
  update public.members m
     set officer_title = public.kos_remove_chair_title(m.officer_title, v_committee),
         updated_at = now()
   where m.id = p_member_id;
  if not found then
    raise exception 'Member not found.';
  end if;
  if to_regprocedure('public.kos_sync_roster_role_grants(uuid)') is not null then
    perform public.kos_sync_roster_role_grants(p_member_id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.unassign_committee_chair(uuid, text) from public, anon;
grant execute on function public.unassign_committee_chair(uuid, text) to authenticated;

create or replace function public.approve_chair_request(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member uuid;
  v_committee text;
begin
  if not public.kos_can_assign_chairs() then
    raise exception 'Only the President, the Membership Chair, and site admins can approve chair requests.';
  end if;
  update public.committee_chair_requests
     set status = 'approved',
         decided_by = public.kos_current_member_id(),
         decided_at = now()
   where id = p_id and status = 'pending'
   returning member_id, committee into v_member, v_committee;
  if v_member is null then
    raise exception 'Request not found or already decided.';
  end if;
  perform public.kos_apply_chair_title(v_member, v_committee);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.approve_chair_request(uuid) from public, anon;
grant execute on function public.approve_chair_request(uuid) to authenticated;

create or replace function public.decline_chair_request(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.kos_can_assign_chairs() then
    raise exception 'Only the President, the Membership Chair, and site admins can decline chair requests.';
  end if;
  update public.committee_chair_requests
     set status = 'declined',
         decided_by = public.kos_current_member_id(),
         decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'Request not found or already decided.';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.decline_chair_request(uuid, text) from public, anon;
grant execute on function public.decline_chair_request(uuid, text) to authenticated;

create or replace function public.list_chair_desk()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_committees jsonb;
  v_requests jsonb;
  v_members jsonb;
begin
  if not public.kos_can_assign_chairs() then
    raise exception 'Only the President, the Membership Chair, and site admins can open the chair desk.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'first_name', m.first_name,
    'last_name', m.last_name,
    'email', m.email,
    'officer_title', m.officer_title,
    'committee_interests', to_jsonb(coalesce(m.committee_interests, '{}'))
  ) order by m.last_name, m.first_name), '[]'::jsonb)
    into v_members
    from public.members m
   where m.merged_into is null
     and coalesce(m.member_role, '') <> 'prospect'
     and coalesce(m.membership_status, '') in ('active', 'pending', 'pending-renewal', 'pending-new');

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', c,
    'chairs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'first_name', m.first_name,
        'last_name', m.last_name,
        'email', m.email,
        'officer_title', m.officer_title
      ) order by m.last_name, m.first_name)
      from public.members m
      where m.merged_into is null
        and public.kos_member_chairs_committee(m.officer_title, c)
    ), '[]'::jsonb)
  )), '[]'::jsonb)
    into v_committees
    from unnest(public.kos_committee_list()) c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'member_id', r.member_id,
    'first_name', m.first_name,
    'last_name', m.last_name,
    'email', m.email,
    'committee', r.committee,
    'note', r.note,
    'created_at', r.created_at
  ) order by r.created_at), '[]'::jsonb)
    into v_requests
    from public.committee_chair_requests r
    join public.members m on m.id = r.member_id
   where r.status = 'pending';

  return jsonb_build_object(
    'committees', v_committees,
    'requests', v_requests,
    'members', v_members
  );
end;
$$;

revoke all on function public.list_chair_desk() from public, anon;
grant execute on function public.list_chair_desk() to authenticated;

-- If a first-login title claim is for a committee chair, only the restricted
-- group can approve it. Other role claims stay with any officer.
create or replace function public.approve_role_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
  v_roles text[];
  v_committee text;
  v_member uuid;
  v_titles text;
  v_role text;
  v_answers jsonb;
  v_is_chair_claim boolean := false;
begin
  select user_id, requested_roles, answers
    into v_user, v_roles, v_answers
    from public.role_requests
   where id = p_id and status = 'pending';
  if v_user is null then
    raise exception 'Request not found or already decided';
  end if;

  v_committee := coalesce(nullif(v_answers->>'committee',''), v_answers->'committees'->>0);
  if 'committee' = any (coalesce(v_roles, '{}'))
     or exists (
       select 1 from jsonb_array_elements_text(coalesce(v_answers->'titles', '[]'::jsonb)) t
        where t ~* 'chair'
     )
  then
    v_is_chair_claim := true;
  end if;

  if v_is_chair_claim and not public.kos_can_assign_chairs() then
    raise exception 'Only the President, the Membership Chair, and site admins can approve a committee chair.';
  end if;
  if not v_is_chair_claim and not public.is_krewe_officer() then
    raise exception 'Officers only';
  end if;

  update public.role_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending';

  insert into public.member_roles (user_id, role, committee, granted_by)
  select v_user, r, case when r = 'committee' then v_committee end, auth.uid()
  from unnest(coalesce(v_roles, '{}')) as r
  on conflict (user_id, role) do update
    set committee = coalesce(excluded.committee, public.member_roles.committee),
        granted_by = excluded.granted_by,
        granted_at = now();

  if 'treasurer' = any (v_roles) or 'secretary' = any (v_roles) or 'officer' = any (v_roles) then
    insert into public.member_roles (user_id, role, granted_by)
    values (v_user, 'officer', auth.uid())
    on conflict (user_id, role) do nothing;
  end if;

  select member_id into v_member from public.profiles where id = v_user;
  if v_member is null then
    return;
  end if;

  select nullif(array_to_string(array(
           select btrim(x) from jsonb_array_elements_text(coalesce(v_answers->'titles', '[]'::jsonb)) as x
           where btrim(x) <> ''
         ), ' · '), '')
    into v_titles;

  if v_titles is null then
    if coalesce(v_committee,'') ~* '(merchandise|merch|shop|store)' then
      v_titles := 'Committee Chair of Merchandise';
    elsif coalesce(v_committee,'') ~* 'social' then
      v_titles := 'Committee Chair of Social';
    elsif coalesce(v_committee,'') ~* '(charity|charities|fundraising|raffle)' then
      v_titles := 'Committee Chair of Charity';
    elsif 'treasurer' = any (v_roles) then
      v_titles := 'Treasurer';
    elsif 'secretary' = any (v_roles) then
      v_titles := 'Secretary';
    elsif 'board' = any (v_roles) then
      v_titles := 'Board Member';
    end if;
  end if;

  v_role := case
    when v_roles && array['officer','captain','treasurer','secretary'] then 'officer'
    when 'board' = any (v_roles) then 'board'
    else null
  end;

  update public.members
     set officer_title = coalesce(v_titles, officer_title),
         member_role   = coalesce(v_role, member_role),
         updated_at    = now()
   where id = v_member
     and coalesce(membership_status, 'active') in ('active', 'pending-renewal', 'prospect', 'pending-new');

  if to_regprocedure('public.kos_sync_roster_role_grants(uuid)') is not null then
    perform public.kos_sync_roster_role_grants(v_member);
  end if;
end;
$$;
