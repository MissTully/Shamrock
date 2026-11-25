-- NOT APPLIED. Do not run this from the website, a webhook, or a deploy.
-- Paste it into the Supabase SQL editor on oazwkwflgbthojvnclfc only after
-- you have run the preview below and read the result.
--
-- Eight Zeffy payments never reached the Hub after Zeffy stopped calling
-- the webhook on 2026-11-11 4:27 PM ET. This script inserts those ledger
-- rows and applies the follow-on effects. It also links Tim Fitzpatrick's
-- existing 2026-10-29 $150 locker payment to his RS1 renewal when
-- payment_id is null.
--
-- Idempotent. payments.provider_event_id uses
-- zeffy-backfill:<date>:<payer>:<amount>
-- and ON CONFLICT DO NOTHING. A second run does not insert again and does
-- not send email. It does not change membership_status.
--
-- Names are matched on public.members (merged_into is null). A trailing
-- Jr, Sr, II, III, or IV is ignored. First name must equal the roster
-- first name, or one must be a prefix of the other. A nickname that is
-- not a prefix (Gerry versus Gerald, Tricia versus Patricia, Chuck versus
-- Charles) stops the script. The preview lists roster first names.
--
-- payments_product_kind_check is read at run time. Locker rows use locker
-- when that check allows it, otherwise other. Donation is a listed kind
-- in sql/kos_membership_pipeline_dashboard.sql. If the live check does not
-- allow donation, the $100 row is filed as other and the description says so.
--
-- Locker rows do not call kos_claim_locker_from_payment. That function
-- assigns the next available locker. These people stay on the waiting
-- list: status queued, locker_id null, paid_at set, payment_id set.
-- That is the paid_waiting outcome, without the assign branch.
--
-- Charles Bauder's $375 membership row is ledger only. membership_year is
-- null. His 2026 dues (Wild Apricot, July 13) are not updated. The script
-- rolls back if that dues row changes.
--
-- Patrick Pustay Jr is a $1 shop test. product_kind store, ledger only.
-- The shop email trigger is disabled for that one insert so it does not
-- mail a receipt. The line item name is "shop test pencil" so stock is
-- not decremented. November 2026 is Eastern Standard Time (UTC-5).
-- 2026-09-06 is Eastern Daylight Time (UTC-4).
--
-- The two Gerry Logan payments share a date and an amount, so those ids
-- include the ET time.

