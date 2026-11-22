-- Associate intent on the Join form, and the chair membership level picker.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Run after sql/kos_membership_pipeline_dashboard.sql and
--   sql/kos_join_couple_interest.sql, and after sql/kos_renewal_approve_no_welcome.sql.
--   Safe to run again. Applying this file does not send email and does not
--   change existing rows.
--
-- Replaces public.submit_membership_application with the same arguments as
-- sql/kos_join_couple_interest.sql, plus a trailing p_membership_level text
-- default null. Only 'associate' and 'full' are accepted. Null leaves the
-- stored level alone on an open row and stores full on a new row.
-- When the level is associate, the chair and President interest email adds
-- "Interested in: Associate membership".
--
-- Adds public.set_application_membership_level(uuid, text). Reviewers only.
-- Allowed statuses: pending-new, prospect, background-check, bg_paid,
-- bg_in_process. Levels: full, associate, auxiliary, loa. The linked partner
-- in an allowed status is updated too. Writes membership_application_actions
-- action level_set and kos_log_dues_event('level_set', ...). No email.
-- Revoke from public and anon. Grant to authenticated.
--
-- kos_dues_catalog is not changed.
--
-- Rollback: drop function public.set_application_membership_level(uuid, text);
-- then run the submit_membership_application block from
-- sql/kos_membership_pipeline_dashboard.sql again. Restore the action check
-- from that file if no level_set or background_check_fee_included rows exist.

