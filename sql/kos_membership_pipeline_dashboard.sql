-- Membership Applications pipeline dashboard.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Melissa applies this file. Do not apply it from the site deploy.
--   Run after sql/kos_application_dob.sql and sql/kos_joining_packet_email_template.sql.
--   If sql/kos_zeffy_dues_ticket_payments.sql is applied later, run this file
--   again so background_check stays a valid product_kind.
--   Safe to run again.
--
-- This file does not email anyone. It does not update membership_status
-- on existing rows. It does not queue the dues invoice for people who
-- already applied. Backfill of old payments is a separate file,
-- sql/kos_background_check_payment_backfill.sql, and that file also
-- sends no email.
--
-- New applicants, going forward:
--   pending-new        New interest. Chair calls, then sends the background check email.
--   background-check   Background check fee pending. Full application may be in or not.
--   bg_paid            Background check fee paid. Chair starts the check.
--   bg_in_process      Background check in process.
--   dues-pending       Induction pending. Dues link and meeting invite are out.
--   active             Member. Voted in at a general meeting.
-- The dues invoice is created when the chair sends the induction email,
-- not when the full application is saved.
-- A Zeffy background check payment is product_kind background_check.
-- The webhook calls kos_apply_background_check_payment, which links the
-- payer and the partner, writes history, moves background-check to bg_paid,
-- and emails the Membership Chair. That email is only for a new payment
-- the webhook marks notify true. Active members are not emailed.

-- ---------------------------------------------------------------------------
-- 1) Status, payment kind, history actions, partner link on a payment.
-- ---------------------------------------------------------------------------
alter table public.members drop constraint if exists members_membership_status_check;
alter table public.members add constraint members_membership_status_check
  check (membership_status in (
    'active', 'inactive', 'lapsed', 'prospect',
    'pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending', 'pending-renewal',
    'merged', 'declined', 'archived'
  ));

alter table public.members add column if not exists partner_member_id uuid;

do $pay_kind$
declare
  r record;
begin
  if to_regclass('public.payments') is null then
    raise exception 'payments is missing. Run sql/kos_payments.sql first.';
  end if;
  for r in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'payments'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%product_kind%'
  loop
    execute format('alter table public.payments drop constraint %I', r.conname);
  end loop;
end
$pay_kind$;

alter table public.payments
  add constraint payments_product_kind_check
  check (product_kind in (
    'store', 'event', 'dues', 'donation', 'raffle', 'background_check', 'other'
  ));

alter table public.payments
  add column if not exists partner_member_id uuid;

do $pay_fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_partner_member_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_partner_member_id_fkey
      foreign key (partner_member_id) references public.members(id) on delete set null;
  end if;
end
$pay_fk$;

comment on column public.payments.partner_member_id is
  'Second application covered by this payment. Set for a couple background check. Not a client write.';

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
    'note', 'renewed'
  ));

-- Campaign titles used to recognize the two Zeffy background check forms.
-- Hyphens here match an em dash in the live Zeffy title after the webhook folds it.
update public.kos_runtime_flags
   set value = jsonb_set(
         jsonb_set(
           value,
           '{individual,description}',
           to_jsonb('Krewe of Shamrock Background Check - Individual'::text),
           true
         ),
         '{couple,description}',
         to_jsonb('Krewe of Shamrock Background Check - Couple'::text),
         true
       ),
       updated_at = now()
 where key = 'background_check_payments'
   and jsonb_typeof(value) = 'object'
   and not (coalesce(value->'individual', '{}'::jsonb) ? 'description');

-- ---------------------------------------------------------------------------
-- 2) Partner match. Name on the application, either direction. Not a client API.
-- ---------------------------------------------------------------------------
create or replace function public.kos_match_application_partner(p_member_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $partner$
declare
  v_member public.members%rowtype;
  v_partner uuid;
  v_name text;
  v_partner_name text;
begin
  select * into v_member
    from public.members
   where id = p_member_id
     and merged_into is null;
  if not found then
    return null;
  end if;
  if v_member.partner_member_id is not null then
    return v_member.partner_member_id;
  end if;

  v_name := lower(btrim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, '')));
  v_partner_name := lower(btrim(coalesce(v_member.partner_first_name, '') || ' ' || coalesce(v_member.partner_last_name, '')));

  if v_partner_name <> '' then
    select m.id into v_partner
      from public.members m
     where m.merged_into is null
       and m.id <> v_member.id
       and lower(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, ''))) = v_partner_name
     order by
       case
         when m.membership_status in ('pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending', 'prospect')
           then 0
         else 1
       end,
       m.created_at
     limit 1;
    if v_partner is not null then
      return v_partner;
    end if;
  end if;

  if v_name <> '' then
    select m.id into v_partner
      from public.members m
     where m.merged_into is null
       and m.id <> v_member.id
       and lower(btrim(coalesce(m.partner_first_name, '') || ' ' || coalesce(m.partner_last_name, ''))) = v_name
     order by m.created_at
     limit 1;
    if v_partner is not null then
      return v_partner;
    end if;
  end if;

  return null;
end;
$partner$;

revoke all on function public.kos_match_application_partner(uuid) from public, anon, authenticated;

comment on function public.kos_match_application_partner(uuid) is
  'Internal. The other application for a couple, by partner_member_id or by the partner name on either application.';

-- ---------------------------------------------------------------------------
-- 3) Link a background check payment. Emails the chair only when p.notify
--    is true, the chair has not already been told about this payment, and
--    the payer is still an open applicant. Active members are never emailed.
-- ---------------------------------------------------------------------------
create or replace function public.kos_apply_background_check_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $apply$
declare
  v_payment public.payments%rowtype;
  v_member uuid;
  v_partner uuid;
  v_couple boolean := false;
  v_amount integer;
  v_email text;
  v_status text;
  v_to text;
  v_who uuid;
  v_ids uuid[] := '{}';
  v_note text;
  v_name text;
  v_dollars integer;
  v_notify boolean := coalesce(p->>'notify', '') = 'true';
  v_move boolean := coalesce(p->>'move_status', 'true') = 'true';
  v_already boolean := false;
  v_told text;
  v_open boolean := false;
  v_html text;
  v_chair record;
  v_chair_sent boolean := false;
  v_seen text[] := '{}';
