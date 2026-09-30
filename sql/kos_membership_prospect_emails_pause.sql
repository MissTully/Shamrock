-- Pause automatic emails to membership prospects.
--
-- ALREADY APPLIED on project oazwkwflgbthojvnclfc. Safe to run again.
-- Re-running does not turn emails back on, and it does not turn them off
-- again if the flag was already changed. The insert below only adds the
-- row when the key is missing.
--
-- Flag key: membership_prospect_emails
-- Live value: {"enabled": false, "reason": "Paused while the membership application pipeline is in development. Officers can still move cards; prospects are not emailed."}
--
-- While enabled is false:
--   Move to background check still moves the card and does not email the prospect.
--   send_membership_full_application refuses to email.
--   kos_queue_level_dues_invoice does not email a dues invoice.
--   submit_membership_full_application does not email the prospect confirmation
--   or the dues invoice. The Membership Chair and President notice still sends.
-- Interest mail to the Membership Chair and President is unchanged.
-- The Join page, the full-application page, and the Chair desk do not mention this pause.
--
-- The public pages read nothing from this flag. kos_membership_prospect_emails_enabled()
-- is granted to anon and authenticated so a later change can read it. The pause
-- message helper is authenticated only.
--
-- To turn prospect emails back on:
-- update kos_runtime_flags set value = jsonb_set(value,'{enabled}','true') where key='membership_prospect_emails';
--
-- Run this file after sql/kos_membership_background_check_invoice.sql.
-- If that invoice file or the staged file is run again later, run this file
-- again so these guards stay last.

create table if not exists public.kos_runtime_flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.kos_runtime_flags (key, value)
values (
  'membership_prospect_emails',
  jsonb_build_object(
    'enabled', false,
    'reason', 'Paused while the membership application pipeline is in development. Officers can still move cards; prospects are not emailed.'
  )
)
on conflict (key) do nothing;

create or replace function public.kos_membership_prospect_emails_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (value->>'enabled')::boolean
      from public.kos_runtime_flags
      where key = 'membership_prospect_emails'
    ),
    true
  );
$$;

revoke all on function public.kos_membership_prospect_emails_enabled() from public;
grant execute on function public.kos_membership_prospect_emails_enabled() to anon, authenticated;

create or replace function public.kos_membership_prospect_emails_pause_message()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select nullif(btrim(value->>'reason'), '')
      from public.kos_runtime_flags
      where key = 'membership_prospect_emails'
    ),
    'Membership prospect emails are paused while this part of the site is in development.'
  );
$$;

revoke all on function public.kos_membership_prospect_emails_pause_message() from public, anon;
grant execute on function public.kos_membership_prospect_emails_pause_message() to authenticated;


