-- Membership Applications for the Member Hub.
--
-- How to apply (do this in the Supabase SQL editor; the website does not run it):
--   1. Open project oazwkwflgbthojvnclfc.
--   2. SQL Editor -> New query -> paste this file -> Run.
-- Safe to run more than once.
--
-- What it does:
--   * Lets Membership Chair, President, Secretary, Chair of Technology, and
--     site admins (a member_roles role of officer that is not a roster officer
--     title, such as the bootstrap admin) review join-form applications.
--   * Approve sets membership_status to active and member_role to member
--     (leadership roles are left alone) and fills join_date only when it is null.
--   * Decline sets membership_status to declined. Archive sets archived.
--     Rows are never deleted.
--   * Records actor uid, display name, time, and optional note.
--   * Copies the existing new-application notice to the current Membership Chair.
--     If nobody holds that role, the notice goes to lsugrue99@gmail.com.
--     The secretary and digital notices are unchanged.
--
-- declined and archived are already ignored by v_secretary_engagement.
-- This file also keeps them out of v_report_membership and v_parade_ready.
-- The directory (active only) and list_todays_birthdays (active,
-- pending-renewal, pending-new) do not need changes.

-- ---------------------------------------------------------------------------
-- 1) Status values
-- ---------------------------------------------------------------------------
alter table public.members drop constraint if exists members_membership_status_check;
alter table public.members add constraint members_membership_status_check
  check (membership_status in (
    'active', 'inactive', 'lapsed', 'prospect',
    'pending-new', 'pending-renewal', 'merged',
    'declined', 'archived'
  ));

-- ---------------------------------------------------------------------------
-- 2) Who may review. Narrower than is_krewe_officer().
-- ---------------------------------------------------------------------------
create or replace function public.can_review_applications()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Membership Chair (role grant or roster title).
    exists (
      select 1 from public.member_roles r
      where r.user_id = auth.uid()
        and r.role = 'committee'
        and coalesce(r.committee, '') ilike 'Membership'
    )
    or exists (
      select 1
      from public.profiles p
      join public.members m on m.id = p.member_id
      where p.id = auth.uid()
        and m.merged_into is null
        and coalesce(m.officer_title, '') ilike '%Chair of Membership%'
    )
    -- President. Exact title segment, so Vice President does not match.
    or exists (
      select 1
      from public.profiles p
      join public.members m on m.id = p.member_id
      where p.id = auth.uid()
        and m.merged_into is null
        and exists (
          select 1
          from unnest(regexp_split_to_array(coalesce(m.officer_title, ''), '\s*·\s*')) as seg(part)
          where btrim(seg.part) ilike 'President'
        )
    )
    -- Secretary.
    or exists (
      select 1 from public.member_roles r
      where r.user_id = auth.uid() and r.role = 'secretary'
    )
    or exists (
      select 1
      from public.profiles p
      join public.members m on m.id = p.member_id
      where p.id = auth.uid()
        and m.merged_into is null
        and exists (
          select 1
          from unnest(regexp_split_to_array(coalesce(m.officer_title, ''), '\s*·\s*')) as seg(part)
          where btrim(seg.part) ilike 'Secretary'
        )
    )
    -- Chair of Technology.
    or exists (
      select 1 from public.member_roles r
      where r.user_id = auth.uid()
        and r.role = 'committee'
        and coalesce(r.committee, '') ilike 'Technology'
    )
    or exists (
      select 1
      from public.profiles p
      join public.members m on m.id = p.member_id
      where p.id = auth.uid()
        and m.merged_into is null
        and coalesce(m.officer_title, '') ilike '%Chair of Technology%'
    )
    -- Site admin: member_roles role officer without a roster officer/chair title.
    -- Melissa's bootstrap grant matches. Treasurer and Vice President do not:
    -- kos_sync_roster_role_grants also writes role officer for them, and their
    -- roster row is member_role officer with a title, so they are excluded here.
    or (
      exists (
        select 1 from public.member_roles r
        where r.user_id = auth.uid() and r.role = 'officer'
      )
      and not exists (
        select 1
        from public.profiles p
        join public.members m on m.id = p.member_id
        where p.id = auth.uid()
          and m.merged_into is null
          and (
            m.member_role in ('officer', 'captain')
            or coalesce(m.officer_title, '') ~* '(president|treasurer|secretary|chair|captain)'
          )
      )
    );
