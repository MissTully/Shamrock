-- NOT APPLIED. Apply after kos_v6_renewal_lapse.sql, only after Melissa approves, with this code.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
-- Safe to run again. Applying this file does not send email.
--
-- Ship this file with the Hub that calls kos_record_dues_receipt,
-- kos_void_dues_receipt, kos_adjust_dues_receipt, kos_treasurer_ledger,
-- kos_dues_reconcile, kos_member_dues_history, and kos_dues_season_report.
-- The Hub hides the new controls when PostgREST returns PGRST202.
--
-- What this file does:
--   * Treasurer, President, and Membership Chair can record cash or check.
--     President and Treasurer approve waivers. The same three manage invoices.
--   * One kos_dues_receipts row can cover a member and a linked partner.
--   * lapsed and pending-renewal become active with action renewed.
--     dues-pending stays dues-pending with action dues_paid.
--   * Read reports for the June-May season. Owing counts use
--     kos_renewal_rows, which calls kos_is_dues_exempt. This file does
--     not replace kos_is_dues_exempt.
--   * Direct writes to dues_payments and payments, and execute on
--     kos_log_dues_event, are taken off anon and authenticated.
--     Security definer functions still write. The Zeffy payment function
--     is not replaced.
--
-- Rollback, in the SQL editor, only if you are undoing this release.
-- Keep public.kos_dues_receipts and dues_payments.receipt_id. They are additive.
--   1. Recreate policy dues_officer_write on public.dues_payments
--      for all to authenticated
--      using (public.is_krewe_officer())
--      with check (public.is_krewe_officer());
--      Grant the table privileges this file revokes:
--      grant all on table public.dues_payments to anon, authenticated;
--      grant all on table public.payments to anon, authenticated;
--   2. grant execute on function public.kos_log_dues_event(text, uuid, integer, jsonb) to authenticated;
--   3. Run the same DO patch with the guard strings swapped back
--      (new guard to the original string). kos_request_dues_waiver stays as it was.
--   4. Restore officer_fundraising_report (live guard kos_can_run_report('finance'),
--      without the receipt CTE) and kos_mark_renewal_paid from sql/kos_dues_renewal.sql.
--   5. Re-add kos_dues_events_event_type_check with the v6 list and without payment_adjusted.

-- ---------------------------------------------------------------------------
-- 1) Who can record cash, approve waivers, and manage invoices.
--    Same shape as kos_can_manage_renewals. Site admins pass each one.
-- ---------------------------------------------------------------------------
create or replace function public.kos_can_record_dues_cash()
returns boolean
language plpgsql
stable
security definer
set search_path = public
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
  return v_keys && array['treasurer', 'president', 'chair_membership']::text[];
end;
$$;

comment on function public.kos_can_record_dues_cash() is
  'Treasurer, President, Membership Chair, and site admins. Records, voids, and adjusts cash and check receipts.';

revoke all on function public.kos_can_record_dues_cash() from public, anon;
grant execute on function public.kos_can_record_dues_cash() to authenticated;

create or replace function public.kos_can_approve_dues_waivers()
returns boolean
language plpgsql
stable
security definer
set search_path = public
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
  return v_keys && array['president', 'treasurer']::text[];
end;
$$;

comment on function public.kos_can_approve_dues_waivers() is
  'President, Treasurer, and site admins. Approve, deny, and apply dues waivers. Request stays on the wider officer gate.';

revoke all on function public.kos_can_approve_dues_waivers() from public, anon;
grant execute on function public.kos_can_approve_dues_waivers() to authenticated;

create or replace function public.kos_can_manage_invoices()
returns boolean
language plpgsql
stable
security definer
set search_path = public
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
  return v_keys && array['treasurer', 'president', 'chair_membership']::text[];
end;
$$;

comment on function public.kos_can_manage_invoices() is
  'Treasurer, President, Membership Chair, and site admins. Create and send dues invoices.';

revoke all on function public.kos_can_manage_invoices() from public, anon;
grant execute on function public.kos_can_manage_invoices() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) One receipt for one cash or check entry. No client policies.
-- ---------------------------------------------------------------------------
create table if not exists public.kos_dues_receipts (
  id uuid primary key default gen_random_uuid(),
  membership_year integer not null,
  method text not null,
  amount numeric(10,2) not null,
  received_on date not null,
  check_number text,
  payer_name text,
  note text,
  member_ids uuid[] not null default '{}',
  recorded_uid uuid,
  recorded_by text default public.kos_dues_actor(),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text,
  void_reason text
);

alter table public.kos_dues_receipts
  drop constraint if exists kos_dues_receipts_method_check;
alter table public.kos_dues_receipts
  add constraint kos_dues_receipts_method_check
  check (method in ('cash', 'check'));

alter table public.kos_dues_receipts
  drop constraint if exists kos_dues_receipts_amount_check;
alter table public.kos_dues_receipts
  add constraint kos_dues_receipts_amount_check
  check (amount > 0);

create index if not exists kos_dues_receipts_received_on_idx
  on public.kos_dues_receipts (received_on desc);

comment on table public.kos_dues_receipts is
  'Officer cash and check dues entries. No client policies. Read and write through the receipt functions.';

alter table public.kos_dues_receipts enable row level security;
revoke all on table public.kos_dues_receipts from public, anon, authenticated;

alter table public.dues_payments
  add column if not exists receipt_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'dues_payments_receipt_id_fkey'
       and conrelid = 'public.dues_payments'::regclass
  ) then
    alter table public.dues_payments
      add constraint dues_payments_receipt_id_fkey
      foreign key (receipt_id) references public.kos_dues_receipts(id) on delete set null;
  end if;
end $$;

create index if not exists dues_payments_receipt_id_idx
  on public.dues_payments (receipt_id);

comment on column public.dues_payments.receipt_id is
  'Cash or check receipt that marked this row paid. Null for Zeffy, waivers, and voided receipts.';

-- ---------------------------------------------------------------------------
-- 3) Event types. Every value from sql/kos_v6_renewal_lapse.sql, plus
--    payment_adjusted. member_inactivated is included for the v6 inactive
--    step so a row of that type stays valid.
-- ---------------------------------------------------------------------------
alter table public.kos_dues_events
  drop constraint if exists kos_dues_events_event_type_check;
alter table public.kos_dues_events
  add constraint kos_dues_events_event_type_check
  check (event_type in (
    'invoice_created',
    'invoice_emailed',
    'payment_recorded',
    'waiver_requested',
    'waiver_approved',
    'waiver_denied',
    'waiver_applied',
    'voided',
    'level_set',
    'officer_exemptions_batch',
    'member_lapsed',
    'reactivation_started',
    'member_inactivated',
    'payment_adjusted'
  ));

