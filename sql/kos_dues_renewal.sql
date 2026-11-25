-- Applied in production (Nov 2026). Do not run this against the live project
-- from the app, a webhook, or a script. It is already on project
-- oazwkwflgbthojvnclfc (Krewe of Shamrock). Safe to re-run.
--
-- Dues renewal for the June-May season.
--
-- kos_dues_season_year uses the same June-May window as
-- krewe_volunteer_season_year. That helper returns the year the season
-- ends (June 2026 returns 2027). Dues rows and kos_dues_catalog are
-- labeled by the year the season starts, so this helper returns one
-- less. November 2026 and January 2027 both return 2026. Existing 2026
-- paid rows stay current, and the season does not reset on January 1.
-- June 1, 2027 starts membership year 2027.
--
-- New invoices are due 30 days after the issue date (America/New_York).
-- June 30 of the membership year is only a month into the season, so an
-- invoice created later was already overdue. Thirty days is never in
-- the past on the day the invoice is created.
--
-- Mandatory meeting attendance in v_parade_ready uses that same June-May
-- window. A meeting counts when its Tampa date is on or after June 1 of
-- the dues year and before the next June 1. Volunteer hours still use
-- krewe_volunteer_season_year (the ending year) for the same window.
--
-- A paid Zeffy dues row for lapsed or pending-renewal sets the member
-- active and writes membership_application_actions with the note
-- Renewed via Zeffy dues payment. No renewal email is queued. pending-new
-- and prospect flows are not changed.
--
-- If you re-apply sql/kos_membership_application_record_note.sql after
-- this file, run the action-check section below again. That older file
-- replaces the check and would drop the renewed action until then.

-- ---------------------------------------------------------------------------
-- 1) Season helpers
-- ---------------------------------------------------------------------------
create or replace function public.kos_dues_season_year(p_on date default null)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select public.krewe_volunteer_season_year(
    coalesce(p_on, (timezone('America/New_York', now()))::date)
  ) - 1;
$$;

comment on function public.kos_dues_season_year(date) is
  'Start year of the June-May dues season. krewe_volunteer_season_year minus 1. November 2026 and January 2027 both return 2026.';

revoke all on function public.kos_dues_season_year(date) from public;
grant execute on function public.kos_dues_season_year(date) to anon, authenticated, service_role;

create or replace function public.kos_dues_invoice_due_date(p_issued date default null)
returns date
language sql
stable
set search_path to 'public'
as $$
  select coalesce(p_issued, (timezone('America/New_York', now()))::date) + 30;
$$;

comment on function public.kos_dues_invoice_due_date(date) is
  'Due date for a new dues invoice: 30 days after the issue date. Not June 30 of the membership year, which is already past for most of the season.';

revoke all on function public.kos_dues_invoice_due_date(date) from public;
grant execute on function public.kos_dues_invoice_due_date(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) History action for a renewal. Existing actions stay valid.
-- ---------------------------------------------------------------------------
alter table public.membership_application_actions
  drop constraint if exists membership_application_actions_action_check;
alter table public.membership_application_actions
  add constraint membership_application_actions_action_check
  check (action in (
    'approve', 'decline', 'archive',
    'background_check', 'dues_pending', 'next_step_sent',
    'full_application_sent', 'full_application_received', 'id_revealed',
    'note', 'renewed'
  ));

-- ---------------------------------------------------------------------------
-- 3) Optional roster link for a partner who is also a member.
--    Members cannot change this column, or membership_level, on their own row.
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists partner_member_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'members_partner_member_id_fkey'
       and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_partner_member_id_fkey
      foreign key (partner_member_id) references public.members(id) on delete set null;
  end if;
end $$;

alter table public.members
  drop constraint if exists members_partner_member_not_self;
alter table public.members
  add constraint members_partner_member_not_self
  check (partner_member_id is null or partner_member_id <> id);

create index if not exists members_partner_member_id_idx
  on public.members (partner_member_id)
  where partner_member_id is not null;

comment on column public.members.partner_member_id is
  'Another roster row for this member''s partner. Renew for both of us follows this column, or a row that points back here. It does not match on names, so a member cannot point the link at someone else by editing their own profile.';

drop policy if exists members_update_self on public.members;
create policy members_update_self
  on public.members
  for update
  to authenticated
  using (id = public.kos_current_member_id())
  with check (
    id = public.kos_current_member_id()
    and member_role is not distinct from (
      select m.member_role from public.members m where m.id = public.kos_current_member_id()
    )
    and membership_status is not distinct from (
      select m.membership_status from public.members m where m.id = public.kos_current_member_id()
    )
    and officer_title is not distinct from (
      select m.officer_title from public.members m where m.id = public.kos_current_member_id()
    )
    and membership_level is not distinct from (
      select m.membership_level from public.members m where m.id = public.kos_current_member_id()
    )
    and partner_member_id is not distinct from (
      select m.partner_member_id from public.members m where m.id = public.kos_current_member_id()
    )
  );

comment on policy members_update_self on public.members is
  'A member may update their own profile row, but not member_role, membership_status, officer_title, membership_level, or partner_member_id.';

-- ---------------------------------------------------------------------------
-- 4) Who can open Renewals, and how a partner is found.
-- ---------------------------------------------------------------------------
create or replace function public.kos_can_manage_renewals()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_title text;
  v_keys text[];
begin
  if auth.uid() is null then
    return false;
  end if;
  if to_regprocedure('public.kos_is_site_admin()') is not null
     and public.kos_is_site_admin() then
    return true;
  end if;
  select m.officer_title into v_title
    from public.members m
   where m.id = public.kos_current_member_id()
     and m.merged_into is null;
  if to_regprocedure('public.kos_title_keys_in(text)') is null then
    return false;
  end if;
  v_keys := public.kos_title_keys_in(v_title);
  return v_keys && array['president', 'treasurer', 'chair_membership']::text[];
end;
$$;

comment on function public.kos_can_manage_renewals() is
  'Membership Chair, Treasurer, President, and site admins.';

revoke all on function public.kos_can_manage_renewals() from public, anon;
grant execute on function public.kos_can_manage_renewals() to authenticated;

