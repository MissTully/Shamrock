-- Staged membership application (Phase 1).
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   1. If Membership Applications is not installed yet, run
--      sql/kos_membership_applications.sql first.
--   2. If the pipeline stages are not installed yet, run
--      sql/kos_membership_application_pipeline.sql next.
--   3. Open sql/kos_membership_application_staged.sql.
--   4. Paste this whole file into a new query and run it.
--   5. Safe to run again.
--   6. Then run sql/kos_membership_background_check_invoice.sql.
--      Move to background check sends the secure link. The dues invoice
--      is queued when the prospect submits the full application.
-- If you run the pipeline file or this staged file again later, run
-- sql/kos_membership_background_check_invoice.sql again so it stays last.
--
-- What this file changes:
--   Stage 0. The public join form is interest only. It stores name, email,
--   phone, mailing address, application fee type (single $50 or dual $75),
--   the second applicant's name when the fee is couple, and the optional
--   note. It does not store a Social Security number or a driver's license
--   number. p_ssn and p_partner_ssn are still accepted so an older page does
--   not error, and then discarded.
--   Stage 0 mail goes to the Membership Chair and the President only.
--   Not secretary@kreweofshamrock.com. Not digital@kreweofshamrock.com.
--   If nobody holds Membership Chair, the chair copy falls back to
--   lsugrue99@gmail.com, same as before. President is the roster title
--   segment President, not Vice President. The letter asks them to call.
--   Stage 1. Move to background check calls send_membership_full_application.
--   That emails the applicant one secure link. The token is 32 random
--   bytes, hex, and only its SHA-256 hash is stored. The link expires in
--   21 days. The email has no Social Security number and no driver's
--   license number. The follow-up SQL file is what wires that call.
--   Stage 2. The token page submits a driver's license number and a
--   Social Security number for Applicant 1. A couple ($75, fee type dual)
--   also submits both numbers for Applicant 2. There is no driver's license
--   state. Confirmation mail names the person and does not include the numbers.
--   membership_application_ids.id_kind is ssn or dl. Lists return the last 4
--   only. reveal_membership_application_id returns one full value to a
--   reviewer and writes an audit row that stores the last 4, not the full value.
--   The ID table and the link table have row level security and no client grants.

-- ---------------------------------------------------------------------------
-- 1) Fee columns from the pipeline, in case that file was not applied.
--    Does not narrow membership_status.
-- ---------------------------------------------------------------------------
alter table public.members add column if not exists application_fee_type text;
alter table public.members drop constraint if exists members_application_fee_type_check;
alter table public.members add constraint members_application_fee_type_check
  check (application_fee_type is null or application_fee_type in ('single', 'dual'));

alter table public.members add column if not exists partner_first_name text;
alter table public.members add column if not exists partner_last_name text;

comment on column public.members.application_fee_type is
  'Join-form application fee: single ($50) or dual ($75). Not membership dues.';

-- ---------------------------------------------------------------------------
-- 2) Background-check IDs. ssn is 9 digits. dl is 4 to 20 letters and digits.
--    No driver's license state. No direct API read.
-- ---------------------------------------------------------------------------
create table if not exists public.membership_application_ids (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  person_slot text not null check (person_slot in ('applicant', 'partner')),
  id_kind text not null default 'ssn' check (id_kind in ('ssn', 'dl')),
  id_digits text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_application_ids_id_digits_check check (
    (id_kind = 'ssn' and id_digits ~ '^\d{9}$')
    or (id_kind = 'dl' and id_digits ~ '^[A-Z0-9]{4,20}$')
  )
);

alter table public.membership_application_ids drop constraint if exists membership_application_ids_id_kind_check;
alter table public.membership_application_ids
  add constraint membership_application_ids_id_kind_check
  check (id_kind in ('ssn', 'dl'));

alter table public.membership_application_ids drop constraint if exists membership_application_ids_id_digits_check;
alter table public.membership_application_ids
  add constraint membership_application_ids_id_digits_check
  check (
    (id_kind = 'ssn' and id_digits ~ '^\d{9}$')
    or (id_kind = 'dl' and id_digits ~ '^[A-Z0-9]{4,20}$')
  );