begin
  if nullif(p->>'payment_id', '') is not null then
    select * into v_payment from public.payments where id = (p->>'payment_id')::uuid;
  end if;
  if v_payment.id is null and nullif(btrim(coalesce(p->>'provider_payment_id', '')), '') is not null then
    select * into v_payment
      from public.payments
     where provider_payment_id = btrim(p->>'provider_payment_id')
       and provider = coalesce(nullif(btrim(coalesce(p->>'provider', '')), ''), provider)
     order by created_at desc
     limit 1;
  end if;
  if v_payment.id is null then
    return jsonb_build_object('ok', false, 'message', 'Payment was not found.');
  end if;

  v_amount := coalesce(v_payment.amount_cents, nullif(p->>'amount_cents', '')::integer, 0);
  v_couple := v_amount >= 7000
    or coalesce(v_payment.description, '') ~* 'couple'
    or coalesce(p->>'description', '') ~* 'couple'
    or coalesce(p->>'campaign_url', '') ~* 'background-check-couple'
    or coalesce(v_payment.raw::text, '') ~* 'background-check-couple';

  update public.payments
     set product_kind = 'background_check'
   where id = v_payment.id
     and product_kind is distinct from 'background_check';

  v_member := coalesce(nullif(p->>'member_id', '')::uuid, v_payment.member_id);
  if v_member is null then
    v_email := lower(btrim(coalesce(v_payment.payer_email, p->>'payer_email', '')));
    if v_email <> '' and to_regprocedure('public.kos_match_member_by_email(text)') is not null then
      v_member := public.kos_match_member_by_email(v_email);
    elsif v_email <> '' then
      select m.id into v_member
        from public.members m
       where m.merged_into is null
         and lower(btrim(coalesce(m.email, ''))) = v_email
       order by m.created_at
       limit 1;
    end if;
  end if;

  if nullif(p->>'partner_member_id', '') is not null then
    v_partner := (p->>'partner_member_id')::uuid;
    v_couple := true;
  elsif v_member is not null and (
    v_couple
    or exists (
      select 1 from public.members m
       where m.id = v_member and m.application_fee_type = 'dual'
    )
  ) then
    v_couple := true;
    v_partner := public.kos_match_application_partner(v_member);
  end if;

  if v_partner = v_member then
    v_partner := null;
  end if;

  if v_member is not null and v_partner is not null then
    update public.members
       set partner_member_id = v_partner,
           updated_at = now()
     where id = v_member
       and merged_into is null
       and (partner_member_id is null or partner_member_id = v_partner);
    update public.members
       set partner_member_id = v_member,
           updated_at = now()
     where id = v_partner
       and merged_into is null
       and (partner_member_id is null or partner_member_id = v_member);
    update public.payments
       set member_id = v_member,
           partner_member_id = v_partner
     where id = v_payment.id;
  elsif v_member is not null then
    update public.payments
       set member_id = coalesce(member_id, v_member)
     where id = v_payment.id;
  end if;

  v_note := 'Background check paid. Payment ' || v_payment.id::text;
  v_already := exists (
    select 1
      from public.membership_application_actions a
     where a.action = 'background_check_paid'
       and a.note like '%' || v_payment.id::text || '%'
  );
  v_told := coalesce(v_payment.raw->>'background_check_chair_notified', '');

  if v_member is not null then
    v_ids := array[v_member];
    if v_partner is not null then
      v_ids := v_ids || v_partner;
    end if;
  end if;

  if not v_already then
    foreach v_who in array v_ids loop
      select m.membership_status into v_status
        from public.members m
       where m.id = v_who
         and m.merged_into is null
       for update;
      if not found then
        continue;
      end if;
      v_to := v_status;
      if v_move and v_status = 'background-check' then
        v_to := 'bg_paid';
        update public.members
           set membership_status = 'bg_paid',
               updated_at = now()
         where id = v_who;
        v_open := true;
      elsif v_status in ('pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending', 'prospect') then
        v_open := true;
      end if;
      insert into public.membership_application_actions (
        member_id, action, note, from_status, to_status, actor_name
      ) values (
        v_who, 'background_check_paid', v_note, v_status, v_to, 'Zeffy'
      );
    end loop;
  else
    select m.membership_status into v_status
      from public.members m
     where m.id = v_member;
    v_open := v_status in ('pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending', 'prospect');
  end if;

  if v_notify and v_told = '' and v_open then
    select btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, ''))
      into v_name
      from public.members m
     where m.id = v_member;
    if coalesce(v_name, '') = '' then
      v_name := coalesce(nullif(btrim(coalesce(v_payment.payer_name, p->>'payer_name', '')), ''), 'An applicant');
    end if;
    if v_amount > 0 then
      v_dollars := round(v_amount / 100.0);
    elsif v_couple then
      v_dollars := 75;
    else
      v_dollars := 50;
    end if;
    v_html :=
      '<p>' || public.kos_html_text(v_name) || ' paid the $' || v_dollars::text
      || ' background check fee. Their card is in Background check fee paid. Choose Start background check when you are ready to paste the driver''s license and Social Security number into the background check site.</p>'
      || '<p><a href="https://www.kreweofshamrock.com/members.html#applications">Open Membership Applications</a></p>';
    for v_chair in
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
              from public.profiles pr
              join public.member_roles r on r.user_id = pr.id
             where pr.member_id = m.id
               and r.role = 'committee'
               and r.committee ilike 'Membership'
          )
        )
    loop
      if v_chair.email = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, v_chair.email);
      perform public.enqueue_email(
        v_chair.email,
        nullif(v_chair.full_name, ''),
        'Background check paid',
        v_html,
        'membership_background_check_paid',
        v_member
      );
      v_chair_sent := true;
    end loop;
    if not v_chair_sent then
      perform public.enqueue_email(
        'lsugrue99@gmail.com',
        'Membership Chair',
        'Background check paid',
        v_html,
        'membership_background_check_paid',
        v_member
      );
    end if;
    update public.payments
       set raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('background_check_chair_notified', 'sent')
     where id = v_payment.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment.id,
    'member_id', v_member,
    'partner_member_id', v_partner,
    'already', v_already,
    'notified', v_notify and v_told = '' and v_open
  );
end;
$apply$;

revoke all on function public.kos_apply_background_check_payment(jsonb) from public, anon, authenticated;
grant execute on function public.kos_apply_background_check_payment(jsonb) to service_role;

