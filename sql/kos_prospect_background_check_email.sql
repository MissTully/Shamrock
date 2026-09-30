-- Move to background check: prospect email with the full application,
-- the background check payment, and each membership level.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Melissa applies this file. Do not apply it from the site deploy.
--   Run after sql/kos_membership_background_check_invoice.sql
--   and sql/kos_dues_foundation.sql.
--   Safe to run again.
--
-- Does not turn prospect email on. The pause lives in
-- kos_runtime_flags key membership_prospect_emails (enabled false means
-- do not email the prospect). This file never updates that key.
-- When the pause is on, Move to background check still changes the stage
-- and does not queue the prospect email.
-- When the pause is off, the prospect email includes:
--   1. A button to finish the full application (the existing secure token).
--   2. Background check payment, individual and couple, from the
--      background_check_payments runtime flag.
--   3. Each dues level: the catalog explainer, then that level's Zeffy link.
--
-- Background check URLs are stored in kos_runtime_flags. Dues URLs and
-- explainers are stored on kos_dues_catalog. They are not written only
-- inside the email HTML.

-- ---------------------------------------------------------------------------
-- 1) Dues explainers and the live Zeffy links. Amounts stay the locked rates.
-- ---------------------------------------------------------------------------
alter table public.kos_dues_catalog
  add column if not exists explainer text;

comment on column public.kos_dues_catalog.explainer is
  'Short plain-language note for this level. The Move to background check email prints this before the pay link.';

insert into public.kos_dues_catalog (membership_year, level, amount, zeffy_url, explainer, active)
values
  (2026, 'full', 375,
    'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership',
    'Voting membership. You march in all parades and meet the 12/12 volunteer commitment (12 hours in the Krewe year, June through May, or the SOP rate of $12 for each hour you do not work).',
    true),
  (2026, 'associate', 450,
    'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-associate-membership',
    'One year. You may attend two parades of your choice. Associate membership does not include a vote and does not include the 12/12 volunteer commitment.',
    true),
  (2026, 'auxiliary', 200,
    'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-auxiliary-membership',
    'Non-voting membership for one major parade. This fee includes the background check and the membership portion.',
    true),
  (2026, 'loa', 100,
    'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2',
    'Social membership for one year away from full participation. This is leave of absence status. You stay connected with the Krewe.',
    true)
on conflict (membership_year, level) do update
  set amount = excluded.amount,
      zeffy_url = excluded.zeffy_url,
      explainer = excluded.explainer,
      active = excluded.active;

-- ---------------------------------------------------------------------------
-- 2) Background check payment links. A different key from the email pause.
-- ---------------------------------------------------------------------------
create table if not exists public.kos_runtime_flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.kos_runtime_flags is
  'Small runtime switches. membership_prospect_emails pauses prospect mail. background_check_payments holds the Zeffy links for that fee.';