$$;

comment on function public.can_review_applications() is
  'Membership Chair, President, Secretary, Chair of Technology, and bootstrap site admins.';

-- ---------------------------------------------------------------------------
-- 3) Audit. Reviewers may read. Clients may not write.
-- ---------------------------------------------------------------------------
create table if not exists public.membership_application_actions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  action text not null check (action in ('approve', 'decline', 'archive')),
  note text,
  from_status text,
  to_status text,
  actor_uid uuid,
  actor_email text,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists membership_application_actions_member_idx
  on public.membership_application_actions (member_id, created_at desc);

create index if not exists membership_application_actions_created_idx
  on public.membership_application_actions (created_at desc);

alter table public.membership_application_actions enable row level security;

drop policy if exists membership_application_actions_reviewer_read
  on public.membership_application_actions;
create policy membership_application_actions_reviewer_read
  on public.membership_application_actions
  for select
  to authenticated
  using (public.can_review_applications());

revoke all on table public.membership_application_actions from public, anon;
grant select on table public.membership_application_actions to authenticated;

-- ---------------------------------------------------------------------------
-- 4) HTML escape for applicant text inside emails. Not a client API.
-- ---------------------------------------------------------------------------
create or replace function public.kos_html_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(replace(replace(replace(replace(coalesce(p_text, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

revoke all on function public.kos_html_text(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) List, newest first. Bucket: new | renewal | prospect.
-- ---------------------------------------------------------------------------
create or replace function public.list_membership_applications(p_bucket text default 'new')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bucket text := lower(coalesce(nullif(btrim(p_bucket), ''), 'new'));
  v_status text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;

  if v_bucket = 'renewal' then
    v_status := 'pending-renewal';
  elsif v_bucket = 'prospect' then
    v_status := 'prospect';
  else
    v_bucket := 'new';
    v_status := 'pending-new';
  end if;

  return jsonb_build_object(
    'ok', true,
    'bucket', v_bucket,
    'counts', jsonb_build_object(
      'new', (select count(*) from public.members m
              where m.merged_into is null and m.membership_status = 'pending-new'),
      'renewal', (select count(*) from public.members m
                  where m.merged_into is null and m.membership_status = 'pending-renewal'),
      'prospect', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'prospect')
    ),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'first_name', q.first_name,
        'last_name', q.last_name,
        'email', q.email,
        'phone', q.phone,
        'street_address', q.street_address,
        'city', q.city,
        'state', q.state,
        'zip', q.zip,
        'notes', q.notes,
        'interests', q.interests,
        'membership_status', q.membership_status,
        'member_role', q.member_role,
        'join_date', q.join_date,
        'created_at', q.created_at
      ) order by q.created_at desc)
      from (
        select m.id, m.first_name, m.last_name, m.email, m.phone,
               m.street_address, m.city, m.state, m.zip,
               m.notes, m.interests, m.membership_status, m.member_role,
               m.join_date, m.created_at
        from public.members m
        where m.merged_into is null
          and m.membership_status = v_status
        order by m.created_at desc
      ) q
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'member_id', q.member_id,
        'action', q.action,
        'note', q.note,
        'from_status', q.from_status,
        'to_status', q.to_status,
        'actor_name', q.actor_name,
        'actor_email', q.actor_email,
        'created_at', q.created_at,
        'applicant', q.applicant
      ) order by q.created_at desc)
      from (
        select a.id, a.member_id, a.action, a.note, a.from_status, a.to_status,
               a.actor_name, a.actor_email, a.created_at,
               btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) as applicant
        from public.membership_application_actions a
        left join public.members m on m.id = a.member_id
        order by a.created_at desc
        limit 12
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Approve, decline, archive. Shared writer. Not a client API.
-- ---------------------------------------------------------------------------
create or replace function public._apply_membership_application_decision(
  p_member_id uuid,
  p_action text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.members%rowtype;
  v_actor record;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
  v_role text;
  v_to text;
  v_subject text;
  v_html text;
  v_name text;
  v_emailed boolean := false;
  v_message text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if p_action not in ('approve', 'decline', 'archive') then
    return jsonb_build_object('ok', false, 'message', 'That action is not available.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing application.');
  end if;

  select * into rec
  from public.members
  where id = p_member_id
  for update;

  if not found or rec.merged_into is not null then
    return jsonb_build_object('ok', false, 'message', 'That application was not found.');
  end if;
  if rec.membership_status not in ('pending-new', 'pending-renewal', 'prospect') then
    return jsonb_build_object('ok', false, 'message', 'That application is no longer waiting for review.');
  end if;

  select * into v_actor from public._officer_actor();

  if p_action = 'approve' then
    v_to := 'active';
    v_role := rec.member_role;
    if v_role is null or btrim(v_role) = '' or lower(v_role) in ('prospect', 'pending') then
      v_role := 'member';
    end if;
    update public.members
       set membership_status = 'active',
           member_role = v_role,
           join_date = coalesce(join_date, (timezone('America/New_York', now()))::date),
           updated_at = now()
     where id = rec.id;
    if to_regprocedure('public.kos_sync_roster_role_grants(uuid)') is not null then
      perform public.kos_sync_roster_role_grants(rec.id);
    end if;
  elsif p_action = 'decline' then
    v_to := 'declined';
    update public.members
       set membership_status = 'declined',
           updated_at = now()
     where id = rec.id;
  else
    v_to := 'archived';
    update public.members
       set membership_status = 'archived',
           updated_at = now()
     where id = rec.id;
  end if;

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, p_action, v_note, rec.membership_status, v_to,
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  v_name := btrim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, ''));

  if p_action = 'approve' and rec.membership_status in ('pending-new', 'prospect') then
    v_subject := 'Welcome to the Krewe of Shamrock';
    v_html :=
      '<p>Dear ' || public.kos_html_text(coalesce(nullif(btrim(rec.first_name), ''), 'friend')) || ',</p>'
      || '<p>Welcome. Your membership application is approved, and you are on the krewe roster.</p>'
      || '<p>To use the Member Hub, create your login with the same email you put on the application ('
      || public.kos_html_text(coalesce(rec.email, '')) || '):</p>'
      || '<ol>'
      || '<li>Open the Member Hub at <a href="https://www.kreweofshamrock.com/members.html">kreweofshamrock.com/members.html</a>.</li>'
      || '<li>Tap <strong>Create or reset your password</strong>.</li>'
      || '<li>Enter that email. We will send you a secure link. The same link works for a first password or a reset.</li>'
      || '<li>Open the link on your device and choose a password of at least 8 characters.</li>'
      || '<li>Come back and sign in with that email and password.</li>'
      || '</ol>'
      || '<p>Signing up with this email links your login to your membership. Old Wild Apricot passwords do not work here.</p>'
      || '<p>Questions: <a href="mailto:secretary@kreweofshamrock.com">secretary@kreweofshamrock.com</a>.</p>'
      || '<p>Sláinte!</p>';
    if to_regprocedure('public.wrap_all_krewe_email_html(text,text)') is not null then
      v_html := public.wrap_all_krewe_email_html(v_subject, v_html);
    end if;
    if public.enqueue_email(
      rec.email,
      nullif(v_name, ''),
      v_subject,
      v_html,
      'membership_welcome',
      rec.id
    ) is not null then
      v_emailed := true;
    end if;
    if v_emailed then
      v_message := 'Approved. They are an active member now. We emailed them a welcome note with steps to create a Member Hub login: open the Member Hub, tap Create or reset your password, and use the email on this application. Signing up with that email links their login to this membership.';
    else
      v_message := 'Approved. They are an active member now. We could not email them, so please tell them the next step: open the Member Hub, tap Create or reset your password, and use the email on this application. Signing up with that email links their login to this membership.';
    end if;
  elsif p_action = 'approve' then
    v_message := 'Approved. They are an active member again. They can sign in with the Member Hub login they already use.';
  elsif p_action = 'decline' then
    v_message := 'Declined. Their record stays on file and is off the new-application list. Nothing was deleted.';
  else
    v_message := 'Archived. Their record stays on file and is off the new-application list. Nothing was deleted.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', v_message,
    'emailed', v_emailed,
    'status', v_to
  );