-- ---------------------------------------------------------------------------
-- PREVIEW. Run this block by itself. Do not run the writes below until the
-- member column is filled for every planned row and the Bauder and
-- Fitzpatrick checks look right.
-- ---------------------------------------------------------------------------
/*
with planned (
  sort_key, provider_event_id, payer_name, member_name, amount_cents, occurred_at, kind_intent, effect
) as (
  values
    (1, 'zeffy-backfill:2026-11-11:charles-powers:37500', 'Charles Powers', 'Tricia Powers', 37500,
      timestamptz '2026-11-11 16:28:00-05', 'dues',
      'Insert dues row. Create or mark Tricia Powers 2026 dues paid.'),
    (2, 'zeffy-backfill:2026-11-11:charles-powers:10000', 'Charles Powers', 'Chuck Powers', 10000,
      timestamptz '2026-11-11 16:28:00-05', 'donation',
      'Insert donation row for the other $100 of the same $475 payment. No dues change.'),
    (3, 'zeffy-backfill:2026-11-11:robyn-thornburg:7500', 'Robyn Thornburg', 'Robyn Thornburg', 7500,
      timestamptz '2026-11-11 19:10:00-05', 'locker',
      'Insert ledger row. Paid small reservation, waiting list, no locker number.'),
    (4, 'zeffy-backfill:2026-11-12T07:53:gerry-logan:37500', 'Gerry Logan', 'Denise Logan', 37500,
      timestamptz '2026-11-12 07:53:00-05', 'dues',
      'Insert dues row. Create or mark Denise Logan 2026 dues paid.'),
    (5, 'zeffy-backfill:2026-11-12T07:57:gerry-logan:37500', 'Gerry Logan', 'Gerry Logan', 37500,
      timestamptz '2026-11-12 07:57:00-05', 'dues',
      'Insert dues row. Create or mark Gerry Logan 2026 dues paid.'),
    (6, 'zeffy-backfill:2026-11-15:tim-dyn:20000', 'Tim Dyn', 'Tim Dyn', 20000,
      timestamptz '2026-11-15 11:54:00-05', 'locker',
      'Insert ledger row. Paid large reservation, waiting list, no locker number.'),
    (7, 'zeffy-backfill:2026-11-16:charles-bauder:20000', 'Charles Bauder', 'Charles Bauder', 20000,
      timestamptz '2026-11-16 15:44:00-05', 'locker',
      'Insert ledger row. Update his queued small unpaid reservation to large and paid. No locker number.'),
    (8, 'zeffy-backfill:2026-11-17:charles-bauder:37500', 'Charles Bauder', 'Charles Bauder', 37500,
      timestamptz '2026-11-17 15:13:00-05', 'dues',
      'Insert ledger row only. membership_year null. Purpose to confirm. Do not touch 2026 dues.'),
    (9, 'zeffy-backfill:2026-09-06:patrick-pustay:100', 'Patrick Pustay Jr', 'Patrick Pustay Jr', 100,
      timestamptz '2026-09-06 13:42:00-04', 'store',
      'Insert store ledger row only. No dues, no locker, no shop email.'),
    (10, null, 'Tim Fitzpatrick', 'Tim Fitzpatrick', 15000,
      timestamptz '2026-10-29 12:00:00-05', 'locker',
      'No new payment. Set RS1 renewal payment_id when it is null.')
),
cleaned as (
  select p.*,
    btrim(regexp_replace(p.member_name, '\s+(jr\.?|sr\.?|ii|iii|iv)$', '', 'i')) as cleaned_name
  from planned p
),
parts as (
  select c.*,
    split_part(c.cleaned_name, ' ', 1) as want_first,
    regexp_replace(c.cleaned_name, '^.*\s+', '') as want_last
  from cleaned c
),
matched as (
  select pa.sort_key, m.id as member_id, m.first_name, m.last_name, m.membership_status
  from parts pa
  join public.members m
    on m.merged_into is null
   and lower(btrim(m.last_name)) = lower(pa.want_last)
   and (
     lower(btrim(m.first_name)) = lower(pa.want_first)
     or lower(btrim(m.first_name)) like lower(pa.want_first) || '%'
     or lower(pa.want_first) like lower(btrim(m.first_name)) || '%'
   )
)
select pa.sort_key,
       pa.provider_event_id,
       pa.payer_name,
       pa.member_name,
       pa.amount_cents,
       pa.occurred_at at time zone 'America/New_York' as occurred_et,
       pa.kind_intent,
       pa.effect,
       (select count(*) from matched m where m.sort_key = pa.sort_key) as member_matches,
       (select string_agg(m.first_name || ' ' || m.last_name, ', ' order by m.first_name)
          from matched m where m.sort_key = pa.sort_key) as matched_member,
       exists (
         select 1 from public.payments pay
          where pay.provider_event_id = pa.provider_event_id
       ) as payment_already_present
from parts pa
order by pa.sort_key;

-- Roster people who share those last names, so a missed nickname is visible.
select m.first_name, m.last_name, m.membership_status
from public.members m
where m.merged_into is null
  and lower(btrim(m.last_name)) in ('powers', 'thornburg', 'logan', 'dyn', 'bauder', 'pustay', 'fitzpatrick')
order by m.last_name, m.first_name;

-- Live product_kind check. locker is used only when this text lists it.
select pg_get_constraintdef(c.oid) as product_kind_check
from pg_constraint c
join pg_class rel on rel.oid = c.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'payments'
  and c.contype = 'c'
  and pg_get_constraintdef(c.oid) ilike '%product_kind%';

-- 2026 dues that this script may mark, plus Charles Bauder, which it must not mark.
select m.first_name, m.last_name, d.paid, d.paid_date, d.amount, d.payment_method, d.waiver_status, d.membership_year
from public.members m
left join public.dues_payments d
  on d.member_id = m.id and d.membership_year = 2026
where m.merged_into is null
  and lower(btrim(m.last_name)) in ('powers', 'logan', 'bauder')
order by m.last_name, m.first_name;

-- Open locker reservations for the locker payers.
select m.first_name, m.last_name, r.size, r.status, r.locker_id, r.paid_at, r.payment_id, r.is_renewal, r.created_at
from public.locker_reservations r
join public.members m on m.id = r.member_id
where m.merged_into is null
  and r.status <> 'cancelled'
  and (
    (lower(btrim(m.last_name)) = 'thornburg' and lower(btrim(m.first_name)) like 'robyn%')
    or (lower(btrim(m.last_name)) = 'dyn' and lower(btrim(m.first_name)) like 'tim%')
    or (lower(btrim(m.last_name)) = 'bauder' and lower(btrim(m.first_name)) like 'charles%')
    or (lower(btrim(m.last_name)) = 'fitzpatrick' and lower(btrim(m.first_name)) like 'tim%')
  )
order by m.last_name, r.created_at;

-- Tim Fitzpatrick: existing $150 payment and the RS1 renewal.
select p.id, p.amount_cents, p.created_at at time zone 'America/New_York' as created_et,
       p.product_kind, p.description, p.payer_name
from public.payments p
left join public.members m on m.id = p.member_id
where p.provider = 'zeffy'
  and p.amount_cents = 15000
  and (p.created_at at time zone 'America/New_York')::date between date '2026-10-28' and date '2026-10-30'
  and (
    (m.last_name ilike 'fitzpatrick' and m.first_name ilike 'tim%')
    or p.payer_name ilike '%fitzpatrick%'
  )
order by p.created_at;

select l.locker_number, r.id, r.is_renewal, r.status, r.payment_id, r.paid_at, r.size
from public.locker_reservations r
join public.lockers l on l.id = r.locker_id
join public.members m on m.id = r.member_id
where upper(btrim(l.locker_number)) = 'RS1'
  and m.merged_into is null
  and lower(btrim(m.last_name)) = 'fitzpatrick'
  and lower(btrim(m.first_name)) like 'tim%';
*/