create or replace function public.kos_linked_partner_id(p_member uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_link uuid;
  v_found uuid;
  v_count integer;
begin
  if p_member is null then
    return null;
  end if;
  select m.partner_member_id
    into v_link
    from public.members m
   where m.id = p_member
     and m.merged_into is null;
  if not found then
    return null;
  end if;

  if v_link is not null and v_link <> p_member and exists (
    select 1 from public.members p
     where p.id = v_link
       and p.merged_into is null
       and coalesce(p.membership_status, '') in ('active', 'lapsed', 'pending-renewal')
  ) then
    return v_link;
  end if;

  select count(*)::integer into v_count
    from public.members p
   where p.partner_member_id = p_member
     and p.id <> p_member
     and p.merged_into is null
     and coalesce(p.membership_status, '') in ('active', 'lapsed', 'pending-renewal');
  if v_count = 1 then
    select p.id into v_found
      from public.members p
     where p.partner_member_id = p_member
       and p.id <> p_member
       and p.merged_into is null
       and coalesce(p.membership_status, '') in ('active', 'lapsed', 'pending-renewal')
     limit 1;
    return v_found;
  end if;

  return null;
end;
$$;

comment on function public.kos_linked_partner_id(uuid) is
  'The other roster row for a partner, using partner_member_id in either direction. Names are not matched, so a member cannot attach this link by editing their own name. Not a client API.';

revoke all on function public.kos_linked_partner_id(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Invoice year and due date
-- ---------------------------------------------------------------------------
create or replace function public.kos_queue_level_dues_invoice(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $invoice$
declare
  v_year integer := public.kos_dues_season_year();
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

  v_due := public.kos_dues_invoice_due_date();
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
           due_date = v_due
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
  'Internal. Queues one level-based membership dues invoice for kos_dues_season_year when a prospect submits the full application and begins the background check. Due date is 30 days after issue. Not a client API. Does not change pending-new or prospect status.';

revoke all on function public.kos_queue_level_dues_invoice(uuid) from public, anon, authenticated;

create or replace function public.kos_create_level_invoices(
  p_member_ids uuid[],
  p_year integer,
  p_exclude_elected_officers boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_exclude boolean := coalesce(p_exclude_elected_officers, true);
  v_id uuid;
  v_member record;
  v_dues public.dues_payments%rowtype;
  v_has_dues boolean;
  v_quote jsonb;
  v_level text;
  v_amount numeric;
  v_url text;
  v_action text;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped_paid integer := 0;
  v_skipped_waiver integer := 0;
  v_skipped_officer integer := 0;
  v_skipped_no_catalog integer := 0;
  v_skipped_missing integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_due date;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Pick at least one member.');
  end if;
  if p_year is null then
    p_year := public.kos_dues_season_year();
  end if;
  if p_year < 2000 or p_year > 2100 then
    return jsonb_build_object('ok', false, 'message', 'Membership year is required.');
  end if;
  v_due := public.kos_dues_invoice_due_date();

  for v_id in
    select distinct u.id
      from unnest(p_member_ids) as u(id)
     where u.id is not null
  loop
    select m.id, m.membership_level, m.officer_title, m.first_name, m.last_name
      into v_member
      from public.members m
     where m.id = v_id
       and m.merged_into is null;

    if not found then
      v_skipped_missing := v_skipped_missing + 1;
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'member_id', v_id, 'result', 'skipped_missing'
      ));
      continue;
    end if;

    select * into v_dues
      from public.dues_payments
     where member_id = v_id
       and membership_year = p_year;
    v_has_dues := found;

    if v_has_dues and v_dues.waiver_status = 'applied' then
      v_skipped_waiver := v_skipped_waiver + 1;
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'member_id', v_id, 'result', 'skipped_waiver'
      ));
      continue;
    end if;

    if v_has_dues and v_dues.paid then
      v_skipped_paid := v_skipped_paid + 1;
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'member_id', v_id, 'result', 'skipped_paid'
      ));
      continue;
    end if;

    if v_exclude and public.kos_is_elected_officer_title(v_member.officer_title) then
      v_skipped_officer := v_skipped_officer + 1;
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'member_id', v_id, 'result', 'skipped_officer'
      ));
      continue;
    end if;

    v_quote := public.kos_dues_quote(p_year, v_member.membership_level);
    v_level := v_quote->>'level';
    v_amount := (v_quote->>'amount')::numeric;
    v_url := nullif(btrim(v_quote->>'zeffy_url'), '');

    if coalesce(v_quote->>'from_catalog', 'false') <> 'true' then
      v_skipped_no_catalog := v_skipped_no_catalog + 1;
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'member_id', v_id, 'result', 'skipped_no_catalog', 'level', v_level
      ));
      continue;
    end if;

    if not v_has_dues then
      insert into public.dues_payments (
        member_id, membership_year, amount, due_date, paid,
        membership_level, standard_amount, zeffy_campaign_key, notes
      ) values (
        v_id, p_year, v_amount, v_due, false,
        v_level, v_amount, v_url, 'Dues invoice'
      )
      returning * into v_dues;
      v_action := 'created';
      v_created := v_created + 1;
    else
      update public.dues_payments
         set membership_level = v_level,
             standard_amount = v_amount,
             amount = v_amount,
             zeffy_campaign_key = v_url,
             due_date = v_due
       where id = v_dues.id
         and paid = false
         and coalesce(waiver_status, '') <> 'applied'
      returning * into v_dues;
      if not found then
        v_skipped_paid := v_skipped_paid + 1;
        v_details := v_details || jsonb_build_array(jsonb_build_object(
          'member_id', v_id, 'result', 'skipped_paid'
        ));
        continue;
      end if;
      v_action := 'updated';
      v_updated := v_updated + 1;
    end if;

    perform public.kos_log_dues_event(
      'invoice_created',
      v_id,
      p_year,
      jsonb_build_object(
        'action', v_action,
        'dues_payment_id', v_dues.id,
        'membership_level', v_level,
        'amount', v_amount,
        'standard_amount', v_amount,
        'zeffy_campaign_key', v_url
      )
    );

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'member_id', v_id,
      'result', v_action,
      'dues_payment_id', v_dues.id,
      'membership_level', v_level,
      'amount', v_amount
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'year', p_year,
    'created', v_created,
    'updated', v_updated,
    'skipped_paid', v_skipped_paid,
    'skipped_waiver', v_skipped_waiver,
    'skipped_officer', v_skipped_officer,
    'skipped_no_catalog', v_skipped_no_catalog,
    'skipped_missing', v_skipped_missing,
    'details', v_details,
    'message', 'Created ' || v_created::text || ' invoice(s), updated ' || v_updated::text
      || '. Skipped paid ' || v_skipped_paid::text
      || ', applied waiver ' || v_skipped_waiver::text
      || ', elected officer ' || v_skipped_officer::text
      || ', no catalog row ' || v_skipped_no_catalog::text
      || ', missing ' || v_skipped_missing::text || '.'
  );
end;
$$;


comment on function public.kos_create_level_invoices(uuid[], integer, boolean) is
  'Officer-only. Upserts unpaid dues_payments from members.membership_level and kos_dues_catalog. A null year uses kos_dues_season_year. Due date is 30 days after issue. Skips paid rows, applied waivers, and elected officers when p_exclude_elected_officers is true.';

revoke all on function public.kos_create_level_invoices(uuid[], integer, boolean) from public, anon;
grant execute on function public.kos_create_level_invoices(uuid[], integer, boolean) to authenticated;

