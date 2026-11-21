-- Zeffy membership dues: one paid row per ticket holder, not only the payer.
-- NOT APPLIED. Paste this file into the Supabase SQL editor for project
-- oazwkwflgbthojvnclfc (Krewe of Shamrock) and run it. Safe to re-run.
-- Do not run it from the app, a webhook, or a script against the live database.
--
-- Depends on sql/kos_dues_foundation.sql (dues_payments, kos_dues_catalog,
-- kos_dues_events, kos_dues_quote) and the live kos_record_payment body from
-- sql/kos_locker_rentals.sql. This replaces that function. Locker, shop,
-- event RSVP, and raffle behavior stay as they were.
--
-- Why: membership forms are Zeffy ticketing forms. After the webhook classifies
-- a payment as dues, a couple order (one $750 charge, two $375 Full tickets)
-- has to mark each attendee's unpaid dues row. The old function updated only
-- the payer. The same Zeffy payment id is not applied twice: a second delivery
-- finds the payment_recorded event and leaves the row alone.
--
-- Also adds members.membership_level to v_parade_ready so Parade Ready can
-- show the amount for that member's level. New column is appended, which
-- CREATE OR REPLACE VIEW allows.

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
  v_dues_results jsonb := '[]'::jsonb;
begin
  v_kind := coalesce(p->>'product_kind', 'other');
  if v_kind not in ('store', 'event', 'dues', 'donation', 'raffle', 'other') then
    v_kind := 'other';
  end if;
  v_year := coalesce(
    nullif(p->>'membership_year', '')::integer,
    extract(year from current_date)::integer
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
      elsif lower(coalesce(v_status, '')) = 'active' then
        begin
          insert into public.dues_payments (
            member_id, membership_year, amount, due_date, paid, paid_date, payment_method,
            membership_level, standard_amount, zeffy_campaign_key, notes
          ) values (
            v_target, v_year, v_charge, make_date(v_year, 6, 30), true, current_date, 'card',
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
          'membership_level', v_level
        )
      );

      v_dues_results := v_dues_results || jsonb_build_array(jsonb_build_object(
        'member_id', v_target,
        'dues_payment_id', v_dues_id,
        'action', v_action,
        'amount_cents', v_holder_cents
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
  'Service role. Records a Zeffy or Stripe payment. Dues payments mark each ticket holder unpaid row for the year, or create a paid row for an active member who has none. The same provider payment id is not applied twice.';

-- Parade Ready reads this view. membership_level is new and goes last.
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
      and d.membership_year = extract(year from current_date)::integer
      and d.paid
  )) as dues_paid,
  (exists (
    select 1 from public.waivers w
    where w.member_id = m.id
      and w.season_year = extract(year from current_date)::integer
  )) as waiver_signed,
  (exists (
    select 1
    from public.event_signups s
    join public.events e on e.id = s.event_id
    where s.member_id = m.id
      and s.status = 'attended'
      and e.event_type = 'meeting'
      and e.is_mandatory
      and e.start_time >= date_trunc('year', now())
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
  'Parade Ready gates for the signed-in member, or the roster when the reader is an officer. membership_level is the dues level used to show the unpaid amount.';