begin;

create or replace function pg_temp.kos_bf_member(p_name text)
returns uuid
language plpgsql
as $mem$
declare
  v_clean text;
  v_first text;
  v_last text;
  v_count integer;
  v_id uuid;
  v_candidates text;
begin
  v_clean := btrim(regexp_replace(btrim(coalesce(p_name, '')), '\s+(jr\.?|sr\.?|ii|iii|iv)$', '', 'i'));
  if v_clean = '' or position(' ' in v_clean) = 0 then
    raise exception 'Need a first and last name, got %', coalesce(p_name, '(blank)');
  end if;
  v_first := split_part(v_clean, ' ', 1);
  v_last := regexp_replace(v_clean, '^.*\s+', '');
  select count(*)::integer
    into v_count
  from public.members m
  where m.merged_into is null
    and lower(btrim(m.last_name)) = lower(v_last)
    and (
      lower(btrim(m.first_name)) = lower(v_first)
      or lower(btrim(m.first_name)) like lower(v_first) || '%'
      or lower(v_first) like lower(btrim(m.first_name)) || '%'
    );
  if v_count <> 1 then
    select string_agg(m.first_name || ' ' || m.last_name, ', ' order by m.first_name)
      into v_candidates
    from public.members m
    where m.merged_into is null
      and lower(btrim(m.last_name)) = lower(v_last);
    raise exception 'Expected 1 member for %, found %. Roster last name %: %',
      p_name, v_count, v_last, coalesce(v_candidates, '(none)');
  end if;
  select m.id
    into v_id
  from public.members m
  where m.merged_into is null
    and lower(btrim(m.last_name)) = lower(v_last)
    and (
      lower(btrim(m.first_name)) = lower(v_first)
      or lower(btrim(m.first_name)) like lower(v_first) || '%'
      or lower(v_first) like lower(btrim(m.first_name)) || '%'
    )
  order by case when lower(btrim(m.first_name)) = lower(v_first) then 0 else 1 end, m.created_at
  limit 1;
  return v_id;
end;
$mem$;