-- One row per person used to cover only SSN. Driver's license is a second row.
drop index if exists public.membership_application_ids_member_slot_idx;
create unique index if not exists membership_application_ids_member_slot_kind_idx
  on public.membership_application_ids (member_id, person_slot, id_kind);

alter table public.membership_application_ids enable row level security;
revoke all on table public.membership_application_ids from public, anon, authenticated;

comment on table public.membership_application_ids is
  'Background-check Social Security numbers and driver''s license numbers. No direct API read. Lists show last 4. Full value only via reveal_membership_application_id for application reviewers. Reveal is audited.';

comment on column public.membership_application_ids.id_digits is
  'Normalized value: 9 digits when id_kind is ssn, or 4 to 20 letters and digits when id_kind is dl.';

-- ---------------------------------------------------------------------------
-- 3) Hashed full-application links. The raw token is never stored.
-- ---------------------------------------------------------------------------
create table if not exists public.membership_application_links (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint membership_application_links_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists membership_application_links_token_hash_idx
  on public.membership_application_links (token_hash);

create index if not exists membership_application_links_member_idx
  on public.membership_application_links (member_id, created_at desc);

alter table public.membership_application_links enable row level security;
revoke all on table public.membership_application_links from public, anon, authenticated;

comment on table public.membership_application_links is
  'SHA-256 hashes of full-application links. The raw token exists only in the applicant email. No direct API read.';

-- ---------------------------------------------------------------------------
-- 4) History actions. Older next_step_sent rows stay valid.
-- ---------------------------------------------------------------------------
alter table public.membership_application_actions
  drop constraint if exists membership_application_actions_action_check;
alter table public.membership_application_actions
  add constraint membership_application_actions_action_check
  check (action in (
    'approve', 'decline', 'archive',
    'background_check', 'dues_pending', 'next_step_sent',
    'full_application_sent', 'full_application_received', 'id_revealed'
  ));

-- ---------------------------------------------------------------------------
-- 5) Helpers. Not client APIs. Never log the value.
-- ---------------------------------------------------------------------------
create or replace function public.kos_ssn_digits(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(coalesce(p_text, ''), '\D', '', 'g') ~ '^\d{9}$'
    then regexp_replace(p_text, '\D', '', 'g')
    else null
  end;
$$;

revoke all on function public.kos_ssn_digits(text) from public, anon, authenticated;

create or replace function public.kos_dl_token(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when upper(regexp_replace(coalesce(p_text, ''), '[^A-Za-z0-9]', '', 'g')) ~ '^[A-Z0-9]{4,20}$'
    then upper(regexp_replace(p_text, '[^A-Za-z0-9]', '', 'g'))
    else null
  end;
$$;

revoke all on function public.kos_dl_token(text) from public, anon, authenticated;

-- Notes and other free text only. Do not run this on the phone field.
create or replace function public.kos_redact_id_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_text, ''), '\d{3}-\d{2}-\d{4}', '[redacted]', 'g'),
        '\d{3}\s+\d{2}\s+\d{4}',
        '[redacted]',
        'g'
      ),
      '\d{9,}',
      '[redacted]',
      'g'
    ),
    '\m[A-Za-z]{1,3}[0-9][A-Za-z0-9]{4,18}\M',
    '[redacted]',
    'g'
  );
$$;

revoke all on function public.kos_redact_id_text(text) from public, anon, authenticated;