create or replace function public.kos_record_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_member uuid;
  v_id uuid;
  v_kind text;
  v_year integer;
  v_event uuid;
  v_emails text[] := '{}';
  v_email text;
  v_matched uuid[] := '{}';
  v_mid uuid;
  v_ticket_count int;
  v_rsvp_results jsonb := '[]'::jsonb;
  v_rsvp jsonb;
  v_i int := 0;
  v_guests int := 0;
  v_amount int;
  v_share int;
  v_duplicate boolean := false;
  v_raffle_qty int := 0;
  v_admission_qty int := 0;
  v_raffle uuid;
  v_raffle_result jsonb;
  v_locker_size text;
  v_locker jsonb;
  v_existing uuid;
  v_holders jsonb := '[]'::jsonb;
  v_holder jsonb;
  v_holder_email text;
  v_holder_cents integer;
  v_target uuid;
  v_seen uuid[] := '{}';
  v_pay_id text;
  v_status text;
  v_level text;
  v_quote jsonb;
  v_std numeric;
  v_dollars numeric;
  v_charge numeric;
  v_url text;
  v_dues_id uuid;
  v_dues_paid boolean;
  v_dues_waiver text;
  v_dues_amount numeric;
  v_action text;
  v_activated boolean := false;
  v_dues_results jsonb := '[]'::jsonb;
