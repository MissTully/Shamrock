-- Krewe of Shamrock — dues foundation (Phase 1)
-- Companion: DUES_FOUNDATION.md (read it before running this).
--
-- APPLY IN THE SUPABASE SQL EDITOR. The website does not run this file.
-- Project: Krewe of Shamrock (oazwkwflgbthojvnclfc).
-- Safe to re-run. Re-running resets the four 2026 kos_dues_catalog rows
-- to the locked rates in this file. It does not call the exemption RPC
-- and does not mark anyone paid.
--
-- Run after these are already on the project (they are, as of 2026-09):
--   members, dues_payments
--   sql/kos_volunteer_dues_waiver.sql   ('waiver' payment method)
--   sql/kos_officer_email_and_invoices.sql (one row per member + year)
--   is_krewe_officer(), kos_current_member_id()
--
-- Does not replace kos_record_payment, the Zeffy webhook, v_outstanding_dues,
-- or v_parade_ready. Those still key off dues_payments.paid.
-- No card numbers. No secrets.

-- ---------------------------------------------------------------------------
-- 1) Roster level. New rows default to full. Existing blanks become full.
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists membership_level text;

alter table public.members
  alter column membership_level set default 'full';

update public.members
   set membership_level = 'full'
 where membership_level is null;

alter table public.members
  drop constraint if exists members_membership_level_check;
alter table public.members
  add constraint members_membership_level_check
  check (membership_level in ('full', 'associate', 'loa', 'auxiliary'));

alter table public.members
  alter column membership_level set not null;

comment on column public.members.membership_level is
  'Dues level: full, associate, loa, or auxiliary. Defaults to full. Officers change it with kos_set_membership_level.';

-- ---------------------------------------------------------------------------
-- 2) One dues row per member per year (already true on the live project).
-- ---------------------------------------------------------------------------
do $$
declare
  v_dup integer;
begin
  select count(*)::integer into v_dup
    from (
      select member_id, membership_year
        from public.dues_payments
       group by member_id, membership_year
      having count(*) > 1
    ) d;
  if v_dup > 0 then
    raise exception
      'dues_payments has % member/year duplicate group(s). Keep one row per member per year, then re-run sql/kos_dues_foundation.sql.',
      v_dup;
  end if;
end $$;

create unique index if not exists dues_payments_member_year_uidx
  on public.dues_payments (member_id, membership_year);

alter table public.dues_payments
  add column if not exists membership_level text,
  add column if not exists standard_amount numeric,
  add column if not exists waiver_kind text,
  add column if not exists waiver_status text,
  add column if not exists waiver_requested_by text,
  add column if not exists waiver_approved_by text,
  add column if not exists waiver_approved_at timestamptz,
  add column if not exists zeffy_campaign_key text;

alter table public.dues_payments
  drop constraint if exists dues_payments_membership_level_check;
alter table public.dues_payments
  add constraint dues_payments_membership_level_check
  check (membership_level is null
         or membership_level in ('full', 'associate', 'loa', 'auxiliary'));

alter table public.dues_payments
  drop constraint if exists dues_payments_waiver_kind_check;
alter table public.dues_payments
  add constraint dues_payments_waiver_kind_check
  check (waiver_kind is null
         or waiver_kind in ('elected_officer', 'service_in_lieu', 'board_approved_other'));

alter table public.dues_payments
  drop constraint if exists dues_payments_waiver_status_check;
alter table public.dues_payments
  add constraint dues_payments_waiver_status_check
  check (waiver_status is null
         or waiver_status in ('requested', 'approved', 'applied', 'denied'));

alter table public.dues_payments
  drop constraint if exists dues_payments_standard_amount_check;
alter table public.dues_payments
  add constraint dues_payments_standard_amount_check
  check (standard_amount is null or standard_amount >= 0);

comment on column public.dues_payments.membership_level is
  'Level this dues row was priced at. Nullable on old rows. Not the same column as members.membership_level.';
comment on column public.dues_payments.standard_amount is
  'Catalog rate at invoice or waiver time. Waived rows keep this (for example 375) while amount is 0.';
comment on column public.dues_payments.waiver_kind is
  'elected_officer, service_in_lieu, or board_approved_other. Null when this is not a waiver.';
comment on column public.dues_payments.waiver_status is
  'requested, approved, applied, or denied. applied means paid=true and payment_method=waiver.';