create or replace function public.kos_email_plain(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select public.kos_html_text(public.kos_redact_id_text(p_text));
$$;

revoke all on function public.kos_email_plain(text) from public, anon, authenticated;

create or replace function public.kos_application_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(
    extensions.digest(convert_to(lower(btrim(coalesce(p_token, ''))), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

revoke all on function public.kos_application_token_hash(text) from public, anon, authenticated;

create or replace function public.kos_upsert_application_id(
  p_member_id uuid,
  p_slot text,
  p_kind text,
  p_value text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.membership_application_ids (member_id, person_slot, id_kind, id_digits)
  values (p_member_id, p_slot, p_kind, p_value)
  on conflict (member_id, person_slot, id_kind)
  do update set id_digits = excluded.id_digits,
                updated_at = now();
end;
$$;

revoke all on function public.kos_upsert_application_id(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.kos_queue_membership_chair_and_president(
  p_subject text,
  p_html text,
  p_purpose text,
  p_member_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_seen text[] := array[]::text[];
  v_chair_sent boolean := false;
begin
  for v_row in
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
    if v_row.email = any (v_seen) then
      continue;
    end if;
    v_seen := array_append(v_seen, v_row.email);
    perform public.enqueue_email(
      v_row.email,
      nullif(v_row.full_name, ''),
      p_subject,
      p_html,
      p_purpose,
      p_member_id
    );
    v_chair_sent := true;
  end loop;

  if not v_chair_sent and not ('lsugrue99@gmail.com' = any (v_seen)) then
    perform public.enqueue_email(
      'lsugrue99@gmail.com',
      'Membership Chair',
      p_subject,
      p_html,
      p_purpose,
      p_member_id
    );
    v_seen := array_append(v_seen, 'lsugrue99@gmail.com');
  end if;

  for v_row in
    select distinct
      lower(btrim(m.email)) as email,
      btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) as full_name
    from public.members m
    where m.merged_into is null
      and coalesce(m.membership_status, 'active') in ('active', 'pending-renewal')
      and m.email is not null
      and position('@' in m.email) > 0
      and exists (
        select 1
        from unnest(regexp_split_to_array(coalesce(m.officer_title, ''), '\s*·\s*')) as seg(part)
        where btrim(seg.part) ilike 'President'
      )
  loop
    if v_row.email = any (v_seen) then
      continue;
    end if;
    v_seen := array_append(v_seen, v_row.email);
    perform public.enqueue_email(
      v_row.email,
      nullif(v_row.full_name, ''),
      p_subject,
      p_html,
      p_purpose,
      p_member_id
    );
  end loop;
end;
$$;

revoke all on function public.kos_queue_membership_chair_and_president(text, text, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) List. Last 4 only. Never id_digits. Notes are redacted before return.
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
  elsif v_bucket = 'background' then
    v_status := 'background-check';
  elsif v_bucket = 'dues' then
    v_status := 'dues-pending';
  elsif v_bucket = 'approved' then
    v_status := 'active';
  elsif v_bucket = 'declined' then
    v_status := 'declined';
  elsif v_bucket = 'archived' then
    v_status := 'archived';
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
      'background', (select count(*) from public.members m
                     where m.merged_into is null and m.membership_status = 'background-check'),
      'dues', (select count(*) from public.members m
               where m.merged_into is null and m.membership_status = 'dues-pending'),
      'approved', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'active'
                     and exists (
                       select 1 from public.membership_application_actions a
                       where a.member_id = m.id and a.action = 'approve'
                     )),
      'declined', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'declined'),
      'archived', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'archived'),
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
        'application_fee_type', q.application_fee_type,
        'partner_first_name', q.partner_first_name,
        'partner_last_name', q.partner_last_name,
        'ssn_last4', q.ssn_last4,
        'partner_ssn_last4', q.partner_ssn_last4,
        'dl_last4', q.dl_last4,
        'partner_dl_last4', q.partner_dl_last4,
        'has_ssn', q.has_ssn,
        'has_dl', q.has_dl,
        'has_partner_ssn', q.has_partner_ssn,
        'has_partner_dl', q.has_partner_dl,
        'full_application_sent_at', q.full_application_sent_at,
        'join_date', q.join_date,
        'created_at', q.created_at
      ) order by q.created_at desc)
      from (
        select m.id, m.first_name, m.last_name, m.email, m.phone,
               m.street_address, m.city, m.state, m.zip,
               public.kos_redact_id_text(m.notes) as notes,
               public.kos_redact_id_text(m.interests) as interests,
               m.membership_status, m.member_role,
               m.application_fee_type, m.partner_first_name, m.partner_last_name,
               m.join_date, m.created_at,
               (select right(i.id_digits, 4)
                  from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'applicant' and i.id_kind = 'ssn'
                 limit 1) as ssn_last4,
               (select right(i.id_digits, 4)
                  from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'partner' and i.id_kind = 'ssn'
                 limit 1) as partner_ssn_last4,
               (select right(i.id_digits, 4)
                  from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'applicant' and i.id_kind = 'dl'
                 limit 1) as dl_last4,
               (select right(i.id_digits, 4)
                  from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'partner' and i.id_kind = 'dl'
                 limit 1) as partner_dl_last4,
               exists (
                 select 1 from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'applicant' and i.id_kind = 'ssn'
               ) as has_ssn,
               exists (
                 select 1 from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'applicant' and i.id_kind = 'dl'
               ) as has_dl,
               exists (
                 select 1 from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'partner' and i.id_kind = 'ssn'
               ) as has_partner_ssn,
               exists (
                 select 1 from public.membership_application_ids i
                 where i.member_id = m.id and i.person_slot = 'partner' and i.id_kind = 'dl'
               ) as has_partner_dl,
               (select max(a.created_at)
                  from public.membership_application_actions a
                 where a.member_id = m.id and a.action = 'full_application_sent'
               ) as full_application_sent_at
        from public.members m
        where m.merged_into is null
          and m.membership_status = v_status
          and (
            v_status <> 'active'
            or exists (
              select 1 from public.membership_application_actions a
              where a.member_id = m.id and a.action = 'approve'
            )
          )
        order by m.created_at desc
        limit 80
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
        select a.id, a.member_id, a.action,
               public.kos_redact_id_text(a.note) as note,
               a.from_status, a.to_status,
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
-- 7) Stage 0 join. Interest only. Chair and President. No ID numbers.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_membership_application(text, text, text, text, text, text, text, text, text);

create or replace function public.submit_membership_application(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_street_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null,
  p_fee_type text default null,
  p_partner_first text default null,
  p_partner_last text default null,
  p_ssn text default null,
  p_partner_ssn text default null
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
  v_fee text := lower(coalesce(nullif(btrim(p_fee_type), ''), ''));
  v_partner_first text := nullif(left(trim(coalesce(p_partner_first, '')), 80), '');
  v_partner_last text := nullif(left(trim(coalesce(p_partner_last, '')), 80), '');
  v_id uuid;
  v_status text;
  v_is_new boolean := false;
  v_open boolean := false;
  v_recent int;
  v_addr text;
  v_html text;
  v_fee_line text;
  v_subject text;
begin
  -- p_ssn and p_partner_ssn stay in the signature so an older join page does not
  -- error. Stage 0 does not store them and does not put them in email.

  if v_first = '' or v_last = '' then
    return jsonb_build_object('ok', false, 'message', 'First and last name are required.');
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'A valid email is required.');
  end if;
  if v_street is null or v_city is null or v_state is null or v_zip is null then
    return jsonb_build_object('ok', false, 'message', 'Please add your mailing address.');
  end if;
  if v_fee = 'couple' then
    v_fee := 'dual';
  end if;
  if v_fee <> '' and v_fee not in ('single', 'dual') then
    return jsonb_build_object('ok', false, 'message', 'Choose single applicant or couple for the application fee.');
  end if;
  if v_fee = 'dual' and (v_partner_first is null or v_partner_last is null) then
    return jsonb_build_object('ok', false, 'message', 'Enter the second applicant''s first and last name.');
  end if;
  if v_fee <> 'dual' then
    v_partner_first := null;
    v_partner_last := null;
  end if;

  select count(*) into v_recent
  from public.members
  where membership_status in ('pending-new', 'prospect', 'background-check', 'dues-pending')
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
      member_role, membership_status,
      application_fee_type, partner_first_name, partner_last_name
    ) values (
      v_first, v_last, v_email, v_phone, v_notes,
      v_street, v_city, v_state, v_zip,
      'prospect', 'pending-new',
      nullif(v_fee, ''), v_partner_first, v_partner_last
    ) returning id into v_id;
    v_is_new := true;
    v_status := 'pending-new';
    v_open := true;
  else
    v_open := v_status in ('prospect', 'pending-new', 'background-check', 'dues-pending');
    update public.members set
      first_name = v_first,
      last_name = v_last,
      phone = coalesce(v_phone, phone),
      notes = coalesce(v_notes, notes),
      street_address = coalesce(v_street, street_address),
      city = coalesce(v_city, city),
      state = coalesce(v_state, state),
      zip = coalesce(v_zip, zip),
      application_fee_type = case when v_open and v_fee <> '' then v_fee else application_fee_type end,
      partner_first_name = case
        when v_open and v_fee = 'dual' then v_partner_first
        when v_open and v_fee = 'single' then null
        else partner_first_name
      end,
      partner_last_name = case
        when v_open and v_fee = 'dual' then v_partner_last
        when v_open and v_fee = 'single' then null
        else partner_last_name
      end,
      updated_at = now()
    where id = v_id;
  end if;

  v_addr := v_street || ', ' || v_city || ', ' || v_state || ' ' || v_zip;
  v_fee_line := case
    when v_fee = 'dual' then 'Application fee: couple, $75. This is the background check fee, not membership dues.'
    when v_fee = 'single' then 'Application fee: single applicant, $50. This is the background check fee, not membership dues.'
    else 'Application fee: $50 single or $75 couple. This is the background check fee, not membership dues.'
  end;

  if v_is_new or v_status in ('prospect', 'pending-new') then
    v_subject := 'Membership interest: ' || public.kos_redact_id_text(v_first || ' ' || v_last);
    v_html :=
      '<p>Someone asked to join the Krewe of Shamrock. This is interest only. Please call them.</p><p><strong>'
      || public.kos_email_plain(v_first) || ' ' || public.kos_email_plain(v_last) || '</strong><br/>'
      || public.kos_email_plain(v_email)
      || case when v_phone is not null then '<br/>' || public.kos_email_plain(v_phone) else '' end
      || '<br/>' || public.kos_email_plain(v_addr) || '</p>'
      || case
           when v_fee = 'dual' then '<p>Second applicant: '
             || public.kos_email_plain(coalesce(v_partner_first, '')) || ' '
             || public.kos_email_plain(coalesce(v_partner_last, '')) || '</p>'
           else ''
         end
      || '<p>' || public.kos_email_plain(v_fee_line) || '</p>'
      || case
           when v_notes is not null then '<p>' || replace(public.kos_email_plain(v_notes), E'\n', '<br/>') || '</p>'
           else ''
         end
      || '<p>After the call, sign in to the Member Hub, open Membership Applications, and choose Move to background check. That emails them a secure link to the full application. Membership dues are invoiced when they submit that form and begin the check. This email does not include a Social Security number or a driver''s license number.</p>'
      || '<p><a href="https://www.kreweofshamrock.com/members.html#applications">Open Membership Applications</a></p>';
    perform public.kos_queue_membership_chair_and_president(
      v_subject,
      v_html,
      'membership_interest',
      v_id
    );
  end if;

  if v_status in ('active', 'pending-renewal', 'lapsed') then
    return jsonb_build_object(
      'ok', true,
      'message', 'You are already on our roster. We updated your mailing address. Questions: secretary@kreweofshamrock.com'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'We received your interest in joining. Someone from the Krewe will call you.'
  );