insert into public.kos_runtime_flags (key, value)
values (
  'background_check_payments',
  jsonb_build_object(
    'individual', jsonb_build_object(
      'label', 'Individual',
      'amount', 50,
      'explainer', 'One person on the application.',
      'url', 'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-individual'
    ),
    'couple', jsonb_build_object(
      'label', 'Couple',
      'amount', 75,
      'explainer', 'Two people applying together.',
      'url', 'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-couple'
    )
  )
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Email body. Reads the catalog and the background check flag.
-- ---------------------------------------------------------------------------
create or replace function public.kos_prospect_background_check_email_html(
  p_first_name text,
  p_application_url text
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
  v_year integer := extract(year from current_date)::integer;
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
  v_title text;
  v_level text;
  v_btn_style text := 'display:inline-block;background:#14532d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;';
begin
  if v_app !~ '^https://www\.kreweofshamrock\.com/membership-full-application\.html\?token=[0-9a-f]{64}$' then
    v_app := '';
  end if;

  if to_regclass('public.kos_dues_catalog') is not null
     and not exists (
       select 1 from public.kos_dues_catalog
        where membership_year = v_year and active
     ) then
    select max(membership_year) into v_year
      from public.kos_dues_catalog
     where active;
  end if;

  if to_regclass('public.kos_runtime_flags') is not null then
    select coalesce(value, '{}'::jsonb) into v_bg
      from public.kos_runtime_flags
     where key = 'background_check_payments';
    v_bg := coalesce(v_bg, '{}'::jsonb);
  end if;

  v_html :=
    '<p>Dear ' || public.kos_email_plain(v_name) || ',</p>'
    || '<p>The Membership Chair moved your application to the background check. Welcome. Here is how to finish joining.</p>'
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">Finish the full application</h2>'
    || '<p>Open this secure link to complete the full application. It asks for a driver''s license number and a Social Security number. The board uses those for the background check. Your information is held confidentially.</p>';

  if v_app <> '' then
    v_html := v_html
      || '<p style="margin:8px 0 18px;"><a href="' || v_app || '" style="' || v_btn_style || '">Complete the full application</a></p>';
  else
    v_html := v_html
      || '<p>The secure link is not ready. Please ask the Membership Chair to send this note again.</p>';
  end if;

  v_html := v_html
    || '<p>This email does not include those numbers. The link expires in 21 days.</p>'
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">Pay the background check</h2>'
    || '<p>This fee is separate from membership dues. Pay the one that matches your application.</p>';

  for v_key, v_label, v_fallback_amount, v_fallback_explainer, v_button in
    select item_key, item_label, item_amount, item_explainer, item_button
      from (values
        ('individual'::text, 'Individual'::text, 50::numeric, 'One person on the application.'::text, 'Pay the individual background check'::text),
        ('couple'::text, 'Couple'::text, 75::numeric, 'Two people applying together.'::text, 'Pay the couple background check'::text)
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
      || '<h3 style="margin:16px 0 6px;font-size:17px;color:#14532d;">'
      || public.kos_email_plain(v_label) || ', ' || v_money || '</h3>'
      || '<p style="margin:0 0 8px;">' || public.kos_email_plain(v_explainer) || '</p>';
    if v_link is not null then
      v_html := v_html
        || '<p style="margin:8px 0 18px;"><a href="' || public.kos_html_text(v_link)
        || '" style="' || v_btn_style || '">' || public.kos_email_plain(v_button) || '</a></p>';
    else
      v_html := v_html
        || '<p style="margin:0 0 18px;">A pay link for this background check is not set up yet. Please write to treasurer@kreweofshamrock.com before you pay. Do not send card numbers by email.</p>';
    end if;
  end loop;

  v_html := v_html
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">Choose your membership</h2>'
    || '<p>Membership dues are separate from the background check fee. Read the short note for each level, then use that level''s pay button. If you choose Auxiliary, that fee already includes the background check and the membership portion. You do not also pay the separate background check above. If you are not sure which level fits, write to treasurer@kreweofshamrock.com before you pay.</p>';

  for v_level, v_title, v_button, v_fallback_amount, v_fallback_explainer in
    select item_level, item_title, item_button, item_amount, item_explainer
      from (values
        ('full'::text, 'Full Krewe Membership'::text, 'Pay Full Krewe Membership'::text, 375::numeric,
          'Voting membership. You march in all parades and meet the 12/12 volunteer commitment (12 hours in the Krewe year, June through May, or the SOP rate of $12 for each hour you do not work).'::text),
        ('associate'::text, 'Associate'::text, 'Pay Associate membership'::text, 450::numeric,
          'One year. You may attend two parades of your choice. Associate membership does not include a vote and does not include the 12/12 volunteer commitment.'::text),
        ('auxiliary'::text, 'Auxiliary'::text, 'Pay Auxiliary membership'::text, 200::numeric,
          'Non-voting membership for one major parade. This fee includes the background check and the membership portion.'::text),
        ('loa'::text, 'Leave of Absence (LOA)'::text, 'Pay Leave of Absence'::text, 100::numeric,
          'Social membership for one year away from full participation. This is leave of absence status. You stay connected with the Krewe.'::text)
      ) as levels(item_level, item_title, item_button, item_amount, item_explainer)
  loop
    v_amount := v_fallback_amount;
    v_explainer := v_fallback_explainer;
    v_link := null;
    if to_regclass('public.kos_dues_catalog') is not null and v_year is not null then
      select c.amount,
             coalesce(nullif(btrim(c.explainer), ''), v_fallback_explainer),
             nullif(btrim(c.zeffy_url), '')
        into v_amount, v_explainer, v_link
        from public.kos_dues_catalog c
       where c.membership_year = v_year
         and c.level = v_level
         and c.active
       limit 1;
      if not found then
        v_amount := v_fallback_amount;
        v_explainer := v_fallback_explainer;
        v_link := null;
      end if;
    end if;
    v_money := case
      when v_amount = trunc(v_amount) then '$' || trim(to_char(v_amount, 'FM999990'))
      else '$' || trim(to_char(v_amount, 'FM999990.00'))
    end;
    v_html := v_html
      || '<h3 style="margin:16px 0 6px;font-size:17px;color:#14532d;">'
      || public.kos_email_plain(v_title) || ', ' || v_money || '</h3>'
      || '<p style="margin:0 0 8px;">' || public.kos_email_plain(v_explainer) || '</p>';
    if v_link is not null then
      v_html := v_html
        || '<p style="margin:8px 0 18px;"><a href="' || public.kos_html_text(v_link)
        || '" style="' || v_btn_style || '">' || public.kos_email_plain(v_button) || '</a></p>';
    else
      v_html := v_html
        || '<p style="margin:0 0 18px;">A pay link for this membership level is not set up yet. Please write to treasurer@kreweofshamrock.com before you pay. Do not send card numbers by email.</p>';
    end if;
  end loop;

  v_html := v_html
    || '<p>If you did not ask to join, you can ignore this message.</p>'
    || '<p>Sláinte,<br>Krewe of Shamrock</p>';

  return v_html;
end;
$html$;

revoke all on function public.kos_prospect_background_check_email_html(text, text) from public, anon, authenticated;

comment on function public.kos_prospect_background_check_email_html(text, text) is
  'Internal. Prospect email body for Move to background check. Reads dues explainers and Zeffy links from kos_dues_catalog, and background check links from kos_runtime_flags. Not a client API.';

-- ---------------------------------------------------------------------------
-- 4) Send the secure link only when prospect email is on.
-- ---------------------------------------------------------------------------
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
    v_url
  );

  v_mail := public.enqueue_email(
    rec.email,
    nullif(v_name, ''),
    'Your Krewe of Shamrock application',
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
    'message', 'Full application sent. We emailed them a secure link to finish the full application, the background check payment, and each membership level with a short note and a pay link. The email does not include a Social Security number or a driver''s license number.'
  );
end;
$send$;

revoke all on function public.send_membership_full_application(uuid, text) from public, anon;
grant execute on function public.send_membership_full_application(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Move to background check. Pause still changes the stage and skips mail.
-- ---------------------------------------------------------------------------
create or replace function public.set_membership_application_status(
  p_member_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $status$
declare
  v_sent jsonb;
  v_result jsonb;
  v_emails_on boolean := true;
  v_pause text;
begin
  if to_regprocedure('public.kos_membership_prospect_emails_enabled()') is not null then
    v_emails_on := public.kos_membership_prospect_emails_enabled();
  end if;

  if p_action = 'background_check' and v_emails_on then
    v_sent := public.send_membership_full_application(p_member_id, p_note);
    if coalesce(v_sent->>'ok', '') <> 'true' then
      return v_sent;
    end if;
  end if;

  v_result := public._apply_membership_application_decision(p_member_id, p_action, p_note);
  if p_action = 'background_check' and coalesce(v_result->>'ok', '') = 'true' then
    if v_emails_on then
      v_result := v_result || jsonb_build_object(
        'emailed', true,
        'message', 'Moved to background check. We emailed them a secure link to finish the full application, the background check payment, and each membership level with a short note and a pay link. The email does not include a Social Security number or a driver''s license number. Membership dues are invoiced when they submit that form and begin the check.'
      );
    else
      v_pause := 'Moved to background check. Prospect email is paused while this pipeline is in development. No full-application link was sent.';
      if to_regprocedure('public.kos_membership_prospect_emails_pause_message()') is not null then
        v_pause := v_pause || ' ' || public.kos_membership_prospect_emails_pause_message();
      end if;
      v_result := v_result || jsonb_build_object(
        'emailed', false,
        'emails_paused', true,
        'message', v_pause
      );
    end if;
  end if;
  return v_result;
end;
$status$;

revoke all on function public.set_membership_application_status(uuid, text, text) from public, anon;
grant execute on function public.set_membership_application_status(uuid, text, text) to authenticated;