comment on column public.dues_payments.waiver_requested_by is
  'Officer email, or member id as text when the session has no email. Matches auth.email() / kos_current_member_id().';
comment on column public.dues_payments.waiver_approved_by is
  'Officer who approved or applied the waiver. Same text shape as waiver_requested_by.';
comment on column public.dues_payments.zeffy_campaign_key is
  'Zeffy campaign URL copied from kos_dues_catalog when the row was written. Null when that level has no campaign yet.';

-- Same payment methods as sql/kos_volunteer_dues_waiver.sql, including waiver.
alter table public.dues_payments
  drop constraint if exists dues_payments_payment_method_check;
alter table public.dues_payments
  add constraint dues_payments_payment_method_check
  check (payment_method is null
         or payment_method in ('cash','check','card','paypal','square','waiver','other'));

-- ---------------------------------------------------------------------------
-- 3) Fee catalog. Officers may read it. Writes stay in this migration.
-- ---------------------------------------------------------------------------
create table if not exists public.kos_dues_catalog (
  id uuid primary key default gen_random_uuid(),
  membership_year integer not null,
  level text not null,
  amount numeric not null,
  zeffy_url text,
  active boolean not null default true
);

alter table public.kos_dues_catalog
  drop constraint if exists kos_dues_catalog_level_check;
alter table public.kos_dues_catalog
  add constraint kos_dues_catalog_level_check
  check (level in ('full', 'associate', 'loa', 'auxiliary'));

alter table public.kos_dues_catalog
  drop constraint if exists kos_dues_catalog_amount_check;
alter table public.kos_dues_catalog
  add constraint kos_dues_catalog_amount_check
  check (amount >= 0);

create unique index if not exists kos_dues_catalog_year_level_uidx
  on public.kos_dues_catalog (membership_year, level);

alter table public.kos_dues_catalog
  add column if not exists explainer text;

comment on table public.kos_dues_catalog is
  'Dues rate card. One active amount, optional Zeffy URL, and optional explainer per year and level. 2026 rates are locked in sql/kos_dues_foundation.sql.';

comment on column public.kos_dues_catalog.explainer is
  'Short plain-language note for this level. The Move to background check email prints this before the pay link.';

-- Locked 2026 season rates and the live Zeffy campaigns.
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
  (2026, 'loa', 100,
    'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2',
    'Social membership for one year away from full participation. This is leave of absence status. You stay connected with the Krewe.',
    true),
  (2026, 'auxiliary', 200,
    'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-auxiliary-membership',
    'Non-voting membership for one major parade. This fee includes the background check and the membership portion.',
    true)
on conflict (membership_year, level) do update
  set amount    = excluded.amount,
      zeffy_url = excluded.zeffy_url,
      explainer = excluded.explainer,
      active    = excluded.active;

alter table public.kos_dues_catalog enable row level security;

drop policy if exists "Officers read dues catalog" on public.kos_dues_catalog;
create policy "Officers read dues catalog"
  on public.kos_dues_catalog for select to authenticated
  using (public.is_krewe_officer());

revoke all on table public.kos_dues_catalog from public, anon, authenticated;
grant select on table public.kos_dues_catalog to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Append-only dues event log. Clients cannot write it.
-- ---------------------------------------------------------------------------
create table if not exists public.kos_dues_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor text,
  member_id uuid references public.members(id) on delete set null,
  membership_year integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
    'officer_exemptions_batch'
  ));

create index if not exists kos_dues_events_created_at_idx
  on public.kos_dues_events (created_at desc);
create index if not exists kos_dues_events_member_year_idx
  on public.kos_dues_events (member_id, membership_year, created_at desc);

comment on table public.kos_dues_events is
  'Append-only dues audit. Officer RPCs insert. Update and delete are rejected.';

create or replace function public.kos_dues_events_append_only()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'kos_dues_events is append-only';
end;
$$;

drop trigger if exists kos_dues_events_no_update on public.kos_dues_events;
create trigger kos_dues_events_no_update
  before update or delete on public.kos_dues_events
  for each row
  execute function public.kos_dues_events_append_only();

alter table public.kos_dues_events enable row level security;

drop policy if exists "Officers read dues events" on public.kos_dues_events;
create policy "Officers read dues events"
  on public.kos_dues_events for select to authenticated
  using (public.is_krewe_officer());

revoke all on table public.kos_dues_events from public, anon, authenticated;
grant select on table public.kos_dues_events to authenticated;

