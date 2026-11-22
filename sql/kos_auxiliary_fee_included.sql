-- Auxiliary dues include the background check fee.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Run after sql/kos_join_level_interest.sql.
--   Safe to run again. Applying this file does not send email and does not
--   change existing rows. kos_dues_catalog is not changed.
--
-- Adds public.kos_mark_background_fee_included(uuid, text). Reviewers only.
-- Allowed only when membership_status is background-check and membership_level
-- is auxiliary. Moves that row, and a linked partner who is also in
-- background-check, to bg_paid. Logs background_check_fee_included. No email.
--
-- Replaces public.kos_prospect_background_check_email_html(text, text, jsonb)
-- and public.send_membership_full_application(uuid, text). When the template
-- jsonb membership_level is auxiliary, the fee section says the $200 dues
-- include the background check. That Auxiliary letter does not also show the
-- $50 or $75 pay buttons. send_membership_full_application passes
-- membership_level the same way it passes fee_type.
--
-- Rollback: drop function public.kos_mark_background_fee_included(uuid, text);
-- then run kos_prospect_background_check_email_html from
-- sql/kos_membership_pipeline_dashboard.sql and send_membership_full_application
-- from sql/kos_join_couple_interest.sql again.


alter table public.membership_application_actions
  drop constraint if exists membership_application_actions_action_check;
alter table public.membership_application_actions
  add constraint membership_application_actions_action_check
  check (action in (
    'approve', 'decline', 'archive',
    'background_check', 'background_check_paid', 'start_background_check',
    'dues_pending', 'dues_paid',
    'next_step_sent',
    'full_application_sent', 'full_application_received', 'id_revealed',
    'note', 'renewed',
    'level_set', 'background_check_fee_included'
  ));


create or replace function public.kos_mark_background_fee_included(
  p_member_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fee$
declare
  rec public.members%rowtype;
  v_actor record;
  v_partner uuid;
  v_partner_status text;
  v_note text := 'Auxiliary: background check fee included in the $200 dues.';
  v_extra text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
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
  if lower(btrim(coalesce(rec.membership_level, ''))) is distinct from 'auxiliary' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Auxiliary: fee included applies only when the membership level is Auxiliary.'
    );
  end if;
  if rec.membership_status is distinct from 'background-check' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Auxiliary: fee included applies only while the background check fee is pending.'
    );
  end if;

  if v_extra is not null then
    v_note := v_note || ' ' || v_extra;
  end if;

  update public.members
     set membership_status = 'bg_paid',
         updated_at = now()
   where id = rec.id;

  select * into v_actor from public._officer_actor();

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, 'background_check_fee_included', v_note, rec.membership_status, 'bg_paid',
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  v_partner := rec.partner_member_id;
  if v_partner is null and to_regprocedure('public.kos_match_application_partner(uuid)') is not null then
    v_partner := public.kos_match_application_partner(rec.id);
  end if;
  if v_partner is not null and v_partner is distinct from rec.id then
    select m.membership_status into v_partner_status
      from public.members m
     where m.id = v_partner
       and m.merged_into is null
     for update;
    if found and v_partner_status = 'background-check' then
      update public.members
         set membership_status = 'bg_paid',
             updated_at = now()
       where id = v_partner;
      insert into public.membership_application_actions (
        member_id, action, note, from_status, to_status,
        actor_uid, actor_email, actor_name
      ) values (
        v_partner, 'background_check_fee_included', v_note, v_partner_status, 'bg_paid',
        v_actor.uid, v_actor.email, v_actor.display_name
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'emailed', false,
    'status', 'bg_paid',
    'message', 'Moved to Background check fee paid. Auxiliary dues ($200) include the background check fee. No email was sent.'
  );
end;
$fee$;

revoke all on function public.kos_mark_background_fee_included(uuid, text) from public, anon;
grant execute on function public.kos_mark_background_fee_included(uuid, text) to authenticated;

comment on function public.kos_mark_background_fee_included(uuid, text) is
  'Reviewer moves an Auxiliary application from background-check to bg_paid because the $200 dues include the fee. The linked partner in background-check moves too. No email.';