create or replace function public.kos_queue_level_dues_invoice(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $invoice$
declare
  v_year integer := extract(year from current_date)::integer;
  v_member record;
  v_dues public.dues_payments%rowtype;
  v_has boolean := false;
  v_quote jsonb;
  v_level text;
  v_amount numeric;
  v_url text;
  v_action text;
  v_name text;
  v_subject text;
  v_html text;
  v_level_label text;
  v_due date;
  v_mail uuid;
  v_emailed boolean := false;
begin
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'emailed', false, 'message', 'Missing member.');
  end if;
  if not public.kos_membership_prospect_emails_enabled() then
    return jsonb_build_object(
      'ok', true,
      'emailed', false,
      'emails_paused', true,
      'result', 'skipped_emails_paused',
      'message', 'Dues invoice email paused while membership pipeline is in development.'
    );
  end if;
  if to_regclass('public.dues_payments') is null
     or to_regclass('public.kos_dues_catalog') is null
     or to_regprocedure('public.kos_dues_quote(integer,text)') is null then
    return jsonb_build_object(
      'ok', false,
      'emailed', false,
      'message', 'Dues catalog is not installed. The full application was still saved.'
    );
  end if;

  select m.id, m.membership_level, m.officer_title, m.first_name, m.last_name, m.email
    into v_member
    from public.members m
   where m.id = p_member_id
     and m.merged_into is null;

  if not found then
    return jsonb_build_object(
      'ok', false, 'emailed', false, 'result', 'skipped_missing',
      'message', 'Member was not found.'
    );
  end if;

  select * into v_dues
    from public.dues_payments
   where member_id = p_member_id
     and membership_year = v_year;
  v_has := found;

  if v_has and v_dues.waiver_status = 'applied' then
    return jsonb_build_object(
      'ok', true, 'emailed', false, 'result', 'skipped_waiver', 'year', v_year,
      'message', 'Dues invoice skipped. An applied waiver is already on file.'
    );
  end if;
  if v_has and v_dues.paid then
    return jsonb_build_object(
      'ok', true, 'emailed', false, 'result', 'skipped_paid', 'year', v_year,
      'message', 'Dues invoice skipped. This year is already paid.'
    );
  end if;
  if to_regprocedure('public.kos_is_elected_officer_title(text)') is not null
     and public.kos_is_elected_officer_title(v_member.officer_title) then
    return jsonb_build_object(
      'ok', true, 'emailed', false, 'result', 'skipped_officer', 'year', v_year,
      'message', 'Dues invoice skipped. Elected officers are not invoiced.'
    );
  end if;

  v_quote := public.kos_dues_quote(v_year, v_member.membership_level);
  v_level := v_quote->>'level';
  v_amount := (v_quote->>'amount')::numeric;
  v_url := nullif(btrim(v_quote->>'zeffy_url'), '');
  if coalesce(v_quote->>'from_catalog', 'false') <> 'true' or v_amount is null then
    return jsonb_build_object(
      'ok', true, 'emailed', false, 'result', 'skipped_no_catalog',
      'year', v_year, 'level', v_level,
      'message', 'Dues invoice skipped. No catalog rate for this year and level.'
    );
  end if;

  v_due := make_date(v_year, 6, 30);
  if not v_has then
    insert into public.dues_payments (
      member_id, membership_year, amount, due_date, paid,
      membership_level, standard_amount, zeffy_campaign_key, notes
    ) values (
      p_member_id, v_year, v_amount, v_due, false,
      v_level, v_amount, v_url, 'Dues invoice'
    )
    returning * into v_dues;
    v_action := 'created';
  else
    update public.dues_payments
       set membership_level = v_level,
           standard_amount = v_amount,
           amount = v_amount,
           zeffy_campaign_key = v_url,
           due_date = coalesce(due_date, v_due)
     where id = v_dues.id
       and paid = false
       and coalesce(waiver_status, '') <> 'applied'
    returning * into v_dues;
    if not found then
      return jsonb_build_object(
        'ok', true, 'emailed', false, 'result', 'skipped_paid', 'year', v_year,
        'message', 'Dues invoice skipped. This year is already paid.'
      );
    end if;
    v_action := 'updated';
  end if;

  if to_regprocedure('public.kos_log_dues_event(text,uuid,integer,jsonb)') is not null then
    perform public.kos_log_dues_event(
      'invoice_created',
      p_member_id,
      v_year,
      jsonb_build_object(
        'action', v_action,
        'source', 'background_check_begun',
        'dues_payment_id', v_dues.id,
        'membership_level', v_level,
        'amount', v_amount,
        'standard_amount', v_amount,
        'zeffy_campaign_key', v_url
      )
    );
  end if;

  v_level_label := case v_level
    when 'associate' then 'Associate'
    when 'loa' then 'Leave of absence'
    when 'auxiliary' then 'Auxiliary'
    else 'Full'
  end;
  v_name := btrim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, ''));
  v_subject := 'Krewe of Shamrock dues invoice (' || v_year::text || ')';
  v_html :=
    '<p>Hi ' || public.kos_email_plain(coalesce(nullif(btrim(v_member.first_name), ''), 'friend')) || ',</p>'
    || '<p>This is your Krewe of Shamrock membership invoice for <b>' || v_year::text || '</b>.</p>'
    || '<p><b>Membership level:</b> ' || public.kos_email_plain(v_level_label) || '</p>'
    || '<p><b>Amount due:</b> $' || trim(to_char(v_amount, 'FM999990.00')) || '</p>'
    || '<p><b>Due date:</b> ' || trim(to_char(coalesce(v_dues.due_date, v_due), 'FMMonth FMDD, YYYY')) || '</p>'
    || '<p>This is membership dues, not the application fee.</p>';
  if v_url is not null then
    v_html := v_html
      || '<p>Please pay securely through our Zeffy membership form (no card numbers are collected in the Member Hub):</p>'
      || '<p style="margin:18px 0;"><a href="' || public.kos_email_plain(v_url) || '" '
      || 'style="display:inline-block;background:#14532d;color:#fff;padding:12px 18px;border-radius:999px;'
      || 'text-decoration:none;font-weight:700;">Pay dues on Zeffy</a></p>';
  else
    v_html := v_html
      || '<p>A Zeffy pay link for this membership level is not set up yet. Please contact the treasurer at '
      || 'treasurer@kreweofshamrock.com before you pay. Do not send card numbers by email.</p>';
  end if;
  v_html := v_html
    || '<p>If you already paid, thank you. You can ignore this note.</p>'
    || '<p>Slainte,<br>Krewe of Shamrock</p>';

  if to_regprocedure('public.wrap_all_krewe_email_html(text,text)') is not null then
    v_html := public.wrap_all_krewe_email_html(v_subject, v_html);
  end if;

  if v_member.email is not null and position('@' in v_member.email) > 0 then
    v_mail := public.enqueue_email(
      v_member.email,
      nullif(v_name, ''),
      v_subject,
      v_html,
      'invoice_notice',
      p_member_id
    );
    v_emailed := v_mail is not null;
  end if;

  if v_emailed and to_regprocedure('public.kos_log_dues_event(text,uuid,integer,jsonb)') is not null then
    perform public.kos_log_dues_event(
      'invoice_emailed',
      p_member_id,
      v_year,
      jsonb_build_object(
        'source', 'background_check_begun',
        'dues_payment_id', v_dues.id,
        'membership_level', v_level,
        'amount', v_amount
      )
    );
  end if;

  if to_regclass('public.officer_outreach_log') is not null then
    insert into public.officer_outreach_log (
      kind, audience, subject, body_html, recipient_count, member_ids, meta, sent_by
    ) values (
      'invoice',
      'background_check',
      v_subject,
      '',
      case when v_emailed then 1 else 0 end,
      array[p_member_id],
      jsonb_build_object(
        'year', v_year,
        'created', case when v_action = 'created' then 1 else 0 end,
        'updated', case when v_action = 'updated' then 1 else 0 end,
        'emailed', case when v_emailed then 1 else 0 end,
        'source', 'background_check_begun',
        'membership_level', v_level,
        'amount', v_amount,
        'send_email', true
      ),
      auth.uid()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'emailed', v_emailed,
    'result', v_action,
    'year', v_year,
    'membership_level', v_level,
    'amount', v_amount,
    'message', case
      when v_emailed then 'Membership dues invoice queued.'
      else 'Membership dues invoice saved. The email could not be queued.'
    end
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'emailed', false,
      'message', 'Could not queue the dues invoice.'
    );