comment on function public.kos_apply_background_check_payment(jsonb) is
  'Service role. Files a payment as background_check, links both applications for a couple, writes Background check paid history, and moves joining-packet applications to bg_paid. Emails the Membership Chair only when notify is true and the payer is still an open applicant.';

-- Let the live kos_record_payment keep a background_check kind instead of
-- rewriting it to other. Does not replace the rest of that function.
do $patch_kind$
declare
  v_def text;
begin
  if to_regprocedure('public.kos_record_payment(jsonb)') is null then
    return;
  end if;
  v_def := pg_get_functiondef('public.kos_record_payment(jsonb)'::regprocedure);
  if position('background_check' in v_def) > 0 then
    return;
  end if;
  v_def := replace(
    v_def,
    '''store'', ''event'', ''dues'', ''donation'', ''raffle'', ''other''',
    '''store'', ''event'', ''dues'', ''donation'', ''raffle'', ''background_check'', ''other'''
  );
  v_def := replace(
    v_def,
    '''store'',''event'',''dues'',''donation'',''raffle'',''other''',
    '''store'',''event'',''dues'',''donation'',''raffle'',''background_check'',''other'''
  );
  if position('background_check' in v_def) = 0 then
    raise notice 'kos_record_payment allow-list was not patched. kos_apply_background_check_payment still refiles the row.';
    return;
  end if;
  execute v_def;
end
$patch_kind$;

-- ---------------------------------------------------------------------------
-- 4) Dues letter after the check passes. One email. Not used by backfill.
-- ---------------------------------------------------------------------------
create or replace function public.kos_queue_dues_choice_email(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $choice$
declare
  v_member public.members%rowtype;
  v_year integer := public.kos_membership_dues_year();
  v_level text;
  v_title text;
  v_button text;
  v_amount numeric;
  v_explainer text;
  v_fallback_amount numeric;
  v_fallback_explainer text;
  v_link text;
  v_money text;
  v_html text;
  v_name text;
  v_mail uuid;
  v_only text;
begin
  select * into v_member
    from public.members
   where id = p_member_id
     and merged_into is null;
  if not found then
    return jsonb_build_object('ok', false, 'emailed', false, 'message', 'Member was not found.');
  end if;

  v_only := lower(btrim(coalesce(v_member.membership_level, '')));
  if v_only not in ('full', 'associate', 'auxiliary', 'loa') then
    v_only := null;
  end if;

  v_name := coalesce(nullif(btrim(v_member.first_name), ''), 'friend');
  v_html :=
    '<p>Dear ' || public.kos_html_text(v_name) || ',</p>'
    || '<p>You passed the background check. The next step is membership dues. This is not the background check fee.</p>';

  if v_only is null then
    v_html := v_html
      || '<p>No membership level is on your application yet, so here is each choice. Read the short note, then use that level''s button.</p>';
  end if;

  for v_level, v_title, v_button, v_amount, v_explainer in
    select item_level, item_title, item_button, item_amount, item_explainer
      from (values
        ('full'::text, 'Full Krewe'::text, 'Pay Full Krewe dues'::text, 375::numeric,
          'You''re a voting member, and you march in all the parades. You also share the 12/12 volunteer commitment: 12 hours in the Krewe year (June through May), or $12 for each hour you don''t work.'::text),
        ('associate'::text, 'Associate'::text, 'Pay Associate dues'::text, 450::numeric,
          'This is for one year. You can join two parades of your choice. There''s no vote, and you don''t take on the 12/12 volunteer commitment.'::text),
        ('auxiliary'::text, 'Auxiliary'::text, 'Pay Auxiliary dues'::text, 200::numeric,
          'This is a non-voting membership for one major parade. The fee already includes the background check and the membership portion.'::text),
        ('loa'::text, 'Leave of absence'::text, 'Pay leave of absence dues'::text, 100::numeric,
          'This is our social membership for a year when you''d like to step back and still stay connected. That''s leave of absence.'::text)
      ) as levels(item_level, item_title, item_button, item_amount, item_explainer)
     where v_only is null or item_level = v_only
  loop
    v_link := null;
    v_fallback_amount := v_amount;
    v_fallback_explainer := v_explainer;
    if to_regclass('public.kos_dues_catalog') is not null then
      select c.amount,
             coalesce(nullif(btrim(c.explainer), ''), v_explainer),
             nullif(btrim(c.zeffy_url), '')
        into v_amount, v_explainer, v_link
        from public.kos_dues_catalog c
       where c.level = v_level
         and c.active
       order by c.membership_year desc
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
      || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">'
      || public.kos_html_text(v_title) || ', ' || v_money || '</h2>'
      || '<p>' || public.kos_html_text(v_explainer) || '</p>';
    if v_link is not null then
      v_html := v_html
        || '<p style="margin:8px 0 18px;"><a href="' || public.kos_html_text(v_link)
        || '" style="display:inline-block;background:#14532d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;">'
        || public.kos_html_text(v_button) || '</a></p>';
    else
      v_html := v_html
        || '<p>We don''t have that pay link ready yet. Please write to treasurer@kreweofshamrock.com before you pay, and please don''t send card numbers by email.</p>';
    end if;
  end loop;

  v_html := v_html || '<p>Sláinte,<br>Krewe of Shamrock</p>';
  if to_regprocedure('public.wrap_all_krewe_email_html(text,text)') is not null then
    v_html := public.wrap_all_krewe_email_html('Your Krewe of Shamrock dues link', v_html);
  end if;

  if v_member.email is not null and position('@' in v_member.email) > 0 then
    v_mail := public.enqueue_email(
      v_member.email,
      nullif(btrim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, '')), ''),
      'Your Krewe of Shamrock dues link',
      v_html,
      'invoice_notice',
      v_member.id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'emailed', v_mail is not null,
    'year', v_year,
    'membership_level', v_only,
    'message', case
      when v_mail is not null and v_only is null then 'Dues email queued with every membership level.'
      when v_mail is not null then 'Dues email queued for their level.'
      else 'Dues email could not be queued.'
    end
  );
end;
$choice$;

revoke all on function public.kos_queue_dues_choice_email(uuid) from public, anon, authenticated;

comment on function public.kos_queue_dues_choice_email(uuid) is
  'Internal. One dues email after the background check passes. Every level when membership_level is empty. One level when it is set. Not a client API.';