create or replace function public.kos_prospect_background_check_email_html(
  p_first_name text,
  p_application_url text,
  p_template jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $html$
declare
  v_name text := coalesce(nullif(btrim(p_first_name), ''), 'friend');
  v_app text := btrim(coalesce(p_application_url, ''));
  v_html text := '';
  v_bg jsonb := '{}'::jsonb;
  v_item jsonb;
  v_key text;
  v_label text;
  v_explainer text;
  v_button text;
  v_link text;
  v_amount numeric;
  v_money text;
  v_fallback_amount numeric;
  v_fallback_explainer text;
  v_btn_style text := 'display:inline-block;background:#14532d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;';
  v_defaults jsonb := public.kos_joining_packet_email_defaults();
  v_tpl jsonb;
  v_greeting text;
  v_intro text;
  v_finish_heading text;
  v_finish_body text;
  v_finish_after text;
  v_fee_heading text;
  v_fee_intro text;
  v_dues_heading text;
  v_dues_intro text;
  v_closing text;
  v_signoff text;
  v_apply text;
  v_member_level text;
begin
  if v_app !~ '^https://www\.kreweofshamrock\.com/membership-full-application\.html\?token=[0-9a-f]{64}$' then
    v_app := '';
  end if;

  v_apply := lower(btrim(coalesce(p_template->>'fee_type', '')));
  if v_apply in ('couple', 'dual') then
    v_apply := 'dual';
  elsif v_apply = 'single' then
    v_apply := 'single';
  else
    v_apply := '';
  end if;
  v_member_level := lower(btrim(coalesce(p_template->>'membership_level', '')));
  v_tpl := coalesce(p_template, '{}'::jsonb) - 'fee_type' - 'membership_level';
  if (p_template is null or v_tpl = '{}'::jsonb)
     and to_regprocedure('public.kos_joining_packet_email_copy()') is not null then
    v_tpl := public.kos_joining_packet_email_copy();
  end if;

  v_greeting := coalesce(nullif(btrim(v_tpl->>'greeting'), ''), v_defaults->>'greeting');
  v_intro := coalesce(nullif(btrim(v_tpl->>'intro'), ''), v_defaults->>'intro');
  v_finish_heading := coalesce(nullif(btrim(v_tpl->>'finish_heading'), ''), v_defaults->>'finish_heading');
  v_finish_body := coalesce(nullif(btrim(v_tpl->>'finish_body'), ''), v_defaults->>'finish_body');
  v_finish_after := coalesce(nullif(btrim(v_tpl->>'finish_after'), ''), v_defaults->>'finish_after');
  v_fee_heading := coalesce(nullif(btrim(v_tpl->>'fee_heading'), ''), v_defaults->>'fee_heading');
  v_fee_intro := coalesce(nullif(btrim(v_tpl->>'fee_intro'), ''), v_defaults->>'fee_intro');
  v_dues_heading := coalesce(nullif(btrim(v_tpl->>'dues_heading'), ''), v_defaults->>'dues_heading');
  v_dues_intro := coalesce(nullif(btrim(v_tpl->>'dues_intro'), ''), v_defaults->>'dues_intro');
  v_closing := coalesce(nullif(btrim(v_tpl->>'closing'), ''), v_defaults->>'closing');
  v_signoff := coalesce(nullif(btrim(v_tpl->>'signoff'), ''), v_defaults->>'signoff');
  if v_dues_intro ilike '%use that level%' or v_dues_intro ilike '%pay button%' and v_dues_intro ilike '%each level%' then
    v_dues_heading := v_defaults->>'dues_heading';
    v_dues_intro := v_defaults->>'dues_intro';
  end if;

  if to_regclass('public.kos_runtime_flags') is not null then
    select coalesce(value, '{}'::jsonb) into v_bg
      from public.kos_runtime_flags
     where key = 'background_check_payments';
    v_bg := coalesce(v_bg, '{}'::jsonb);
  end if;

  v_html :=
    '<p>' || public.kos_joining_packet_fill(v_greeting, v_name) || '</p>'
    || '<p>' || public.kos_joining_packet_fill(v_intro, v_name) || '</p>'
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">'
    || public.kos_joining_packet_fill(v_finish_heading, v_name) || '</h2>'
    || '<p>' || public.kos_joining_packet_fill(v_finish_body, v_name) || '</p>';

  if v_app <> '' then
    v_html := v_html
      || '<p style="margin:8px 0 18px;"><a href="' || v_app || '" style="' || v_btn_style || '">Finish your application</a></p>';
  else
    v_html := v_html
      || '<p>Your private link isn''t in this note. Please ask the Membership Chair to send it again, and we''ll get you sorted.</p>';
  end if;

  v_html := v_html
    || '<p>' || public.kos_joining_packet_fill(v_finish_after, v_name) || '</p>'
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">'
    || public.kos_joining_packet_fill(v_fee_heading, v_name) || '</h2>';
  if v_member_level = 'auxiliary' then
    v_html := v_html || '<p>You chose Auxiliary membership. Your $200 Auxiliary dues include the background check, so you do not pay this fee.</p>';
  else
  v_html := v_html
    || '<p>' || public.kos_joining_packet_fill(v_fee_intro, v_name) || '</p>';
  if v_apply = 'dual' then
    v_html := v_html || '<p><strong>You are applying as a couple. Please use the $75 couple fee.</strong> The $50 link is there for a single applicant.</p>';
  elsif v_apply = 'single' then
    v_html := v_html || '<p><strong>You are applying as a single applicant. Please use the $50 individual fee.</strong> The $75 link is there for a couple.</p>';
  end if;

  for v_key, v_label, v_fallback_amount, v_fallback_explainer, v_button in
    select item_key, item_label, item_amount, item_explainer, item_button
      from (values
        ('individual'::text, 'Individual'::text, 50::numeric, 'Just you on the application.'::text, 'Pay the individual fee'::text),
        ('couple'::text, 'Couple'::text, 75::numeric, 'The two of you, applying together.'::text, 'Pay the couple fee'::text)
      ) as fee(item_key, item_label, item_amount, item_explainer, item_button)
  loop
    v_item := coalesce(v_bg -> v_key, '{}'::jsonb);
    if nullif(btrim(v_item->>'label'), '') is not null then
      v_label := btrim(v_item->>'label');
    end if;
    if nullif(btrim(v_item->>'explainer'), '') is not null then
      v_explainer := btrim(v_item->>'explainer');
    else
      v_explainer := v_fallback_explainer;
    end if;
    if coalesce(v_item->>'amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_amount := (v_item->>'amount')::numeric;
    else
      v_amount := v_fallback_amount;
    end if;
    v_link := nullif(btrim(v_item->>'url'), '');
    v_money := case
      when v_amount = trunc(v_amount) then '$' || trim(to_char(v_amount, 'FM999990'))
      else '$' || trim(to_char(v_amount, 'FM999990.00'))
    end;
    v_html := v_html
      || case
           when (v_apply = 'dual' and v_key = 'couple') or (v_apply = 'single' and v_key = 'individual')
             then '<p style="margin:12px 0 4px;font-weight:700;color:#14532d;">Your fee</p>'
           else ''
         end
      || '<h3 style="margin:16px 0 6px;font-size:17px;color:#14532d;">'
      || public.kos_email_plain(v_label) || ', ' || v_money || '</h3>'
      || '<p style="margin:0 0 8px;">' || public.kos_email_plain(v_explainer) || '</p>';
    if v_link is not null then
      v_html := v_html
        || '<p style="margin:8px 0 18px;"><a href="' || public.kos_html_text(v_link)
        || '" style="' || v_btn_style || '">' || public.kos_email_plain(v_button) || '</a></p>';
    else
      v_html := v_html
        || '<p style="margin:0 0 18px;">We don''t have that pay link ready yet. Please write to treasurer@kreweofshamrock.com before you pay, and please don''t send card numbers by email.</p>';
    end if;
  end loop;
  end if;

  v_html := v_html
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">'
    || public.kos_joining_packet_fill(v_dues_heading, v_name) || '</h2>'
    || '<p>' || public.kos_joining_packet_fill(v_dues_intro, v_name) || '</p>'
    || '<p>' || public.kos_joining_packet_fill(v_closing, v_name) || '</p>'
    || '<p>' || public.kos_joining_packet_fill(v_signoff, v_name) || '</p>';

  return v_html;
end;
$html$;

revoke all on function public.kos_prospect_background_check_email_html(text, text, jsonb) from public, anon, authenticated;


comment on function public.kos_prospect_background_check_email_html(text, text, jsonb) is
  'Internal. Joining packet body. Finish link and background check pay buttons stay. Dues pay buttons are not included. The dues link comes after the check passes. When template membership_level is auxiliary, the fee section says the $200 dues include the background check.';

create or replace function public.send_membership_full_application(
  p_member_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $send$
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
  v_pause text;
  v_subject text := 'We''re glad you''re joining the Krewe';
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if to_regprocedure('public.kos_membership_prospect_emails_enabled()') is not null
     and not public.kos_membership_prospect_emails_enabled() then
    v_pause := 'Prospect email is paused while this pipeline is in development. No full-application link was sent.';
    if to_regprocedure('public.kos_membership_prospect_emails_pause_message()') is not null then
      v_pause := v_pause || ' ' || public.kos_membership_prospect_emails_pause_message();
    end if;
    return jsonb_build_object(
      'ok', false,
      'emailed', false,
      'emails_paused', true,
      'message', v_pause
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
  v_html := public.kos_prospect_background_check_email_html(
    coalesce(nullif(btrim(rec.first_name), ''), 'friend'),
    v_url,
    jsonb_build_object(
      'fee_type', coalesce(rec.application_fee_type, ''),
      'membership_level', coalesce(rec.membership_level, '')
    )
  );
  v_subject := coalesce(nullif(btrim(public.kos_joining_packet_email_subject()), ''), v_subject);

  v_mail := public.enqueue_email(
    rec.email,
    nullif(v_name, ''),
    v_subject,
    v_html,
    'membership_full_application',
    rec.id
  );

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
    'message', 'Full application sent. We emailed the background check fee ($50 individual or $75 couple) and a secure link to the full application. The email does not include a dues link, a Social Security number, or a driver''s license number.'
  );
end;
$send$;

revoke all on function public.send_membership_full_application(uuid, text) from public, anon;
grant execute on function public.send_membership_full_application(uuid, text) to authenticated;