-- ---------------------------------------------------------------------------
-- 4) Record one cash or check entry. No email.
-- ---------------------------------------------------------------------------
create or replace function public.kos_record_dues_receipt(
  p_member_id uuid,
  p_method text,
  p_amount numeric,
  p_received_on date,
  p_check_number text default null,
  p_include_partner boolean default false,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text := lower(btrim(coalesce(p_method, '')));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_check text := nullif(left(btrim(coalesce(p_check_number, '')), 40), '');
  v_year integer := public.kos_dues_season_year();
  v_today date := (timezone('America/New_York', now()))::date;
  v_ids uuid[] := '{}';
  v_partner uuid;
  v_id uuid;
  v_member record;
  v_dues public.dues_payments%rowtype;
  v_has_dues boolean;
  v_status text;
  v_quote jsonb;
  v_level text;
  v_catalog numeric;
  v_url text;
  v_expected numeric := 0;
  v_levels text[] := '{}';
  v_catalogs numeric[] := '{}';
  v_urls text[] := '{}';
  v_statuses text[] := '{}';
  v_names text[] := '{}';
  v_cents bigint;
  v_n integer;
  v_base bigint;
  v_rem bigint;
  v_share numeric;
  v_i integer;
  v_line text;
  v_receipt_id uuid;
  v_dues_id uuid;
  v_dues_ids uuid[] := '{}';
  v_activated boolean;
  v_any_activated boolean := false;
  v_label text;
  v_message text;
begin
  if not public.kos_can_record_dues_cash() then
    return jsonb_build_object('ok', false, 'message', 'Cash and check are for the Treasurer, President, or Membership Chair.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Member is required.');
  end if;
  if v_method not in ('cash', 'check') then
    return jsonb_build_object('ok', false, 'message', 'Choose cash or check.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'message', 'Amount must be more than zero.');
  end if;
  if p_received_on is null then
    return jsonb_build_object('ok', false, 'message', 'Date received is required.');
  end if;
  if p_received_on > v_today then
    return jsonb_build_object('ok', false, 'message', 'Date received cannot be in the future.');
  end if;
  if v_method = 'check' and v_check is null then
    return jsonb_build_object('ok', false, 'message', 'Check number is required.');
  end if;
  if v_method = 'cash' then
    v_check := null;
  end if;

  v_ids := array[p_member_id];
  if coalesce(p_include_partner, false) then
    v_partner := null;
    if to_regprocedure('public.kos_linked_partner_id(uuid)') is not null then
      v_partner := public.kos_linked_partner_id(p_member_id);
    end if;
    if v_partner is null then
      select m.partner_member_id into v_partner
        from public.members m
       where m.id = p_member_id
         and m.merged_into is null;
    end if;
    if v_partner is null or v_partner = p_member_id then
      return jsonb_build_object('ok', false, 'message', 'No linked partner is on file.');
    end if;
    v_ids := v_ids || v_partner;
  end if;

  foreach v_id in array v_ids loop
    select m.id, m.first_name, m.last_name, m.membership_status, m.membership_level
      into v_member
      from public.members m
     where m.id = v_id
       and m.merged_into is null
     for update;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'Member was not found.');
    end if;
    v_status := lower(coalesce(v_member.membership_status, ''));
    if v_status = 'inactive' then
      return jsonb_build_object('ok', false, 'message', 'Inactive members must reapply.');
    end if;
    if v_status not in ('active', 'lapsed', 'pending-renewal', 'dues-pending') then
      return jsonb_build_object(
        'ok', false,
        'message', 'This entry is for active, lapsed, pending-renewal, or dues-pending members.'
      );
    end if;

    v_has_dues := false;
    select * into v_dues
      from public.dues_payments d
     where d.member_id = v_id
       and d.membership_year = v_year
     for update;
    if found then
      v_has_dues := true;
    end if;
    if v_has_dues and (
      coalesce(v_dues.paid, false)
      or coalesce(v_dues.waiver_status, '') = 'applied'
      or coalesce(v_dues.payment_method, '') = 'waiver'
    ) then
      return jsonb_build_object('ok', false, 'message', 'Someone on this entry is already paid or waived for this season.');
    end if;
    if v_status = 'dues-pending' and not v_has_dues then
      return jsonb_build_object('ok', false, 'message', 'No induction invoice yet.');
    end if;

    v_quote := public.kos_dues_quote(v_year, coalesce(v_member.membership_level, 'full'));
    v_level := coalesce(nullif(v_quote->>'level', ''), coalesce(v_member.membership_level, 'full'));
    v_catalog := coalesce((v_quote->>'amount')::numeric, public.kos_dues_fallback_amount(v_level));
    v_url := nullif(btrim(coalesce(v_quote->>'zeffy_url', '')), '');
    v_expected := v_expected + v_catalog;
    v_levels := v_levels || v_level;
    v_catalogs := v_catalogs || v_catalog;
    v_urls := v_urls || coalesce(v_url, '');
    v_statuses := v_statuses || v_status;
    v_names := v_names || coalesce(
      nullif(btrim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, '')), ''),
      'Member'
    );
  end loop;

  if round(p_amount, 2) <> round(v_expected, 2) and v_note is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Amount differs from $' || trim(to_char(round(v_expected, 2), 'FM999999990.00')) || ' expected. Add a note.'
    );
  end if;

  v_cents := round(round(p_amount, 2) * 100)::bigint;
  v_n := cardinality(v_ids);
  v_base := v_cents / v_n;
  v_rem := v_cents - (v_base * v_n);
  v_line := case
    when v_method = 'check' then 'Recorded by an officer (check #' || v_check || ').'
    else 'Recorded by an officer (cash).'
  end;

  insert into public.kos_dues_receipts (
    membership_year, method, amount, received_on, check_number, payer_name, note,
    member_ids, recorded_uid, recorded_by
  ) values (
    v_year, v_method, round(p_amount, 2), p_received_on, v_check,
    array_to_string(v_names, ' and '), v_note, v_ids, auth.uid(), public.kos_dues_actor()
  )
  returning id into v_receipt_id;

  for v_i in 1 .. v_n loop
    v_share := ((case when v_i = 1 then v_base + v_rem else v_base end)::numeric / 100);
    v_dues_id := null;
    insert into public.dues_payments (
      member_id, membership_year, amount, due_date, paid, paid_date, payment_method,
      membership_level, standard_amount, zeffy_campaign_key, notes, receipt_id
    ) values (
      v_ids[v_i], v_year, v_share, public.kos_dues_invoice_due_date(), true, p_received_on, v_method,
      v_levels[v_i], v_catalogs[v_i], nullif(v_urls[v_i], ''), v_line, v_receipt_id
    )
    on conflict (member_id, membership_year) do update
      set paid = true,
          paid_date = excluded.paid_date,
          payment_method = excluded.payment_method,
          amount = excluded.amount,
          membership_level = excluded.membership_level,
          standard_amount = coalesce(public.dues_payments.standard_amount, excluded.standard_amount),
          zeffy_campaign_key = coalesce(excluded.zeffy_campaign_key, public.dues_payments.zeffy_campaign_key),
          receipt_id = excluded.receipt_id,
          notes = trim(both from coalesce(public.dues_payments.notes, '')
            || case when coalesce(public.dues_payments.notes, '') = '' then '' else E'\n' end
            || excluded.notes)
    where public.dues_payments.paid = false
      and coalesce(public.dues_payments.waiver_status, '') <> 'applied'
      and coalesce(public.dues_payments.payment_method, '') <> 'waiver'
    returning id into v_dues_id;

    if v_dues_id is null then
      raise exception 'Could not record a dues row for %', v_ids[v_i];
    end if;
    v_dues_ids := v_dues_ids || v_dues_id;

    v_activated := false;
    if v_statuses[v_i] in ('lapsed', 'pending-renewal') then
      update public.members
         set membership_status = 'active',
             updated_at = now()
       where id = v_ids[v_i]
         and lower(coalesce(membership_status, '')) in ('lapsed', 'pending-renewal');
      insert into public.membership_application_actions (
        member_id, action, note, from_status, to_status, actor_uid, actor_email, actor_name
      ) values (
        v_ids[v_i],
        'renewed',
        'Marked renewed by an officer (' || v_method || ').'
          || case when v_check is null then '' else ' Check #' || v_check || '.' end
          || case when v_note is null then '' else ' ' || v_note end,
        v_statuses[v_i],
        'active',
        auth.uid(),
        public.kos_dues_actor(),
        public.kos_dues_actor()
      );
      v_activated := true;
      v_any_activated := true;
    elsif v_statuses[v_i] = 'dues-pending' then
      insert into public.membership_application_actions (
        member_id, action, note, from_status, to_status, actor_uid, actor_email, actor_name
      ) values (
        v_ids[v_i],
        'dues_paid',
        v_line || case when v_note is null then '' else ' ' || v_note end,
        'dues-pending',
        'dues-pending',
        auth.uid(),
        public.kos_dues_actor(),
        public.kos_dues_actor()
      );
    end if;

    perform public.kos_log_dues_event(
      'payment_recorded',
      v_ids[v_i],
      v_year,
      jsonb_build_object(
        'source', 'officer_receipt',
        'receipt_id', v_receipt_id,
        'method', v_method,
        'amount', v_share,
        'check_number', v_check,
        'received_on', p_received_on,
        'activated', v_activated
      )
    );
  end loop;

  v_label := v_year::text || '-' || right((v_year + 1)::text, 2);
  if v_n = 1 then
    v_message := v_names[1] || ' is marked paid by ' || v_method || ' for the ' || v_label || ' season.';
  else
    v_message := array_to_string(v_names, ' and ') || ' are marked paid by ' || v_method || ' for the ' || v_label || ' season.';
  end if;
  if v_any_activated then
    v_message := v_message || ' Status is now active.';
  end if;
  v_message := v_message || ' No email was sent.';

  return jsonb_build_object(
    'ok', true,
    'already_paid', false,
    'activated', v_any_activated,
    'receipt_id', v_receipt_id,
    'dues_payment_ids', to_jsonb(v_dues_ids),
    'message', v_message
  );