create or replace function pg_temp.kos_bf_insert_payment(
  p_event text,
  p_amount integer,
  p_at timestamptz,
  p_payer text,
  p_email text,
  p_member uuid,
  p_kind text,
  p_year integer,
  p_description text,
  p_campaign text,
  p_raw jsonb,
  p_quiet_shop boolean
) returns uuid
language plpgsql
as $ins$
declare
  v_id uuid;
  v_quiet boolean := false;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if p_quiet_shop and exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'payments'
      and t.tgname = 'kos_payments_shop_order_emails'
      and not t.tgisinternal
  ) then
    v_quiet := true;
    execute 'alter table public.payments disable trigger kos_payments_shop_order_emails';
  end if;

  begin
    insert into public.payments (
      provider, provider_event_id, provider_payment_id, amount_cents, currency,
      status, payer_email, payer_name, description, product_kind, member_id,
      event_id, membership_year, raw, created_at
    ) values (
      'zeffy', p_event, p_event, p_amount, 'usd',
      'succeeded', v_email, p_payer, p_description, p_kind, p_member,
      null, p_year,
      coalesce(p_raw, '{}'::jsonb) || jsonb_build_object(
        'backfill', true,
        'source', 'kos_zeffy_backfill_missed_nov2026',
        'campaign', p_campaign,
        'occurred_at', to_char(p_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI ET')
      ),
      p_at
    )
    on conflict (provider_event_id) do nothing
    returning id into v_id;

    if v_quiet then
      execute 'alter table public.payments enable trigger kos_payments_shop_order_emails';
      v_quiet := false;
    end if;
  exception when others then
    if v_quiet then
      execute 'alter table public.payments enable trigger kos_payments_shop_order_emails';
    end if;
    raise;
  end;

  if v_id is null then
    select p.id into v_id
    from public.payments p
    where p.provider_event_id = p_event;
    if v_id is null then
      raise exception 'Payment % was not inserted and was not already present.', p_event;
    end if;
    raise notice 'Payment % already present (%).', p_event, v_id;
  else
    raise notice 'Inserted payment % (%).', p_event, v_id;
  end if;
  return v_id;
end;
$ins$;

create or replace function pg_temp.kos_bf_mark_dues(
  p_member uuid,
  p_payment uuid,
  p_at timestamptz,
  p_dollars numeric,
  p_event text
) returns void
language plpgsql
as $dues$
declare
  v_status text;
  v_level text;
  v_label text;
  v_quote jsonb;
  v_std numeric;
  v_url text;
  v_dues_id uuid;
  v_paid boolean;
  v_waiver text;
  v_method text;
  v_paid_date date;
  v_action text;
begin
  select m.membership_status, m.membership_level,
         btrim(m.first_name || ' ' || m.last_name)
    into v_status, v_level, v_label
  from public.members m
  where m.id = p_member
    and m.merged_into is null;
  if not found then
    raise exception 'Dues member % is missing.', p_member;
  end if;
  v_level := coalesce(nullif(btrim(v_level), ''), 'full');
  v_paid_date := (p_at at time zone 'America/New_York')::date;
  v_quote := public.kos_dues_quote(2026, v_level);
  v_level := coalesce(nullif(v_quote->>'level', ''), v_level);
  v_std := coalesce((v_quote->>'amount')::numeric, p_dollars);
  v_url := nullif(btrim(coalesce(v_quote->>'zeffy_url', '')), '');

  select d.id, d.paid, d.waiver_status, d.payment_method
    into v_dues_id, v_paid, v_waiver, v_method
  from public.dues_payments d
  where d.member_id = p_member
    and d.membership_year = 2026
  for update;

  if found and (coalesce(v_waiver, '') = 'applied' or coalesce(v_method, '') = 'waiver') then
    raise exception '% 2026 dues is a waiver. Not changed.', v_label;
  end if;
  if found and coalesce(v_paid, false) then
    raise notice '% 2026 dues already paid. Left as-is.', v_label;
    return;
  end if;

  v_action := null;
  if v_dues_id is not null then
    update public.dues_payments
       set paid = true,
           paid_date = v_paid_date,
           payment_method = 'card',
           amount = case when coalesce(amount, 0) = 0 then p_dollars else amount end,
           notes = case
             when coalesce(notes, '') ilike '%Zeffy backfill November 2026%' then notes
             else concat_ws(' ', notes, 'Marked paid from the Zeffy backfill November 2026.')
           end
     where id = v_dues_id
       and paid = false
       and coalesce(waiver_status, '') <> 'applied'
    returning id into v_dues_id;
    if v_dues_id is not null then
      v_action := 'marked_paid';
    end if;
  else
    if lower(coalesce(v_status, '')) not in ('active', 'lapsed', 'pending-renewal') then
      raise exception '% has no 2026 dues row and membership_status is %. Not created.',
        v_label, coalesce(v_status, '(blank)');
    end if;
    begin
      insert into public.dues_payments (
        member_id, membership_year, amount, due_date, paid, paid_date, payment_method,
        membership_level, standard_amount, zeffy_campaign_key, notes
      ) values (
        p_member, 2026, p_dollars, v_paid_date, true, v_paid_date, 'card',
        v_level, v_std, v_url,
        'Paid via Zeffy. No open dues invoice was on file. Zeffy backfill November 2026.'
      )
      returning id into v_dues_id;
      v_action := 'created_paid';
    exception when unique_violation then
      update public.dues_payments
         set paid = true,
             paid_date = v_paid_date,
             payment_method = 'card'
       where member_id = p_member
         and membership_year = 2026
         and paid = false
         and coalesce(waiver_status, '') <> 'applied'
      returning id into v_dues_id;
      if v_dues_id is not null then
        v_action := 'marked_paid';
      end if;
    end;
  end if;

  if v_action is null or v_dues_id is null then
    raise notice '% 2026 dues was not changed.', v_label;
    return;
  end if;

  insert into public.kos_dues_events (event_type, actor, member_id, membership_year, payload)
  select 'payment_recorded', 'zeffy-backfill', p_member, 2026,
         jsonb_build_object(
           'provider', 'zeffy',
           'provider_event_id', p_event,
           'payment_id', p_payment,
           'dues_payment_id', v_dues_id,
           'action', v_action,
           'amount', p_dollars,
           'backfill', true
         )
  where not exists (
    select 1
    from public.kos_dues_events e
    where e.event_type = 'payment_recorded'
      and e.member_id = p_member
      and e.membership_year = 2026
      and e.payload->>'provider_event_id' = p_event
  );
  raise notice '% 2026 dues %.', v_label, v_action;
end;
$dues$;

-- Paid waiting list. Does not assign a locker number.
create or replace function pg_temp.kos_bf_paid_waiting(
  p_member uuid,
  p_email text,
  p_name text,
  p_size text,
  p_payment uuid,
  p_at timestamptz,
  p_note text
) returns uuid
language plpgsql
as $lock$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_count integer;
  v_id uuid;
  v_locker uuid;
begin
  select r.id
    into v_id
  from public.locker_reservations r
  where r.payment_id = p_payment
    and r.member_id = p_member
    and r.size = p_size
    and r.locker_id is null
  limit 1;
  if v_id is not null then
    raise notice 'Locker reservation % already linked to this payment.', v_id;
    return v_id;
  end if;

  select count(*)::integer
    into v_count
  from public.locker_reservations r
  where r.status in ('queued', 'assigned')
    and r.size = p_size
    and r.payment_id is null
    and (
      r.member_id = p_member
      or (v_email is not null and lower(btrim(coalesce(r.requester_email, ''))) = v_email)
    );
  if v_count > 1 then
    raise exception '% has % open % locker reservations. Not changed.', p_name, v_count, p_size;
  end if;

  if v_count = 1 then
    select r.id, r.locker_id
      into v_id, v_locker
    from public.locker_reservations r
    where r.status in ('queued', 'assigned')
      and r.size = p_size
      and r.payment_id is null
      and (
        r.member_id = p_member
        or (v_email is not null and lower(btrim(coalesce(r.requester_email, ''))) = v_email)
      )
    for update;
    if v_locker is not null then
      raise exception '% already has a % locker number on an open reservation. Not changed.', p_name, p_size;
    end if;
    update public.locker_reservations
       set paid_at = coalesce(paid_at, p_at),
           payment_id = p_payment,
           status = 'queued',
           member_id = coalesce(member_id, p_member),
           requester_name = coalesce(nullif(btrim(requester_name), ''), p_name),
           requester_email = coalesce(requester_email, v_email),
           notes = case
             when coalesce(notes, '') ilike '%Zeffy backfill November 2026%' then notes
             else concat_ws(E'\n', nullif(notes, ''), p_note)
           end,
           updated_at = now()
     where id = v_id
       and locker_id is null
       and payment_id is null;
    raise notice 'Marked % % reservation % paid and waiting.', p_name, p_size, v_id;
    return v_id;
  end if;

  insert into public.locker_reservations (
    member_id, requester_name, requester_email, size, notes, status,
    locker_id, paid_at, payment_id, is_renewal, created_at, updated_at
  ) values (
    p_member, p_name, v_email, p_size, p_note,
    'queued', null, p_at, p_payment, false, p_at, now()
  )
  returning id into v_id;
  raise notice 'Created paid waiting % reservation % for %.', p_size, v_id, p_name;
  return v_id;
end;
$lock$;

create or replace function pg_temp.kos_bf_link_fitz(p_member uuid)
returns uuid
language plpgsql
as $fitz$
declare
  v_ids uuid[];
  v_locker_ids uuid[];
  v_pay uuid;
  v_pay_at timestamptz;
  v_count integer;
  v_res uuid;
  v_existing uuid;
  v_near text;
begin
  select coalesce(array_agg(p.id order by p.created_at), '{}'::uuid[])
    into v_ids
  from public.payments p
  where p.provider = 'zeffy'
    and p.amount_cents = 15000
    and (p.created_at at time zone 'America/New_York')::date = date '2026-10-29'
    and (
      p.member_id = p_member
      or p.payer_name ilike '%fitzpatrick%'
    );

  if coalesce(array_length(v_ids, 1), 0) > 1 then
    select coalesce(array_agg(p.id order by p.created_at), '{}'::uuid[])
      into v_locker_ids
    from public.payments p
    where p.id = any (v_ids)
      and (
        coalesce(p.description, '') ilike '%locker%'
        or coalesce(p.raw::text, '') ilike '%locker%'
      );
    if coalesce(array_length(v_locker_ids, 1), 0) = 1 then
      v_ids := v_locker_ids;
    end if;
  end if;

  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    select format('Oct 28 %s, Oct 29 %s, Oct 30 %s',
      count(*) filter (where (p.created_at at time zone 'America/New_York')::date = date '2026-10-28'),
      count(*) filter (where (p.created_at at time zone 'America/New_York')::date = date '2026-10-29'),
      count(*) filter (where (p.created_at at time zone 'America/New_York')::date = date '2026-10-30'))
      into v_near
    from public.payments p
    where p.provider = 'zeffy'
      and p.amount_cents = 15000
      and (
        p.member_id = p_member
        or p.payer_name ilike '%fitzpatrick%'
      );
    raise exception 'Tim Fitzpatrick $150 Zeffy payment on 2026-10-29 ET did not match exactly one row (%). Nearby $150 counts: %.',
      coalesce(array_length(v_ids, 1), 0), v_near;
  end if;
  v_pay := v_ids[1];
  select p.created_at into v_pay_at from public.payments p where p.id = v_pay;

  select count(*)::integer
    into v_count
  from public.locker_reservations r
  join public.lockers l on l.id = r.locker_id
  where upper(btrim(l.locker_number)) = 'RS1'
    and r.member_id = p_member
    and coalesce(r.is_renewal, false) = true
    and r.status <> 'cancelled';
  if v_count <> 1 then
    raise exception 'Expected 1 RS1 renewal reservation for Tim Fitzpatrick, found %.', v_count;
  end if;

  select r.id, r.payment_id
    into v_res, v_existing
  from public.locker_reservations r
  join public.lockers l on l.id = r.locker_id
  where upper(btrim(l.locker_number)) = 'RS1'
    and r.member_id = p_member
    and coalesce(r.is_renewal, false) = true
    and r.status <> 'cancelled'
  for update of r;

  if v_existing is null then
    update public.locker_reservations
       set payment_id = v_pay,
           paid_at = coalesce(paid_at, v_pay_at),
           updated_at = now()
     where id = v_res
       and payment_id is null;
    raise notice 'Linked Tim Fitzpatrick RS1 renewal % to payment %.', v_res, v_pay;
  elsif v_existing = v_pay then
    raise notice 'Tim Fitzpatrick RS1 renewal already linked to payment %.', v_pay;
  else
    raise exception 'Tim Fitzpatrick RS1 renewal payment_id is already set. Not changed.';
  end if;
  return v_pay;
end;
$fitz$;

do $backfill$
declare
  v_def text;
  v_locker_kind text;
  v_donation_kind text;
  v_charles uuid;
  v_tricia uuid;
  v_robyn uuid;
  v_gerry uuid;
  v_denise uuid;
  v_dyn uuid;
  v_bauder uuid;
  v_patrick uuid;
  v_fitz uuid;
  v_charles_email text;
  v_tricia_email text;
  v_robyn_email text;
  v_gerry_email text;
  v_denise_email text;
  v_dyn_email text;
  v_bauder_email text;
  v_patrick_email text;
  v_charles_label text;
  v_tricia_label text;
  v_robyn_label text;
  v_gerry_label text;
  v_denise_label text;
  v_dyn_label text;
  v_bauder_label text;
  v_patrick_label text;
  v_pay uuid;
  v_desc text;
  v_raw jsonb;
  v_bauder_count integer;
  v_bauder_paid boolean;
  v_bauder_paid_date date;
  v_after_count integer;
  v_after_paid boolean;
  v_after_paid_date date;
  v_small_count integer;
  v_small uuid;
  v_note text;
begin
  select pg_get_constraintdef(c.oid)
    into v_def
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'payments'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%product_kind%'
  limit 1;
  if v_def is null then
    raise exception 'payments product_kind check was not found.';
  end if;
  v_locker_kind := case when v_def ~* '''locker''' then 'locker' else 'other' end;
  v_donation_kind := case when v_def ~* '''donation''' then 'donation' else 'other' end;
  raise notice 'Locker product_kind is %. Donation product_kind is %.', v_locker_kind, v_donation_kind;

  v_charles := pg_temp.kos_bf_member('Chuck Powers');
  v_tricia := pg_temp.kos_bf_member('Tricia Powers');
  v_robyn := pg_temp.kos_bf_member('Robyn Thornburg');
  v_gerry := pg_temp.kos_bf_member('Gerry Logan');
  v_denise := pg_temp.kos_bf_member('Denise Logan');
  v_dyn := pg_temp.kos_bf_member('Tim Dyn');
  v_bauder := pg_temp.kos_bf_member('Charles Bauder');
  v_patrick := pg_temp.kos_bf_member('Patrick Pustay Jr');
  v_fitz := pg_temp.kos_bf_member('Tim Fitzpatrick');

  select m.email, btrim(m.first_name || ' ' || m.last_name)
    into v_charles_email, v_charles_label from public.members m where m.id = v_charles;
  select m.email, btrim(m.first_name || ' ' || m.last_name)
    into v_tricia_email, v_tricia_label from public.members m where m.id = v_tricia;
  select m.email, btrim(m.first_name || ' ' || m.last_name)
    into v_robyn_email, v_robyn_label from public.members m where m.id = v_robyn;
  select m.email, btrim(m.first_name || ' ' || m.last_name)
    into v_gerry_email, v_gerry_label from public.members m where m.id = v_gerry;
  select m.email, btrim(m.first_name || ' ' || m.last_name)
    into v_denise_email, v_denise_label from public.members m where m.id = v_denise;
  select m.email, btrim(m.first_name || ' ' || m.last_name)
    into v_dyn_email, v_dyn_label from public.members m where m.id = v_dyn;
  select m.email, btrim(m.first_name || ' ' || m.last_name)
    into v_bauder_email, v_bauder_label from public.members m where m.id = v_bauder;
  select m.email, btrim(m.first_name || ' ' || m.last_name)
    into v_patrick_email, v_patrick_label from public.members m where m.id = v_patrick;

  select count(*)::integer, bool_or(d.paid), max(d.paid_date)
    into v_bauder_count, v_bauder_paid, v_bauder_paid_date
  from public.dues_payments d
  where d.member_id = v_bauder
    and d.membership_year = 2026;

  v_raw := jsonb_build_object('part', 'dues', 'of_cents', 47500);
  v_pay := pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-11-11:charles-powers:37500',
    37500,
    timestamptz '2026-11-11 16:28:00-05',
    'Charles Powers',
    v_charles_email,
    v_tricia,
    'dues',
    2026,
    'Krewe Of Shamrock Membership for Tricia Powers. $375 of the $475 Zeffy payment on 2026-11-11 4:28 PM ET. The other $100 is the donation row for this same payment.',
    'Krewe Of Shamrock Membership',
    v_raw,
    false
  );
  perform pg_temp.kos_bf_mark_dues(
    v_tricia, v_pay, timestamptz '2026-11-11 16:28:00-05', 375,
    'zeffy-backfill:2026-11-11:charles-powers:37500'
  );

  v_desc := 'Donation. $100 of the $475 Zeffy payment from Charles Powers on 2026-11-11 4:28 PM ET for Tricia Powers membership.';
  if v_donation_kind <> 'donation' then
    v_desc := 'Donation kind is not allowed by payments_product_kind_check. Filed as other. ' || v_desc;
  end if;
  perform pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-11-11:charles-powers:10000',
    10000,
    timestamptz '2026-11-11 16:28:00-05',
    'Charles Powers',
    v_charles_email,
    v_charles,
    v_donation_kind,
    null,
    v_desc,
    'Krewe Of Shamrock Membership',
    jsonb_build_object('part', 'donation', 'of_cents', 47500),
    false
  );

  v_note := 'Paid Zeffy locker. Waiting list. No locker number assigned. Zeffy backfill November 2026.';
  v_pay := pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-11-11:robyn-thornburg:7500',
    7500,
    timestamptz '2026-11-11 19:10:00-05',
    'Robyn Thornburg',
    v_robyn_email,
    v_robyn,
    v_locker_kind,
    null,
    'Krewe locker rental - Small',
    'Krewe locker rental - Small',
    jsonb_build_object('size', 'small'),
    false
  );
  perform pg_temp.kos_bf_paid_waiting(
    v_robyn, v_robyn_email, v_robyn_label, 'small', v_pay,
    timestamptz '2026-11-11 19:10:00-05', v_note
  );

  v_pay := pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-11-12T07:53:gerry-logan:37500',
    37500,
    timestamptz '2026-11-12 07:53:00-05',
    'Gerry Logan',
    v_gerry_email,
    v_denise,
    'dues',
    2026,
    'Krewe Of Shamrock Membership for Denise Logan',
    'Krewe Of Shamrock Membership',
    jsonb_build_object('for', 'Denise Logan'),
    false
  );
  perform pg_temp.kos_bf_mark_dues(
    v_denise, v_pay, timestamptz '2026-11-12 07:53:00-05', 375,
    'zeffy-backfill:2026-11-12T07:53:gerry-logan:37500'
  );

  v_pay := pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-11-12T07:57:gerry-logan:37500',
    37500,
    timestamptz '2026-11-12 07:57:00-05',
    'Gerry Logan',
    v_gerry_email,
    v_gerry,
    'dues',
    2026,
    'Krewe Of Shamrock Membership',
    'Krewe Of Shamrock Membership',
    '{}'::jsonb,
    false
  );
  perform pg_temp.kos_bf_mark_dues(
    v_gerry, v_pay, timestamptz '2026-11-12 07:57:00-05', 375,
    'zeffy-backfill:2026-11-12T07:57:gerry-logan:37500'
  );

  v_pay := pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-11-15:tim-dyn:20000',
    20000,
    timestamptz '2026-11-15 11:54:00-05',
    'Tim Dyn',
    v_dyn_email,
    v_dyn,
    v_locker_kind,
    null,
    'Krewe locker rental - Large',
    'Krewe locker rental - Large',
    jsonb_build_object('size', 'large'),
    false
  );
  perform pg_temp.kos_bf_paid_waiting(
    v_dyn, v_dyn_email, v_dyn_label, 'large', v_pay,
    timestamptz '2026-11-15 11:54:00-05', v_note
  );

  v_pay := pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-11-16:charles-bauder:20000',
    20000,
    timestamptz '2026-11-16 15:44:00-05',
    'Charles Bauder',
    v_bauder_email,
    v_bauder,
    v_locker_kind,
    null,
    'Krewe locker rental - Large',
    'Krewe locker rental - Large',
    jsonb_build_object('size', 'large', 'from_size', 'small'),
    false
  );

  if exists (
    select 1
    from public.locker_reservations r
    where r.payment_id = v_pay
      and r.member_id = v_bauder
      and r.size = 'large'
      and r.locker_id is null
  ) then
    raise notice 'Charles Bauder large reservation already linked to this payment.';
  else
    select count(*)::integer
      into v_small_count
    from public.locker_reservations r
    where r.status = 'queued'
      and r.size = 'small'
      and r.locker_id is null
      and r.paid_at is null
      and r.payment_id is null
      and (
        r.member_id = v_bauder
        or (v_bauder_email is not null and lower(btrim(coalesce(r.requester_email, ''))) = lower(v_bauder_email))
      );
    if v_small_count <> 1 then
      raise exception 'Expected 1 queued unpaid small reservation for Charles Bauder, found %.', v_small_count;
    end if;
    if exists (
      select 1
      from public.locker_reservations r
      where r.size = 'large'
        and r.locker_id is null
        and r.status in ('queued', 'assigned')
        and (
          r.member_id = v_bauder
          or (v_bauder_email is not null and lower(btrim(coalesce(r.requester_email, ''))) = lower(v_bauder_email))
        )
    ) then
      raise exception 'Charles Bauder already has an open large reservation with no locker. Not changed.';
    end if;
    select r.id
      into v_small
    from public.locker_reservations r
    where r.status = 'queued'
      and r.size = 'small'
      and r.locker_id is null
      and r.paid_at is null
      and r.payment_id is null
      and (
        r.member_id = v_bauder
        or (v_bauder_email is not null and lower(btrim(coalesce(r.requester_email, ''))) = lower(v_bauder_email))
      )
    for update;
    update public.locker_reservations
       set size = 'large',
           notes = case
             when coalesce(notes, '') ilike '%Zeffy backfill November 2026%' then notes
             else concat_ws(E'\n', nullif(notes, ''),
               'Zeffy large locker on 2026-11-16. Updated from a queued small reservation. No locker number yet. Zeffy backfill November 2026.')
           end,
           updated_at = now()
     where id = v_small
       and size = 'small'
       and locker_id is null
       and paid_at is null
       and payment_id is null
       and status = 'queued';
    perform pg_temp.kos_bf_paid_waiting(
      v_bauder, v_bauder_email, v_bauder_label, 'large', v_pay,
      timestamptz '2026-11-16 15:44:00-05',
      'Zeffy large locker on 2026-11-16. Updated from a queued small reservation. No locker number yet. Zeffy backfill November 2026.'
    );
  end if;

  perform pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-11-17:charles-bauder:37500',
    37500,
    timestamptz '2026-11-17 15:13:00-05',
    'Charles Bauder',
    v_bauder_email,
    v_bauder,
    'dues',
    null,
    'Krewe Of Shamrock Membership. Purpose to confirm.',
    'Krewe Of Shamrock Membership',
    jsonb_build_object(
      'ledger_only', true,
      'note', 'Purpose to confirm. 2026 dues were already paid from Wild Apricot on July 13. This script does not change them.'
    ),
    false
  );

  perform pg_temp.kos_bf_insert_payment(
    'zeffy-backfill:2026-09-06:patrick-pustay:100',
    100,
    timestamptz '2026-09-06 13:42:00-04',
    'Patrick Pustay Jr',
    v_patrick_email,
    v_patrick,
    'store',
    null,
    'Krewe Pencil (shop test)',
    'Krewe Pencil (shop test)',
    jsonb_build_object(
      'do_not_email', true,
      'ledger_only', true,
      'data', jsonb_build_object(
        'items', jsonb_build_array(jsonb_build_object(
          'name', 'shop test pencil',
          'quantity', 1,
          'amount', 100
        ))
      )
    ),
    true
  );

  perform pg_temp.kos_bf_link_fitz(v_fitz);

  select count(*)::integer, bool_or(d.paid), max(d.paid_date)
    into v_after_count, v_after_paid, v_after_paid_date
  from public.dues_payments d
  where d.member_id = v_bauder
    and d.membership_year = 2026;
  if v_after_count is distinct from v_bauder_count
     or v_after_paid is distinct from v_bauder_paid
     or v_after_paid_date is distinct from v_bauder_paid_date then
    raise exception 'Charles Bauder 2026 dues changed. Rolled back.';
  end if;
  raise notice 'Charles Bauder 2026 dues were not changed.';
