-- Volunteer interest inbox for the Charity Chair.
--
-- How to apply (do this in the Supabase SQL editor; the website does not run it):
--   1. Open project oazwkwflgbthojvnclfc.
--   2. SQL Editor -> New query -> paste this file -> Run.
-- Safe to run more than once.
--
-- What it does:
--   * Public volunteer.html calls submit_volunteer_inquiry (anon). The table
--     has row level security and no client insert/update/delete.
--   * The notice goes to whoever currently holds Chair of Charity: a roster
--     title containing "Chair of Charity", or a member_roles committee of
--     Charity. That is the same idea as the Membership Chair letter.
--   * If nobody holds that role, the notice goes to
--     secretary@kreweofshamrock.com. It does not go to a personal mailbox.
--   * Charity Chair and krewe officers review the inbox in the Member Hub.
--
-- Depends on enqueue_email (sql/kos_public_events_and_rsvp.sql) and
-- is_krewe_officer(). Both are already on the project.

-- ---------------------------------------------------------------------------
-- 1) Inbox. Clients do not write this table.
-- ---------------------------------------------------------------------------
create table if not exists public.volunteer_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text not null,
  affiliation text not null,
  other_krewe_name text,
  interests text not null,
  notes text,
  status text not null default 'new',
  contacted_at timestamptz,
  done_at timestamptz,
  officer_note text,
  actor_uid uuid,
  actor_email text,
  actor_name text,
  updated_at timestamptz
);

alter table public.volunteer_inquiries drop constraint if exists volunteer_inquiries_affiliation_check;
alter table public.volunteer_inquiries
  add constraint volunteer_inquiries_affiliation_check
  check (affiliation in ('krewe_member', 'other_krewe', 'neither'));

alter table public.volunteer_inquiries drop constraint if exists volunteer_inquiries_status_check;
alter table public.volunteer_inquiries
  add constraint volunteer_inquiries_status_check
  check (status in ('new', 'contacted', 'done'));

create index if not exists volunteer_inquiries_status_created_idx
  on public.volunteer_inquiries (status, created_at desc);

create index if not exists volunteer_inquiries_created_idx
  on public.volunteer_inquiries (created_at desc);

alter table public.volunteer_inquiries enable row level security;

revoke all on table public.volunteer_inquiries from public, anon, authenticated;

comment on table public.volunteer_inquiries is
  'Public volunteer interest. Written only by submit_volunteer_inquiry. Reviewed by Charity Chair and officers.';

-- ---------------------------------------------------------------------------
-- 2) HTML escape for inquiry text inside emails. Same helper as membership.
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
-- 3) Who may open the Officer Desk inbox.
--    Officers, or Charity committee, or a Chair of Charity title.
-- ---------------------------------------------------------------------------
create or replace function public.can_review_volunteer_inquiries()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_krewe_officer()
    or exists (
      select 1
      from public.member_roles r
      where r.user_id = auth.uid()
        and r.role = 'committee'
        and coalesce(r.committee, '') ilike 'Charity'
    )
    or exists (
      select 1
      from public.profiles p
      join public.members m on m.id = p.member_id
      where p.id = auth.uid()
        and m.merged_into is null
        and coalesce(m.officer_title, '') ilike '%Chair of Charity%'
    );
$$;

comment on function public.can_review_volunteer_inquiries() is
  'Krewe officers, Charity committee grants, and Chair of Charity titles.';