end;
$$;

comment on function public.kos_record_dues_receipt(uuid, text, numeric, date, text, boolean, text) is
  'Treasurer, President, Membership Chair, and site admins. Records one cash or check receipt for the current season, splits it across the member and an optional partner, and does not send email.';

revoke all on function public.kos_record_dues_receipt(uuid, text, numeric, date, text, boolean, text) from public, anon;
grant execute on function public.kos_record_dues_receipt(uuid, text, numeric, date, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Old Renewals button. Same guard, refusals, already_paid, and message.
--    Catalog amount, today, no partner. The dialog calls the receipt directly.
-- ---------------------------------------------------------------------------
create or replace function public.kos_mark_renewal_paid(
  p_member_id uuid,
  p_method text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text := lower(btrim(coalesce(p_method, '')));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_year integer := public.kos_dues_season_year();
  v_member record;
  v_quote jsonb;
  v_level text;
  v_amount numeric;
  v_name text;
  v_result jsonb;
  v_activated boolean := false;
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
  v_name := nullif(btrim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, '')), '');

  if exists (
    select 1 from public.dues_payments d
     where d.member_id = p_member_id
       and d.membership_year = v_year
       and (
         d.paid
         or coalesce(d.waiver_status, '') = 'applied'
         or coalesce(d.payment_method, '') = 'waiver'
       )
  ) then
    return jsonb_build_object('ok', true, 'already_paid', true, 'message', coalesce(v_name, 'Member') || ' is already paid for this season.');
  end if;

  v_result := public.kos_record_dues_receipt(
    p_member_id,
    v_method,
    v_amount,
    (timezone('America/New_York', now()))::date,
    null,
    false,
    v_note
  );
  if coalesce(v_result->>'ok', '') <> 'true' then
    return v_result;
  end if;
  v_activated := coalesce((v_result->>'activated')::boolean, false);

  return jsonb_build_object(
    'ok', true,
    'already_paid', false,
    'activated', v_activated,
    'dues_payment_id', v_result->'dues_payment_ids'->0,
    'receipt_id', v_result->>'receipt_id',
    'message', coalesce(v_name, 'Member') || ' is marked paid by ' || v_method
      || ' for the ' || v_year::text || '-' || right((v_year + 1)::text, 2) || ' season.'
      || case when v_activated then ' Status is now active.' else '' end
      || ' No email was sent.'
  );
end;
$$;

comment on function public.kos_mark_renewal_paid(uuid, text, text) is
  'Membership Chair, Treasurer, President, and site admins. Wrapper around kos_record_dues_receipt for the catalog amount, today, and no partner. No email.';