create or replace function public.kos_application_dues_already_paid(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $paid$
  -- Own dues row, or a payment that names this person (payer or the partner
  -- on a shared couple charge). The other person's separate dues do not count.
  select exists (
    select 1
      from public.payments p
     where p.product_kind = 'dues'
       and (
         p.member_id = p_member_id
         or p.partner_member_id = p_member_id
       )
  )
  or (
    to_regclass('public.dues_payments') is not null
    and exists (
      select 1 from public.dues_payments d
       where d.member_id = p_member_id
         and d.paid
    )
  );
$paid$;

revoke all on function public.kos_application_dues_already_paid(uuid) from public, anon, authenticated;

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
    'pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending', 'pending-renewal', 'prospect'
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
  'Reviewer-only note. Allows bg_paid so a note can be saved while the background check is in progress. Does not change status and does not send email.';

-- ---------------------------------------------------------------------------
-- 4b) Next membership meeting, dues offer, and the induction letter.
--     The dues row is created here, when the chair sends the letter.
-- ---------------------------------------------------------------------------
create or replace function public.kos_next_membership_meeting()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $meet$
declare
  v_name text;
  v_when timestamptz;
  v_place text;
begin
  if to_regclass('public.events') is null then
    return null;
  end if;
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'events'
       and column_name = 'location'
  ) then
    return null;
  end if;
  select e.name, e.start_time, nullif(btrim(coalesce(e.location, '')), '')
    into v_name, v_when, v_place
    from public.events e
   where e.start_time > now()
     and (
       lower(coalesce(e.event_type, '')) = 'meeting'
       or e.name ilike '%general meeting%'
       or e.name ilike '%membership meeting%'
     )
   order by e.start_time
   limit 1;
  if v_when is null or v_place is null then
    return null;
  end if;
  return jsonb_build_object(
    'name', coalesce(nullif(btrim(v_name), ''), 'Membership meeting'),
    'when_text', to_char(v_when at time zone 'America/New_York', 'FMDay, FMMonth FMDD, YYYY')
      || ' at '
      || to_char(v_when at time zone 'America/New_York', 'FMHH12:MI AM'),
    'place', v_place
  );
end;
$meet$;

revoke all on function public.kos_next_membership_meeting() from public, anon;
grant execute on function public.kos_next_membership_meeting() to authenticated;

-- June through May, labeled by the start year. November 2026 and January 2027
-- are both membership year 2026. June 1 opens the next year.
create or replace function public.kos_membership_dues_year(p_on date default null)
returns integer
language plpgsql
stable
set search_path = public
as $dyear$
declare
  v_on date := coalesce(p_on, (timezone('America/New_York', now()))::date);
begin
  if to_regprocedure('public.kos_dues_season_year(date)') is not null then
    return public.kos_dues_season_year(v_on);
  end if;
  if extract(month from v_on) >= 6 then
    return extract(year from v_on)::integer;
  end if;
  return extract(year from v_on)::integer - 1;
end;
$dyear$;

revoke all on function public.kos_membership_dues_year(date) from public, anon;

-- 30 days after the issue date. June 30 of the season start is already past
-- for anyone invoiced later in that June-May year.
create or replace function public.kos_membership_dues_due_date(p_issued date default null)
returns date
language plpgsql
stable
set search_path = public
as $ddue$
declare
  v_on date := coalesce(p_issued, (timezone('America/New_York', now()))::date);
begin
  if to_regprocedure('public.kos_dues_invoice_due_date(date)') is not null then
    return public.kos_dues_invoice_due_date(v_on);
  end if;
  return v_on + 30;
end;
$ddue$;

revoke all on function public.kos_membership_dues_due_date(date) from public, anon;

create or replace function public.kos_prepare_induction_dues(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $offer$
declare
  v_year integer := public.kos_membership_dues_year();
  v_due date := public.kos_membership_dues_due_date();
  v_member record;
  v_dues public.dues_payments%rowtype;
  v_has boolean := false;
  v_quote jsonb;
  v_level text;
  v_amount numeric;
  v_url text;
  v_label text;
  v_name text;
begin
  if p_member_id is null or to_regclass('public.dues_payments') is null then
    return jsonb_build_object('ok', false, 'paid', false, 'message', 'Dues records are not installed.');
  end if;
  select m.id, m.membership_level, m.first_name, m.last_name, m.email
    into v_member
    from public.members m
   where m.id = p_member_id
     and m.merged_into is null;
  if not found then
    return jsonb_build_object('ok', false, 'paid', false, 'message', 'Member was not found.');
  end if;
  v_name := btrim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, ''));
  if public.kos_application_dues_already_paid(p_member_id) then
    return jsonb_build_object(
      'ok', true, 'paid', true, 'name', v_name,
      'message', 'Dues are already paid.'
    );
  end if;
  if to_regprocedure('public.kos_dues_quote(integer,text)') is null then
    return jsonb_build_object(
      'ok', false, 'paid', false, 'name', v_name,
      'message', 'Dues catalog is not installed.'
    );
  end if;
  v_quote := public.kos_dues_quote(v_year, v_member.membership_level);
  v_level := v_quote->>'level';
  v_amount := (v_quote->>'amount')::numeric;
  v_url := nullif(btrim(v_quote->>'zeffy_url'), '');
  v_label := case v_level
    when 'associate' then 'Associate'
    when 'loa' then 'Leave of absence'
    when 'auxiliary' then 'Auxiliary'
    else 'Full Krewe'
  end;
  if coalesce(v_quote->>'from_catalog', 'false') <> 'true' or v_amount is null or v_url is null then
    return jsonb_build_object(
      'ok', false, 'paid', false, 'name', v_name, 'level', v_level, 'label', v_label,
      'message', 'No dues pay link is set for this level yet.'
    );
  end if;

  select * into v_dues
    from public.dues_payments
   where member_id = p_member_id
     and membership_year = v_year;
  v_has := found;
  if v_has and coalesce(v_dues.waiver_status, '') = 'applied' then
    return jsonb_build_object('ok', true, 'paid', true, 'name', v_name, 'message', 'A dues waiver is already on file.');
  end if;
  if v_has and v_dues.paid then
    return jsonb_build_object('ok', true, 'paid', true, 'name', v_name, 'message', 'Dues are already paid.');
  end if;
  if not v_has then
    insert into public.dues_payments (
      member_id, membership_year, amount, due_date, paid,
      membership_level, standard_amount, zeffy_campaign_key, notes
    ) values (
      p_member_id, v_year, v_amount, v_due, false,
      v_level, v_amount, v_url, 'Induction dues link'
    );
  else
    update public.dues_payments
       set membership_level = v_level,
           standard_amount = v_amount,
           amount = v_amount,
           zeffy_campaign_key = v_url,
           due_date = case
             when due_date is null or due_date < (timezone('America/New_York', now()))::date then v_due
             else due_date
           end
     where id = v_dues.id
       and paid = false
       and coalesce(waiver_status, '') <> 'applied';
  end if;
  if to_regprocedure('public.kos_log_dues_event(text,uuid,integer,jsonb)') is not null then
    perform public.kos_log_dues_event(
      'invoice_created',
      p_member_id,
      v_year,
      jsonb_build_object(
        'source', 'induction',
        'membership_level', v_level,
        'amount', v_amount,
        'zeffy_campaign_key', v_url
      )
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'paid', false,
    'name', v_name,
    'level', v_level,
    'label', v_label,
    'amount', trim(to_char(v_amount, 'FM999990.00')),
    'url', v_url
  );
