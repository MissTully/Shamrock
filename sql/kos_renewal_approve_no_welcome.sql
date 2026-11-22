-- Applied in production (Nov 2026).
-- Renewal approvals do not send the welcome letter.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Run after sql/kos_membership_pipeline_dashboard.sql.
--   Safe to run again. Applying this file does not send email and does not
--   change existing rows.
--
-- Replaces public._apply_membership_application_decision(uuid, text, text).
-- Signature, SECURITY DEFINER, search_path, and grants stay the same.
-- A dues-pending approval still queues the welcome letter, including
-- https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR.
-- A pending-renewal approval sets the member active and queues no email.
--
-- Rollback: run the _apply_membership_application_decision block from
-- sql/kos_membership_pipeline_dashboard.sql again.

create or replace function public._apply_membership_application_decision(
  p_member_id uuid,
  p_action text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $decision$
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
  if p_action not in ('approve', 'decline', 'archive', 'background_check', 'start_background_check', 'dues_pending', 'next_step_sent') then
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
  if rec.membership_status not in (
    'pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending', 'pending-renewal', 'prospect'
  ) then
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
  elsif p_action = 'archive' then
    v_to := 'archived';
    update public.members
       set membership_status = 'archived',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'background_check' then
    v_to := 'background-check';
    update public.members
       set membership_status = 'background-check',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'start_background_check' then
    v_to := 'bg_in_process';
    update public.members
       set membership_status = 'bg_in_process',
           updated_at = now()
     where id = rec.id;
  elsif p_action = 'dues_pending' then
    v_to := 'dues-pending';
    update public.members
       set membership_status = 'dues-pending',
           updated_at = now()
     where id = rec.id;
  else
    v_to := rec.membership_status;
  end if;

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, p_action, v_note, rec.membership_status, v_to,
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  v_name := btrim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, ''));

  if p_action = 'approve' and rec.membership_status = 'dues-pending' then
    v_subject := 'Welcome to the Krewe of Shamrock';
    v_html :=
      '<p>Dear ' || public.kos_html_text(coalesce(nullif(btrim(rec.first_name), ''), 'friend')) || ',</p>'
      || '<p>Welcome. Your membership is approved, subject to final ratification by the Board of Directors, and you are on the roster.</p>'
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
      || '<p>When you are signed in, watch the member website training video: '
      || '<a href="https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR">Member Hub training</a>.</p>'
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
      v_message := 'Approved. They are an active member now. We emailed a welcome note with the Member Hub login steps and the training video: https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR';
    else
      v_message := 'Approved. They are an active member now. We could not email them, so please tell them the next step: open the Member Hub, tap Create or reset your password, and use the email on this application. The training video is https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR';
    end if;
  elsif p_action = 'approve' and rec.membership_status = 'pending-renewal' then
    v_message := 'Renewed. They are active again and keep their current Member Hub login. No email was sent.';
  elsif p_action = 'approve' then
    v_message := 'Approved. They are an active member again. They can sign in with the Member Hub login they already use.';
  elsif p_action = 'decline' then
    v_message := 'Declined. Their record stays on file and is off the new-application list. Nothing was deleted.';
  elsif p_action = 'archive' then
    v_message := 'Withdrawn. Their record stays on file and is off the new-application list. Nothing was deleted.';
  elsif p_action = 'background_check' then
    v_message := 'Called. The background check email is the next message.';
  elsif p_action = 'start_background_check' then
    v_message := 'Background check in process. Copy the driver''s license and Social Security number into the background check site. No email was sent.';
  elsif p_action = 'dues_pending' then
    v_message := 'Induction pending. The dues link and the meeting invitation are the next email.';
  else
    v_message := 'Next step sent. The note is on the application history.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', v_message,
    'emailed', v_emailed,
    'status', v_to
  );
end;
$decision$;

revoke all on function public._apply_membership_application_decision(uuid, text, text) from public, anon, authenticated;