revoke all on function public.kos_mark_renewal_paid(uuid, text, text) from public, anon;
grant execute on function public.kos_mark_renewal_paid(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Void a receipt. Member status is not changed. No email.
-- ---------------------------------------------------------------------------
create or replace function public.kos_void_dues_receipt(
  p_receipt_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_receipt public.kos_dues_receipts%rowtype;
  v_row public.dues_payments%rowtype;
  v_line text;
begin
  if not public.kos_can_record_dues_cash() then
    return jsonb_build_object('ok', false, 'message', 'Cash and check are for the Treasurer, President, or Membership Chair.');
  end if;
  if p_receipt_id is null then
    return jsonb_build_object('ok', false, 'message', 'Receipt is required.');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'message', 'A reason is required.');
  end if;

  select * into v_receipt
    from public.kos_dues_receipts
   where id = p_receipt_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Receipt was not found.');
  end if;
  if v_receipt.voided_at is not null then
    return jsonb_build_object('ok', false, 'message', 'This receipt is already voided.');
  end if;

  v_line := 'Receipt voided: ' || v_reason;
  for v_row in
    select *
      from public.dues_payments
     where receipt_id = p_receipt_id
     for update
  loop
    update public.dues_payments
       set paid = false,
           paid_date = null,
           payment_method = null,
           receipt_id = null,
           amount = coalesce(standard_amount, amount),
           notes = trim(both from coalesce(notes, '')
             || case when coalesce(notes, '') = '' then '' else E'\n' end
             || v_line)
     where id = v_row.id;

    perform public.kos_log_dues_event(
      'voided',
      v_row.member_id,
      v_row.membership_year,
      jsonb_build_object(
        'source', 'officer_receipt',
        'receipt_id', p_receipt_id,
        'reason', v_reason,
        'amount', v_row.amount
      )
    );
  end loop;

  update public.kos_dues_receipts
     set voided_at = now(),
         voided_by = public.kos_dues_actor(),
         void_reason = v_reason
   where id = p_receipt_id;

  return jsonb_build_object(
    'ok', true,
    'receipt_id', p_receipt_id,
    'message', 'Receipt voided. No email was sent.'
  );
end;
$$;

comment on function public.kos_void_dues_receipt(uuid, text) is
  'Treasurer, President, Membership Chair, and site admins. Marks the linked dues rows unpaid and leaves member status as it is. No email.';

revoke all on function public.kos_void_dues_receipt(uuid, text) from public, anon;
grant execute on function public.kos_void_dues_receipt(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Adjust amount, date, or check number. Re-split onto the same rows.
-- ---------------------------------------------------------------------------
create or replace function public.kos_adjust_dues_receipt(
  p_receipt_id uuid,
  p_amount numeric,
  p_received_on date,
  p_check_number text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_check text := nullif(left(btrim(coalesce(p_check_number, '')), 40), '');
  v_today date := (timezone('America/New_York', now()))::date;
  v_receipt public.kos_dues_receipts%rowtype;
  v_ids uuid[];
  v_n integer;
  v_cents bigint;
  v_base bigint;
  v_rem bigint;
  v_i integer;
  v_share numeric;
  v_old_share numeric;
  v_member uuid;
begin
  if not public.kos_can_record_dues_cash() then
    return jsonb_build_object('ok', false, 'message', 'Cash and check are for the Treasurer, President, or Membership Chair.');
  end if;
  if p_receipt_id is null then
    return jsonb_build_object('ok', false, 'message', 'Receipt is required.');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'message', 'A reason is required.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'message', 'Amount must be more than zero.');
  end if;
  if p_received_on is null then
    return jsonb_build_object('ok', false, 'message', 'Date received is required.');
  end if;
  if p_received_on > v_today then
    return jsonb_build_object('ok', false, 'message', 'Date received cannot be in the future.');
  end if;

  select * into v_receipt
    from public.kos_dues_receipts
   where id = p_receipt_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Receipt was not found.');
  end if;
  if v_receipt.voided_at is not null then
    return jsonb_build_object('ok', false, 'message', 'A voided receipt cannot be adjusted.');
  end if;
  if v_receipt.method = 'check' and v_check is null then
    return jsonb_build_object('ok', false, 'message', 'Check number is required.');
  end if;
  if v_receipt.method = 'cash' then
    v_check := null;
  end if;

  select coalesce(array_agg(d.member_id order by array_position(v_receipt.member_ids, d.member_id), d.member_id), '{}')
    into v_ids
    from public.dues_payments d
   where d.receipt_id = p_receipt_id;
  v_n := coalesce(cardinality(v_ids), 0);
  if v_n < 1 then
    return jsonb_build_object('ok', false, 'message', 'This receipt is not linked to a dues row.');
  end if;

  v_cents := round(round(p_amount, 2) * 100)::bigint;
  v_base := v_cents / v_n;
  v_rem := v_cents - (v_base * v_n);

  update public.kos_dues_receipts
     set amount = round(p_amount, 2),
         received_on = p_received_on,
         check_number = v_check
   where id = p_receipt_id;

  for v_i in 1 .. v_n loop
    v_member := v_ids[v_i];
    v_share := ((case when v_i = 1 then v_base + v_rem else v_base end)::numeric / 100);
    select d.amount into v_old_share
      from public.dues_payments d
     where d.receipt_id = p_receipt_id
       and d.member_id = v_member
     for update;

    update public.dues_payments
       set amount = v_share,
           paid_date = p_received_on
     where receipt_id = p_receipt_id
       and member_id = v_member;

    perform public.kos_log_dues_event(
      'payment_adjusted',
      v_member,
      v_receipt.membership_year,
      jsonb_build_object(
        'source', 'officer_receipt',
        'receipt_id', p_receipt_id,
        'reason', v_reason,
        'before', jsonb_build_object(
          'amount', v_receipt.amount,
          'received_on', v_receipt.received_on,
          'check_number', v_receipt.check_number,
          'share', v_old_share
        ),
        'after', jsonb_build_object(
          'amount', round(p_amount, 2),
          'received_on', p_received_on,
          'check_number', v_check,
          'share', v_share
        )
      )
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'receipt_id', p_receipt_id,
    'message', 'Receipt adjusted. No email was sent.'
  );
end;
$$;

comment on function public.kos_adjust_dues_receipt(uuid, numeric, date, text, text) is
  'Treasurer, President, Membership Chair, and site admins. Updates one open receipt and re-splits the amount onto its dues rows. No email.';

revoke all on function public.kos_adjust_dues_receipt(uuid, numeric, date, text, text) from public, anon;
grant execute on function public.kos_adjust_dues_receipt(uuid, numeric, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Read reports. can_view_payments(), except history also allows renewals.
-- ---------------------------------------------------------------------------
create or replace function public.kos_treasurer_ledger(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_totals jsonb;
  v_days jsonb;
  v_deposit bigint;
begin
  if to_regprocedure('public.can_view_payments()') is null
     or not public.can_view_payments() then
    return jsonb_build_object('ok', false, 'message', 'Dues reports are for people who can open Dues and Payments.');
  end if;

  with lines as (
    select
      'zeffy'::text as source,
      (p.created_at at time zone 'America/New_York')::date as paid_on,
      p.member_id,
      coalesce(nullif(btrim(p.payer_name), ''), 'Zeffy payer') as name,
      'card'::text as method,
      round(p.amount_cents / 100.0, 2) as amount,
      p.amount_cents::bigint as amount_cents,
      null::text as check_number,
      false as voided,
      null::uuid as receipt_id,
      p.id as payment_id,
      p.product_kind as kind,
      p.description as note
    from public.payments p
    where p.status = 'succeeded'
      and (p_from is null or (p.created_at at time zone 'America/New_York')::date >= p_from)
      and (p_to is null or (p.created_at at time zone 'America/New_York')::date <= p_to)
    union all
    select
      r.method,
      r.received_on,
      r.member_ids[1],
      coalesce(r.payer_name, 'Cash or check'),
      r.method,
      r.amount,
      round(r.amount * 100)::bigint,
      r.check_number,
      r.voided_at is not null,
      r.id,
      null::uuid,
      'dues',
      r.note
    from public.kos_dues_receipts r
    where (p_from is null or r.received_on >= p_from)
      and (p_to is null or r.received_on <= p_to)
    union all
    select
      'waiver',
      coalesce(d.paid_date, make_date(d.membership_year, 6, 1)),
      d.member_id,
      trim(both from coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
      'waiver',
      0,
      0,
      null,
      false,
      d.receipt_id,
      null::uuid,
      'dues',
      'Waived'
    from public.dues_payments d
    join public.members m on m.id = d.member_id
    where (coalesce(d.payment_method, '') = 'waiver' or coalesce(d.waiver_status, '') = 'applied')
      and (p_from is null or coalesce(d.paid_date, make_date(d.membership_year, 6, 1)) >= p_from)
      and (p_to is null or coalesce(d.paid_date, make_date(d.membership_year, 6, 1)) <= p_to)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'source', source,
           'when', paid_on,
           'member_id', member_id,
           'name', name,
           'method', method,
           'amount', amount,
           'amount_cents', amount_cents,
           'check_number', check_number,
           'voided', voided,
           'receipt_id', receipt_id,
           'payment_id', payment_id,
           'kind', kind,
           'note', note
         ) order by paid_on desc, name), '[]'::jsonb)
    into v_rows
    from lines;

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', g.source,
           'count', g.count,
           'amount_cents', g.amount_cents
         ) order by g.source), '[]'::jsonb)
    into v_totals
    from (
      select source,
             count(*)::int as count,
             coalesce(sum(amount_cents) filter (where not voided), 0)::bigint as amount_cents
        from (
          select 'zeffy'::text as source, p.amount_cents::bigint as amount_cents, false as voided
            from public.payments p
           where p.status = 'succeeded'
             and (p_from is null or (p.created_at at time zone 'America/New_York')::date >= p_from)
             and (p_to is null or (p.created_at at time zone 'America/New_York')::date <= p_to)
          union all
          select r.method, round(r.amount * 100)::bigint, r.voided_at is not null
            from public.kos_dues_receipts r
           where (p_from is null or r.received_on >= p_from)
             and (p_to is null or r.received_on <= p_to)
          union all
          select 'waiver'::text, 0::bigint, false
            from public.dues_payments d
           where (coalesce(d.payment_method, '') = 'waiver' or coalesce(d.waiver_status, '') = 'applied')
             and (p_from is null or coalesce(d.paid_date, make_date(d.membership_year, 6, 1)) >= p_from)
             and (p_to is null or coalesce(d.paid_date, make_date(d.membership_year, 6, 1)) <= p_to)
        ) raw
       group by source
    ) g;

  select coalesce(sum(round(r.amount * 100)), 0)::bigint
    into v_deposit
    from public.kos_dues_receipts r
   where r.voided_at is null
     and r.method in ('cash', 'check')
     and (p_from is null or r.received_on >= p_from)
     and (p_to is null or r.received_on <= p_to);

  select coalesce(jsonb_agg(jsonb_build_object(
           'day', day,
           'cash_cents', cash_cents,
           'check_cents', check_cents,
           'total_cents', cash_cents + check_cents
         ) order by day), '[]'::jsonb)
    into v_days
    from (
      select r.received_on as day,
             coalesce(sum(round(r.amount * 100)) filter (where r.method = 'cash'), 0)::bigint as cash_cents,
             coalesce(sum(round(r.amount * 100)) filter (where r.method = 'check'), 0)::bigint as check_cents
        from public.kos_dues_receipts r
       where r.voided_at is null
         and (p_from is null or r.received_on >= p_from)
         and (p_to is null or r.received_on <= p_to)
       group by r.received_on
    ) days;

  return jsonb_build_object(
    'ok', true,
    'from', p_from,
    'to', p_to,
    'rows', v_rows,
    'totals', v_totals,
    'deposit_total_cents', v_deposit,
    'deposits_by_day', v_days
  );
end;
$$;

comment on function public.kos_treasurer_ledger(date, date) is
  'People who can view payments. Zeffy rows, cash and check receipts, and waived dues in a date range. Deposit total is non-voided cash plus check.';

revoke all on function public.kos_treasurer_ledger(date, date) from public, anon;
grant execute on function public.kos_treasurer_ledger(date, date) to authenticated;

create or replace function public.kos_dues_reconcile(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
  v_from date := make_date(coalesce(p_year, public.kos_dues_season_year()), 6, 1);
  v_to date := make_date(coalesce(p_year, public.kos_dues_season_year()) + 1, 5, 31);
  v_amount jsonb;
  v_level jsonb;
  v_unmatched jsonb;
  v_misfiled jsonb;
  v_card jsonb;
  v_norow jsonb;
begin
  if to_regprocedure('public.can_view_payments()') is null
     or not public.can_view_payments() then
    return jsonb_build_object('ok', false, 'message', 'Dues reports are for people who can open Dues and Payments.');
  end if;

  with pay as (
    select p.id, p.member_id, p.partner_member_id, p.amount_cents, p.payer_name, p.description
      from public.payments p
     where p.status = 'succeeded'
       and p.product_kind = 'dues'
       and p.member_id is not null
       and (p.created_at at time zone 'America/New_York')::date between v_from and v_to
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'payment_id', s.id,
           'member_id', s.member_id,
           'partner_member_id', s.partner_member_id,
           'payer_name', s.payer_name,
           'amount_cents', s.amount_cents,
           'row_cents', s.row_cents
         )), '[]'::jsonb)
    into v_amount
    from (
      select pay.id, pay.member_id, pay.partner_member_id, pay.payer_name, pay.amount_cents,
             round(coalesce(sum(d.amount), 0) * 100)::int as row_cents
        from pay
        join public.dues_payments d
          on d.membership_year = v_year
         and d.paid
         and d.payment_method = 'card'
         and (d.member_id = pay.member_id or d.member_id = pay.partner_member_id)
       group by pay.id, pay.member_id, pay.partner_member_id, pay.amount_cents, pay.payer_name
      having round(coalesce(sum(d.amount), 0) * 100)::int <> pay.amount_cents
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', d.member_id,
           'name', trim(both from coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
           'level', coalesce(d.membership_level, m.membership_level),
           'amount', d.amount,
           'other_level', c.level
         )), '[]'::jsonb)
    into v_level
    from public.dues_payments d
    join public.members m on m.id = d.member_id
    join public.kos_dues_catalog c
      on c.membership_year = v_year
     and c.active
     and c.amount = d.amount
     and c.level <> coalesce(d.membership_level, m.membership_level, 'full')
   where d.membership_year = v_year
     and d.paid
     and coalesce(d.payment_method, '') <> 'waiver'
     and coalesce(d.waiver_status, '') <> 'applied';

  select coalesce(jsonb_agg(jsonb_build_object(
           'payment_id', p.id,
           'payer_name', p.payer_name,
           'payer_email', p.payer_email,
           'amount_cents', p.amount_cents,
           'description', p.description
         )), '[]'::jsonb)
    into v_unmatched
    from public.payments p
   where p.status = 'succeeded'
     and p.product_kind = 'dues'
     and p.member_id is null
     and (p.created_at at time zone 'America/New_York')::date between v_from and v_to;

  select coalesce(jsonb_agg(jsonb_build_object(
           'payment_id', p.id,
           'payer_name', p.payer_name,
           'product_kind', p.product_kind,
           'amount_cents', p.amount_cents,
           'description', p.description,
           'member_id', p.member_id
         )), '[]'::jsonb)
    into v_misfiled
    from public.payments p
   where p.status = 'succeeded'
     and p.product_kind in ('event', 'other')
     and (p.created_at at time zone 'America/New_York')::date between v_from and v_to
     and (
       coalesce(p.description, '') ~* '(dues|membership|renew|associate|auxiliary|leave of absence)'
       or p.amount_cents in (select cents from (
            select distinct round(x.amount * 100)::int as cents
              from (
                select c.amount from public.kos_dues_catalog c
                 where c.membership_year = v_year and c.active and c.amount > 0
                union all
                select public.kos_dues_fallback_amount(lvl)
                  from unnest(array['full', 'associate', 'loa', 'auxiliary']) as lvl
              ) x
          ) one)
       or p.amount_cents in (select cents * 2 from (
            select distinct round(x.amount * 100)::int as cents
              from (
                select c.amount from public.kos_dues_catalog c
                 where c.membership_year = v_year and c.active and c.amount > 0
                union all
                select public.kos_dues_fallback_amount(lvl)
                  from unnest(array['full', 'associate', 'loa', 'auxiliary']) as lvl
              ) x
          ) two)
     );

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', d.member_id,
           'name', trim(both from coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
           'amount', d.amount,
           'paid_date', d.paid_date
         )), '[]'::jsonb)
    into v_card
    from public.dues_payments d
    join public.members m on m.id = d.member_id
   where d.membership_year = v_year
     and d.paid
     and d.payment_method = 'card'
     and not exists (
       select 1 from public.payments p
        where p.status = 'succeeded'
          and p.product_kind = 'dues'
          and (p.created_at at time zone 'America/New_York')::date between v_from and v_to
          and (p.member_id = d.member_id or p.partner_member_id = d.member_id)
     );

  select coalesce(jsonb_agg(jsonb_build_object(
           'payment_id', p.id,
           'member_id', p.member_id,
           'payer_name', p.payer_name,
           'amount_cents', p.amount_cents,
           'description', p.description
         )), '[]'::jsonb)
    into v_norow
    from public.payments p
   where p.status = 'succeeded'
     and p.product_kind = 'dues'
     and p.member_id is not null
     and (p.created_at at time zone 'America/New_York')::date between v_from and v_to
     and not exists (
       select 1 from public.dues_payments d
        where d.member_id = p.member_id
          and d.membership_year = v_year
     );

  return jsonb_build_object(
    'ok', true,
    'year', v_year,
    'from', v_from,
    'to', v_to,
    'amount_mismatch', coalesce(v_amount, '[]'::jsonb),
    'level_mismatch', coalesce(v_level, '[]'::jsonb),
    'unmatched_dues_payer', coalesce(v_unmatched, '[]'::jsonb),
    'possible_misfiled', coalesce(v_misfiled, '[]'::jsonb),
    'card_paid_no_payment', coalesce(v_card, '[]'::jsonb),
    'dues_payment_no_row', coalesce(v_norow, '[]'::jsonb)
  );
