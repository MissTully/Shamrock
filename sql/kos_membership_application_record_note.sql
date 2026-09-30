-- Save a Membership Applications "Note for the record" without moving
-- the stage and without sending the joining packet.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Melissa applies this file. Do not apply it from the site deploy.
--   Run after sql/kos_joining_packet_email_template.sql.
--   Safe to run again.
--
-- Does not turn prospect email on. This file never updates
-- kos_runtime_flags key membership_prospect_emails.
-- It does not change the joining packet draft, the finish link, or pay buttons.
--
-- Officer notes are rows in membership_application_actions with action
-- 'note'. from_status and to_status stay on the current membership_status.
-- members.notes stays the applicant's own note (shown as "Their note").
--
-- If you run sql/kos_membership_application_staged.sql again, run this
-- file again afterward. That file replaces the action check and the list
-- function, and a second run of it drops 'note' until this file is applied.

-- ---------------------------------------------------------------------------
-- 1) Allow a note-only history row. Existing actions stay valid.
-- ---------------------------------------------------------------------------
alter table public.membership_application_actions
  drop constraint if exists membership_application_actions_action_check;
alter table public.membership_application_actions
  add constraint membership_application_actions_action_check
  check (action in (
    'approve', 'decline', 'archive',
    'background_check', 'dues_pending', 'next_step_sent',
    'full_application_sent', 'full_application_received', 'id_revealed',
    'note'
  ));

-- ---------------------------------------------------------------------------
-- 2) Save the note. Does not update members. Does not queue email.
-- ---------------------------------------------------------------------------
create or replace function public.save_membership_application_note(
  p_member_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $save$
declare
  rec public.members%rowtype;
  v_actor record;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing application.');
  end if;
  if v_note is null then
    return jsonb_build_object('ok', false, 'message', 'Write a note before saving.');
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

  select * into v_actor from public._officer_actor();

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, 'note', v_note, rec.membership_status, rec.membership_status,
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Note saved on the record. Their stage is the same, and the joining packet was not sent.',
    'status', rec.membership_status
  );
end;
$save$;

revoke all on function public.save_membership_application_note(uuid, text) from public, anon;
grant execute on function public.save_membership_application_note(uuid, text) to authenticated;

comment on function public.save_membership_application_note(uuid, text) is
  'Reviewer-only note on a membership application. Writes membership_application_actions.action = note. Does not change members.notes or membership_status and does not send email.';

-- ---------------------------------------------------------------------------
-- 3) List. Same buckets as before, plus the latest officer record note.
--    members.notes remains the applicant note. record_note is the latest
--    action = note row, redacted the same way as other history notes.
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
$$;

revoke all on function public.list_membership_applications(text) from public, anon;
grant execute on function public.list_membership_applications(text) to authenticated;