begin
  v_kind := coalesce(p->>'product_kind', 'other');
  if v_kind not in ('store', 'event', 'dues', 'donation', 'raffle', 'other') then
    v_kind := 'other';
  end if;
  v_year := coalesce(
    nullif(p->>'membership_year', '')::integer,
    public.kos_dues_season_year()
  );
  v_amount := coalesce((p->>'amount_cents')::integer, 0);
  v_locker_size := public.kos_locker_payment_size(p);
  v_pay_id := nullif(btrim(coalesce(p->>'provider_payment_id', p->>'provider_event_id', '')), '');

  if coalesce(p->>'payer_email', '') <> '' then
    v_emails := array_append(v_emails, lower(btrim(p->>'payer_email')));
  end if;
  if jsonb_typeof(p->'payer_emails') = 'array' then
    for v_email in
      select lower(btrim(x))
      from jsonb_array_elements_text(p->'payer_emails') as t(x)
      where position('@' in x) > 0
    loop
      if not (v_email = any (v_emails)) then
        v_emails := array_append(v_emails, v_email);
      end if;
    end loop;
  end if;
  if jsonb_typeof(p->'attendee_emails') = 'array' then
    for v_email in
      select lower(btrim(x))
      from jsonb_array_elements_text(p->'attendee_emails') as t(x)
      where position('@' in x) > 0
    loop
      if not (v_email = any (v_emails)) then
        v_emails := array_append(v_emails, v_email);
      end if;
    end loop;
  end if;

  foreach v_email in array v_emails loop
    v_mid := public.kos_match_member_by_email(v_email);
    if v_mid is not null and not (v_mid = any (v_matched)) then
      v_matched := array_append(v_matched, v_mid);
    end if;
  end loop;

  if coalesce(array_length(v_matched, 1), 0) = 0 then
    v_mid := public.kos_match_member_by_name(p->>'payer_name');
    if v_mid is not null then
      v_matched := array_append(v_matched, v_mid);
    end if;
  end if;

  v_member := case when coalesce(array_length(v_matched, 1), 0) > 0 then v_matched[1] else null end;
  v_event := public.kos_find_event_for_payment(p);
  v_raffle_qty := greatest(coalesce(nullif(p->>'raffle_qty', '')::integer, 0), 0);
  v_admission_qty := greatest(coalesce(nullif(p->>'admission_qty', '')::integer, 0), 0);
  v_ticket_count := greatest(
    coalesce(nullif(p->>'ticket_count', '')::integer, 0),
    v_admission_qty,
    0
  );
  if v_ticket_count < 1 then
    v_ticket_count := 1;
  end if;
  if v_admission_qty > 0 then
    v_ticket_count := v_admission_qty;
  elsif v_raffle_qty > 0 and v_kind = 'raffle' then
    v_ticket_count := 0;
  end if;

  -- Same Zeffy payment id is one ledger row. A later delivery with a new
  -- event id must not insert again, and must not mark dues a second time.
  v_existing := null;
  if v_pay_id is not null then
    select id into v_existing
      from public.payments
     where provider_payment_id = v_pay_id
       and provider = coalesce(p->>'provider', 'stripe')
     order by created_at
     limit 1;
  end if;

  if v_existing is not null then
    v_duplicate := true;
    v_id := v_existing;
  else
    insert into public.payments (
      provider, provider_event_id, provider_payment_id, amount_cents, currency,
      status, payer_email, payer_name, description, product_kind, member_id,
      event_id, membership_year, raw
    ) values (
      coalesce(p->>'provider', 'stripe'),
      p->>'provider_event_id',
      p->>'provider_payment_id',
      v_amount,
      coalesce(p->>'currency', 'usd'),
      coalesce(p->>'status', 'succeeded'),
      nullif(lower(btrim(coalesce(p->>'payer_email', ''))), ''),
      nullif(btrim(coalesce(p->>'payer_name', '')), ''),
      p->>'description',
      v_kind,
      v_member,
      case when v_locker_size is null then v_event else null end,
      v_year,
      p->'raw'
    )
    on conflict (provider_event_id) do nothing
    returning id into v_id;

    if v_id is null then
      v_duplicate := true;
      select id
        into v_id
        from public.payments
       where provider_event_id = p->>'provider_event_id'
       limit 1;
    end if;
  end if;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_recorded');
  end if;

  v_locker := public.kos_claim_locker_from_payment(v_id, p);

  -- Dues: each ticket holder, then the payer if that holder did not match.
  -- Runs on a duplicate delivery too. payment_recorded for this Zeffy payment
  -- id makes the second pass a no-op, including when the provider event id differs.
  if v_locker_size is null and v_kind = 'dues' then
    if jsonb_typeof(p->'ticket_holders') = 'array' then
      v_holders := p->'ticket_holders';
    end if;
    if jsonb_array_length(v_holders) = 0 then
      v_holders := jsonb_build_array(jsonb_build_object(
        'email', nullif(lower(btrim(coalesce(p->>'payer_email', ''))), ''),
        'name', nullif(btrim(coalesce(p->>'payer_name', '')), ''),
        'ticket_name', nullif(btrim(coalesce(p->>'description', '')), ''),
        'amount_cents', v_amount
      ));
    end if;

    for v_holder in
      select t.elem from jsonb_array_elements(v_holders) as t(elem)
    loop
      v_target := null;
      v_holder_email := nullif(lower(btrim(coalesce(v_holder->>'email', ''))), '');
      if v_holder_email is not null and position('@' in v_holder_email) > 0 then
        v_target := public.kos_match_member_by_email(v_holder_email);
      end if;
      if v_target is null then
        v_target := public.kos_match_member_by_name(v_holder->>'name');
      end if;
      if v_target is null then
        v_target := v_member;
      end if;
      if v_target is null or v_target = any (v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, v_target);

      if v_pay_id is not null and exists (
        select 1
          from public.kos_dues_events e
         where e.event_type = 'payment_recorded'
           and e.member_id = v_target
           and e.payload->>'provider_payment_id' = v_pay_id
      ) then
        continue;
      end if;

      v_holder_cents := null;
      if coalesce(v_holder->>'amount_cents', '') ~ '^-?[0-9]+$' then
        v_holder_cents := (v_holder->>'amount_cents')::integer;
      end if;
      if v_holder_cents is null then
        v_holder_cents := round(
          v_amount::numeric / greatest(jsonb_array_length(v_holders), 1)
        )::integer;
      end if;
      if v_holder_cents < 0 then
        v_holder_cents := 0;
      end if;
      v_dollars := round(v_holder_cents / 100.0, 2);

      select m.membership_status, m.membership_level
        into v_status, v_level
        from public.members m
       where m.id = v_target
         and m.merged_into is null;
      if not found then
        continue;
      end if;

      v_dues_id := null;
      v_dues_paid := null;
      v_dues_waiver := null;
      v_dues_amount := null;
      select d.id, d.paid, d.waiver_status, d.amount
        into v_dues_id, v_dues_paid, v_dues_waiver, v_dues_amount
        from public.dues_payments d
       where d.member_id = v_target
         and d.membership_year = v_year;

      if found and (coalesce(v_dues_paid, false) or coalesce(v_dues_waiver, '') = 'applied') then
        continue;
      end if;

      v_quote := public.kos_dues_quote(v_year, coalesce(v_level, 'full'));
      v_level := coalesce(nullif(v_quote->>'level', ''), coalesce(v_level, 'full'));
      v_std := coalesce((v_quote->>'amount')::numeric, public.kos_dues_fallback_amount(v_level));
      v_url := nullif(btrim(coalesce(nullif(v_quote->>'zeffy_url', ''), p->>'campaign_url', '')), '');
      v_charge := case when v_dollars > 0 then v_dollars else v_std end;
      v_action := null;

      if v_dues_id is not null then
        update public.dues_payments
           set paid = true,
               paid_date = current_date,
               payment_method = 'card',
               amount = case
                 when coalesce(amount, 0) = 0 and v_dollars > 0 then v_dollars
                 else amount
               end
         where id = v_dues_id
           and paid = false
           and coalesce(waiver_status, '') <> 'applied'
        returning id into v_dues_id;
        if v_dues_id is not null then
          v_action := 'marked_paid';
        end if;
      elsif lower(coalesce(v_status, '')) in ('active', 'lapsed', 'pending-renewal') then
        begin
          insert into public.dues_payments (
            member_id, membership_year, amount, due_date, paid, paid_date, payment_method,
            membership_level, standard_amount, zeffy_campaign_key, notes
          ) values (
            v_target, v_year, v_charge, public.kos_dues_invoice_due_date(), true, current_date, 'card',
            v_level, v_std, v_url, 'Paid via Zeffy. No open dues invoice was on file.'
          )
          returning id into v_dues_id;
          v_action := 'created_paid';
        exception
          when unique_violation then
            update public.dues_payments
               set paid = true,
                   paid_date = current_date,
                   payment_method = 'card'
             where member_id = v_target
               and membership_year = v_year
               and paid = false
               and coalesce(waiver_status, '') <> 'applied'
            returning id into v_dues_id;
            if v_dues_id is not null then
              v_action := 'marked_paid';
            end if;
        end;
      end if;

      if v_action is null or v_dues_id is null then
        continue;
      end if;

      v_activated := false;
      if lower(coalesce(v_status, '')) in ('lapsed', 'pending-renewal') then
        update public.members
           set membership_status = 'active',
               updated_at = now()
         where id = v_target
           and lower(coalesce(membership_status, '')) in ('lapsed', 'pending-renewal');
        insert into public.membership_application_actions (
          member_id, action, note, from_status, to_status, actor_name
        ) values (
          v_target,
          'renewed',
          'Renewed via Zeffy dues payment',
          v_status,
          'active',
          'zeffy-webhook'
        );
        v_activated := true;
      end if;

      insert into public.kos_dues_events (event_type, actor, member_id, membership_year, payload)
      values (
        'payment_recorded',
        'zeffy-webhook',
        v_target,
        v_year,
        jsonb_build_object(
          'provider', coalesce(p->>'provider', 'zeffy'),
          'provider_payment_id', v_pay_id,
          'provider_event_id', p->>'provider_event_id',
          'payment_id', v_id,
          'dues_payment_id', v_dues_id,
          'action', v_action,
          'amount_cents', v_holder_cents,
          'amount', v_dollars,
          'email', v_holder_email,
          'name', nullif(btrim(coalesce(v_holder->>'name', '')), ''),
          'ticket_name', nullif(btrim(coalesce(v_holder->>'ticket_name', '')), ''),
          'membership_level', v_level,
          'activated', v_activated,
          'from_status', v_status
        )
      );

      v_dues_results := v_dues_results || jsonb_build_array(jsonb_build_object(
        'member_id', v_target,
        'dues_payment_id', v_dues_id,
        'action', v_action,
        'amount_cents', v_holder_cents,
        'activated', v_activated
      ));
    end loop;
  end if;

  if not v_duplicate and v_locker_size is null then
    if v_event is not null
       and coalesce(array_length(v_matched, 1), 0) > 0
       and (v_kind = 'event' or v_admission_qty > 0)
    then
      for v_i in 1 .. array_length(v_matched, 1) loop
        v_guests := case
          when v_i = 1 and array_length(v_matched, 1) = 1
            then greatest(v_ticket_count - 1, 0)
          else 0
        end;
        v_share := case when v_i = 1 then v_amount else null end;
        v_rsvp := public.kos_auto_rsvp_from_payment(
          v_event,
          v_matched[v_i],
          v_guests,
          'Tickets purchased via Zeffy',
          v_id,
          v_share
        );
        v_rsvp_results := v_rsvp_results || jsonb_build_array(v_rsvp);
      end loop;
    end if;
  end if;

  if v_locker_size is null and (v_raffle_qty > 0 or v_kind = 'raffle') then
    if v_raffle_qty < 1 then
      v_raffle_qty := greatest(coalesce(nullif(p->>'ticket_count', '')::integer, 1), 1);
    end if;
    v_raffle := public.kos_find_raffle_for_payment(p, v_event);
    if v_raffle is not null and v_raffle_qty > 0 then
      v_raffle_result := public.kos_credit_raffle_from_payment(
        v_id,
        v_raffle,
        v_raffle_qty,
        v_member,
        coalesce(nullif(btrim(coalesce(p->>'payer_name', '')), ''), 'Zeffy guest'),
        p->>'payer_email'
      );
    else
      v_raffle_result := jsonb_build_object(
        'ok', false,
        'reason', case when v_raffle is null then 'raffle_not_linked' else 'no_qty' end,
        'hint', 'Link this raffle to the krewe event in Member Hub, or name the Zeffy raffle line so the webhook can match it.'
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', v_duplicate,
    'payment_id', v_id,
    'member_matched', v_member is not null,
    'member_id', v_member,
    'event_id', case when v_locker_size is null then v_event else null end,
    'matched_members', to_jsonb(v_matched),
    'rsvps', v_rsvp_results,
    'raffle_id', v_raffle,
    'raffle_qty', v_raffle_qty,
    'raffle', v_raffle_result,
    'locker', v_locker,
    'dues', v_dues_results
  );
