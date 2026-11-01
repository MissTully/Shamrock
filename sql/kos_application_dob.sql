-- Date of birth on the full membership application.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
-- The owner pastes this file. Do not apply it from the site deploy.
--   Project: oazwkwflgbthojvnclfc
--   Run after sql/kos_membership_background_check_invoice.sql
--   and sql/kos_membership_application_record_note.sql.
--   Safe to run again.
--
-- Applicant 1 date of birth is saved on members.birthday.
-- Applicant 2 (the partner) date of birth is membership_application_ids.dob.
-- That column sits on the same table as the partner driver's license and
-- Social Security number. Row level security stays on, and anon and
-- authenticated still have no grants. Reviewers read both dates from
-- list_membership_applications. The browser cannot select the partner date.
--
-- Mail from this save does not include a date of birth, a Social Security
-- number, or a driver's license number.
--
-- If you run sql/kos_membership_background_check_invoice.sql again, or
-- sql/kos_membership_application_record_note.sql again, run this file again.
-- The invoice file replaces the full-application save. The record-note file
-- replaces the chair list. This file puts the date fields back on both.
-- It does not turn prospect email on. It does not change the joining packet.

-- ---------------------------------------------------------------------------
-- 1) Applicant column already used by profiles, plus the private partner column.
-- ---------------------------------------------------------------------------
do $guard$
begin
  if to_regclass('public.members') is null
     or to_regclass('public.membership_application_ids') is null then
    raise exception 'Run the membership application SQL files before sql/kos_application_dob.sql.';
  end if;
end
$guard$;

alter table public.members add column if not exists birthday date;

alter table public.membership_application_ids
  add column if not exists dob date;

alter table public.membership_application_ids
  drop constraint if exists membership_application_ids_dob_check;
alter table public.membership_application_ids
  add constraint membership_application_ids_dob_check
  check (dob is null or dob >= date '1900-01-01');

alter table public.membership_application_ids enable row level security;
revoke all on table public.membership_application_ids from public, anon, authenticated;

comment on column public.members.birthday is
  'Date of birth. The full application writes Applicant 1 here. Profile save can also set it. The directory shows month and day only. The partner date of birth is not stored in this column.';

comment on column public.membership_application_ids.dob is
  'Partner date of birth for the background check. Set on partner rows only. Null on applicant rows. Applicant 1 uses members.birthday. No direct API read. Reviewers see it from list_membership_applications.';

comment on table public.membership_application_ids is
  'Background-check Social Security numbers, driver''s license numbers, and the partner date of birth (dob). No direct API read. Lists show the last 4 of each ID. Full ID values only via reveal_membership_application_id for application reviewers. Partner date of birth is returned to reviewers by list_membership_applications. Applicant date of birth is members.birthday. Reveal of an ID is audited.';

-- ---------------------------------------------------------------------------
-- 2) Token page save. Applicant 1 date is required. Partner date is required
--    only when the application fee type is dual.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_membership_full_application(text, text, text, text, text);
drop function if exists public.submit_membership_full_application(text, text, text, text, text, date, date);