end;
$$;

comment on function public.kos_dues_reconcile(integer) is
  'People who can view payments. Read only. Compares Zeffy dues payments in the June-May window with dues rows. Does not change rows and does not send email.';

revoke all on function public.kos_dues_reconcile(integer) from public, anon;
grant execute on function public.kos_dues_reconcile(integer) to authenticated;

create or replace function public.kos_member_dues_history(p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
  v_items jsonb;
begin
  if not (
    (to_regprocedure('public.can_view_payments()') is not null and public.can_view_payments())
    or public.kos_can_manage_renewals()
  ) then
    return jsonb_build_object('ok', false, 'message', 'Dues history is for payments viewers or the renewals desk.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Member is required.');
  end if;

  select trim(both from coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, ''))
    into v_name
    from public.members m
   where m.id = p_member_id
     and m.merged_into is null;
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'Member was not found.');
  end if;

  with items as (
    select e.created_at as at,
           jsonb_build_object(
             'kind', 'event',
             'at', e.created_at,
             'event_type', e.event_type,
             'actor', e.actor,
             'membership_year', e.membership_year,
             'payload', e.payload
           ) as item
      from public.kos_dues_events e
     where e.member_id = p_member_id
    union all
    select r.recorded_at,
           jsonb_build_object(
             'kind', 'receipt',
             'at', r.recorded_at,
             'receipt_id', r.id,
             'method', r.method,
             'amount', r.amount,
             'received_on', r.received_on,
             'check_number', r.check_number,
             'voided', r.voided_at is not null,
             'void_reason', r.void_reason,
             'note', r.note,
             'membership_year', r.membership_year
           )
      from public.kos_dues_receipts r
     where p_member_id = any (r.member_ids)
    union all
    select p.created_at,
           jsonb_build_object(
             'kind', 'payment',
             'at', p.created_at,
             'payment_id', p.id,
             'source', 'zeffy',
             'amount_cents', p.amount_cents,
             'product_kind', p.product_kind,
             'description', p.description,
             'status', p.status,
             'payer_name', p.payer_name
           )
      from public.payments p
     where p.member_id = p_member_id
        or p.partner_member_id = p_member_id
  )
  select coalesce(jsonb_agg(item order by at desc), '[]'::jsonb)
    into v_items
    from items;

  return jsonb_build_object(
    'ok', true,
    'member_id', p_member_id,
    'name', v_name,
    'items', v_items
  );