-- ---------------------------------------------------------------------------
-- 4) Public submit. Honeypot + 10-minute flood, then email the current chair.
-- ---------------------------------------------------------------------------
create or replace function public.submit_volunteer_inquiry(
  p_full_name text,
  p_email text,
  p_phone text,
  p_affiliation text,
  p_interests text,
  p_other_krewe_name text default null,
  p_notes text default null,
  p_company_website text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(btrim(coalesce(p_full_name, '')), 120);
  v_email text := left(lower(btrim(coalesce(p_email, ''))), 120);
  v_phone text := left(btrim(coalesce(p_phone, '')), 40);
  v_affiliation text := lower(btrim(coalesce(p_affiliation, '')));
  v_other text := nullif(left(btrim(coalesce(p_other_krewe_name, '')), 120), '');
  v_interests text := left(btrim(coalesce(p_interests, '')), 2000);
  v_notes text := nullif(left(btrim(coalesce(p_notes, '')), 2000), '');
  v_id uuid;
  v_recent int;
  v_aff_label text;
  v_html text;
  v_subject text;
  v_chair record;
  v_chair_sent boolean := false;
  v_ok_message text := 'Thank you. The Charity committee will follow up.';
begin
  -- Hidden company-website field. A person leaves it blank. A bot often fills
  -- it. Pretend the form worked and do not store or email anything.
  if nullif(btrim(coalesce(p_company_website, '')), '') is not null then
    return jsonb_build_object('ok', true, 'message', v_ok_message);
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'Please add your name.');
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'A valid email is required.');
  end if;
  if v_phone = '' or length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then
    return jsonb_build_object('ok', false, 'message', 'A phone number is required.');
  end if;
  if v_affiliation not in ('krewe_member', 'other_krewe', 'neither') then
    return jsonb_build_object('ok', false, 'message', 'Please choose how you are connected to the Krewe.');
  end if;
  if v_affiliation = 'other_krewe' and v_other is null then
    return jsonb_build_object('ok', false, 'message', 'Please tell us which krewe you are with.');
  end if;
  if v_affiliation <> 'other_krewe' then
    v_other := null;
  end if;
  if v_interests = '' then
    return jsonb_build_object('ok', false, 'message', 'Please tell us your interests or when you can help.');
  end if;

  -- Same 10-minute flood idea as the join form: a burst of new rows is refused.
  select count(*) into v_recent
  from public.volunteer_inquiries
  where created_at > now() - interval '10 minutes';
  if v_recent >= 12 then
    return jsonb_build_object('ok', false, 'message', 'Please try again in a few minutes.');
  end if;

  if exists (
    select 1
    from public.volunteer_inquiries
    where lower(email) = v_email
      and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', false, 'message', 'Please try again in a few minutes.');
  end if;

  insert into public.volunteer_inquiries (
    full_name, email, phone, affiliation, other_krewe_name, interests, notes, status
  ) values (
    v_name, v_email, v_phone, v_affiliation, v_other, v_interests, v_notes, 'new'
  ) returning id into v_id;

  v_aff_label := case v_affiliation
    when 'krewe_member' then 'Krewe member'
    when 'other_krewe' then 'Friend from another krewe'
    else 'Neighbor'
  end;
  if v_affiliation = 'other_krewe' and v_other is not null then
    v_aff_label := v_aff_label || ' (' || v_other || ')';
  end if;

  v_subject := 'Volunteer inquiry: ' || v_name;
  v_html :=
    '<p>Someone would like to volunteer with the Krewe of Shamrock.</p>'
    || '<p><strong>' || public.kos_html_text(v_name) || '</strong><br/>'
    || public.kos_html_text(v_email) || '<br/>'
    || public.kos_html_text(v_phone) || '</p>'
    || '<p><strong>Affiliation:</strong> ' || public.kos_html_text(v_aff_label) || '</p>'
    || '<p><strong>Interests and availability:</strong><br/>'
    || replace(public.kos_html_text(v_interests), E'\n', '<br/>') || '</p>'
    || case
         when v_notes is not null then
           '<p><strong>Notes:</strong><br/>' || replace(public.kos_html_text(v_notes), E'\n', '<br/>') || '</p>'
         else ''
       end
    || '<p><a href="https://www.kreweofshamrock.com/members.html#volunteer-inquiries">Open the volunteer inbox on the Officer Desk</a></p>';

  -- Current Charity Chair (role grant or title). Not a hardcoded person.
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
        coalesce(m.officer_title, '') ilike '%Chair of Charity%'
        or exists (
          select 1
          from public.profiles p
          join public.member_roles r on r.user_id = p.id
          where p.member_id = m.id
            and r.role = 'committee'
            and r.committee ilike 'Charity'
        )
      )
  loop
    perform public.enqueue_email(
      v_chair.email,
      nullif(v_chair.full_name, ''),
      v_subject,
      v_html,
      'volunteer_inquiry',
      null
    );
    v_chair_sent := true;
  end loop;

  if not v_chair_sent then
    perform public.enqueue_email(
      'secretary@kreweofshamrock.com',
      'Krewe Secretary',
      v_subject,
      v_html,
      'volunteer_inquiry',
      null
    );
  end if;

  return jsonb_build_object('ok', true, 'message', v_ok_message);
end;
$$;

comment on function public.submit_volunteer_inquiry(text, text, text, text, text, text, text, text) is
  'Public volunteer interest. Emails the current Charity Chair, or secretary@ if no chair is on the roster.';