end;
$fn$;

revoke all on function public.kos_record_payment(jsonb) from public, anon, authenticated;
grant execute on function public.kos_record_payment(jsonb) to service_role;


comment on function public.kos_record_payment(jsonb) is
  'Service role. Records a Zeffy or Stripe payment. Dues use kos_dues_season_year when the payload has no membership year. A paid dues row for lapsed or pending-renewal sets membership_status to active and writes membership_application_actions note Renewed via Zeffy dues payment. No email is queued. pending-new and prospect rows are not activated. The same provider payment id is not applied twice.';

create or replace view public.v_parade_ready
with (security_invoker = true) as
select
  id as member_id,
  first_name,
  last_name,
  membership_status,
  (exists (
    select 1 from public.dues_payments d
    where d.member_id = m.id
      and d.membership_year = public.kos_dues_season_year()
      and d.paid
  )) as dues_paid,
  (exists (
    select 1 from public.waivers w
    where w.member_id = m.id
      and w.season_year = public.kos_dues_season_year()
  )) as waiver_signed,
  (exists (
    select 1
    from public.event_signups s
    join public.events e on e.id = s.event_id
    where s.member_id = m.id
      and s.status = 'attended'
      and e.event_type = 'meeting'
      and e.is_mandatory
      and (e.start_time at time zone 'America/New_York')::date >= make_date(public.kos_dues_season_year(), 6, 1)
      and (e.start_time at time zone 'America/New_York')::date < make_date(public.kos_dues_season_year() + 1, 6, 1)
  )) as meeting_attended,
  coalesce((
    select sum(v.hours)
    from public.volunteer_hours v
    where v.member_id = m.id
      and v.season_year = krewe_volunteer_season_year(current_date)
      and v.approved
      and coalesce(v.is_demo, false) = false
  ), 0::numeric) as hours_approved,
  coalesce((
    select sum(v.hours)
    from public.volunteer_hours v
    where v.member_id = m.id
      and v.season_year = krewe_volunteer_season_year(current_date)
      and coalesce(v.is_demo, false) = false
  ), 0::numeric) as hours_logged,
  coalesce((
    select sum(v.hours)
    from public.volunteer_hours v
    where v.member_id = m.id
      and v.season_year = krewe_volunteer_season_year(current_date)
      and v.approved
      and coalesce(v.is_demo, false) = false
  ), 0::numeric) as volunteer_hours_approved,
  coalesce((
    select sum(v.hours)
    from public.volunteer_hours v
    where v.member_id = m.id
      and v.season_year = krewe_volunteer_season_year(current_date)
      and coalesce(v.is_demo, false) = false
  ), 0::numeric) as volunteer_hours_logged,
  m.membership_level
from public.members m
where coalesce(membership_status, '') <> 'merged'
  and coalesce(membership_status, '') not in ('declined', 'archived')
  and merged_into is null
  and (id = kos_current_member_id() or is_krewe_officer());

alter view public.v_parade_ready set (security_invoker = true);


comment on view public.v_parade_ready is
  'Parade Ready gates for the signed-in member, or the roster when the reader is an officer. Dues and waivers use kos_dues_season_year (June through May, labeled by the start year, so a 2026 paid row still counts in November 2026 and January 2027). Mandatory meeting attendance uses that same June-May window in America/New_York: the meeting date is on or after June 1 of the dues year and before the next June 1. It does not reset on January 1. Volunteer hours still use krewe_volunteer_season_year, which is the same window labeled by the ending year. membership_level is the dues level.';


-- ---------------------------------------------------------------------------
-- 6) Member renewal card
-- ---------------------------------------------------------------------------
create or replace function public.kos_my_renewal()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_member record;
  v_year integer := public.kos_dues_season_year();
  v_paid boolean := false;
  v_paid_date date;
  v_partner_id uuid;
  v_partner jsonb := null;
  v_levels jsonb;
  v_exempt boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to renew.');
  end if;
  v_id := public.kos_current_member_id();
  if v_id is null then
    return jsonb_build_object('ok', false, 'message', 'Your login is not linked to a roster row yet.');
  end if;
  select m.id, m.membership_level, m.membership_status, m.officer_title, m.member_role
    into v_member
    from public.members m
   where m.id = v_id
     and m.merged_into is null;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Your roster row was not found.');
  end if;

  select d.paid, d.paid_date
    into v_paid, v_paid_date
    from public.dues_payments d
   where d.member_id = v_id
     and d.membership_year = v_year
     and d.paid
   limit 1;
  v_paid := coalesce(v_paid, false);

  v_exempt := coalesce(v_member.member_role, '') in ('officer', 'board', 'captain')
    or (
      to_regprocedure('public.kos_is_elected_officer_title(text)') is not null
      and public.kos_is_elected_officer_title(v_member.officer_title)
    );

  v_partner_id := public.kos_linked_partner_id(v_id);
  if v_partner_id is not null then
    select jsonb_build_object(
      'member_id', p.id,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'membership_level', coalesce(p.membership_level, 'full'),
      'paid', exists (
        select 1 from public.dues_payments d
         where d.member_id = p.id
           and d.membership_year = v_year
           and d.paid
      )
    )
      into v_partner
      from public.members p
     where p.id = v_partner_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'level', x.level,
    'label', x.label,
    'amount', coalesce(c.amount, public.kos_dues_fallback_amount(x.level)),
    'zeffy_url', c.zeffy_url,
    'explainer', c.explainer
  ) order by x.ord), '[]'::jsonb)
    into v_levels
    from (
      values
        (1, 'full', 'Full'),
        (2, 'associate', 'Associate'),
        (3, 'auxiliary', 'Auxiliary'),
        (4, 'loa', 'Leave of absence')
    ) as x(ord, level, label)
    left join public.kos_dues_catalog c
      on c.membership_year = v_year
     and c.level = x.level
     and c.active;

  return jsonb_build_object(
    'ok', true,
    'year', v_year,
    'season_label', v_year::text || '-' || right((v_year + 1)::text, 2),
    'paid', v_paid,
    'paid_date', v_paid_date,
    'exempt', v_exempt,
    'membership_level', coalesce(v_member.membership_level, 'full'),
    'membership_status', v_member.membership_status,
    'partner', v_partner,
    'levels', v_levels,
    'treasurer_email', 'treasurer@kreweofshamrock.com'
  );