end;
$$;

grant execute on function public.submit_membership_application(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) Chair sends the secure link. Raw token is not returned.
-- ---------------------------------------------------------------------------
create or replace function public.send_membership_full_application(
  p_member_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.members%rowtype;
  v_actor record;
  v_note text := nullif(left(btrim(public.kos_redact_id_text(coalesce(p_note, ''))), 1000), '');
  v_token text;
  v_hash text;
  v_link_id uuid;
  v_url text;
  v_html text;
  v_mail uuid;
  v_name text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if to_regprocedure('public.kos_membership_prospect_emails_enabled()') is not null
     and not public.kos_membership_prospect_emails_enabled() then
    return jsonb_build_object(
      'ok', false,
      'emailed', false,
      'emails_paused', true,
      'message', 'Prospect email is paused while this pipeline is in development. No full-application link was sent.'
    );
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
  if rec.membership_status not in (
    'pending-new', 'background-check', 'dues-pending', 'pending-renewal', 'prospect'
  ) then
    return jsonb_build_object('ok', false, 'message', 'That application is no longer waiting for review.');
  end if;
  if rec.email is null or position('@' in rec.email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'That application has no email address to send the link to.');
  end if;

  select * into v_actor from public._officer_actor();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := public.kos_application_token_hash(v_token);
  insert into public.membership_application_links (member_id, token_hash, expires_at, created_by)
  values (rec.id, v_hash, now() + interval '21 days', auth.uid())
  returning id into v_link_id;

  v_url := 'https://www.kreweofshamrock.com/membership-full-application.html?token=' || v_token;
  v_name := btrim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, ''));
  if to_regprocedure('public.kos_prospect_background_check_email_html(text,text)') is not null then
    v_html := public.kos_prospect_background_check_email_html(
      coalesce(nullif(btrim(rec.first_name), ''), 'friend'),
      v_url
    );
  else
    v_html :=
      '<p>Dear ' || public.kos_email_plain(coalesce(nullif(btrim(rec.first_name), ''), 'friend')) || ',</p>'
      || '<p>The Membership Chair moved your application to the background check.</p>'
      || '<p>Open this secure link to finish the background-check form. It asks for a driver''s license number and a Social Security number. The board uses SSN and driver''s license for the background check. Your information is held confidentially.</p>'
      || '<p><a href="' || v_url || '">Open the full application</a></p>'
      || '<p>This email does not include those numbers. The link expires in 21 days. If you did not ask to join, you can ignore this message.</p>'
      || '<p>Sláinte!</p>';
  end if;

  declare
    v_subject text := 'Your Krewe of Shamrock application';
  begin
    if to_regprocedure('public.kos_joining_packet_email_subject()') is not null then
      v_subject := coalesce(nullif(btrim(public.kos_joining_packet_email_subject()), ''), v_subject);
    end if;
    v_mail := public.enqueue_email(
      rec.email,
      nullif(v_name, ''),
      v_subject,
      v_html,
      'membership_full_application',
      rec.id
    );
  end;

  if v_mail is null then
    delete from public.membership_application_links where id = v_link_id;
    return jsonb_build_object(
      'ok', false,
      'message', 'Could not email the full application link. Nothing was sent.'
    );
  end if;

  update public.membership_application_links
     set expires_at = now()
   where member_id = rec.id
     and id <> v_link_id
     and used_at is null
     and expires_at > now();

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, 'full_application_sent', v_note, rec.membership_status, rec.membership_status,
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  return jsonb_build_object(
    'ok', true,
    'emailed', true,
    'message', 'Full application sent. We emailed them a secure link to finish the full application, the background check payment, and each membership level with a short note and a pay link. The email does not include a Social Security number or a driver''s license number.'
  );