-- ---------------------------------------------------------------------------
-- 5) List one status, newest first, plus counts for New / Contacted / Done.
-- ---------------------------------------------------------------------------
create or replace function public.list_volunteer_inquiries(p_status text default 'new')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text := lower(coalesce(nullif(btrim(p_status), ''), 'new'));
begin
  if auth.uid() is null or not public.can_review_volunteer_inquiries() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to volunteer inquiries.');
  end if;
  if v_status not in ('new', 'contacted', 'done') then
    v_status := 'new';
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'counts', (
      select jsonb_build_object(
        'new', count(*) filter (where status = 'new'),
        'contacted', count(*) filter (where status = 'contacted'),
        'done', count(*) filter (where status = 'done')
      )
      from public.volunteer_inquiries
    ),
    'inquiries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'created_at', q.created_at,
        'full_name', q.full_name,
        'email', q.email,
        'phone', q.phone,
        'affiliation', q.affiliation,
        'other_krewe_name', q.other_krewe_name,
        'interests', q.interests,
        'notes', q.notes,
        'status', q.status,
        'contacted_at', q.contacted_at,
        'done_at', q.done_at,
        'officer_note', q.officer_note,
        'actor_name', q.actor_name,
        'actor_email', q.actor_email,
        'updated_at', q.updated_at
      ) order by q.created_at desc)
      from (
        select *
        from public.volunteer_inquiries
        where status = v_status
        order by created_at desc
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Mark contacted or done. Records who did it.
-- ---------------------------------------------------------------------------
create or replace function public.update_volunteer_inquiry_status(
  p_id uuid,
  p_status text,
  p_officer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_note text;
  v_row public.volunteer_inquiries%rowtype;
  v_actor_uid uuid;
  v_actor_email text;
  v_actor_name text;
  v_message text;
begin
  if auth.uid() is null or not public.can_review_volunteer_inquiries() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to volunteer inquiries.');
  end if;
  if p_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing inquiry.');
  end if;
  if v_status not in ('new', 'contacted', 'done') then
    return jsonb_build_object('ok', false, 'message', 'That status is not available.');
  end if;

  select * into v_row
  from public.volunteer_inquiries
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That inquiry was not found.');
  end if;

  -- Null keeps the note already on the row. A blank string clears it.
  if p_officer_note is null then
    v_note := v_row.officer_note;
  else
    v_note := nullif(left(btrim(p_officer_note), 1000), '');
  end if;

  v_actor_uid := auth.uid();
  select
    coalesce(
      (select m.email from public.profiles p join public.members m on m.id = p.member_id where p.id = v_actor_uid limit 1),
      (select u.email::text from auth.users u where u.id = v_actor_uid)
    ),
    coalesce(
      nullif(btrim((
        select btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, ''))
        from public.profiles p
        join public.members m on m.id = p.member_id
        where p.id = v_actor_uid
        limit 1
      )), ''),
      (select u.email::text from auth.users u where u.id = v_actor_uid)
    )
  into v_actor_email, v_actor_name;

  update public.volunteer_inquiries
     set status = v_status,
         contacted_at = case
           when v_status in ('contacted', 'done') then coalesce(contacted_at, now())
           else contacted_at
         end,
         done_at = case
           when v_status = 'done' then coalesce(done_at, now())
           else done_at
         end,
         officer_note = v_note,
         actor_uid = v_actor_uid,
         actor_email = v_actor_email,
         actor_name = v_actor_name,
         updated_at = now()
   where id = p_id;

  v_message := case v_status
    when 'contacted' then 'Marked contacted.'
    when 'done' then 'Marked done.'
    else 'Moved back to new.'
  end;

  return jsonb_build_object(
    'ok', true,
    'message', v_message,
    'status', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Grants. The form is public. Review functions are signed-in only.
-- ---------------------------------------------------------------------------
revoke all on function public.submit_volunteer_inquiry(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_volunteer_inquiry(text, text, text, text, text, text, text, text) to anon, authenticated;

revoke all on function public.can_review_volunteer_inquiries() from public, anon;
grant execute on function public.can_review_volunteer_inquiries() to authenticated;

revoke all on function public.list_volunteer_inquiries(text) from public, anon;
grant execute on function public.list_volunteer_inquiries(text) to authenticated;

revoke all on function public.update_volunteer_inquiry_status(uuid, text, text) from public, anon;
grant execute on function public.update_volunteer_inquiry_status(uuid, text, text) to authenticated;