end;
$$;

create or replace function public.approve_membership_application(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._apply_membership_application_decision(p_member_id, 'approve', null);
end;
$$;

create or replace function public.decline_membership_application(p_member_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._apply_membership_application_decision(p_member_id, 'decline', p_note);
end;
$$;

create or replace function public.archive_membership_application(p_member_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._apply_membership_application_decision(p_member_id, 'archive', p_note);
end;
$$;

revoke all on function public._apply_membership_application_decision(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Home badge count, folded into the existing officer counts.
--    applications is 0 unless the caller may review. Other keys stay officer-only.
-- ---------------------------------------------------------------------------
create or replace function public.officer_pending_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_krewe_officer() or public.can_review_applications() then jsonb_build_object(
      'role_requests', case when public.is_krewe_officer() then (select count(*) from public.role_requests where status = 'pending') else 0 end,
      'duplicates', case when public.is_krewe_officer() then (select count(*) from public.possible_duplicates where status = 'open') else 0 end,
      'unlinked', case when public.is_krewe_officer() then (
        select count(*) from auth.users u
        left join public.profiles p on p.id = u.id
        where p.member_id is null
      ) else 0 end,
      'media', case when public.is_krewe_officer() then (
        select count(*) from public.content_items
        where type in ('photo', 'video') and approval_status = 'pending'
      ) else 0 end,
      'applications', case when public.can_review_applications() then (
        select count(*) from public.members m
        where m.merged_into is null and m.membership_status = 'pending-new'
      ) else 0 end
    )
    else jsonb_build_object(
      'role_requests', 0, 'duplicates', 0, 'unlinked', 0, 'media', 0, 'applications', 0
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Keep declined and archived people out of membership totals and parade roster.
--    security_invoker stays on, matching the live views.
-- ---------------------------------------------------------------------------
create or replace view public.v_report_membership
with (security_invoker = true) as
select
  count(*)::integer as total_members,
  count(*) filter (where membership_status = 'active')::integer as active_members,
  count(*) filter (where membership_status = 'prospect')::integer as prospects,
  count(*) filter (where member_role = any (array['officer', 'captain', 'board']))::integer as officers,
  count(*) filter (where join_date >= date_trunc('year', current_date::timestamp with time zone)::date)::integer as new_this_year
from public.members
where coalesce(membership_status, '') <> 'merged'
  and coalesce(membership_status, '') not in ('declined', 'archived');

create or replace view public.v_parade_ready
with (security_invoker = true) as
select
  id as member_id,
  first_name,
  last_name,
  membership_status,
  (exists (
    select 1 from public.dues_payments d
    where d.member_id = m.id
      and d.membership_year = extract(year from current_date)::integer
      and d.paid
  )) as dues_paid,
  (exists (
    select 1 from public.waivers w
    where w.member_id = m.id
      and w.season_year = extract(year from current_date)::integer
  )) as waiver_signed,
  (exists (
    select 1
    from public.event_signups s
    join public.events e on e.id = s.event_id
    where s.member_id = m.id
      and s.status = 'attended'
      and e.event_type = 'meeting'
      and e.is_mandatory
      and e.start_time >= date_trunc('year', now())
  )) as meeting_attended,
  coalesce((
    select sum(v.hours)
    from public.volunteer_hours v
    where v.member_id = m.id
      and v.season_year = krewe_volunteer_season_year(current_date)
      and v.approved
      and coalesce(v.is_demo, false) = false
  ), 0::numeric) as hours_approved,
  coalesce((
    select sum(v.hours)
    from public.volunteer_hours v
    where v.member_id = m.id
      and v.season_year = krewe_volunteer_season_year(current_date)
      and coalesce(v.is_demo, false) = false
  ), 0::numeric) as hours_logged,
  coalesce((
    select sum(v.hours)
    from public.volunteer_hours v
    where v.member_id = m.id
      and v.season_year = krewe_volunteer_season_year(current_date)
      and v.approved
      and coalesce(v.is_demo, false) = false
  ), 0::numeric) as volunteer_hours_approved,
  coalesce((
    select sum(v.hours)
    from public.volunteer_hours v
    where v.member_id = m.id
      and v.season_year = krewe_volunteer_season_year(current_date)
      and coalesce(v.is_demo, false) = false
  ), 0::numeric) as volunteer_hours_logged
from public.members m
where coalesce(membership_status, '') <> 'merged'
  and coalesce(membership_status, '') not in ('declined', 'archived')
  and merged_into is null
  and (id = kos_current_member_id() or is_krewe_officer());

alter view public.v_report_membership set (security_invoker = true);
alter view public.v_parade_ready set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 9) Join form: same function as live, plus a Membership Chair copy.
--    secretary@ and digital@ notices are unchanged.
--    Public (anon) execute stays, because membership-application.html calls this.
-- ---------------------------------------------------------------------------
create or replace function public.submit_membership_application(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_street_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := left(trim(coalesce(p_first_name,'')), 80);
  v_last  text := left(trim(coalesce(p_last_name,'')), 80);
  v_email text := left(lower(trim(coalesce(p_email,''))), 120);
  v_phone text := nullif(left(trim(coalesce(p_phone,'')), 40), '');
  v_notes text := nullif(left(trim(coalesce(p_notes,'')), 2000), '');
  v_street text := nullif(left(trim(coalesce(p_street_address,'')), 120), '');
  v_city text := nullif(left(trim(coalesce(p_city,'')), 80), '');
  v_state text := nullif(left(trim(coalesce(p_state,'')), 20), '');
  v_zip text := nullif(left(trim(coalesce(p_zip,'')), 16), '');
  v_id uuid;
  v_status text;
  v_is_new boolean := false;
  v_recent int;
  v_addr text;
  v_chair_sent boolean := false;
  v_chair record;
  v_chair_html text;
begin
  if v_first = '' or v_last = '' then
    return jsonb_build_object('ok', false, 'message', 'First and last name are required.');
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'A valid email is required.');
  end if;
  if v_street is null or v_city is null or v_state is null or v_zip is null then
    return jsonb_build_object('ok', false, 'message', 'Please add your mailing address.');
  end if;

  select count(*) into v_recent
  from public.members
  where membership_status in ('pending-new', 'prospect')
    and created_at > now() - interval '10 minutes';
  if v_recent >= 12 then
    return jsonb_build_object('ok', false, 'message', 'Please try again in a few minutes.');
  end if;

  select id, membership_status into v_id, v_status
  from public.members
  where lower(email) = v_email and merged_into is null
  order by created_at
  limit 1;

  if v_id is null then
    insert into public.members (
      first_name, last_name, email, phone, notes,
      street_address, city, state, zip,
      member_role, membership_status
    ) values (
      v_first, v_last, v_email, v_phone, v_notes,
      v_street, v_city, v_state, v_zip,
      'prospect', 'pending-new'
    ) returning id into v_id;
    v_is_new := true;
  else
    update public.members set
      first_name = v_first,
      last_name = v_last,
      phone = coalesce(v_phone, phone),
      notes = coalesce(v_notes, notes),
      street_address = coalesce(v_street, street_address),
      city = coalesce(v_city, city),
      state = coalesce(v_state, state),
      zip = coalesce(v_zip, zip),
      updated_at = now()
    where id = v_id;
  end if;

  v_addr := v_street || ', ' || v_city || ', ' || v_state || ' ' || v_zip;

  if v_is_new or v_status in ('prospect', 'pending-new') then
    perform public.enqueue_email(
      'secretary@kreweofshamrock.com',
      'Krewe Secretary',
      'New membership application: ' || v_first || ' ' || v_last,
      '<p>A membership application just arrived.</p><p><strong>'
        || v_first || ' ' || v_last || '</strong><br/>'
        || v_email || case when v_phone is not null then '<br/>' || v_phone else '' end
        || '<br/>' || v_addr || '</p>'
        || case when v_notes is not null then '<p>' || replace(v_notes, E'\n', '<br/>') || '</p>' else '' end
        || '<p>Review in the Member Hub or v_pending_applications.</p>',
      'membership_application',
      v_id
    );
    perform public.enqueue_email(
      'digital@kreweofshamrock.com',
      'Krewe Digital',
      'New membership application: ' || v_first || ' ' || v_last,
      '<p>' || v_first || ' ' || v_last || ' applied (' || v_email || ').</p><p>' || v_addr || '</p>',
      'membership_application',
      v_id
    );

    -- Current Membership Chair (role grant or title). Not a hardcoded person.
    v_chair_html :=
      '<p>A new membership application just arrived from the join form.</p><p><strong>'
      || public.kos_html_text(v_first) || ' ' || public.kos_html_text(v_last) || '</strong><br/>'
      || public.kos_html_text(v_email)
      || case when v_phone is not null then '<br/>' || public.kos_html_text(v_phone) else '' end
      || '<br/>' || public.kos_html_text(v_addr) || '</p>'
      || case when v_notes is not null then '<p>' || replace(public.kos_html_text(v_notes), E'\n', '<br/>') || '</p>' else '' end
      || '<p>Sign in to the Member Hub, open your Officer desk, and choose Membership Applications.</p>';

    for v_chair in
      select distinct
        lower(btrim(m.email)) as email,
        btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) as full_name
      from public.members m
      where m.merged_into is null
        and coalesce(m.membership_status, 'active') in ('active', 'pending-renewal')
        and m.email is not null
        and position('@' in m.email) > 0
        and (
          coalesce(m.officer_title, '') ilike '%Chair of Membership%'
          or exists (
            select 1
            from public.profiles p
            join public.member_roles r on r.user_id = p.id
            where p.member_id = m.id
              and r.role = 'committee'
              and r.committee ilike 'Membership'
          )
        )
    loop
      if v_chair.email in ('secretary@kreweofshamrock.com', 'digital@kreweofshamrock.com') then
        continue;
      end if;
      perform public.enqueue_email(
        v_chair.email,
        nullif(v_chair.full_name, ''),
        'New membership application: ' || v_first || ' ' || v_last,
        v_chair_html,
        'membership_application',
        v_id
      );
      v_chair_sent := true;
    end loop;

    if not v_chair_sent then
      perform public.enqueue_email(
        'lsugrue99@gmail.com',
        'Membership Chair',
        'New membership application: ' || v_first || ' ' || v_last,
        v_chair_html,
        'membership_application',
        v_id
      );
    end if;
  end if;

  if v_status in ('active', 'pending-renewal', 'lapsed') then
    return jsonb_build_object(
      'ok', true,
      'message', 'You are already on our roster. We updated your mailing address. Questions: secretary@kreweofshamrock.com'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'Application received. We will follow up by email. Sláinte!'
  );
end;
$$;

-- The join form is public. Keep anon execute on that one function only.
grant execute on function public.submit_membership_application(text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) Client grants. Review RPCs: authenticated only.
-- ---------------------------------------------------------------------------
revoke all on function public.can_review_applications() from public, anon;
grant execute on function public.can_review_applications() to authenticated;

revoke all on function public.list_membership_applications(text) from public, anon;
grant execute on function public.list_membership_applications(text) to authenticated;

revoke all on function public.approve_membership_application(uuid) from public, anon;
grant execute on function public.approve_membership_application(uuid) to authenticated;

revoke all on function public.decline_membership_application(uuid, text) from public, anon;
grant execute on function public.decline_membership_application(uuid, text) to authenticated;

revoke all on function public.archive_membership_application(uuid, text) from public, anon;
grant execute on function public.archive_membership_application(uuid, text) to authenticated;

revoke all on function public.officer_pending_counts() from public, anon;
grant execute on function public.officer_pending_counts() to authenticated;