end;
$$;

comment on function public.kos_my_renewal() is
  'Signed-in member. Current dues season, catalog levels, paid flag, and linked partner. Does not change any row.';

revoke all on function public.kos_my_renewal() from public, anon;
grant execute on function public.kos_my_renewal() to authenticated;

create or replace function public.kos_choose_renewal_level(
  p_level text,
  p_include_partner boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_level text := lower(btrim(coalesce(p_level, '')));
  v_from text;
  v_year integer := public.kos_dues_season_year();
  v_partner uuid;
  v_url text;
  v_partner_updated boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to choose a level.');
  end if;
  v_id := public.kos_current_member_id();
  if v_id is null then
    return jsonb_build_object('ok', false, 'message', 'Your login is not linked to a roster row yet.');
  end if;
  if v_level not in ('full', 'associate', 'loa', 'auxiliary') then
    return jsonb_build_object('ok', false, 'message', 'Choose Full, Associate, Leave of absence, or Auxiliary.');
  end if;

  if exists (
    select 1 from public.dues_payments d
     where d.member_id = v_id
       and d.membership_year = v_year
       and d.paid
  ) then
    return jsonb_build_object(
      'ok', true,
      'already_paid', true,
      'membership_level', v_level,
      'message', 'You are already paid for the ' || v_year::text || '-' || right((v_year + 1)::text, 2) || ' season.'
    );
  end if;

  select m.membership_level into v_from
    from public.members m
   where m.id = v_id
     and m.merged_into is null;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Your roster row was not found.');
  end if;

  if v_from is distinct from v_level then
    update public.members
       set membership_level = v_level
     where id = v_id;
    perform public.kos_log_dues_event(
      'level_set',
      v_id,
      v_year,
      jsonb_build_object('from', v_from, 'to', v_level, 'source', 'member_renewal')
    );
  end if;

  if coalesce(p_include_partner, false) then
    v_partner := public.kos_linked_partner_id(v_id);
    if v_partner is not null and not exists (
      select 1 from public.dues_payments d
       where d.member_id = v_partner
         and d.membership_year = v_year
         and d.paid
    ) then
      update public.members
         set membership_level = v_level
       where id = v_partner
         and membership_level is distinct from v_level;
      if found then
        v_partner_updated := true;
        perform public.kos_log_dues_event(
          'level_set',
          v_partner,
          v_year,
          jsonb_build_object('to', v_level, 'source', 'member_renewal_partner', 'by_member', v_id)
        );
      end if;
    end if;
  end if;

  select c.zeffy_url into v_url
    from public.kos_dues_catalog c
   where c.membership_year = v_year
     and c.level = v_level
     and c.active
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'already_paid', false,
    'membership_level', v_level,
    'partner_updated', v_partner_updated,
    'zeffy_url', v_url,
    'message', 'Your level is saved. Zeffy is the next step.'
  );
end;
$$;

comment on function public.kos_choose_renewal_level(text, boolean) is
  'Signed-in member sets their own dues level for the open season, and optionally the linked partner. Does not mark anyone paid and does not send email.';