end;
$offer$;

revoke all on function public.kos_prepare_induction_dues(uuid) from public, anon, authenticated;

create or replace function public.kos_induction_letter_html(
  p_first text,
  p_offers jsonb,
  p_when text,
  p_place text
)
returns text
language plpgsql
stable
set search_path = public
as $letter$
declare
  v_html text;
  v_offer jsonb;
  v_any_link boolean := false;
begin
  v_html :=
    '<p>Dear ' || public.kos_html_text(coalesce(nullif(btrim(p_first), ''), 'friend')) || ',</p>'
    || '<p>Your background check is complete. We would like to welcome you in person.</p>'
    || '<p>You are invited to your in-person induction at our next membership meeting.</p>'
    || '<p><strong>Date and time:</strong> ' || public.kos_html_text(p_when) || '</p>'
    || '<p><strong>Place:</strong> ' || public.kos_html_text(p_place) || '</p>'
    || '<p>At that meeting we will ask you to share a little about why you want to join the Krewe. A sentence or two is plenty.</p>';
  if jsonb_typeof(p_offers) = 'array' then
    for v_offer in select value from jsonb_array_elements(p_offers)
    loop
      if coalesce(v_offer->>'paid', '') = 'true' then
        v_html := v_html || '<p>' || public.kos_html_text(coalesce(v_offer->>'name', 'Dues'))
          || ': membership dues are already paid.</p>';
      elsif nullif(v_offer->>'url', '') is not null then
        v_any_link := true;
        v_html := v_html
          || '<p><strong>' || public.kos_html_text(coalesce(v_offer->>'label', 'Full Krewe'))
          || '</strong>'
          || case when nullif(v_offer->>'name', '') is not null
               then ' for ' || public.kos_html_text(v_offer->>'name')
               else ''
             end
          || ': $' || public.kos_html_text(coalesce(v_offer->>'amount', ''))
          || '. This is membership dues, not the background check fee.</p>'
          || '<p style="margin:18px 0;"><a href="' || public.kos_html_text(v_offer->>'url') || '" '
          || 'style="display:inline-block;background:#14532d;color:#fff;padding:12px 18px;border-radius:999px;'
          || 'text-decoration:none;font-weight:700;">Pay dues on Zeffy</a></p>';
      else
        v_html := v_html || '<p>A dues pay link is not ready yet. The treasurer will send it. This is membership dues, not the background check fee.</p>';
      end if;
    end loop;
  end if;
  if not v_any_link and (p_offers is null or jsonb_array_length(coalesce(p_offers, '[]'::jsonb)) = 0) then
    v_html := v_html || '<p>A dues pay link is not ready yet. The treasurer will send it.</p>';
  end if;
  v_html := v_html || '<p>We are glad you are joining us.</p><p>Sláinte!</p>';
  return v_html;
end;
$letter$;

revoke all on function public.kos_induction_letter_html(text, jsonb, text, text) from public, anon, authenticated;