end;
$$;

revoke all on function public.send_membership_full_application(uuid, text) from public, anon;
grant execute on function public.send_membership_full_application(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Token page lookup. No ID numbers in the response.
-- ---------------------------------------------------------------------------
create or replace function public.lookup_membership_full_application(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_hash text;
  v_link public.membership_application_links%rowtype;
  rec public.members%rowtype;
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'ok', false,
      'message', 'This link is not valid or has expired. Ask the Membership Chair to send a new one.'
    );
  end if;

  v_hash := public.kos_application_token_hash(v_token);
  select * into v_link
  from public.membership_application_links
  where token_hash = v_hash;

  if not found or v_link.expires_at <= now() then
    return jsonb_build_object(
      'ok', false,
      'message', 'This link is not valid or has expired. Ask the Membership Chair to send a new one.'
    );
  end if;

  select * into rec
  from public.members
  where id = v_link.member_id and merged_into is null;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'This link is not valid or has expired. Ask the Membership Chair to send a new one.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_submitted', v_link.used_at is not null,
    'fee_type', rec.application_fee_type,
    'applicant_first', rec.first_name,
    'partner_first', case when rec.application_fee_type = 'dual' then rec.partner_first_name else null end
  );
end;
$$;

revoke all on function public.lookup_membership_full_application(text) from public;
grant execute on function public.lookup_membership_full_application(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) Token page save. Couple requires Applicant 1 and Applicant 2.
--     Returned message and queued mail do not contain the numbers.
-- ---------------------------------------------------------------------------
create or replace function public.submit_membership_full_application(
  p_token text,
  p_dl text,
  p_ssn text,
  p_partner_dl text default null,
  p_partner_ssn text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_hash text;
  v_link public.membership_application_links%rowtype;
  rec public.members%rowtype;
  v_dl text;
  v_ssn text;
  v_partner_dl text;
  v_partner_ssn text;
  v_fee text;
  v_name text;
  v_html text;
  v_fee_line text;
  v_subject text;
  v_invoice jsonb;
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'ok', false,
      'message', 'This link is not valid or has expired. Ask the Membership Chair to send a new one.'
    );
  end if;

  v_hash := public.kos_application_token_hash(v_token);
  select * into v_link
  from public.membership_application_links
  where token_hash = v_hash
  for update;

  if not found or v_link.expires_at <= now() then
    return jsonb_build_object(
      'ok', false,
      'message', 'This link is not valid or has expired. Ask the Membership Chair to send a new one.'
    );
  end if;
  if v_link.used_at is not null then
    return jsonb_build_object(
      'ok', false,
      'message', 'We already received this full application. Someone from the Krewe will follow up.'
    );
  end if;

  select * into rec
  from public.members
  where id = v_link.member_id and merged_into is null
  for update;

  if not found or rec.membership_status not in (
    'pending-new', 'prospect', 'background-check', 'dues-pending'
  ) then
    return jsonb_build_object(
      'ok', false,
      'message', 'This application is no longer open for the background check.'
    );
  end if;

  v_dl := public.kos_dl_token(p_dl);
  v_ssn := public.kos_ssn_digits(p_ssn);
  if v_dl is null then
    return jsonb_build_object('ok', false, 'message', 'Enter the driver''s license number using letters and numbers only.');
  end if;
  if v_ssn is null then
    return jsonb_build_object('ok', false, 'message', 'Enter a 9 digit Social Security number.');
  end if;

  v_fee := coalesce(rec.application_fee_type, '');
  if v_fee = 'dual' then
    v_partner_dl := public.kos_dl_token(p_partner_dl);
    v_partner_ssn := public.kos_ssn_digits(p_partner_ssn);
    if v_partner_dl is null or v_partner_ssn is null then
      return jsonb_build_object(
        'ok', false,
        'message', 'A couple application needs a driver''s license number and a 9 digit Social Security number for Applicant 2.'
      );
    end if;
  end if;

  begin
    perform public.kos_upsert_application_id(rec.id, 'applicant', 'dl', v_dl);
    perform public.kos_upsert_application_id(rec.id, 'applicant', 'ssn', v_ssn);
    if v_fee = 'dual' then
      perform public.kos_upsert_application_id(rec.id, 'partner', 'dl', v_partner_dl);
      perform public.kos_upsert_application_id(rec.id, 'partner', 'ssn', v_partner_ssn);
    end if;
    update public.membership_application_links
       set used_at = now()
     where id = v_link.id;
    insert into public.membership_application_actions (
      member_id, action, note, from_status, to_status, actor_name
    ) values (
      rec.id, 'full_application_received', 'Full application received.',
      rec.membership_status, rec.membership_status, 'Applicant'
    );
  exception
    when others then
      return jsonb_build_object(
        'ok', false,
        'message', 'Could not save the full application. Please try again.'
      );
  end;

  v_name := btrim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, ''));
  v_html :=
    '<p>Dear ' || public.kos_email_plain(coalesce(nullif(btrim(rec.first_name), ''), 'friend')) || ',</p>'
    || '<p>We received the background-check information on your Krewe of Shamrock application.</p>'
    || '<p>The board uses SSN and driver''s license for the background check. Your information is held confidentially.</p>'
    || '<p>This email does not include those numbers.</p>'
    || '<p>Sláinte!</p>';
  perform public.enqueue_email(
    rec.email,
    nullif(v_name, ''),
    'Krewe of Shamrock application received',
    v_html,
    'membership_full_application_received',
    rec.id
  );

  v_fee_line := case
    when v_fee = 'dual' then 'Application fee: couple, $75. This is the background check fee, not membership dues.'
    when v_fee = 'single' then 'Application fee: single applicant, $50. This is the background check fee, not membership dues.'
    else 'Application fee: $50 single or $75 couple. This is the background check fee, not membership dues.'
  end;
  v_subject := 'Full application received: ' || public.kos_redact_id_text(v_name);
  v_html :=
    '<p>' || public.kos_email_plain(v_name) || ' submitted the full application for the background check.</p>'
    || '<p>' || public.kos_email_plain(coalesce(rec.email, '')) || '</p>'
    || '<p>' || public.kos_email_plain(v_fee_line) || '</p>'
    || '<p>Sign in to the Member Hub and open Membership Applications. Lists show the last 4 only.</p>'
    || '<p><a href="https://www.kreweofshamrock.com/members.html#applications">Open Membership Applications</a></p>'
    || '<p>This email does not include a Social Security number or a driver''s license number.</p>';

  perform public.kos_queue_membership_chair_and_president(
    v_subject,
    v_html,
    'membership_full_application_received',
    rec.id
  );

  -- The member begins the background check by submitting this form.
  -- That is when the level-based membership dues invoice is queued.
  -- Move to background check only emails this link. It does not invoice.
  v_invoice := null;
  if to_regprocedure('public.kos_queue_level_dues_invoice(uuid)') is not null then
    v_invoice := public.kos_queue_level_dues_invoice(rec.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'We received your driver''s license number and Social Security number. The board uses SSN and driver''s license for the background check. Your information is held confidentially.'
      || case
           when coalesce(v_invoice->>'emailed', '') = 'true'
             then ' We emailed your membership dues invoice. That is membership dues, not the application fee.'
           else ''
         end
  );