end;
$invoice$;

revoke all on function public.kos_queue_level_dues_invoice(uuid) from public, anon, authenticated;

comment on function public.kos_queue_level_dues_invoice(uuid) is
  'Internal. Queues one level-based membership dues invoice for the calendar year when a prospect submits the full application and begins the background check. Not a client API.';

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
begin
  if p_action = 'background_check' then
    if public.kos_membership_prospect_emails_enabled() then
      v_sent := public.send_membership_full_application(p_member_id, p_note);
      if coalesce(v_sent->>'ok', '') <> 'true' then
        return v_sent;
      end if;
    end if;
  end if;

  v_result := public._apply_membership_application_decision(p_member_id, p_action, p_note);
  if p_action = 'background_check' and coalesce(v_result->>'ok', '') = 'true' then
    if public.kos_membership_prospect_emails_enabled() then
      v_result := v_result || jsonb_build_object(
        'emailed', true,
        'message', 'Moved to background check. We emailed them a secure link to the full application. The email does not include a Social Security number or a driver''s license number. Membership dues are invoiced when they submit that form and begin the check.'
      );
    else
      v_result := v_result || jsonb_build_object(
        'emailed', false,
        'emails_paused', true,
        'message', 'Moved to background check. Prospect email is paused while this pipeline is in development — no full-application link was sent. ' || public.kos_membership_prospect_emails_pause_message()
      );
    end if;
  end if;
  return v_result;
end;
$status$;

revoke all on function public.set_membership_application_status(uuid, text, text) from public, anon;
grant execute on function public.set_membership_application_status(uuid, text, text) to authenticated;

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
  if not public.kos_membership_prospect_emails_enabled() then
    return jsonb_build_object(
      'ok', false,
      'emailed', false,
      'emails_paused', true,
      'message', 'Prospect email is paused while this pipeline is in development. No full-application link was sent. ' || public.kos_membership_prospect_emails_pause_message()
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
  v_html :=
    '<p>Dear ' || public.kos_email_plain(coalesce(nullif(btrim(rec.first_name), ''), 'friend')) || ',</p>'
    || '<p>The Membership Chair moved your application to the background check.</p>'
    || '<p>Open this secure link to finish the background-check form. It asks for a driver''s license number and a Social Security number. The board uses SSN and driver''s license for the background check. Your information is held confidentially.</p>'
    || '<p><a href="' || v_url || '">Open the full application</a></p>'
    || '<p>This email does not include those numbers. The link expires in 21 days. If you did not ask to join, you can ignore this message.</p>'
    || '<p>Sláinte!</p>';

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
    'message', 'Full application sent. We emailed them a secure link to finish the background check. The email does not include a Social Security number or a driver''s license number.'
  );
end;
$$;

revoke all on function public.send_membership_full_application(uuid, text) from public, anon;
grant execute on function public.send_membership_full_application(uuid, text) to authenticated;

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
  v_emails_on boolean := public.kos_membership_prospect_emails_enabled();
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

  -- Prospect confirmation + dues invoice emails only when the flag is on.
  if v_emails_on then
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
  end if;

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
    || '<p>This email does not include a Social Security number or a driver''s license number.</p>'
    || case when not v_emails_on then '<p><b>Note:</b> Prospect email is paused. No confirmation or dues invoice was emailed to the applicant.</p>' else '' end;

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
  if v_emails_on and to_regprocedure('public.kos_queue_level_dues_invoice(uuid)') is not null then
    v_invoice := public.kos_queue_level_dues_invoice(rec.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'emails_paused', not v_emails_on,
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