create or replace function public.submit_membership_full_application(
  p_token text,
  p_dl text,
  p_ssn text,
  p_partner_dl text default null,
  p_partner_ssn text default null,
  p_birthday date default null,
  p_partner_birthday date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $submit$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_hash text;
  v_link public.membership_application_links%rowtype;
  rec public.members%rowtype;
  v_dl text;
  v_ssn text;
  v_partner_dl text;
  v_partner_ssn text;
  v_birthday date;
  v_partner_birthday date;
  v_fee text;
  v_name text;
  v_html text;
  v_fee_line text;
  v_subject text;
  v_invoice jsonb;
  v_rows integer;
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

  v_birthday := p_birthday;
  if v_birthday is null or v_birthday > current_date or v_birthday < date '1900-01-01' then
    return jsonb_build_object('ok', false, 'message', 'Enter a date of birth.');
  end if;

  v_fee := coalesce(rec.application_fee_type, '');
  if v_fee = 'dual' then
    v_partner_dl := public.kos_dl_token(p_partner_dl);
    v_partner_ssn := public.kos_ssn_digits(p_partner_ssn);
    v_partner_birthday := p_partner_birthday;
    if v_partner_dl is null or v_partner_ssn is null
       or v_partner_birthday is null
       or v_partner_birthday > current_date
       or v_partner_birthday < date '1900-01-01' then
      return jsonb_build_object(
        'ok', false,
        'message', 'A couple application needs a driver''s license number, a 9 digit Social Security number, and a date of birth for Applicant 2.'
      );
    end if;
  end if;

  begin
    perform public.kos_upsert_application_id(rec.id, 'applicant', 'dl', v_dl);
    perform public.kos_upsert_application_id(rec.id, 'applicant', 'ssn', v_ssn);
    update public.members
       set birthday = v_birthday
     where id = rec.id;
    get diagnostics v_rows = row_count;
    if v_rows < 1 then
      raise exception 'date of birth was not stored';
    end if;
    if v_fee = 'dual' then
      perform public.kos_upsert_application_id(rec.id, 'partner', 'dl', v_partner_dl);
      perform public.kos_upsert_application_id(rec.id, 'partner', 'ssn', v_partner_ssn);
      update public.membership_application_ids
         set dob = v_partner_birthday,
             updated_at = now()
       where member_id = rec.id
         and person_slot = 'partner';
      get diagnostics v_rows = row_count;
      if v_rows < 1 then
        raise exception 'partner date of birth was not stored';
      end if;
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
    || '<p>The board uses date of birth, SSN, and driver''s license for the background check. Your information is held confidentially.</p>'
    || '<p>This email does not include a date of birth or those numbers.</p>'
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
    || '<p>Sign in to the Member Hub and open Membership Applications. Lists show the last 4 of each ID only. Dates of birth are on the card.</p>'
    || '<p><a href="https://www.kreweofshamrock.com/members.html#applications">Open Membership Applications</a></p>'
    || '<p>This email does not include a date of birth, a Social Security number, or a driver''s license number.</p>';

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
    'message', 'We received your date of birth, driver''s license number, and Social Security number. The board uses date of birth, SSN, and driver''s license for the background check. Your information is held confidentially.'
      || case
           when coalesce(v_invoice->>'emailed', '') = 'true'
             then ' We emailed your membership dues invoice. That is membership dues, not the application fee.'
           else ''
         end
  );
end;
$submit$;

revoke all on function public.submit_membership_full_application(text, text, text, text, text, date, date) from public;
grant execute on function public.submit_membership_full_application(text, text, text, text, text, date, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Chair list. Same buckets and record note as the record-note file,
--    plus both dates of birth. ID numbers stay last-4 only.
-- ---------------------------------------------------------------------------
create or replace function public.list_membership_applications(p_bucket text default 'new')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $list$
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
        'birthday', q.birthday,
        'partner_birthday', q.partner_birthday,
        'ssn_last4', q.ssn_last4,
        'partner_ssn_last4', q.partner_ssn_last4,
        'dl_last4', q.dl_last4,
        'partner_dl_last4', q.partner_dl_last4,
        'has_ssn', q.has_ssn,
        'has_dl', q.has_dl,
        'has_partner_ssn', q.has_partner_ssn,
        'has_partner_dl', q.has_partner_dl,
        'full_application_sent_at', q.full_application_sent_at,
        'record_note', q.record_note,
        'record_note_by', q.record_note_by,
        'record_note_at', q.record_note_at,
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
               to_char(m.birthday, 'YYYY-MM-DD') as birthday,
               to_char((
                 select i.dob
                   from public.membership_application_ids i
                  where i.member_id = m.id
                    and i.person_slot = 'partner'
                    and i.dob is not null
                  order by i.updated_at desc
                  limit 1
               ), 'YYYY-MM-DD') as partner_birthday,
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
               ) as full_application_sent_at,
               rn.record_note,
               rn.record_note_by,
               rn.record_note_at
        from public.members m
        left join lateral (
          select public.kos_redact_id_text(n.note) as record_note,
                 n.actor_name as record_note_by,
                 n.created_at as record_note_at
            from public.membership_application_actions n
           where n.member_id = m.id
             and n.action = 'note'
             and nullif(btrim(coalesce(n.note, '')), '') is not null
           order by n.created_at desc
           limit 1
        ) rn on true
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
$list$;

revoke all on function public.list_membership_applications(text) from public, anon;
grant execute on function public.list_membership_applications(text) to authenticated;