end;
$$;

revoke all on function public.submit_membership_full_application(text, text, text, text, text) from public;
grant execute on function public.submit_membership_full_application(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11) One full value for a reviewer. Writes an audit row with the last 4 only.
-- ---------------------------------------------------------------------------
drop function if exists public.reveal_membership_application_id(uuid, text);

create or replace function public.reveal_membership_application_id(
  p_member_id uuid,
  p_slot text default 'applicant',
  p_kind text default 'ssn'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_slot text := lower(coalesce(nullif(btrim(p_slot), ''), 'applicant'));
  v_kind text := lower(coalesce(nullif(btrim(p_kind), ''), 'ssn'));
  v_value text;
  v_actor record;
  v_note text;
  v_shown text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if v_slot not in ('applicant', 'partner') then
    return jsonb_build_object('ok', false, 'message', 'That person is not on the application.');
  end if;
  if v_kind not in ('ssn', 'dl') then
    return jsonb_build_object('ok', false, 'message', 'That ID type is not on the application.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing application.');
  end if;

  select i.id_digits into v_value
  from public.membership_application_ids i
  where i.member_id = p_member_id
    and i.person_slot = v_slot
    and i.id_kind = v_kind
  limit 1;

  if v_value is null then
    return jsonb_build_object(
      'ok', false,
      'message', case
        when v_kind = 'dl' then 'No driver''s license number is on file for that person.'
        else 'No Social Security number is on file for that person.'
      end
    );
  end if;

  if v_kind = 'ssn' then
    v_shown := substr(v_value, 1, 3) || '-' || substr(v_value, 4, 2) || '-' || substr(v_value, 6, 4);
  else
    v_shown := v_value;
  end if;

  v_note := case
    when v_kind = 'dl' then 'Opened ' || v_slot || ' driver''s license number. Last 4 only: ' || right(v_value, 4) || '.'
    else 'Opened ' || v_slot || ' Social Security number. Last 4 only: ' || right(v_value, 4) || '.'
  end;

  select * into v_actor from public._officer_actor();
  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  )
  select p_member_id, 'id_revealed', v_note, m.membership_status, m.membership_status,
         v_actor.uid, v_actor.email, v_actor.display_name
  from public.members m
  where m.id = p_member_id;

  return jsonb_build_object(
    'ok', true,
    'slot', v_slot,
    'kind', v_kind,
    'last4', right(v_value, 4),
    'ssn', case when v_kind = 'ssn' then v_shown else null end,
    'dl', case when v_kind = 'dl' then v_shown else null end
  );
end;
$$;

revoke all on function public.reveal_membership_application_id(uuid, text, text) from public, anon;
grant execute on function public.reveal_membership_application_id(uuid, text, text) to authenticated;

revoke all on function public.list_membership_applications(text) from public, anon;
grant execute on function public.list_membership_applications(text) to authenticated;