create or replace function public.kos_induction_meeting(p_meeting text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $when$
declare
  v_when text := nullif(btrim(split_part(coalesce(p_meeting, ''), E'\n', 1)), '');
  v_place text := nullif(btrim(split_part(coalesce(p_meeting, ''), E'\n', 2)), '');
  v_meet jsonb;
begin
  if v_when is not null and v_place is not null then
    return jsonb_build_object('ok', true, 'when_text', left(v_when, 160), 'place', left(v_place, 200));
  end if;
  v_meet := public.kos_next_membership_meeting();
  if v_meet is not null then
    return jsonb_build_object(
      'ok', true,
      'when_text', v_meet->>'when_text',
      'place', v_meet->>'place',
      'from_calendar', true
    );
  end if;
  return jsonb_build_object(
    'ok', false,
    'needs_meeting', true,
    'message', 'Enter the next membership meeting date, time, and place before sending the induction email.'
  );
end;
$when$;

revoke all on function public.kos_induction_meeting(text) from public, anon;
grant execute on function public.kos_induction_meeting(text) to authenticated;

drop function if exists public.kos_pass_background_check(uuid, text);

create or replace function public.kos_pass_background_check(
  p_member_id uuid,
  p_note text default null,
  p_meeting text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $pass$
declare
  rec public.members%rowtype;
  v_actor record;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
  v_partner uuid;
  v_ids uuid[];
  v_who uuid;
  v_row public.members%rowtype;
  v_meet jsonb;
  v_when text;
  v_place text;
  v_offers jsonb := '[]'::jsonb;
  v_offer jsonb;
  v_html text;
  v_subject text := 'Your Krewe of Shamrock induction';
  v_name text;
  v_message text;
  v_moved integer := 0;
  v_emailed boolean := false;
  v_mail_to public.members%rowtype;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  select * into rec
    from public.members
   where id = p_member_id
     and merged_into is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That application was not found.');
  end if;
  if rec.membership_status <> 'bg_in_process' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Send the induction email from Background check in process.'
    );
  end if;

  v_meet := public.kos_induction_meeting(p_meeting);
  if coalesce(v_meet->>'ok', '') <> 'true' then
    return v_meet;
  end if;
  v_when := v_meet->>'when_text';
  v_place := v_meet->>'place';

  v_partner := public.kos_match_application_partner(rec.id);
  if v_partner = rec.id then
    v_partner := null;
  end if;
  v_ids := array[rec.id];
  if v_partner is not null then
    select m.membership_status into v_name
      from public.members m
     where m.id = v_partner
       and m.merged_into is null;
    if v_name = 'bg_in_process' then
      v_ids := v_ids || v_partner;
    end if;
  end if;

  foreach v_who in array v_ids loop
    if not public.kos_application_dues_already_paid(v_who) then
      v_offer := public.kos_prepare_induction_dues(v_who);
      v_offers := v_offers || jsonb_build_array(v_offer);
    else
      select btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, ''))
        into v_name
        from public.members m
       where m.id = v_who;
      v_offers := v_offers || jsonb_build_array(jsonb_build_object(
        'ok', true, 'paid', true, 'name', coalesce(v_name, '')
      ));
    end if;
  end loop;

  select * into v_actor from public._officer_actor();
  v_note := coalesce(v_note || ' ', '') || 'Induction at ' || v_when || ', ' || v_place || '.';

  foreach v_who in array v_ids loop
    select * into v_row
      from public.members
     where id = v_who
       and merged_into is null
     for update;
    if not found then
      continue;
    end if;
    if v_row.membership_status not in ('bg_in_process', 'dues-pending') then
      continue;
    end if;
    if v_row.membership_status is distinct from 'dues-pending' then
      update public.members
         set membership_status = 'dues-pending',
             updated_at = now()
       where id = v_row.id;
      v_moved := v_moved + 1;
    end if;
    insert into public.membership_application_actions (
      member_id, action, note, from_status, to_status,
      actor_uid, actor_email, actor_name
    ) values (
      v_row.id,
      'dues_pending',
      v_note,
      v_row.membership_status,
      'dues-pending',
      v_actor.uid, v_actor.email, v_actor.display_name
    );
  end loop;

  select * into v_mail_to
    from public.members
   where id = v_ids[1];
  v_html := public.kos_induction_letter_html(
    coalesce(nullif(btrim(v_mail_to.first_name), ''), 'friend'),
    v_offers,
    v_when,
    v_place
  );
  if to_regprocedure('public.wrap_all_krewe_email_html(text,text)') is not null then
    v_html := public.wrap_all_krewe_email_html(v_subject, v_html);
  end if;
  v_name := btrim(coalesce(v_mail_to.first_name, '') || ' ' || coalesce(v_mail_to.last_name, ''));
  if public.enqueue_email(
    v_mail_to.email,
    nullif(v_name, ''),
    v_subject,
    v_html,
    'membership_induction',
    v_mail_to.id
  ) is not null then
    v_emailed := true;
  end if;

  if v_emailed then
    v_message := 'Induction pending. We emailed the dues link, the meeting, and the invitation to share why they want to join.';
  else
    v_message := 'Induction pending. The dues link email could not be queued. Please send the meeting details yourself.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'emailed', v_emailed,
    'message', v_message,
    'status', 'dues-pending',
    'moved', v_moved,
    'when_text', v_when,
    'place', v_place,
    'subject', v_subject,
    'preview_html', v_html
  );
end;
$pass$;

revoke all on function public.kos_pass_background_check(uuid, text, text) from public, anon, authenticated;

comment on function public.kos_pass_background_check(uuid, text, text) is
  'Chair action from Background check in process. Creates the level dues invoice, emails one induction letter with the dues link and the next membership meeting, and moves the applicant and partner to Induction pending.';

create or replace function public.preview_membership_induction_email(
  p_member_id uuid,
  p_meeting text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview$
declare
  rec public.members%rowtype;
  v_meet jsonb;
  v_level text;
  v_label text;
  v_amount text;
  v_offer jsonb;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  select * into rec from public.members where id = p_member_id and merged_into is null;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That application was not found.');
  end if;
  v_meet := public.kos_induction_meeting(p_meeting);
  v_level := lower(btrim(coalesce(rec.membership_level, 'full')));
  v_label := case v_level
    when 'associate' then 'Associate'
    when 'loa' then 'Leave of absence'
    when 'auxiliary' then 'Auxiliary'
    else 'Full Krewe'
  end;
  v_amount := case v_level
    when 'associate' then '450.00'
    when 'loa' then '100.00'
    when 'auxiliary' then '200.00'
    else '375.00'
  end;
  v_offer := '{}'::jsonb;
  if to_regprocedure('public.kos_dues_quote(integer,text)') is not null then
    v_offer := public.kos_dues_quote(public.kos_membership_dues_year(), rec.membership_level);
    if nullif(v_offer->>'amount', '') is not null then
      v_amount := trim(to_char((v_offer->>'amount')::numeric, 'FM999990.00'));
    end if;
    if nullif(v_offer->>'level', '') is not null then
      v_level := v_offer->>'level';
    end if;
    v_label := case v_level
      when 'associate' then 'Associate'
      when 'loa' then 'Leave of absence'
      when 'auxiliary' then 'Auxiliary'
      else 'Full Krewe'
    end;
  end if;
  v_offer := jsonb_build_array(jsonb_build_object(
    'paid', public.kos_application_dues_already_paid(rec.id),
    'name', btrim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, '')),
    'label', v_label,
    'amount', v_amount,
    'url', case
      when public.kos_application_dues_already_paid(rec.id) then null
      else nullif(v_offer->>'zeffy_url', '')
    end
  ));
  if coalesce(v_meet->>'ok', '') <> 'true' then
    return v_meet || jsonb_build_object('subject', 'Your Krewe of Shamrock induction', 'label', v_label, 'amount', v_amount);
  end if;
  return jsonb_build_object(
    'ok', true,
    'needs_meeting', false,
    'when_text', v_meet->>'when_text',
    'place', v_meet->>'place',
    'from_calendar', coalesce(v_meet->>'from_calendar', 'false') = 'true',
    'subject', 'Your Krewe of Shamrock induction',
    'label', v_label,
    'amount', v_amount,
    'preview_html', public.kos_induction_letter_html(
      coalesce(nullif(btrim(rec.first_name), ''), 'friend'),
      v_offer,
      v_meet->>'when_text',
      v_meet->>'place'
    )
  );
end;
$preview$;