drop function if exists public.submit_membership_application(
  text, text, text, text, text, text, text, text, text
);
drop function if exists public.submit_membership_application(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
);
drop function if exists public.submit_membership_application(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
);
drop function if exists public.submit_membership_application(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
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
  p_partner_phone text default null,
  p_membership_level text default null
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
  v_level text := lower(nullif(btrim(coalesce(p_membership_level, '')), ''));
  v_partner_id uuid;
  v_old_partner uuid;
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
  if v_level is not null and v_level not in ('associate', 'full') then
    return jsonb_build_object('ok', false, 'message', 'Choose Associate or Full membership.');
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

  select id, membership_status, partner_member_id into v_id, v_status, v_old_partner
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
      partner_email, partner_phone, membership_level
    ) values (
      v_first, v_last, v_email, v_phone, v_notes,
      v_street, v_city, v_state, v_zip,
      'prospect', 'pending-new',
      nullif(v_fee, ''), v_partner_first, v_partner_last,
      v_partner_email, v_partner_phone, coalesce(v_level, 'full')
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
      membership_level = case when v_open and v_level is not null then v_level else membership_level end,
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
          application_fee_type, partner_first_name, partner_last_name,
          membership_level
        ) values (
          v_partner_first, v_partner_last, v_partner_email, v_partner_phone,
          v_street, v_city, v_state, v_zip,
          'prospect', 'pending-new',
          'dual', v_first, v_last,
          coalesce(v_level, 'full')
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
             membership_level = case
               when v_level is not null and membership_status in (
                 'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
               ) then v_level
               else membership_level
             end,
             updated_at = now()
       where id = v_partner_id
         and merged_into is null;
    end if;
    if v_old_partner is not null and v_old_partner is distinct from v_partner_id then
      update public.members
         set partner_member_id = null,
             updated_at = now()
       where id = v_old_partner
         and partner_member_id = v_id;
      update public.members
         set partner_member_id = null,
             updated_at = now()
       where id = v_id
         and partner_member_id = v_old_partner;
    end if;
    if v_partner_id is not null then
      update public.members
         set partner_member_id = v_partner_id,
             updated_at = now()
       where id = v_id
         and merged_into is null;
      update public.members
         set partner_member_id = v_id,
             updated_at = now()
       where id = v_partner_id
         and merged_into is null
         and (
           partner_member_id is null
           or partner_member_id = v_id
           or membership_status in (
             'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
           )
         );
    end if;
  elsif (v_is_new or v_open) and v_old_partner is not null then
    update public.members
       set partner_member_id = null,
           updated_at = now()
     where id = v_old_partner
       and partner_member_id = v_id;
    update public.members
       set partner_member_id = null,
           updated_at = now()
     where id = v_id
       and partner_member_id = v_old_partner;
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
           when v_level = 'associate' then '<p><strong>Interested in:</strong> Associate membership</p>'
           else ''
         end
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
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;


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


create or replace function public.set_application_membership_level(
  p_member_id uuid,
  p_level text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $level$
declare
  rec public.members%rowtype;
  v_actor record;
  v_level text := lower(btrim(coalesce(p_level, '')));
  v_partner uuid;
  v_partner_status text;
  v_partner_level text;
  v_year integer;
  v_label text;
  v_note text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing application.');
  end if;
  if v_level not in ('full', 'associate', 'auxiliary', 'loa') then
    return jsonb_build_object('ok', false, 'message', 'Choose Full Krewe, Associate, Auxiliary, or Leave of absence.');
  end if;

  select * into rec
    from public.members
   where id = p_member_id
   for update;

  if not found or rec.merged_into is not null then
    return jsonb_build_object('ok', false, 'message', 'That application was not found.');
  end if;
  if rec.membership_status not in (
    'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process'
  ) then
    return jsonb_build_object(
      'ok', false,
      'message', 'Membership level can be set from New interest through Background check in process.'
    );
  end if;

  v_label := case v_level
    when 'associate' then 'Associate'
    when 'auxiliary' then 'Auxiliary'
    when 'loa' then 'Leave of absence'
    else 'Full Krewe'
  end;
  v_note := 'Membership level set to ' || v_label || '.';

  update public.members
     set membership_level = v_level,
         updated_at = now()
   where id = rec.id;

  select * into v_actor from public._officer_actor();

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, 'level_set', v_note, rec.membership_status, rec.membership_status,
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  v_year := extract(year from (timezone('America/New_York', now())))::integer;
  if to_regprocedure('public.kos_membership_dues_year(date)') is not null then
    v_year := public.kos_membership_dues_year(null);
  end if;
  if to_regprocedure('public.kos_log_dues_event(text,uuid,integer,jsonb)') is not null then
    perform public.kos_log_dues_event(
      'level_set',
      rec.id,
      v_year,
      jsonb_build_object(
        'membership_level', v_level,
        'from_level', rec.membership_level
      )
    );
  end if;

  v_partner := rec.partner_member_id;
  if v_partner is null and to_regprocedure('public.kos_match_application_partner(uuid)') is not null then
    v_partner := public.kos_match_application_partner(rec.id);
  end if;
  if v_partner is not null and v_partner is distinct from rec.id then
    select m.membership_status, m.membership_level
      into v_partner_status, v_partner_level
      from public.members m
     where m.id = v_partner
       and m.merged_into is null
     for update;
    if found and v_partner_status in (
      'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process'
    ) then
      update public.members
         set membership_level = v_level,
             updated_at = now()
       where id = v_partner;
      insert into public.membership_application_actions (
        member_id, action, note, from_status, to_status,
        actor_uid, actor_email, actor_name
      ) values (
        v_partner, 'level_set', v_note, v_partner_status, v_partner_status,
        v_actor.uid, v_actor.email, v_actor.display_name
      );
      if to_regprocedure('public.kos_log_dues_event(text,uuid,integer,jsonb)') is not null then
        perform public.kos_log_dues_event(
          'level_set',
          v_partner,
          v_year,
          jsonb_build_object(
            'membership_level', v_level,
            'from_level', v_partner_level,
            'linked_to', rec.id
          )
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'Membership level saved as ' || v_label || '. The induction email uses this level.',
    'membership_level', v_level
  );
end;
$level$;

revoke all on function public.set_application_membership_level(uuid, text) from public, anon;
grant execute on function public.set_application_membership_level(uuid, text) to authenticated;

comment on function public.set_application_membership_level(uuid, text) is
  'Reviewer sets full, associate, auxiliary, or loa from New interest through Background check in process. The linked partner in those stages is updated too. No email.';