revoke all on function public.kos_dues_events_append_only() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Helpers. Not a client API. The five kos_* RPCs below are the API.
-- ---------------------------------------------------------------------------
create or replace function public.kos_dues_actor()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    nullif(btrim(auth.email()), ''),
    nullif(public.kos_current_member_id()::text, ''),
    nullif(auth.uid()::text, '')
  );
$$;

create or replace function public.kos_is_elected_officer_title(p_title text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select exists (
    select 1
      from unnest(regexp_split_to_array(coalesce(p_title, ''), '\s*·\s*')) as seg(part)
     where btrim(part) ~* '^(president|vice president|secretary|treasurer)$'
  );
$$;

-- Locked card used only when a year/level has no active catalog row
-- (waivers and historical backfill). Invoices do not use this fallback.
create or replace function public.kos_dues_fallback_amount(p_level text)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select case lower(btrim(coalesce(p_level, 'full')))
    when 'associate' then 450
    when 'loa' then 100
    when 'auxiliary' then 200
    else 375
  end::numeric;
$$;

create or replace function public.kos_dues_quote(p_year integer, p_level text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'level', v.level,
    'amount', coalesce(c.amount, public.kos_dues_fallback_amount(v.level)),
    'zeffy_url', c.zeffy_url,
    'from_catalog', (c.id is not null)
  )
  from (
    select case
      when lower(btrim(coalesce(p_level, ''))) in ('full', 'associate', 'loa', 'auxiliary')
        then lower(btrim(p_level))
      else 'full'
    end as level
  ) v
  left join public.kos_dues_catalog c
    on c.membership_year = p_year
   and c.level = v.level
   and c.active
  limit 1;
$$;

create or replace function public.kos_log_dues_event(
  p_event_type text,
  p_member_id uuid,
  p_year integer,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  insert into public.kos_dues_events (event_type, actor, member_id, membership_year, payload)
  values (
    p_event_type,
    public.kos_dues_actor(),
    p_member_id,
    p_year,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.kos_dues_actor() from public, anon, authenticated;
revoke all on function public.kos_is_elected_officer_title(text) from public, anon, authenticated;
revoke all on function public.kos_dues_fallback_amount(text) from public, anon, authenticated;
revoke all on function public.kos_dues_quote(integer, text) from public, anon, authenticated;
revoke all on function public.kos_log_dues_event(text, uuid, integer, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Backfill old dues rows. Does not change amount, paid, or payment_method.
--    Level from the amount: 100 loa, 450 associate, 200 auxiliary,
--    and 0 / 375 / 325 / anything else → full (325 was the prior Full rate).
--    Standard amount: waived or paid-at-zero keeps the catalog (or level)
--    rate; every other row keeps the amount that was charged.
-- ---------------------------------------------------------------------------
update public.dues_payments
   set membership_level = case
     when amount = 100 then 'loa'
     when amount = 450 then 'associate'
     when amount = 200 then 'auxiliary'
     else 'full'
   end
 where membership_level is null;

update public.dues_payments d
   set standard_amount = case
     when d.payment_method = 'waiver' or (d.paid and d.amount = 0) then
       coalesce(
         (select c.amount
            from public.kos_dues_catalog c
           where c.membership_year = d.membership_year
             and c.level = d.membership_level
             and c.active
           limit 1),
         public.kos_dues_fallback_amount(d.membership_level)
       )
     else d.amount
   end
 where d.standard_amount is null;

-- ---------------------------------------------------------------------------
-- 7) kos_set_membership_level
-- ---------------------------------------------------------------------------
create or replace function public.kos_set_membership_level(
  p_member_id uuid,
  p_level text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_level text := lower(btrim(coalesce(p_level, '')));
  v_from text;
  v_name text;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Member is required.');
  end if;
  if v_level not in ('full', 'associate', 'loa', 'auxiliary') then
    return jsonb_build_object('ok', false, 'message', 'Level must be full, associate, loa, or auxiliary.');
  end if;

  select m.membership_level,
         nullif(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), '')
    into v_from, v_name
    from public.members m
   where m.id = p_member_id
     and m.merged_into is null;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Member was not found.');
  end if;

  if v_from = v_level then
    return jsonb_build_object(
      'ok', true,
      'member_id', p_member_id,
      'membership_level', v_level,
      'message', coalesce(v_name, 'Member') || ' is already ' || v_level || '.'
    );
  end if;

  update public.members
     set membership_level = v_level
   where id = p_member_id;

  perform public.kos_log_dues_event(
    'level_set',
    p_member_id,
    null,
    jsonb_build_object('from', v_from, 'to', v_level, 'name', v_name)
  );

  return jsonb_build_object(
    'ok', true,
    'member_id', p_member_id,
    'membership_level', v_level,
    'message', coalesce(v_name, 'Member') || ' is now ' || v_level || '. Open unpaid invoices stay as they are until you create invoices again.'
  );
end;
$$;

comment on function public.kos_set_membership_level(uuid, text) is
  'Officer-only. Sets members.membership_level and writes a level_set dues event.';

revoke all on function public.kos_set_membership_level(uuid, text) from public, anon;
grant execute on function public.kos_set_membership_level(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) kos_create_level_invoices
--    Upserts unpaid rows from the member's level and the catalog.
--    Skips paid rows, applied waivers, and (by default) elected officers.
-- ---------------------------------------------------------------------------
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
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Pick at least one member.');
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    return jsonb_build_object('ok', false, 'message', 'Membership year is required.');
  end if;

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
        v_id, p_year, v_amount, make_date(p_year, 6, 30), false,
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
             due_date = coalesce(due_date, make_date(p_year, 6, 30))
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
  'Officer-only. Upserts unpaid dues_payments from members.membership_level and kos_dues_catalog. Skips paid rows, applied waivers, and elected officers when p_exclude_elected_officers is true.';

revoke all on function public.kos_create_level_invoices(uuid[], integer, boolean) from public, anon;
grant execute on function public.kos_create_level_invoices(uuid[], integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) kos_request_dues_waiver — does not mark paid
-- ---------------------------------------------------------------------------
create or replace function public.kos_request_dues_waiver(
  p_member_id uuid,
  p_year integer,
  p_kind text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_reason text := nullif(btrim(p_reason), '');
  v_member record;
  v_dues public.dues_payments%rowtype;
  v_has_dues boolean;
  v_quote jsonb;
  v_level text;
  v_amount numeric;
  v_url text;
  v_line text;
  v_notes text;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_member_id is null or p_year is null or p_year < 2000 or p_year > 2100 then
    return jsonb_build_object('ok', false, 'message', 'Member and membership year are required.');
  end if;
  if v_kind not in ('elected_officer', 'service_in_lieu', 'board_approved_other') then
    return jsonb_build_object(
      'ok', false,
      'message', 'Waiver kind must be elected_officer, service_in_lieu, or board_approved_other.'
    );
  end if;

  select m.id, m.membership_level, m.first_name, m.last_name
    into v_member
    from public.members m
   where m.id = p_member_id
     and m.merged_into is null;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Member was not found.');
  end if;

  select * into v_dues
    from public.dues_payments
   where member_id = p_member_id
     and membership_year = p_year
   for update;
  v_has_dues := found;

  if v_has_dues and (v_dues.waiver_status = 'applied'
                or (v_dues.paid and v_dues.payment_method = 'waiver')) then
    return jsonb_build_object('ok', false, 'message', 'A waiver is already applied for this year.');
  end if;

  if v_has_dues and v_dues.paid and coalesce(v_dues.payment_method, '') <> 'waiver' then
    return jsonb_build_object('ok', false, 'message', 'This year is already paid. It was not changed.');
  end if;

  v_quote := public.kos_dues_quote(p_year, v_member.membership_level);
  v_line := 'Waiver requested (' || v_kind || ')'
    || case when v_reason is not null then ': ' || v_reason else '' end;
  if v_has_dues then
    v_level := coalesce(v_dues.membership_level, v_quote->>'level');
    v_amount := coalesce(v_dues.standard_amount, (v_quote->>'amount')::numeric);
    v_url := coalesce(nullif(btrim(v_dues.zeffy_campaign_key), ''), nullif(btrim(v_quote->>'zeffy_url'), ''));
    v_notes := v_dues.notes;
  else
    v_level := v_quote->>'level';
    v_amount := (v_quote->>'amount')::numeric;
    v_url := nullif(btrim(v_quote->>'zeffy_url'), '');
    v_notes := null;
  end if;
  if v_line is not null
     and right(coalesce(v_notes, ''), char_length(v_line)) is distinct from v_line then
    v_notes := concat_ws(E'\n', nullif(v_notes, ''), v_line);
  end if;

  if not v_has_dues then
    insert into public.dues_payments (
      member_id, membership_year, amount, due_date, paid,
      membership_level, standard_amount, zeffy_campaign_key, notes,
      waiver_kind, waiver_status, waiver_requested_by
    ) values (
      p_member_id,
      p_year,
      coalesce((v_quote->>'amount')::numeric, v_amount),
      make_date(p_year, 6, 30),
      false,
      v_quote->>'level',
      coalesce((v_quote->>'amount')::numeric, v_amount),
      nullif(btrim(v_quote->>'zeffy_url'), ''),
      v_line,
      v_kind,
      'requested',
      public.kos_dues_actor()
    )
    returning * into v_dues;
  else
    update public.dues_payments
       set membership_level = coalesce(membership_level, v_level),
           standard_amount = coalesce(standard_amount, v_amount),
           zeffy_campaign_key = coalesce(zeffy_campaign_key, v_url),
           notes = v_notes,
           waiver_kind = v_kind,
           waiver_status = 'requested',
           waiver_requested_by = public.kos_dues_actor()
     where id = v_dues.id
    returning * into v_dues;
  end if;

  perform public.kos_log_dues_event(
    'waiver_requested',
    p_member_id,
    p_year,
    jsonb_build_object(
      'dues_payment_id', v_dues.id,
      'waiver_kind', v_kind,
      'reason', v_reason,
      'amount', v_dues.amount,
      'paid', v_dues.paid
    )
  );

  return jsonb_build_object(
    'ok', true,
    'dues_payment_id', v_dues.id,
    'waiver_status', 'requested',
    'waiver_kind', v_kind,
    'paid', false,
    'message', 'Waiver requested. The member is not marked paid.'
  );
end;
$$;

comment on function public.kos_request_dues_waiver(uuid, integer, text, text) is
  'Officer-only. Sets waiver_status=requested. Does not mark the dues row paid.';

revoke all on function public.kos_request_dues_waiver(uuid, integer, text, text) from public, anon;
grant execute on function public.kos_request_dues_waiver(uuid, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) kos_decide_dues_waiver
--     Approve can also apply: amount 0, paid, method waiver, status applied.
--     Deny never marks paid and never unwinds an applied waiver.
-- ---------------------------------------------------------------------------
create or replace function public.kos_decide_dues_waiver(
  p_member_id uuid,
  p_year integer,
  p_approve boolean,
  p_apply boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_apply boolean := coalesce(p_apply, true);
  v_dues public.dues_payments%rowtype;
  v_level text;
  v_quote jsonb;
  v_std numeric;
  v_url text;
  v_line text;
  v_notes text;
  v_event text;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_member_id is null or p_year is null or p_year < 2000 or p_year > 2100 then
    return jsonb_build_object('ok', false, 'message', 'Member and membership year are required.');
  end if;
  if p_approve is null then
    return jsonb_build_object('ok', false, 'message', 'Say whether to approve or deny the waiver.');
  end if;

  select * into v_dues
    from public.dues_payments
   where member_id = p_member_id
     and membership_year = p_year
   for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'No dues row for that member and year. Request a waiver or create an invoice first.'
    );
  end if;

  if not p_approve then
    if v_dues.waiver_status = 'applied'
       or (v_dues.paid and v_dues.payment_method = 'waiver') then
      return jsonb_build_object('ok', false, 'message', 'This waiver is already applied. It was not changed.');
    end if;
    if v_dues.paid and coalesce(v_dues.payment_method, '') <> 'waiver' then
      return jsonb_build_object('ok', false, 'message', 'This year is already paid. It was not changed.');
    end if;
    if v_dues.waiver_status = 'denied' then
      return jsonb_build_object('ok', true, 'waiver_status', 'denied', 'message', 'Waiver was already denied.');
    end if;

    update public.dues_payments
       set waiver_status = 'denied'
     where id = v_dues.id;

    perform public.kos_log_dues_event(
      'waiver_denied',
      p_member_id,
      p_year,
      jsonb_build_object('dues_payment_id', v_dues.id, 'waiver_kind', v_dues.waiver_kind)
    );

    return jsonb_build_object(
      'ok', true,
      'waiver_status', 'denied',
      'paid', v_dues.paid,
      'message', 'Waiver denied. The member was not marked paid.'
    );
  end if;

  if v_dues.paid and coalesce(v_dues.payment_method, '') <> 'waiver' and coalesce(v_dues.amount, 0) > 0 then
    return jsonb_build_object('ok', false, 'message', 'This year is already paid in money. It was not changed.');
  end if;

  if v_dues.waiver_status = 'applied' and v_apply then
    return jsonb_build_object('ok', true, 'waiver_status', 'applied', 'message', 'Waiver is already applied.');
  end if;

  if v_dues.waiver_status = 'approved' and not v_apply then
    return jsonb_build_object(
      'ok', true,
      'waiver_status', 'approved',
      'message', 'Waiver is already approved and has not been applied.'
    );
  end if;

  select coalesce(v_dues.membership_level, m.membership_level, 'full')
    into v_level
    from public.members m
   where m.id = p_member_id;

  v_level := coalesce(v_level, v_dues.membership_level, 'full');
  v_quote := public.kos_dues_quote(p_year, v_level);
  v_level := v_quote->>'level';
  v_std := (v_quote->>'amount')::numeric;
  v_url := coalesce(nullif(btrim(v_dues.zeffy_campaign_key), ''), nullif(btrim(v_quote->>'zeffy_url'), ''));

  if v_apply then
    v_line := 'Waiver applied (' || coalesce(v_dues.waiver_kind, 'unspecified') || '). Amount due and collected: $0.00.';
    v_notes := v_dues.notes;
    if right(coalesce(v_notes, ''), char_length(v_line)) is distinct from v_line then
      v_notes := concat_ws(E'\n', nullif(v_notes, ''), v_line);
    end if;

    update public.dues_payments
       set amount = 0,
           paid = true,
           paid_date = coalesce(paid_date, current_date),
           payment_method = 'waiver',
           membership_level = v_level,
           standard_amount = v_std,
           zeffy_campaign_key = v_url,
           waiver_status = 'applied',
           waiver_approved_by = public.kos_dues_actor(),
           waiver_approved_at = now(),
           notes = v_notes
     where id = v_dues.id
    returning * into v_dues;
    v_event := 'waiver_applied';
  else
    update public.dues_payments
       set membership_level = coalesce(membership_level, v_level),
           standard_amount = coalesce(standard_amount, v_std),
           zeffy_campaign_key = coalesce(zeffy_campaign_key, v_url),
           waiver_status = 'approved',
           waiver_approved_by = public.kos_dues_actor(),
           waiver_approved_at = now()
     where id = v_dues.id
    returning * into v_dues;
    v_event := 'waiver_approved';
  end if;

  perform public.kos_log_dues_event(
    v_event,
    p_member_id,
    p_year,
    jsonb_build_object(
      'dues_payment_id', v_dues.id,
      'waiver_kind', v_dues.waiver_kind,
      'waiver_status', v_dues.waiver_status,
      'amount', v_dues.amount,
      'standard_amount', v_dues.standard_amount,
      'paid', v_dues.paid,
      'payment_method', v_dues.payment_method
    )
  );

  return jsonb_build_object(
    'ok', true,
    'dues_payment_id', v_dues.id,
    'waiver_status', v_dues.waiver_status,
    'amount', v_dues.amount,
    'standard_amount', v_dues.standard_amount,
    'paid', v_dues.paid,
    'payment_method', v_dues.payment_method,
    'message', case
      when v_dues.waiver_status = 'applied' then
        'Waiver applied. Amount due is $0.00. Standard amount kept for the books: $'
        || trim(to_char(v_dues.standard_amount, 'FM999990.00')) || '.'
      else
        'Waiver approved. It is not applied yet, so the member is not marked paid.'
    end
  );
end;
$$;

comment on function public.kos_decide_dues_waiver(uuid, integer, boolean, boolean) is
  'Officer-only. Approve sets waiver_status=approved. With p_apply, marks amount 0, paid, method waiver, status applied. Deny sets denied and does not mark paid.';

revoke all on function public.kos_decide_dues_waiver(uuid, integer, boolean, boolean) from public, anon;
grant execute on function public.kos_decide_dues_waiver(uuid, integer, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 11) kos_apply_elected_officer_exemptions
--     President, Vice President, Secretary, Treasurer (title segment match).
--     Board members and committee chairs are not elected officers here.
--     Does not overwrite a real money payment or a different applied waiver.
-- ---------------------------------------------------------------------------
create or replace function public.kos_apply_elected_officer_exemptions(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_dues public.dues_payments%rowtype;
  v_has_dues boolean;
  v_quote jsonb;
  v_level text;
  v_std numeric;
  v_url text;
  v_line text;
  v_notes text;
  v_applied integer := 0;
  v_skipped_paid integer := 0;
  v_skipped_other integer := 0;
  v_ids uuid[] := '{}';
  v_actor text := public.kos_dues_actor();
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    return jsonb_build_object('ok', false, 'message', 'Membership year is required.');
  end if;

  for r in
    select m.id, m.membership_level, m.officer_title, m.first_name, m.last_name
      from public.members m
     where m.merged_into is null
       and public.kos_is_elected_officer_title(m.officer_title)
     order by m.last_name, m.first_name
  loop
    select * into v_dues
      from public.dues_payments
     where member_id = r.id
       and membership_year = p_year
     for update;
    v_has_dues := found;

    if v_has_dues
       and v_dues.paid
       and coalesce(v_dues.payment_method, '') <> 'waiver'
       and coalesce(v_dues.amount, 0) > 0 then
      v_skipped_paid := v_skipped_paid + 1;
      continue;
    end if;

    if v_has_dues
       and v_dues.waiver_status = 'applied'
       and v_dues.waiver_kind is not null
       and v_dues.waiver_kind <> 'elected_officer' then
      v_skipped_other := v_skipped_other + 1;
      continue;
    end if;

    v_quote := public.kos_dues_quote(p_year, coalesce(r.membership_level, 'full'));
    v_level := v_quote->>'level';
    v_std := (v_quote->>'amount')::numeric;
    v_url := nullif(btrim(v_quote->>'zeffy_url'), '');
    v_line := 'Elected officer dues exemption (' || p_year::text || '). Amount due and collected: $0.00.';
    if v_has_dues then
      v_notes := v_dues.notes;
    else
      v_notes := null;
    end if;
    if right(coalesce(v_notes, ''), char_length(v_line)) is distinct from v_line then
      v_notes := concat_ws(E'\n', nullif(v_notes, ''), v_line);
    end if;

    if not v_has_dues then
      insert into public.dues_payments (
        member_id, membership_year, amount, due_date, paid, paid_date, payment_method,
        membership_level, standard_amount, zeffy_campaign_key, notes,
        waiver_kind, waiver_status, waiver_requested_by, waiver_approved_by, waiver_approved_at
      ) values (
        r.id, p_year, 0, make_date(p_year, 6, 30), true, current_date, 'waiver',
        v_level, v_std, v_url, v_line,
        'elected_officer', 'applied', v_actor, v_actor, now()
      )
      returning * into v_dues;
    else
      update public.dues_payments
         set amount = 0,
             paid = true,
             paid_date = coalesce(paid_date, current_date),
             payment_method = 'waiver',
             membership_level = v_level,
             standard_amount = v_std,
             zeffy_campaign_key = coalesce(v_url, zeffy_campaign_key),
             notes = v_notes,
             waiver_kind = 'elected_officer',
             waiver_status = 'applied',
             waiver_requested_by = coalesce(waiver_requested_by, v_actor),
             waiver_approved_by = coalesce(waiver_approved_by, v_actor),
             waiver_approved_at = coalesce(waiver_approved_at, now())
       where id = v_dues.id
      returning * into v_dues;
    end if;

    v_applied := v_applied + 1;
    v_ids := array_append(v_ids, r.id);
  end loop;

  perform public.kos_log_dues_event(
    'officer_exemptions_batch',
    null,
    p_year,
    jsonb_build_object(
      'applied', v_applied,
      'skipped_paid_cash', v_skipped_paid,
      'skipped_other_waiver', v_skipped_other,
      'member_ids', to_jsonb(v_ids)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'year', p_year,
    'applied', v_applied,
    'skipped_paid_cash', v_skipped_paid,
    'skipped_other_waiver', v_skipped_other,
    'member_ids', to_jsonb(v_ids),
    'message', 'Applied elected-officer exemptions for ' || v_applied::text
      || ' member(s). Skipped ' || v_skipped_paid::text
      || ' already paid in money and ' || v_skipped_other::text
      || ' covered by another waiver.'
  );
end;
$$;

comment on function public.kos_apply_elected_officer_exemptions(integer) is
  'Officer-only. Upserts applied elected_officer waivers for President, Vice President, Secretary, and Treasurer. Does not overwrite money payments or a different applied waiver.';

revoke all on function public.kos_apply_elected_officer_exemptions(integer) from public, anon;
grant execute on function public.kos_apply_elected_officer_exemptions(integer) to authenticated;