revoke all on function public.preview_membership_induction_email(uuid, text) from public, anon;
grant execute on function public.preview_membership_induction_email(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Decisions. Approve sends the welcome letter from Induction pending.
-- ---------------------------------------------------------------------------
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

  if p_action = 'approve' and rec.membership_status in ('dues-pending', 'pending-renewal') then
    v_subject := 'Welcome to the Krewe of Shamrock';
    v_html :=
      '<p>Dear ' || public.kos_html_text(coalesce(nullif(btrim(rec.first_name), ''), 'friend')) || ',</p>'
      || '<p>Welcome. The Krewe voted you in at a general meeting, and you are on the roster.</p>'
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

drop function if exists public.set_membership_application_status(uuid, text, text);
drop function if exists public.set_membership_application_status(uuid, text, text, text);

create or replace function public.set_membership_application_status(
  p_member_id uuid,
  p_action text,
  p_note text default null,
  p_meeting text default null
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
  v_partner uuid;
  v_partner_status text;
begin
  if p_action = 'dues_pending' then
    return public.kos_pass_background_check(p_member_id, p_note, p_meeting);
  end if;

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
  if coalesce(v_result->>'ok', '') <> 'true' then
    return v_result;
  end if;

  v_partner := public.kos_match_application_partner(p_member_id);
  if v_partner = p_member_id then
    v_partner := null;
  end if;
  if v_partner is not null then
    select m.membership_status into v_partner_status
      from public.members m
     where m.id = v_partner
       and m.merged_into is null;
    if p_action = 'background_check' and v_partner_status in ('pending-new', 'prospect') then
      perform public._apply_membership_application_decision(v_partner, p_action, p_note);
    elsif p_action = 'start_background_check' and v_partner_status = 'bg_paid' then
      perform public._apply_membership_application_decision(v_partner, p_action, p_note);
    elsif p_action = 'approve' and v_partner_status = 'dues-pending' then
      perform public._apply_membership_application_decision(v_partner, p_action, p_note);
    elsif p_action in ('decline', 'archive')
      and v_partner_status in (
        'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
      ) then
      perform public._apply_membership_application_decision(v_partner, p_action, p_note);
    end if;
  end if;

  if p_action = 'background_check' then
    if v_emails_on then
      v_result := v_result || jsonb_build_object(
        'emailed', true,
        'message', 'Called. We emailed the background check fee ($50 individual or $75 couple) and the link to the full application. The email does not include a dues link, a Social Security number, or a driver''s license number.'
      );
    else
      v_pause := 'Called. The card moved to Background check fee pending. Prospect email is paused, so the background check email was not sent.';
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

revoke all on function public.set_membership_application_status(uuid, text, text, text) from public, anon;
grant execute on function public.set_membership_application_status(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Full application save. No dues invoice here.
-- ---------------------------------------------------------------------------
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
    'pending-new', 'prospect', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending'
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
    || '<p>This email does not include a date of birth or those numbers. The dues link comes after the check passes.</p>'
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
    || '<p>Sign in to the Member Hub and open Membership Applications. Lists show the last 4 of each ID only. Dates of birth are on the card. The dues link is not sent yet.</p>'
    || '<p><a href="https://www.kreweofshamrock.com/members.html#applications">Open Membership Applications</a></p>'
    || '<p>This email does not include a date of birth, a Social Security number, or a driver''s license number.</p>';

  perform public.kos_queue_membership_chair_and_president(
    v_subject,
    v_html,
    'membership_full_application_received',
    rec.id
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'We received your date of birth, driver''s license number, and Social Security number. The board uses date of birth, SSN, and driver''s license for the background check. Your information is held confidentially. The dues link comes after the check passes.'
  );
end;
$submit$;

revoke all on function public.submit_membership_full_application(text, text, text, text, text, date, date) from public;
grant execute on function public.submit_membership_full_application(text, text, text, text, text, date, date) to anon, authenticated;

comment on function public.submit_membership_full_application(text, text, text, text, text, date, date) is
  'Saves the full application. Does not queue membership dues. The chair sends the dues link after the background check passes.';

-- ---------------------------------------------------------------------------
-- 7) Joining packet: keep the finish link and the background check fees.
--    Remove the four dues pay links.
-- ---------------------------------------------------------------------------
create or replace function public.kos_joining_packet_email_defaults()
returns jsonb
language sql
immutable
set search_path = public
as $defaults$
  select jsonb_build_object(
    'subject', $s$We're glad you're joining the Krewe$s$,
    'greeting', $s$Dear {{first_name}},$s$,
    'intro', $s$We're so glad you're joining the Krewe of Shamrock. We're excited to have you. The rest of this note is simply how to finish joining, whenever you're ready.$s$,
    'finish_heading', $s$Let's finish your application$s$,
    'finish_body', $s$When you have a quiet moment, open your private link and finish the full application. It asks for a driver's license number and a Social Security number. We use those only for the background check, and we hold them confidentially.$s$,
    'finish_after', $s$This email doesn't include those numbers. Your link expires in 21 days.$s$,
    'fee_heading', $s$Your background check fee$s$,
    'fee_intro', $s$This fee is separate from membership dues. Pick the one that matches your application.$s$,
    'dues_heading', $s$Membership dues come later$s$,
    'dues_intro', $s$Your dues link comes after the background check passes. If you are not sure which level fits, write to treasurer@kreweofshamrock.com and we will help before you pay.$s$,
    'closing', $s$Welcome to the Krewe. We can't wait to have you with us.$s$,
    'signoff', $s$Sláinte,$s$ || chr(10) || $s$Krewe of Shamrock$s$
  );
$defaults$;

revoke all on function public.kos_joining_packet_email_defaults() from public, anon, authenticated;

update public.kos_joining_packet_template
   set dues_heading = 'Membership dues come later',
       dues_intro = 'Your dues link comes after the background check passes. If you are not sure which level fits, write to treasurer@kreweofshamrock.com and we will help before you pay.',
       updated_at = now()
 where id = 'draft'
   and dues_intro ilike '%use that level%';

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

-- ---------------------------------------------------------------------------
-- 8) Chair list. Board returns every open stage plus recent active members,
--    with background check and dues payment fields.
-- ---------------------------------------------------------------------------
create or replace function public.list_membership_applications(p_bucket text default 'board')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $list$
declare
  v_bucket text := lower(coalesce(nullif(btrim(p_bucket), ''), 'board'));
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
  elsif v_bucket = 'bg_paid' then
    v_status := 'bg_paid';
  elsif v_bucket = 'dues' then
    v_status := 'dues-pending';
  elsif v_bucket = 'approved' then
    v_status := 'active';
  elsif v_bucket = 'declined' then
    v_status := 'declined';
  elsif v_bucket = 'archived' then
    v_status := 'archived';
  elsif v_bucket = 'new' then
    v_status := 'pending-new';
  elsif v_bucket = 'board' then
    v_status := null;
  else
    v_bucket := 'board';
    v_status := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'bucket', v_bucket,
    'counts', jsonb_build_object(
      'new', (select count(*) from public.members m
              where m.merged_into is null and m.membership_status = 'pending-new'),
      'background', (select count(*) from public.members m
                     where m.merged_into is null and m.membership_status = 'background-check'),
      'bg_paid', (select count(*) from public.members m
                  where m.merged_into is null and m.membership_status = 'bg_paid'),
      'dues', (select count(*) from public.members m
               where m.merged_into is null and m.membership_status = 'dues-pending'),
      'approved', (select count(*) from public.members m
                   where m.merged_into is null and m.membership_status = 'active'
                     and exists (
                       select 1 from public.membership_application_actions a
                       where a.member_id = m.id and a.action in ('approve', 'background_check_paid', 'dues_paid')
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
        'membership_level', q.membership_level,
        'member_role', q.member_role,
        'application_fee_type', q.application_fee_type,
        'partner_member_id', q.partner_member_id,
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
        'background_check_paid', q.background_check_paid,
        'background_check_amount_cents', q.background_check_amount_cents,
        'background_check_paid_at', q.background_check_paid_at,
        'background_check_couple', q.background_check_couple,
        'dues_paid', q.dues_paid,
        'dues_amount_cents', q.dues_amount_cents,
        'dues_paid_at', q.dues_paid_at,
        'stage_at', q.stage_at,
        'journey', q.journey,
        'join_date', q.join_date,
        'created_at', q.created_at
      ) order by q.created_at desc)
      from (
        select m.id, m.first_name, m.last_name, m.email, m.phone,
               m.street_address, m.city, m.state, m.zip,
               public.kos_redact_id_text(m.notes) as notes,
               public.kos_redact_id_text(m.interests) as interests,
               m.membership_status, m.membership_level, m.member_role,
               m.application_fee_type, m.partner_member_id,
               m.partner_first_name, m.partner_last_name,
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
               rn.record_note_at,
               bg.created_at is not null as background_check_paid,
               bg.amount_cents as background_check_amount_cents,
               bg.created_at as background_check_paid_at,
               coalesce(bg.couple, false) as background_check_couple,
               (coalesce(dues_row.paid, false) or dues_pay.created_at is not null) as dues_paid,
               -- Per person from dues_payments ($375), not the shared Zeffy charge ($750).
               coalesce(
                 dues_row.amount_cents,
                 case
                   when dues_pay.shared and dues_pay.amount_cents is not null
                     then dues_pay.amount_cents / 2
                   else dues_pay.amount_cents
                 end
               ) as dues_amount_cents,
               coalesce(dues_pay.created_at, dues_row.paid_at) as dues_paid_at,
               coalesce(stage.created_at, m.updated_at, m.created_at) as stage_at,
               coalesce(journey.items, '[]'::jsonb) as journey
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
        left join lateral (
          select p.amount_cents,
                 p.created_at,
                 (
                   p.amount_cents >= 7000
                   or coalesce(m.application_fee_type, '') = 'dual'
                   or coalesce(p.description, '') ~* 'couple'
                 ) as couple
            from public.payments p
           where p.product_kind = 'background_check'
             and (
               p.member_id = m.id
               or p.partner_member_id = m.id
             )
           order by p.created_at desc
           limit 1
        ) bg on true
        left join lateral (
          select p.amount_cents,
                 p.created_at,
                 (p.partner_member_id is not null) as shared
            from public.payments p
           where p.product_kind = 'dues'
             and (
               p.member_id = m.id
               or p.partner_member_id = m.id
             )
           order by case when p.member_id = m.id then 0 else 1 end, p.created_at desc
           limit 1
        ) dues_pay on true
        left join lateral (
          select round(d.amount * 100)::integer as amount_cents,
                 d.paid_date::timestamptz as paid_at,
                 true as paid
            from public.dues_payments d
           where d.member_id = m.id
             and d.paid
           order by d.membership_year desc
           limit 1
        ) dues_row on true
        left join lateral (
          select a.created_at
            from public.membership_application_actions a
           where a.member_id = m.id
             and a.to_status = m.membership_status
           order by a.created_at desc
           limit 1
        ) stage on true
        left join lateral (
          select jsonb_agg(
                   jsonb_build_object(
                     'action', a.action,
                     'created_at', a.created_at,
                     'note', public.kos_redact_id_text(a.note),
                     'to_status', a.to_status
                   )
                   order by a.created_at
                 ) as items
            from public.membership_application_actions a
           where a.member_id = m.id
             and a.action in (
               'background_check', 'background_check_paid', 'start_background_check', 'dues_pending', 'dues_paid', 'approve'
             )
        ) journey on true
        where m.merged_into is null
          and (
            (
              v_bucket = 'board'
              and (
                m.membership_status in ('pending-new', 'background-check', 'bg_paid', 'bg_in_process', 'dues-pending')
                or (
                  m.membership_status = 'active'
                  and exists (
                    select 1
                      from public.membership_application_actions a
                     where a.member_id = m.id
                       and a.action in ('approve', 'background_check_paid', 'dues_paid')
                       and a.created_at > now() - interval '120 days'
                  )
                )
              )
            )
            or (
              v_bucket <> 'board'
              and m.membership_status = v_status
              and (
                v_status <> 'active'
                or exists (
                  select 1 from public.membership_application_actions a
                  where a.member_id = m.id and a.action = 'approve'
                )
              )
            )
          )
        order by m.created_at desc
        limit case when v_bucket = 'board' then 200 else 80 end
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

comment on function public.list_membership_applications(text) is
  'Application reviewers. Bucket board is the pipeline, including payment chips. Prospect, renewal, declined, and archived stay separate lists.';

-- ---------------------------------------------------------------------------
-- Interest email. Phone is a large tap-to-call link for the Membership Chair.
-- Replaces the copy that told the chair to invoice dues at the full application.
-- ---------------------------------------------------------------------------
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
