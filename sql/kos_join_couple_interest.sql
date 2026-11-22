-- Couple choice on the public Join form.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Safe to run again. Does not send email and does not change flags.
--
-- Stores Applying as Single or Couple on the interest record, optional partner
-- email and phone, and links partner_member_id when the partner can be found
-- or created. The background check letter keeps both fee links and points a
-- couple at $75 and a single applicant at $50.

alter table public.members add column if not exists partner_email text;
alter table public.members add column if not exists partner_phone text;

comment on column public.members.partner_email is
  'Optional email for the second applicant on a couple interest form. Not a login.';
comment on column public.members.partner_phone is
  'Optional phone for the second applicant on a couple interest form.';

drop function if exists public.submit_membership_application(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
);

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
  p_partner_ssn text default null,
  p_partner_email text default null,
  p_partner_phone text default null
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
  v_partner_email text := nullif(left(lower(trim(coalesce(p_partner_email, ''))), 120), '');
  v_partner_phone text := nullif(left(trim(coalesce(p_partner_phone, '')), 40), '');
  v_partner_id uuid;
  v_id uuid;
  v_status text;
  v_is_new boolean := false;
  v_open boolean := false;
  v_recent int;
  v_addr text;
  v_html text;
  v_fee_line text;
  v_subject text;
  v_tel text;
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
  if v_partner_email is not null and position('@' in v_partner_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Enter a valid email for your partner, or leave that field blank.');
  end if;
  if v_fee = 'dual' and v_partner_email is not null and v_partner_email = v_email then
    return jsonb_build_object('ok', false, 'message', 'Use a different email for your partner, or leave that field blank.');
  end if;
  if v_fee <> 'dual' then
    v_partner_first := null;
    v_partner_last := null;
    v_partner_email := null;
    v_partner_phone := null;
  end if;

  select count(*) into v_recent
  from public.members
  where membership_status in (
    'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
  )
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
      application_fee_type, partner_first_name, partner_last_name,
      partner_email, partner_phone
    ) values (
      v_first, v_last, v_email, v_phone, v_notes,
      v_street, v_city, v_state, v_zip,
      'prospect', 'pending-new',
      nullif(v_fee, ''), v_partner_first, v_partner_last,
      v_partner_email, v_partner_phone
    ) returning id into v_id;
    v_is_new := true;
    v_status := 'pending-new';
    v_open := true;
  else
    v_open := v_status in (
      'prospect', 'pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
    );
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
      partner_email = case
        when v_open and v_fee = 'dual' then v_partner_email
        when v_open and v_fee = 'single' then null
        else partner_email
      end,
      partner_phone = case
        when v_open and v_fee = 'dual' then v_partner_phone
        when v_open and v_fee = 'single' then null
        else partner_phone
      end,
      updated_at = now()
    where id = v_id;
  end if;

  if v_fee = 'dual' and (v_is_new or v_open) then
    v_partner_id := null;
    if v_partner_email is not null then
      select m.id into v_partner_id
        from public.members m
       where m.merged_into is null
         and m.id <> v_id
         and lower(btrim(coalesce(m.email, ''))) = v_partner_email
       order by m.created_at
       limit 1;
    end if;
    if v_partner_id is null then
      select m.id into v_partner_id
        from public.members m
       where m.merged_into is null
         and m.id <> v_id
         and lower(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')))
             = lower(v_partner_first || ' ' || v_partner_last)
         and m.membership_status in (
           'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
         )
       order by m.created_at
       limit 1;
    end if;
    if v_partner_id is null then
      begin
        insert into public.members (
          first_name, last_name, email, phone,
          street_address, city, state, zip,
          member_role, membership_status,
          application_fee_type, partner_first_name, partner_last_name
        ) values (
          v_partner_first, v_partner_last, v_partner_email, v_partner_phone,
          v_street, v_city, v_state, v_zip,
          'prospect', 'pending-new',
          'dual', v_first, v_last
        ) returning id into v_partner_id;
      exception
        when not_null_violation then
          v_partner_id := null;
      end;
    else
      update public.members
         set phone = coalesce(v_partner_phone, phone),
             application_fee_type = case
               when membership_status in (
                 'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
               ) then 'dual'
               else application_fee_type
             end,
             partner_first_name = case
               when membership_status in (
                 'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
               ) then v_first
               else partner_first_name
             end,
             partner_last_name = case
               when membership_status in (
                 'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
               ) then v_last
               else partner_last_name
             end,
             updated_at = now()
       where id = v_partner_id
         and merged_into is null;
    end if;
    if v_partner_id is not null then
      update public.members
         set partner_member_id = v_partner_id,
             updated_at = now()
       where id = v_id
         and merged_into is null
         and (partner_member_id is null or partner_member_id = v_partner_id);
      update public.members
         set partner_member_id = v_id,
             updated_at = now()
       where id = v_partner_id
         and merged_into is null
         and (partner_member_id is null or partner_member_id = v_id);
    end if;
  end if;

  v_addr := v_street || ', ' || v_city || ', ' || v_state || ' ' || v_zip;
  v_fee_line := case
    when v_fee = 'dual' then 'Application fee: couple, $75. This is the background check fee, not membership dues.'
    when v_fee = 'single' then 'Application fee: single applicant, $50. This is the background check fee, not membership dues.'
    else 'Application fee: $50 single or $75 couple. This is the background check fee, not membership dues.'
  end;
  v_tel := regexp_replace(coalesce(v_phone, ''), '[^0-9+]', '', 'g');

  if v_is_new or v_status in ('prospect', 'pending-new') then
    v_subject := 'Membership interest: ' || public.kos_redact_id_text(v_first || ' ' || v_last);
    v_html :=
      '<p>Someone asked to join the Krewe of Shamrock. This is interest only. Please call them.</p>'
      || '<p><strong>' || public.kos_email_plain(v_first) || ' ' || public.kos_email_plain(v_last) || '</strong><br/>'
      || public.kos_email_plain(v_email) || '<br/>'
      || public.kos_email_plain(v_addr) || '</p>'
      || case
           when v_phone is not null and v_tel <> '' then
             '<p style="font-size:22px;margin:16px 0;"><strong>Phone: </strong><a href="tel:'
             || v_tel || '">' || public.kos_email_plain(v_phone) || '</a></p>'
           else '<p>No phone number was given.</p>'
         end
      || '<p><strong>Applying as:</strong> '
      || case when v_fee = 'dual' then 'Couple' when v_fee = 'single' then 'Single' else 'Not chosen' end
      || '</p>'
      || case
           when v_fee = 'dual' then
             '<p><strong>Partner:</strong> '
             || public.kos_email_plain(coalesce(v_partner_first, '')) || ' '
             || public.kos_email_plain(coalesce(v_partner_last, '')) || '</p>'
             || case
                  when v_partner_email is not null then '<p>Partner email: '
                    || public.kos_email_plain(v_partner_email) || '</p>'
                  else ''
                end
             || case
                  when v_partner_phone is not null then
                    '<p style="font-size:20px;margin:12px 0;"><strong>Partner phone: </strong><a href="tel:'
                    || regexp_replace(v_partner_phone, '[^0-9+]', '', 'g') || '">'
                    || public.kos_email_plain(v_partner_phone) || '</a></p>'
                  else ''
                end
           else ''
         end
      || '<p>' || public.kos_email_plain(v_fee_line) || '</p>'
      || case
           when v_notes is not null then '<p>' || replace(public.kos_email_plain(v_notes), E'\n', '<br/>') || '</p>'
           else ''
         end
      || '<p>After the call, open Membership Applications and choose Called, send background check email. That email has the background check fee and the full application. It does not include a dues link. This email does not include a Social Security number or a driver''s license number.</p>'
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
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

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
    'partner_first', case when rec.application_fee_type = 'dual' then rec.partner_first_name else null end,
    'partner_last', case when rec.application_fee_type = 'dual' then rec.partner_last_name else null end,
    'partner_name', case
      when rec.application_fee_type = 'dual' then nullif(btrim(
        coalesce(rec.partner_first_name, '') || ' ' || coalesce(rec.partner_last_name, '')
      ), '')
      else null
    end
  );
end;
$$;

revoke all on function public.lookup_membership_full_application(text) from public;
grant execute on function public.lookup_membership_full_application(text) to anon, authenticated;

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
  v_tpl := coalesce(p_template, '{}'::jsonb) - 'fee_type';
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
    || public.kos_joining_packet_fill(v_fee_heading, v_name) || '</h2>'
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
  'Internal. Joining packet body. Finish link and background check pay buttons stay. Dues pay buttons are not included. The dues link comes after the check passes.';

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
    jsonb_build_object('fee_type', coalesce(rec.application_fee_type, ''))
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

