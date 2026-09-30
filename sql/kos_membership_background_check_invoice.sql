-- Move to background check sends the full application.
-- The membership dues invoice is queued when the prospect begins the check.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Run this after sql/kos_membership_application_staged.sql.
--   Also requires the dues catalog from sql/kos_dues_foundation.sql
--   (already applied with Send invoices). Safe to run again.
--   If you re-run the pipeline file or the staged file later, run this file
--   again, then run sql/kos_prospect_background_check_email.sql last.
--   That last file is the prospect email (finish the application, background
--   check payment, and each dues level). It does not turn the
--   membership_prospect_emails pause on or off.
--
-- Choice recorded here:
--   "Begins their background check" is the prospect submitting the token
--   full application (driver's license and Social Security number).
--   That is submit_membership_full_application.
--   It is not the chair's Move to background check click.
--   Move to background check emails the secure link and sets
--   membership_status to background-check. If that email cannot be queued,
--   the status stays where it was so the chair can click again.
--   The dues invoice uses kos_dues_quote and dues_payments the same way
--   Send invoices uses kos_create_level_invoices, then queues the same
--   kind of notice (level, amount, due date, catalog Zeffy link) through
--   enqueue_email with purpose invoice_notice.
--   The membership year is the calendar year, matching
--   officer_create_and_send_invoices. There is no second billing system.
--   A couple application is one roster row, so this queues one invoice at
--   that member's level (new members default to full). It does not charge
--   the $50 or $75 application fee, and it does not invent a second member
--   for the partner.
--   Paid rows, applied waivers, elected officers, and a missing catalog
--   row are skipped. A skip does not undo the full application.

-- ---------------------------------------------------------------------------
-- 1) One level-based dues invoice. Not granted to the browser.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) Move to background check emails the secure link, then changes status.
--    When kos_membership_prospect_emails_enabled() is false, the stage
--    still changes and the prospect is not emailed. Do not turn that
--    pause on or off from this file. The letter body, when mail is on,
--    comes from kos_prospect_background_check_email_html
--    (sql/kos_prospect_background_check_email.sql). Run that file last.
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

-- ---------------------------------------------------------------------------
-- 3) Interest letter, secure-link letter, and full-application save.
--    Replaces the copies from kos_membership_application_staged.sql so this
--    file is enough to paste after that one is already on the project.
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