revoke all on function public.kos_choose_renewal_level(text, boolean) from public, anon;
grant execute on function public.kos_choose_renewal_level(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Officer renewals list and cash / check
-- ---------------------------------------------------------------------------
create or replace function public.kos_renewal_rows(p_year integer default null)
returns table (
  member_id uuid,
  first_name text,
  last_name text,
  email text,
  membership_status text,
  membership_level text,
  partner_name text,
  last_paid_year integer,
  amount numeric,
  zeffy_url text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
begin
  return query
  select
    m.id,
    m.first_name,
    m.last_name,
    lower(m.email),
    m.membership_status,
    coalesce(m.membership_level, 'full'),
    nullif(btrim(coalesce(partner.first_name, '') || ' ' || coalesce(partner.last_name, '')), ''),
    (
      select d.membership_year
        from public.dues_payments d
       where d.member_id = m.id
         and d.paid
       order by d.membership_year desc
       limit 1
    ),
    coalesce(c.amount, public.kos_dues_fallback_amount(coalesce(m.membership_level, 'full'))),
    c.zeffy_url
  from public.members m
  left join public.kos_dues_catalog c
    on c.membership_year = v_year
   and c.level = coalesce(m.membership_level, 'full')
   and c.active
  left join public.members partner
    on partner.id = public.kos_linked_partner_id(m.id)
  where m.merged_into is null
    and coalesce(m.membership_status, '') in ('active', 'lapsed', 'pending-renewal')
    and coalesce(m.member_role, '') not in ('officer', 'board', 'captain')
    and not public.kos_is_elected_officer_title(m.officer_title)
    and not exists (
      select 1 from public.dues_payments d
       where d.member_id = m.id
         and d.membership_year = v_year
         and d.paid
    )
  order by m.last_name, m.first_name;
end;
$$;

comment on function public.kos_renewal_rows(integer) is
  'Internal. Active, lapsed, and pending-renewal members with no paid dues row for the season. Elected officers and board are left off. Not granted to the browser.';

revoke all on function public.kos_renewal_rows(integer) from public, anon, authenticated;

create or replace function public.kos_list_renewals(p_year integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
  v_rows jsonb;
begin
  if not public.kos_can_manage_renewals() then
    return jsonb_build_object('ok', false, 'message', 'Renewals are for the Membership Chair, Treasurer, President, or an admin.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.member_id,
    'first_name', r.first_name,
    'last_name', r.last_name,
    'email', r.email,
    'membership_status', r.membership_status,
    'membership_level', r.membership_level,
    'partner_name', r.partner_name,
    'last_paid_year', r.last_paid_year,
    'amount', r.amount,
    'zeffy_url', r.zeffy_url
  ) order by r.last_name, r.first_name), '[]'::jsonb)
    into v_rows
    from public.kos_renewal_rows(v_year) r;
  return jsonb_build_object(
    'ok', true,
    'year', v_year,
    'season_label', v_year::text || '-' || right((v_year + 1)::text, 2),
    'count', coalesce(jsonb_array_length(v_rows), 0),
    'members', v_rows
  );
end;
$$;

comment on function public.kos_list_renewals(integer) is
  'Membership Chair, Treasurer, President, and site admins. Unpaid members for the dues season.';

revoke all on function public.kos_list_renewals(integer) from public, anon;
grant execute on function public.kos_list_renewals(integer) to authenticated;

create or replace function public.kos_mark_renewal_paid(
  p_member_id uuid,
  p_method text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_method text := lower(btrim(coalesce(p_method, '')));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_year integer := public.kos_dues_season_year();
  v_member record;
  v_quote jsonb;
  v_level text;
  v_amount numeric;
  v_url text;
  v_dues_id uuid;
  v_activated boolean := false;
  v_name text;
begin
  if not public.kos_can_manage_renewals() then
    return jsonb_build_object('ok', false, 'message', 'Renewals are for the Membership Chair, Treasurer, President, or an admin.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Member is required.');
  end if;
  if v_method not in ('cash', 'check') then
    return jsonb_build_object('ok', false, 'message', 'Choose cash or check.');
  end if;

  select m.id, m.first_name, m.last_name, m.membership_status, m.membership_level
    into v_member
    from public.members m
   where m.id = p_member_id
     and m.merged_into is null;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Member was not found.');
  end if;
  if lower(coalesce(v_member.membership_status, '')) not in ('active', 'lapsed', 'pending-renewal') then
    return jsonb_build_object(
      'ok', false,
      'message', 'Renewals are for active, lapsed, or pending-renewal members. New applications stay in Membership Applications.'
    );
  end if;

  v_quote := public.kos_dues_quote(v_year, coalesce(v_member.membership_level, 'full'));
  v_level := coalesce(v_quote->>'level', coalesce(v_member.membership_level, 'full'));
  v_amount := coalesce((v_quote->>'amount')::numeric, public.kos_dues_fallback_amount(v_level));
  v_url := nullif(btrim(v_quote->>'zeffy_url'), '');
  v_name := nullif(btrim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, '')), '');

  select d.id into v_dues_id
    from public.dues_payments d
   where d.member_id = p_member_id
     and d.membership_year = v_year;

  if found and exists (
    select 1 from public.dues_payments d
     where d.id = v_dues_id
       and (d.paid or coalesce(d.waiver_status, '') = 'applied')
  ) then
    return jsonb_build_object('ok', true, 'already_paid', true, 'message', coalesce(v_name, 'Member') || ' is already paid for this season.');
  end if;

  if v_dues_id is null then
    insert into public.dues_payments (
      member_id, membership_year, amount, due_date, paid, paid_date, payment_method,
      membership_level, standard_amount, zeffy_campaign_key, notes
    ) values (
      p_member_id, v_year, v_amount, public.kos_dues_invoice_due_date(), true, current_date, v_method,
      v_level, v_amount, v_url,
      'Marked paid by an officer (' || v_method || ').'
    )
    returning id into v_dues_id;
  else
    update public.dues_payments
       set paid = true,
           paid_date = current_date,
           payment_method = v_method,
           amount = v_amount,
           membership_level = v_level,
           standard_amount = coalesce(standard_amount, v_amount),
           zeffy_campaign_key = coalesce(v_url, zeffy_campaign_key),
           notes = trim(both from coalesce(notes, '') || case when coalesce(notes, '') = '' then '' else E'\n' end
             || 'Marked paid by an officer (' || v_method || ').')
     where id = v_dues_id
       and paid = false
       and coalesce(waiver_status, '') <> 'applied'
    returning id into v_dues_id;
    if v_dues_id is null then
      return jsonb_build_object('ok', true, 'already_paid', true, 'message', coalesce(v_name, 'Member') || ' is already paid for this season.');
    end if;
  end if;

  if lower(coalesce(v_member.membership_status, '')) in ('lapsed', 'pending-renewal') then
    update public.members
       set membership_status = 'active',
           updated_at = now()
     where id = p_member_id
       and lower(coalesce(membership_status, '')) in ('lapsed', 'pending-renewal');
    insert into public.membership_application_actions (
      member_id, action, note, from_status, to_status, actor_uid, actor_email, actor_name
    ) values (
      p_member_id,
      'renewed',
      'Marked renewed by an officer (' || v_method || ').'
        || case when v_note is null then '' else ' ' || v_note end,
      v_member.membership_status,
      'active',
      auth.uid(),
      public.kos_dues_actor(),
      public.kos_dues_actor()
    );
    v_activated := true;
  end if;

  perform public.kos_log_dues_event(
    'payment_recorded',
    p_member_id,
    v_year,
    jsonb_build_object(
      'source', 'officer_mark_paid',
      'method', v_method,
      'dues_payment_id', v_dues_id,
      'amount', v_amount,
      'membership_level', v_level,
      'activated', v_activated,
      'note', v_note
    )
  );

  return jsonb_build_object(
    'ok', true,
    'already_paid', false,
    'activated', v_activated,
    'dues_payment_id', v_dues_id,
    'message', coalesce(v_name, 'Member') || ' is marked paid by ' || v_method
      || ' for the ' || v_year::text || '-' || right((v_year + 1)::text, 2) || ' season.'
      || case when v_activated then ' Status is now active.' else '' end
      || ' No email was sent.'
  );
end;
$$;

comment on function public.kos_mark_renewal_paid(uuid, text, text) is
  'Membership Chair, Treasurer, President, and site admins. Records a paid cash or check dues row for the current season and sets lapsed or pending-renewal to active. No email.';