end;
$backfill$;

commit;

-- ---------------------------------------------------------------------------
-- Verification. Safe to run again after the writes.
-- ---------------------------------------------------------------------------
select p.provider_event_id,
       p.payer_name,
       btrim(m.first_name || ' ' || m.last_name) as member,
       p.amount_cents,
       p.created_at at time zone 'America/New_York' as created_et,
       p.product_kind,
       p.membership_year,
       p.description,
       r.size as locker_size,
       r.status as locker_status,
       (r.id is not null and r.locker_id is null) as locker_unassigned,
       r.paid_at as locker_paid_at
from public.payments p
left join public.members m on m.id = p.member_id
left join public.locker_reservations r on r.payment_id = p.id
where p.provider_event_id like 'zeffy-backfill:%'
order by p.created_at, p.provider_event_id;

select m.first_name, m.last_name, d.membership_year, d.paid, d.paid_date, d.amount, d.payment_method, d.waiver_status
from public.members m
left join public.dues_payments d
  on d.member_id = m.id and d.membership_year = 2026
where m.merged_into is null
  and (
    (lower(btrim(m.last_name)) = 'powers' and lower(btrim(m.first_name)) like 'tricia%')
    or (lower(btrim(m.last_name)) = 'logan' and lower(btrim(m.first_name)) like 'denise%')
    or (lower(btrim(m.last_name)) = 'logan' and (lower(btrim(m.first_name)) like 'gerry%' or lower(btrim(m.first_name)) like 'gerald%'))
    or (lower(btrim(m.last_name)) = 'bauder' and lower(btrim(m.first_name)) like 'charles%')
  )
order by m.last_name, m.first_name;

select l.locker_number, r.is_renewal, r.payment_id, r.paid_at, r.status,
       p.amount_cents, p.created_at at time zone 'America/New_York' as payment_et, p.provider_event_id
from public.locker_reservations r
join public.lockers l on l.id = r.locker_id
join public.members m on m.id = r.member_id
left join public.payments p on p.id = r.payment_id
where upper(btrim(l.locker_number)) = 'RS1'
  and m.merged_into is null
  and lower(btrim(m.last_name)) = 'fitzpatrick'
  and lower(btrim(m.first_name)) like 'tim%'
  and coalesce(r.is_renewal, false) = true;