end;
$$;

comment on function public.kos_member_dues_history(uuid) is
  'Payments viewers and the renewals desk. Events, receipts, and Zeffy payments for one member, newest first. Read only.';

revoke all on function public.kos_member_dues_history(uuid) from public, anon;
grant execute on function public.kos_member_dues_history(uuid) to authenticated;

create or replace function public.kos_dues_season_report(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
  v_from date;
  v_to date;
  v_collected jsonb;
  v_waived_count integer := 0;
  v_waived_amount numeric := 0;
  v_voided_count integer := 0;
  v_voided_amount numeric := 0;
  v_ren_count integer := 0;
  v_ren_amount numeric := 0;
  v_ind_count integer := 0;
  v_ind_amount numeric := 0;
  v_not_count integer := 0;
  v_not_amount numeric := 0;
  v_bg_count integer := 0;
  v_bg_cents bigint := 0;
  v_renewal_rows integer := 0;
begin
  if to_regprocedure('public.can_view_payments()') is null
     or not public.can_view_payments() then
    return jsonb_build_object('ok', false, 'message', 'Dues reports are for people who can open Dues and Payments.');
  end if;

  v_from := make_date(v_year, 6, 1);
  v_to := make_date(v_year + 1, 5, 31);

  select coalesce(jsonb_agg(jsonb_build_object(
           'method', method,
           'level', level,
           'count', count,
           'amount', amount
         ) order by method, level), '[]'::jsonb)
    into v_collected
    from (
      select coalesce(nullif(d.payment_method, ''), 'unset') as method,
             coalesce(d.membership_level, 'full') as level,
             count(*)::int as count,
             coalesce(sum(d.amount), 0) as amount
        from public.dues_payments d
       where d.membership_year = v_year
         and d.paid
         and coalesce(d.payment_method, '') <> 'waiver'
         and coalesce(d.waiver_status, '') <> 'applied'
       group by 1, 2
    ) c;

  select count(*)::int, coalesce(sum(coalesce(d.standard_amount, d.amount)), 0)
    into v_waived_count, v_waived_amount
    from public.dues_payments d
   where d.membership_year = v_year
     and (coalesce(d.payment_method, '') = 'waiver' or coalesce(d.waiver_status, '') = 'applied');

  select count(*)::int, coalesce(sum(r.amount), 0)
    into v_voided_count, v_voided_amount
    from public.kos_dues_receipts r
   where r.membership_year = v_year
     and r.voided_at is not null;

  -- kos_renewal_rows already applies kos_is_dues_exempt. Do not re-check a role column.
  select count(*)::int
    into v_renewal_rows
    from public.kos_renewal_rows(v_year);

  select count(*)::int, coalesce(sum(d.amount), 0)
    into v_ren_count, v_ren_amount
    from public.kos_renewal_rows(v_year) r
    join public.dues_payments d
      on d.member_id = r.member_id
     and d.membership_year = v_year
     and d.paid = false
     and coalesce(d.waiver_status, '') <> 'applied'
     and coalesce(d.payment_method, '') <> 'waiver';

  select count(*)::int, coalesce(sum(r.amount), 0)
    into v_not_count, v_not_amount
    from public.kos_renewal_rows(v_year) r
   where not exists (
     select 1
       from public.dues_payments d
      where d.member_id = r.member_id
        and d.membership_year = v_year
        and d.paid = false
        and coalesce(d.waiver_status, '') <> 'applied'
        and coalesce(d.payment_method, '') <> 'waiver'
   );

  select count(*)::int, coalesce(sum(d.amount), 0)
    into v_ind_count, v_ind_amount
    from public.dues_payments d
    join public.members m on m.id = d.member_id
   where d.membership_year = v_year
     and m.merged_into is null
     and lower(coalesce(m.membership_status, '')) = 'dues-pending'
     and d.paid = false
     and coalesce(d.waiver_status, '') <> 'applied'
     and coalesce(d.payment_method, '') <> 'waiver';

  select count(*)::int, coalesce(sum(p.amount_cents), 0)::bigint
    into v_bg_count, v_bg_cents
    from public.payments p
   where p.status = 'succeeded'
     and p.product_kind = 'background_check'
     and (p.created_at at time zone 'America/New_York')::date between v_from and v_to;

  return jsonb_build_object(
    'ok', true,
    'year', v_year,
    'from', v_from,
    'to', v_to,
    'collected', v_collected,
    'waived', jsonb_build_object('count', v_waived_count, 'amount', v_waived_amount),
    'voided', jsonb_build_object('count', v_voided_count, 'amount', v_voided_amount),
    'invoiced_unpaid', jsonb_build_object(
      'renewal', jsonb_build_object('count', v_ren_count, 'amount', v_ren_amount),
      'induction', jsonb_build_object('count', v_ind_count, 'amount', v_ind_amount)
    ),
    'not_invoiced', jsonb_build_object('count', v_not_count, 'amount', v_not_amount),
    'owing_total', v_ren_count + v_not_count,
    'owing_amount', v_ren_amount + v_not_amount,
    'renewal_rows', v_renewal_rows,
    'background_check_fees', jsonb_build_object('count', v_bg_count, 'amount_cents', v_bg_cents)
  );
end;
$$;

comment on function public.kos_dues_season_report(integer) is
  'People who can view payments. Collected, waived, voided, unpaid renewal and induction, and not-yet-invoiced counts from kos_renewal_rows. owing_total equals that renewal list. Read only. No email.';

revoke all on function public.kos_dues_season_report(integer) from public, anon;
grant execute on function public.kos_dues_season_report(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Fundraising summary. Live guard stays. Cash and check receipts, and
--    background check card payments, sit with membership dues.
-- ---------------------------------------------------------------------------
create or replace function public.officer_fundraising_report(
  p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_by_category jsonb;
  v_by_event    jsonb;
  v_total       bigint;
  v_cash_check  bigint;
begin
  if not public.kos_can_run_report('finance') then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.');
  end if;

  select coalesce(sum(round(r.amount * 100)), 0)::bigint
    into v_cash_check
    from public.kos_dues_receipts r
   where r.voided_at is null
     and (p_from is null or r.received_on >= p_from)
     and (p_to is null or r.received_on < p_to + 1);

  with legacy as (
    select case
             when lp.origin = 'Event registration' then 'Events'
             when lp.origin in ('Member renewal','Member application','Member level change')
               then 'Membership dues & applications'
             when lp.origin = 'Online store order' then 'Store'
             when lp.origin = 'Manual invoice' then 'Manual invoices'
             when lp.origin like '%;%' then 'Mixed'
             else 'Other'
           end as category,
           (lp.settled_cents - lp.refunded_cents) as net_cents
      from public.legacy_payments lp
     where (p_from is null or lp.paid_at >= p_from)
       and (p_to is null or lp.paid_at < p_to + 1)
  ), site as (
    select case p.product_kind
             when 'event' then 'Events'
             when 'dues' then 'Membership dues & applications'
             when 'background_check' then 'Membership dues & applications'
             when 'store' then 'Store'
             when 'raffle' then 'Raffle'
             when 'donation' then 'Donations'
             else 'Other'
           end as category,
           p.amount_cents as net_cents
      from public.payments p
     where p.status = 'succeeded'
       and (p_from is null or p.created_at >= p_from)
       and (p_to is null or p.created_at < p_to + 1)
  ), receipts as (
    select 'Membership dues & applications'::text as category,
           round(r.amount * 100)::bigint as net_cents
      from public.kos_dues_receipts r
     where r.voided_at is null
       and (p_from is null or r.received_on >= p_from)
       and (p_to is null or r.received_on < p_to + 1)
  ), unioned as (
    select * from legacy
    union all
    select * from site
    union all
    select * from receipts
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.total_cents desc), '[]'::jsonb),
         coalesce(sum(c.total_cents), 0)
    into v_by_category, v_total
    from (select category, sum(net_cents)::bigint as total_cents,
                 count(*)::bigint as payments
            from unioned group by category) c;

  with per_event as (
    select e.name as title, e.start_time,
           coalesce((select sum(p.amount_cents) from public.payments p
                      where p.event_id = e.id and p.status = 'succeeded'), 0)
         + coalesce((select sum(l.total_fee_cents)
                       from public.legacy_event_registrations l
                      where l.event_id = e.id and l.payment_state = 'Paid'), 0)
           as raised_cents,
           coalesce((select sum(1 + coalesce(s.guests_count,0))
                       from public.event_signups s
                      where s.event_id = e.id
                        and s.status in ('registered','confirmed','attended')), 0)
         + coalesce((select count(*)
                       from public.legacy_event_registrations l
                      where l.event_id = e.id
                        and coalesce(l.payment_state,'')
                            not in ('Canceled','Probably abandoned (payment failed)')), 0)
           as headcount
      from public.events e
     where coalesce(e.source,'') <> 'ikc'
    union all
    select min(l.event_title), min(l.event_start),
           coalesce(sum(l.total_fee_cents) filter (where l.payment_state = 'Paid'), 0),
           count(*) filter (where coalesce(l.payment_state,'')
             not in ('Canceled','Probably abandoned (payment failed)'))
      from public.legacy_event_registrations l
     where l.event_id is null and l.wa_event_id is not null
     group by l.wa_event_id
  )
  select coalesce(jsonb_agg(to_jsonb(pe) order by pe.start_time desc nulls last), '[]'::jsonb)
    into v_by_event
    from per_event pe
   where (pe.raised_cents > 0 or pe.headcount > 0)
     and (p_from is null or pe.start_time >= p_from)
     and (p_to is null or pe.start_time < p_to + 1);

  return jsonb_build_object(
    'ok', true,
    'total_cents', v_total,
    'cash_check_cents', v_cash_check,
    'by_category', v_by_category,
    'by_event', v_by_event);
end;
$$;

comment on function public.officer_fundraising_report(date, date) is
  'Finance report. Same guard as live. Non-voided cash and check receipts, and background check card payments, are Membership dues and applications.';

revoke all on function public.officer_fundraising_report(date, date) from public, anon;
grant execute on function public.officer_fundraising_report(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) Lock down direct writes. Select policies stay.
-- ---------------------------------------------------------------------------
drop policy if exists "dues_officer_write" on public.dues_payments;

revoke insert, update, delete, truncate, references, trigger on table public.dues_payments from anon, authenticated;
revoke select on table public.dues_payments from anon;

revoke insert, update, delete, truncate, references, trigger on table public.payments from anon, authenticated;
revoke select on table public.payments from anon;

revoke execute on function public.kos_log_dues_event(text, uuid, integer, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11) Narrow the live guards. kos_request_dues_waiver is unchanged.
--     Raises if the old string is missing, unless the new guard is already there.
-- ---------------------------------------------------------------------------
do $patch_guards$
declare
  v_sig text;
  v_old text;
  v_new text;
  v_def text;
  v_i integer;
  v_sigs text[] := array[
    'public.kos_decide_dues_waiver(uuid,integer,boolean,boolean)',
    'public.kos_apply_elected_officer_exemptions(integer)',
    'public.kos_create_level_invoices(uuid[],integer,boolean)',
    'public.officer_create_and_send_invoices(uuid[],integer,numeric,text,text,boolean,text)',
    'public.officer_list_invoice_targets(text,integer,text,integer)'
  ];
  v_olds text[] := array[
    'if not (public.is_krewe_officer() or public.has_tool(''dues_waivers'')) then',
    'if not (public.is_krewe_officer() or public.has_tool(''dues_waivers'')) then',
    'if not public.is_krewe_officer() then',
    'if not (public.is_krewe_officer() or public.has_tool(''send_invoices'')) then',
    'if not (public.is_krewe_officer() or public.has_tool(''send_invoices'')) then'
  ];
  v_news text[] := array[
    'if not public.kos_can_approve_dues_waivers() then',
    'if not public.kos_can_approve_dues_waivers() then',
    'if not public.kos_can_manage_invoices() then',
    'if not public.kos_can_manage_invoices() then',
    'if not public.kos_can_manage_invoices() then'
  ];
begin
  for v_i in 1 .. 5 loop
    v_sig := v_sigs[v_i];
    v_old := v_olds[v_i];
    v_new := v_news[v_i];
    if to_regprocedure(v_sig) is null then
      raise exception 'Guard patch: % is missing.', v_sig;
    end if;
    v_def := pg_get_functiondef(v_sig::regprocedure);
    if position(v_new in v_def) > 0 then
      continue;
    end if;
    if position(v_old in v_def) = 0 then
      raise exception 'Guard patch: expected guard is missing in %.', v_sig;
    end if;
    v_def := replace(v_def, v_old, v_new);
    execute v_def;
  end loop;
end
$patch_guards$;

-- Welcome letter. The live decision function already says the Krewe voted
-- the member in at a general meeting. Bylaws say final ratification is by
-- the Board of Directors. This replaces that one sentence. It does not
-- replace the rest of the function.
do $patch_welcome$
declare
  v_sig text := 'public._apply_membership_application_decision(uuid,text,text)';
  v_old text := 'Welcome. The Krewe voted you in at a general meeting, and you are on the roster.';
  v_new text := 'Welcome. Your membership is approved, subject to final ratification by the Board of Directors, and you are on the roster.';
  v_def text;
begin
  if to_regprocedure(v_sig) is null then
    raise exception 'Welcome copy patch: % is missing.', v_sig;
  end if;
  v_def := pg_get_functiondef(v_sig::regprocedure);
  if position(v_new in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'Welcome copy patch: expected sentence is missing in %.', v_sig;
  end if;
  execute replace(v_def, v_old, v_new);
end
$patch_welcome$;