revoke all on function public.kos_mark_renewal_paid(uuid, text, text) from public, anon;
grant execute on function public.kos_mark_renewal_paid(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Email audience: unpaid this season. Officers only. No new cron.
-- ---------------------------------------------------------------------------

create or replace function public.officer_email_audience_counts()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.kos_can_send_member_email() then
    return jsonb_build_object('ok', false, 'message', 'Signed-in members only.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'active', (select count(*)::int from public.v_active_member_emails),
    'officers', (select count(*)::int from public.v_officer_emails),
    'chairs', (
      select count(*)::int from public.members m
      where m.merged_into is null
        and m.membership_status = 'active'
        and m.email is not null and position('@' in m.email) > 0
        and (
          lower(coalesce(m.officer_title, '')) like '%chair%'
          or lower(coalesce(m.member_role, '')) in ('officer', 'captain', 'board')
        )
    ),
    'prospects', case when public.is_krewe_officer() then (
      select count(*)::int from public.v_event_outreach v
       where v.applied_to_join = false
         and ('website_rsvp' = any (v.source_keys) or 'zeffy' = any (v.source_keys))
    ) else null end,
    'prospects_legacy', case when public.is_krewe_officer() then (
      select count(*)::int from public.v_event_outreach v
       where v.applied_to_join = false
         and ('website_rsvp' = any (v.source_keys) or 'zeffy' = any (v.source_keys) or 'legacy' = any (v.source_keys))
    ) else null end,
    'unpaid_season', case when public.is_krewe_officer() then (
      select count(*)::int
        from public.kos_renewal_rows(null) r
       where r.email is not null and position('@' in r.email) > 0
    ) else null end
  );
end;
$$;


create or replace function public.officer_send_member_email(
  p_subject text, p_body_html text, p_audience text default 'active', p_member_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_audience text := lower(coalesce(nullif(btrim(p_audience), ''), 'active'));
  v_subject text := nullif(btrim(p_subject), '');
  v_body_in text := nullif(btrim(p_body_html), '');
  v_body text;
  v_count integer := 0;
  v_skipped integer := 0;
  v_ids uuid[] := '{}';
  v_seen text[] := '{}';
  r record;
  v_log_id uuid;
begin
  if not public.kos_can_send_member_email() then
    return jsonb_build_object('ok', false, 'message', 'Signed-in members only.');
  end if;
  if not public.kos_member_email_under_daily_cap() then
    return jsonb_build_object('ok', false, 'message', 'Daily send limit reached (10 per day for members). Try again tomorrow, or ask an officer.');
  end if;
  if v_subject is null then
    return jsonb_build_object('ok', false, 'message', 'Subject is required.');
  end if;
  if v_body_in is null then
    return jsonb_build_object('ok', false, 'message', 'Message body is required.');
  end if;
  if v_audience in ('prospects', 'prospects_legacy') and not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Event prospects are officers only.');
  end if;
  if v_audience = 'unpaid_season' and not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Unpaid this season is officers only.');
  end if;
  if v_audience not in ('active', 'officers', 'chairs', 'selected', 'prospects', 'prospects_legacy', 'unpaid_season') then
    return jsonb_build_object('ok', false, 'message', 'Choose an audience: active, officers, chairs, selected, event prospects, or unpaid this season.');
  end if;
  if v_audience = 'selected' and (p_member_ids is null or cardinality(p_member_ids) = 0) then
    return jsonb_build_object('ok', false, 'message', 'Pick at least one member from the roster.');
  end if;

  v_body := public.wrap_all_krewe_email_html(v_subject, v_body_in);

  if v_audience = 'active' then
    for r in select member_id, first_name, last_name, email from public.v_active_member_emails
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  elsif v_audience = 'officers' then
    for r in select member_id, first_name, last_name, email from public.v_officer_emails
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  elsif v_audience = 'chairs' then
    for r in
      select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
      from public.members m
      where m.merged_into is null and m.membership_status = 'active'
        and m.email is not null and position('@' in m.email) > 0
        and (lower(coalesce(m.officer_title, '')) like '%chair%'
          or lower(coalesce(m.member_role, '')) in ('officer', 'captain', 'board'))
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  elsif v_audience in ('prospects', 'prospects_legacy') then
    for r in
      select distinct on (lower(btrim(v.email)))
        v.member_id, v.display_name, lower(btrim(v.email)) as email
      from public.v_event_outreach v
      where v.applied_to_join = false and v.email is not null and position('@' in v.email) > 0
        and ('website_rsvp' = any (v.source_keys) or 'zeffy' = any (v.source_keys)
          or (v_audience = 'prospects_legacy' and 'legacy' = any (v.source_keys)))
      order by lower(btrim(v.email))
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.display_name, '')), ''), v_subject, v_body, 'event_prospect_email', r.member_id);
      if r.member_id is not null then v_ids := array_append(v_ids, r.member_id); end if;
      v_count := v_count + 1;
    end loop;
  elsif v_audience = 'unpaid_season' then
    for r in
      select u.member_id, u.first_name, u.last_name, u.email
        from public.kos_renewal_rows(null) u
       where u.email is not null and position('@' in u.email) > 0
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  else
    for r in
      select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
      from public.members m
      where m.id = any(p_member_ids) and m.merged_into is null
        and m.email is not null and position('@' in m.email) > 0
    loop
      if public.kos_email_is_opted_out(r.email, r.member_id) then v_skipped := v_skipped + 1; continue; end if;
      if r.email = any (v_seen) then continue; end if;
      v_seen := array_append(v_seen, r.email);
      perform public.enqueue_email(r.email, nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), v_subject, v_body, 'officer_email', r.member_id);
      v_ids := array_append(v_ids, r.member_id); v_count := v_count + 1;
    end loop;
  end if;

  insert into public.officer_outreach_log
    (kind, audience, subject, body_html, recipient_count, member_ids, meta, sent_by)
  values
    ('email', v_audience, v_subject, v_body_in, v_count, v_ids,
     jsonb_build_object(
       'purpose', case when v_audience in ('prospects', 'prospects_legacy') then 'event_prospect_email' else 'officer_email' end,
       'skipped_opt_out', v_skipped,
       'include_legacy', v_audience = 'prospects_legacy',
       'sent_as_member', not public.is_krewe_officer()
     ), auth.uid())
  returning id into v_log_id;

  if v_audience = 'active' then
    insert into public.all_krewe_messages (subject, body_html, sent_by, recipient_count, segment)
    values (v_subject, v_body_in, auth.uid(), v_count, 'active');
  end if;

  return jsonb_build_object(
    'ok', true, 'id', v_log_id, 'recipient_count', v_count, 'skipped_opt_out', v_skipped, 'audience', v_audience,
    'message', 'Queued for ' || v_count || ' recipient(s).'
      || case when v_skipped > 0 then ' Skipped ' || v_skipped || ' opted-out address(es).' else '' end
      || ' Delivery uses the krewe outbound email queue.'
  );
end;
$$;



revoke all on function public.officer_email_audience_counts() from public, anon;
revoke all on function public.officer_send_member_email(text, text, text, uuid[]) from public, anon;
grant execute on function public.officer_email_audience_counts() to authenticated;
grant execute on function public.officer_send_member_email(text, text, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Officer Desk tool. Site admins already receive every tool from has_tool.
-- ---------------------------------------------------------------------------
insert into public.officer_tools (tool_key, label, description, section, sort_order, report_group, sensitive)
values (
  'renewals',
  'Renewals',
  'Who has not paid dues this season. Mark cash or check, or send a reminder.',
  'Email and invoices',
  145,
  null,
  true
)
on conflict (tool_key) do update set
  label = excluded.label,
  description = excluded.description,
  section = excluded.section,
  sort_order = excluded.sort_order,
  sensitive = excluded.sensitive;

insert into public.officer_title_tools (title_key, tool_key)
select t.title_key, 'renewals'
  from (values ('president'), ('treasurer'), ('chair_membership')) as t(title_key)
 where exists (select 1 from public.officer_titles ot where ot.title_key = t.title_key)
on conflict (title_key, tool_key) do nothing;
