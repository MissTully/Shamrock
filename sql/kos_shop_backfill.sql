-- NOT APPLIED. Run in the Supabase SQL editor on oazwkwflgbthojvnclfc
-- AFTER reviewing it. Do not run sql/kos_shop_backfill_kos_shop_nov2026.sql
-- until this file has been applied. Applying this file does not insert
-- payments and does not send email.
--
-- What this changes:
--   * Shop line totals tolerate non-numeric Zeffy amounts instead of
--     aborting the payment insert.
--   * A small gap between item totals and the amount paid is listed as
--     "Zeffy tip or fee" so chair and buyer emails still add up.
--   * kos_queue_shop_order_emails(uuid, boolean) can send the buyer receipt
--     without the per-order chair email. The one-argument call still sends both.
--   * A before-insert guard skips a Zeffy row whose payment id, event id, or
--     KOS Shop minute key is already stored, so a later webhook does not
--     email the same order twice.
--   * kos_backfill_shop_orders(jsonb, text) records missing store payments
--     with the same member match as the webhook (email, then name) and lets
--     the existing trigger send shop_receipt and shop_po once.
--     Pass chair_notice 'summary' to skip per-order chair mail and send one
--     catch-up email instead. Buyer receipts still go out once either way.
--
-- Safe to re-run. It does not insert the November 2026 orders by itself.

create or replace function public.kos_text_numeric(p text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  return btrim(p)::numeric;
exception when others then
  return null;
end;
$$;

revoke all on function public.kos_text_numeric(text) from public, anon, authenticated;

create or replace function public.kos_zeffy_item_cents(p_item jsonb)
returns integer
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v numeric;
  v_qty integer;
begin
  v := public.kos_text_numeric(p_item->>'amount_cents');
  if v is not null then return round(v)::integer; end if;
  v := public.kos_text_numeric(p_item->>'amount_in_cents');
  if v is not null then return round(v)::integer; end if;
  v := coalesce(
    public.kos_text_numeric(p_item->>'amount'),
    public.kos_text_numeric(p_item->>'total')
  );
  if v is not null then
    if v <> trunc(v) then return round(v * 100)::integer; end if;
    return round(v)::integer;
  end if;
  v := coalesce(
    public.kos_text_numeric(p_item->>'unit_amount'),
    public.kos_text_numeric(p_item->>'price')
  );
  if v is not null then
    v_qty := coalesce(public.kos_text_numeric(p_item->>'quantity')::integer, 1);
    if v <> trunc(v) then v := v * 100; end if;
    return round(v * greatest(v_qty, 1))::integer;
  end if;
  return null;
end;
$$;

revoke all on function public.kos_zeffy_item_cents(jsonb) from public, anon;

create or replace function public.kos_shop_order_lines(
  p_raw jsonb, p_fallback_name text, p_amount_cents int
) returns text
language plpgsql stable set search_path to 'public' as $$
declare
  v_obj jsonb;
  v_items jsonb;
  v_it jsonb;
  v_html text := '';
  v_name text;
  v_qty int;
  v_cents int;
  v_sum int := 0;
  v_priced int := 0;
  v_gap int;
begin
  v_obj := public.kos_zeffy_payment_obj(p_raw);
  v_items := case when jsonb_typeof(v_obj->'items') = 'array' then v_obj->'items' else '[]'::jsonb end;
  for v_it in select * from jsonb_array_elements(v_items) loop
    v_name := public.kos_shop_line_label(v_it, p_fallback_name);
    v_qty := coalesce(public.kos_text_numeric(v_it->>'quantity')::int, 1);
    if v_qty < 1 then v_qty := 1; end if;
    v_cents := public.kos_zeffy_item_cents(v_it);
    if v_cents is not null then
      v_sum := v_sum + v_cents;
      v_priced := v_priced + 1;
    end if;
    v_html := v_html || '<tr><td style="padding:6px 0">' || public.kos_html_esc(v_name)
      || '</td><td style="padding:6px 0;text-align:center">' || v_qty
      || '</td><td style="padding:6px 0;text-align:right">'
      || case when v_cents is null then '' else '$' || to_char(v_cents / 100.0, 'FM999990.00') end
      || '</td></tr>';
  end loop;
  if v_html = '' then
    v_html := '<tr><td style="padding:6px 0">' || public.kos_html_esc(coalesce(p_fallback_name, 'Krewe item'))
      || '</td><td style="padding:6px 0;text-align:center">1</td><td style="padding:6px 0;text-align:right">$'
      || to_char(coalesce(p_amount_cents, 0) / 100.0, 'FM999990.00') || '</td></tr>';
  elsif v_priced > 0 and p_amount_cents is not null and p_amount_cents > v_sum then
    v_gap := p_amount_cents - v_sum;
    if v_gap between 1 and 500 and v_gap < v_sum then
      v_html := v_html || '<tr><td style="padding:6px 0">Zeffy tip or fee</td><td style="padding:6px 0;text-align:center">1</td><td style="padding:6px 0;text-align:right">$'
        || to_char(v_gap / 100.0, 'FM999990.00') || '</td></tr>';
    end if;
  end if;
  return v_html;
end;
$$;

create or replace function public.kos_shop_order_time(p_raw jsonb, p_created timestamptz)
returns timestamptz
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_created text;
  v_ts timestamptz;
begin
  v_created := nullif(btrim(coalesce(p_raw #>> '{data,created}', p_raw->>'created', '')), '');
  if v_created ~ '^[0-9]+(\.[0-9]+)?$' then
    return to_timestamp(v_created::numeric);
  end if;
  if v_created ~ '^[0-9]{4}-' then
    begin
      v_ts := v_created::timestamptz;
      return v_ts;
    exception when others then
      return p_created;
    end;
  end if;
  return p_created;
end;
$$;

revoke all on function public.kos_shop_order_time(jsonb, timestamptz) from public, anon, authenticated;

-- Minute-precision key for a KOS Shop checkout. An explicit raw.shop_key wins.
create or replace function public.kos_shop_order_key(
  p_raw jsonb, p_email text, p_created timestamptz
) returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_explicit text := nullif(btrim(coalesce(p_raw->>'shop_key', '')), '');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ts timestamptz;
begin
  if v_explicit is not null then
    return v_explicit;
  end if;
  v_ts := public.kos_shop_order_time(p_raw, p_created);
  if v_ts is null or position('@' in v_email) = 0 then
    return null;
  end if;
  return 'kos-shop:' || to_char(v_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') || ':' || v_email;
end;
$$;

revoke all on function public.kos_shop_order_key(jsonb, text, timestamptz) from public, anon, authenticated;

create or replace function public.kos_payments_skip_known_shop_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key text;
  v_ts timestamptz;
begin
  if coalesce(new.provider, '') <> 'zeffy' then
    return new;
  end if;
  if nullif(btrim(coalesce(new.provider_payment_id, '')), '') is not null and exists (
    select 1 from public.payments p
    where p.provider = new.provider
      and p.provider_payment_id = new.provider_payment_id
  ) then
    return null;
  end if;
  if nullif(btrim(coalesce(new.provider_event_id, '')), '') is not null and exists (
    select 1 from public.payments p
    where p.provider_event_id = new.provider_event_id
  ) then
    return null;
  end if;
  v_key := public.kos_shop_order_key(new.raw, new.payer_email, new.created_at);
  if v_key is not null and exists (
    select 1 from public.payments p
    where p.provider_event_id = v_key
       or p.provider_payment_id = v_key
       or p.raw->>'shop_key' = v_key
  ) then
    return null;
  end if;
  if new.product_kind = 'store' and position('@' in coalesce(new.payer_email, '')) > 0 then
    v_ts := public.kos_shop_order_time(new.raw, new.created_at);
    if v_ts is not null and exists (
      select 1 from public.payments p
      where coalesce(p.raw->>'backfill', '') = 'true'
        and p.product_kind = 'store'
        and lower(p.payer_email) = lower(new.payer_email)
        and abs(extract(epoch from (p.created_at - v_ts))) <= 180
    ) then
      return null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.kos_payments_skip_known_shop_order() from public, anon, authenticated;

drop trigger if exists kos_payments_skip_known_shop_order on public.payments;
create trigger kos_payments_skip_known_shop_order
  before insert on public.payments
  for each row execute function public.kos_payments_skip_known_shop_order();

-- p_notify_chairs false sends only the buyer receipt. Used by summary backfill.
drop trigger if exists kos_payments_shop_order_emails on public.payments;
drop function if exists public.kos_queue_shop_order_emails(uuid);

create or replace function public.kos_queue_shop_order_emails(
  p_payment_id uuid,
  p_notify_chairs boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  pay public.payments%rowtype;
  v_obj jsonb;
  v_product text;
  v_lines text;
  v_total text;
  v_date text;
  v_order text;
  v_buyer text;
  v_first text;
  v_email text;
  v_member text;
  v_table text;
  v_body text;
  v_r record;
  v_chairs int := 0;
  v_sent text[] := '{}';
  v_queued int := 0;
  v_phone text;
  v_tel text;
begin
  select * into pay from public.payments where id = p_payment_id;
  if not found or pay.product_kind <> 'store' then
    return jsonb_build_object('ok', false, 'reason', 'not_store');
  end if;
  if coalesce(pay.status, 'succeeded') not in ('succeeded', 'paid', 'completed', 'succeded') then
    return jsonb_build_object('ok', false, 'reason', 'not_paid');
  end if;

  v_obj := public.kos_zeffy_payment_obj(pay.raw);
  v_product := public.kos_shop_order_title(pay.raw, coalesce(pay.description, 'Krewe item'));
  v_lines := public.kos_shop_order_lines(pay.raw, v_product, pay.amount_cents);
  v_total := '$' || to_char(coalesce(pay.amount_cents, 0) / 100.0, 'FM999990.00');
  v_date := to_char(pay.created_at at time zone 'America/New_York', 'FMMonth FMDD, YYYY');
  v_order := coalesce(pay.provider_payment_id, pay.id::text);
  v_email := nullif(btrim(coalesce(
    pay.payer_email,
    v_obj->'buyer'->>'email',
    v_obj->'buyer'->>'emailAddress',
    v_obj->>'email',
    ''
  )), '');
  v_buyer := coalesce(
    nullif(btrim(coalesce(pay.payer_name, '')), ''),
    nullif(btrim(coalesce(v_obj->'buyer'->>'first_name', v_obj->'buyer'->>'firstName', '') || ' '
      || coalesce(v_obj->'buyer'->>'last_name', v_obj->'buyer'->>'lastName', '')), ''),
    v_email,
    'Shop customer'
  );
  v_first := split_part(coalesce(v_buyer, ''), ' ', 1);
  v_phone := public.kos_shop_buyer_phone(pay.raw);
  v_tel := public.kos_tel_href(v_phone);
  select m.first_name || ' ' || m.last_name into v_member from public.members m where m.id = pay.member_id;

  v_table := '<table style="width:100%;border-collapse:collapse;font-size:15px"><tr style="border-bottom:1px solid #d9e6dc">'
    || '<th style="text-align:left;padding:6px 0">Item</th><th style="padding:6px 0">Qty</th><th style="text-align:right;padding:6px 0">Line total</th></tr>'
    || v_lines
    || '<tr style="border-top:1px solid #d9e6dc"><td style="padding:8px 0;font-weight:700">Order total</td><td></td><td style="padding:8px 0;text-align:right;font-weight:700">'
    || v_total || '</td></tr></table>';

  if v_email is not null
     and not exists (select 1 from public.outbound_emails where purpose = 'shop_receipt:' || pay.id)
  then
    v_body := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d24">'
      || '<div style="background:#0b5d33;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><div style="font-size:20px;font-weight:700">Krewe of Shamrock</div><div style="font-size:14px;opacity:.9">Order receipt</div></div>'
      || '<div style="border:1px solid #d9e6dc;border-top:0;padding:22px;border-radius:0 0 10px 10px">'
      || '<p>Hi' || case when v_first <> '' then ' ' || public.kos_html_esc(v_first) else '' end || ',</p>'
      || '<p>Thank you for supporting the Krewe of Shamrock! Here is your receipt.</p>'
      || '<p style="font-size:14px;color:#4a5a50">Zeffy payment id: <b>' || public.kos_html_esc(v_order) || '</b><br>Payment date: ' || v_date || '</p>'
      || v_table
      || '<p style="background:#eef6f0;padding:12px 14px;border-radius:8px">The Merchandise Chair will reach out to arrange delivery at a Krewe meeting or event, or pick up/drop off.</p>'
      || '<p>Questions? Reply to this email or write to <a href="mailto:secretary@kreweofshamrock.com">secretary@kreweofshamrock.com</a>.</p>'
      || '<p>Slainte,<br>Krewe of Shamrock</p></div></div>';
    perform public.enqueue_email(v_email, v_buyer,
      'Your Krewe of Shamrock order receipt', v_body, 'shop_receipt:' || pay.id, pay.member_id);
    v_queued := v_queued + 1;
  end if;

  if p_notify_chairs and not exists (select 1 from public.outbound_emails where purpose = 'shop_po:' || pay.id) then
    select count(*) into v_chairs from public.members m
     where m.officer_title ilike '%Merchandise%' and position('@' in coalesce(m.email, '')) > 0;

    v_body := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d24">'
      || '<div style="background:#0b5d33;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><div style="font-size:20px;font-weight:700">New shop order</div><div style="font-size:14px;opacity:.9">Zeffy payment id ' || public.kos_html_esc(v_order) || '</div></div>'
      || '<div style="border:1px solid #d9e6dc;border-top:0;padding:22px;border-radius:0 0 10px 10px">'
      || '<p>Hi,</p>'
      || '<p>A new order came in through the KOS Shop.</p>'
      || '<p>Please contact the buyer to arrange delivery at a Krewe meeting or event, or pick up/drop off.</p>'
      || '<table style="font-size:15px;margin-bottom:14px">'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Buyer</td><td><b>' || public.kos_html_esc(v_buyer) || '</b></td></tr>'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Email</td><td>'
      || case when v_email is null then 'Not provided' else '<a href="mailto:' || public.kos_html_esc(v_email) || '">' || public.kos_html_esc(v_email) || '</a>' end
      || '</td></tr>'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Phone</td><td>'
      || case
           when v_phone is null then 'Not provided'
           when v_tel is not null then '<a href="' || public.kos_html_esc(v_tel) || '">' || public.kos_html_esc(v_phone) || '</a>'
           else public.kos_html_esc(v_phone)
         end
      || '</td></tr>'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Member</td><td>' || case when v_member is null then 'Not matched to a member' else 'Yes, ' || public.kos_html_esc(v_member) end || '</td></tr>'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Payment date</td><td>' || v_date || '</td></tr>'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Zeffy payment id</td><td>' || public.kos_html_esc(v_order) || '</td></tr></table>'
      || v_table
      || case when v_chairs = 0 then '<p style="color:#9a3b00"><b>Note:</b> no Merchandise Chair is listed in the roster, so this went to the Treasurer and Secretary.</p>' else '' end
      || '<p><a href="https://www.kreweofshamrock.com/members.html" style="color:#0b5d33;font-weight:700">Open Shop Studio in the Member Hub</a></p></div></div>';

    for v_r in
      select m.email, m.first_name || ' ' || m.last_name as nm, m.id
        from public.members m
       where position('@' in coalesce(m.email, '')) > 0
         and m.officer_title ilike '%Merchandise%'
      union all
      select m.email, m.first_name || ' ' || m.last_name as nm, m.id
        from public.members m
       where v_chairs = 0
         and position('@' in coalesce(m.email, '')) > 0
         and m.officer_title ilike '%Treasurer%'
      union all
      select 'secretary@kreweofshamrock.com', 'Krewe Secretary', null::uuid
       where v_chairs = 0
    loop
      if not (lower(v_r.email) = any (v_sent)) then
        v_sent := array_append(v_sent, lower(v_r.email));
        perform public.enqueue_email(v_r.email, v_r.nm,
          'New shop order: ' || v_product || ' for ' || v_buyer, v_body, 'shop_po:' || pay.id, v_r.id);
        v_queued := v_queued + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'po_recipients', to_jsonb(v_sent), 'chairs', p_notify_chairs);
end;
$$;

revoke all on function public.kos_queue_shop_order_emails(uuid, boolean) from public, anon, authenticated;

create or replace function public.kos_payments_shop_order_emails()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_notice text;
begin
  if new.product_kind = 'store' then
    v_notice := coalesce(nullif(current_setting('kos.shop_chair_notice', true), ''), 'each');
    if v_notice = 'summary' then
      perform public.kos_queue_shop_order_emails(new.id, false);
    else
      perform public.kos_queue_shop_order_emails(new.id, true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists kos_payments_shop_order_emails on public.payments;
create trigger kos_payments_shop_order_emails
  after insert on public.payments
  for each row execute function public.kos_payments_shop_order_emails();

-- One chair email covering every payment id in the list. Opt-in from backfill.
create or replace function public.kos_queue_shop_chair_summary(p_payment_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids uuid[];
  v_purpose text;
  v_body text := '';
  v_block text;
  v_pay public.payments%rowtype;
  v_lines text;
  v_buyer text;
  v_email text;
  v_phone text;
  v_tel text;
  v_date text;
  v_total text;
  v_order text;
  v_chairs int := 0;
  v_sent text[] := '{}';
  v_queued int := 0;
  v_r record;
  v_n int;
begin
  select coalesce(array_agg(x order by x), '{}') into v_ids
  from unnest(coalesce(p_payment_ids, '{}')) as t(x)
  where x is not null;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_payments');
  end if;
  v_purpose := 'shop_po_summary:' || md5(array_to_string(v_ids::text[], ','));
  if exists (select 1 from public.outbound_emails where purpose = v_purpose) then
    return jsonb_build_object('ok', true, 'queued', 0, 'purpose', v_purpose, 'duplicate', true);
  end if;

  select count(*) into v_chairs from public.members m
   where m.officer_title ilike '%Merchandise%' and position('@' in coalesce(m.email, '')) > 0;

  for v_pay in
    select * from public.payments p
    where p.id = any (v_ids)
    order by p.created_at, p.id
  loop
    v_lines := public.kos_shop_order_lines(v_pay.raw, coalesce(v_pay.description, 'Krewe item'), v_pay.amount_cents);
    v_total := '$' || to_char(coalesce(v_pay.amount_cents, 0) / 100.0, 'FM999990.00');
    v_date := to_char(v_pay.created_at at time zone 'America/New_York', 'FMMonth FMDD, YYYY FMHH12:MI am');
    v_order := coalesce(v_pay.provider_payment_id, v_pay.id::text);
    v_email := nullif(btrim(coalesce(v_pay.payer_email, '')), '');
    v_buyer := coalesce(nullif(btrim(coalesce(v_pay.payer_name, '')), ''), v_email, 'Shop customer');
    v_phone := public.kos_shop_buyer_phone(v_pay.raw);
    v_tel := public.kos_tel_href(v_phone);
    v_block := '<h3 style="margin:18px 0 6px;font-size:16px">' || public.kos_html_esc(v_buyer) || '</h3>'
      || '<p style="margin:0 0 8px;font-size:14px;color:#4a5a50">' || v_date
      || '<br>Email: ' || case when v_email is null then 'Not provided' else '<a href="mailto:' || public.kos_html_esc(v_email) || '">' || public.kos_html_esc(v_email) || '</a>' end
      || '<br>Phone: ' || case
           when v_phone is null then 'Not provided'
           when v_tel is not null then '<a href="' || public.kos_html_esc(v_tel) || '">' || public.kos_html_esc(v_phone) || '</a>'
           else public.kos_html_esc(v_phone)
         end
      || '<br>Payment id: ' || public.kos_html_esc(v_order) || '</p>'
      || '<table style="width:100%;border-collapse:collapse;font-size:15px"><tr style="border-bottom:1px solid #d9e6dc">'
      || '<th style="text-align:left;padding:6px 0">Item</th><th style="padding:6px 0">Qty</th><th style="text-align:right;padding:6px 0">Line total</th></tr>'
      || v_lines
      || '<tr style="border-top:1px solid #d9e6dc"><td style="padding:8px 0;font-weight:700">Order total</td><td></td><td style="padding:8px 0;text-align:right;font-weight:700">'
      || v_total || '</td></tr></table>';
    v_body := v_body || v_block;
  end loop;

  v_body := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d24">'
    || '<div style="background:#0b5d33;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><div style="font-size:20px;font-weight:700">KOS Shop catch-up</div><div style="font-size:14px;opacity:.9">' || v_n::text || ' order' || case when v_n = 1 then '' else 's' end || ' recorded from Zeffy</div></div>'
    || '<div style="border:1px solid #d9e6dc;border-top:0;padding:22px;border-radius:0 0 10px 10px">'
    || '<p>Hi,</p><p>These KOS Shop orders were already paid in Zeffy and were missing from the Krewe ledger. This is the one catch-up note for the batch. Each buyer is getting their own receipt.</p>'
    || '<p>Please contact each buyer to arrange delivery at a Krewe meeting or event, or pick up/drop off.</p>'
    || v_body
    || case when v_chairs = 0 then '<p style="color:#9a3b00"><b>Note:</b> no Merchandise Chair is listed in the roster, so this went to the Treasurer and Secretary.</p>' else '' end
    || '<p><a href="https://www.kreweofshamrock.com/members.html" style="color:#0b5d33;font-weight:700">Open Shop Studio in the Member Hub</a></p></div></div>';

  for v_r in
    select m.email, m.first_name || ' ' || m.last_name as nm, m.id
      from public.members m
     where position('@' in coalesce(m.email, '')) > 0
       and m.officer_title ilike '%Merchandise%'
    union all
    select m.email, m.first_name || ' ' || m.last_name as nm, m.id
      from public.members m
     where v_chairs = 0
       and position('@' in coalesce(m.email, '')) > 0
       and m.officer_title ilike '%Treasurer%'
    union all
    select 'secretary@kreweofshamrock.com', 'Krewe Secretary', null::uuid
     where v_chairs = 0
  loop
    if not (lower(v_r.email) = any (v_sent)) then
      v_sent := array_append(v_sent, lower(v_r.email));
      perform public.enqueue_email(v_r.email, v_r.nm,
        'KOS Shop catch-up: ' || v_n::text || ' order' || case when v_n = 1 then '' else 's' end,
        v_body, v_purpose, v_r.id);
      v_queued := v_queued + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'purpose', v_purpose, 'po_recipients', to_jsonb(v_sent));
end;
$$;

revoke all on function public.kos_queue_shop_chair_summary(uuid[]) from public, anon, authenticated;

-- p_orders is a JSON array, or an object with an "orders" array.
-- p_chair_notice: 'each' (default) or 'summary'.
-- Each new store row is product_kind store. The shop email trigger sends
-- shop_receipt once. 'each' also sends shop_po once. 'summary' sends one
-- chair catch-up for the rows this call inserted. Already recorded payments
-- are skipped and are not included in the summary.
create or replace function public.kos_backfill_shop_orders(
  p_orders jsonb,
  p_chair_notice text default 'each'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $backfill$
declare
  v_notice text := lower(btrim(coalesce(p_chair_notice, 'each')));
  v_orders jsonb;
  v_ord jsonb;
  v_items_in jsonb;
  v_it jsonb;
  v_items jsonb;
  v_name text;
  v_qty int;
  v_unit int;
  v_line int;
  v_email text;
  v_buyer text;
  v_first text;
  v_last text;
  v_phone text;
  v_campaign text;
  v_ts timestamptz;
  v_cents int;
  v_txn text;
  v_shop_key text;
  v_event_id text;
  v_payment_id text;
  v_member uuid;
  v_existing uuid;
  v_id uuid;
  v_raw jsonb;
  v_results jsonb := '[]'::jsonb;
  v_new uuid[] := '{}';
  v_inserted int := 0;
  v_skipped int := 0;
  v_summary jsonb := null;
  v_err text;
begin
  if v_notice not in ('each', 'summary') then
    return jsonb_build_object('ok', false, 'message', 'chair_notice must be each or summary.');
  end if;
  if jsonb_typeof(p_orders) = 'array' then
    v_orders := p_orders;
  elsif jsonb_typeof(p_orders) = 'object' and jsonb_typeof(p_orders->'orders') = 'array' then
    v_orders := p_orders->'orders';
  else
    return jsonb_build_object('ok', false, 'message', 'Pass a JSON array of orders, or {"orders":[...]} .');
  end if;

  for v_ord in select * from jsonb_array_elements(v_orders) loop
    v_err := null;
    v_email := lower(btrim(coalesce(v_ord->>'buyer_email', v_ord->>'email', '')));
    v_buyer := nullif(btrim(coalesce(v_ord->>'buyer_name', v_ord->>'name', '')), '');
    v_phone := nullif(btrim(coalesce(v_ord->>'phone', '')), '');
    v_campaign := coalesce(nullif(btrim(coalesce(v_ord->>'campaign', '')), ''), 'KOS Shop');
    v_txn := nullif(btrim(coalesce(
      v_ord->>'transaction_id', v_ord->>'provider_payment_id', v_ord->>'zeffy_id', v_ord->>'id', ''
    )), '');
    begin
      v_ts := nullif(btrim(coalesce(v_ord->>'occurred_at', v_ord->>'date', v_ord->>'created_at', '')), '')::timestamptz;
    exception when others then
      v_ts := null;
      v_err := 'occurred_at is not a timestamp.';
    end;
    if v_err is null and v_ts is null then
      v_err := 'occurred_at is required.';
    end if;
    if v_err is null and position('@' in v_email) = 0 then
      v_err := 'buyer_email is required.';
    end if;
    v_cents := null;
    if v_err is null then
      if v_ord ? 'total_cents' or v_ord ? 'amount_cents' then
        v_cents := round(public.kos_text_numeric(coalesce(v_ord->>'total_cents', v_ord->>'amount_cents')))::int;
      elsif v_ord ? 'total_dollars' or v_ord ? 'total' then
        v_cents := round(public.kos_text_numeric(coalesce(v_ord->>'total_dollars', v_ord->>'total')) * 100)::int;
      end if;
      if v_cents is null or v_cents <= 0 then
        v_err := 'total_cents or total_dollars is required.';
      end if;
    end if;
    v_shop_key := nullif(btrim(coalesce(v_ord->>'shop_key', '')), '');
    if v_shop_key is null and v_err is null then
      v_shop_key := 'kos-shop:' || to_char(v_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') || ':' || v_email;
    end if;
    if v_err is null and v_txn is null and v_shop_key is null then
      v_err := 'transaction_id or shop_key is required.';
    end if;
    if v_err is not null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false, 'email', v_email, 'message', v_err
      ));
      continue;
    end if;

    if v_txn is not null then
      v_event_id := v_txn;
      v_payment_id := v_txn;
    else
      v_event_id := v_shop_key;
      v_payment_id := v_shop_key;
    end if;

    select p.id into v_existing
    from public.payments p
    where p.provider_event_id in (v_event_id, v_shop_key)
       or p.provider_payment_id in (v_event_id, v_shop_key)
       or p.raw->>'shop_key' = v_shop_key
    limit 1;
    if v_existing is not null then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', true, 'skipped', true, 'reason', 'already_recorded',
        'payment_id', v_existing, 'shop_key', v_shop_key, 'transaction_id', v_txn
      ));
      continue;
    end if;

    v_items := '[]'::jsonb;
    v_items_in := case when jsonb_typeof(v_ord->'items') = 'array' then v_ord->'items' else '[]'::jsonb end;
    for v_it in select * from jsonb_array_elements(v_items_in) loop
      v_name := nullif(btrim(coalesce(v_it->>'name', v_it->>'rate_title', v_it->>'title', '')), '');
      if v_name is null then
        continue;
      end if;
      v_qty := coalesce(public.kos_text_numeric(v_it->>'quantity')::int, 1);
      if v_qty < 1 then v_qty := 1; end if;
      if v_it ? 'unit_cents' or v_it ? 'price_cents' then
        v_unit := round(public.kos_text_numeric(coalesce(v_it->>'unit_cents', v_it->>'price_cents')))::int;
      elsif v_it ? 'unit_dollars' or v_it ? 'price_dollars' or v_it ? 'price' then
        v_unit := round(public.kos_text_numeric(coalesce(v_it->>'unit_dollars', v_it->>'price_dollars', v_it->>'price')) * 100)::int;
      else
        v_unit := null;
      end if;
      v_line := case when v_unit is null then null else v_unit * v_qty end;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'rate_title', v_name,
        'name', v_name,
        'quantity', v_qty,
        'amount', v_line,
        'type', case when v_name ~* '(tip|contribution)' then 'tip' else 'product' end
      ));
    end loop;
    if jsonb_array_length(v_items) = 0 then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false, 'email', v_email, 'shop_key', v_shop_key,
        'message', 'At least one named line item is required.'
      ));
      continue;
    end if;

    v_member := public.kos_match_member_by_email(v_email);
    if v_member is null and v_buyer is not null then
      v_member := public.kos_match_member_by_name(v_buyer);
    end if;
    v_first := split_part(coalesce(v_buyer, ''), ' ', 1);
    v_last := case
      when v_buyer is null or position(' ' in v_buyer) = 0 then ''
      else regexp_replace(v_buyer, '^.*\s+', '')
    end;

    v_raw := jsonb_build_object(
      'type', 'payment.completed',
      'backfill', true,
      'shop_key', v_shop_key,
      'data', jsonb_build_object(
        'object', 'payment',
        'id', v_payment_id,
        'amount', v_cents,
        'created', extract(epoch from v_ts)::bigint,
        'description', v_campaign,
        'campaign_name', v_campaign,
        'campaign_title', v_campaign,
        'status', 'succeeded',
        'email', v_email,
        'phone', v_phone,
        'buyer', jsonb_build_object(
          'email', v_email,
          'first_name', nullif(v_first, ''),
          'last_name', nullif(v_last, ''),
          'phone', v_phone
        ),
        'items', v_items
      )
    );

    perform set_config('kos.shop_chair_notice', v_notice, true);
    insert into public.payments (
      provider, provider_event_id, provider_payment_id, amount_cents, currency,
      status, payer_email, payer_name, description, product_kind, member_id,
      event_id, membership_year, raw, created_at
    ) values (
      'zeffy', v_event_id, v_payment_id, v_cents, 'usd',
      'succeeded', v_email, v_buyer, v_campaign, 'store', v_member,
      null, extract(year from v_ts at time zone 'America/New_York')::int, v_raw, v_ts
    )
    on conflict (provider_event_id) do nothing
    returning id into v_id;

    if v_id is null then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', true, 'skipped', true, 'reason', 'already_recorded',
        'shop_key', v_shop_key, 'transaction_id', v_txn
      ));
    else
      v_inserted := v_inserted + 1;
      v_new := array_append(v_new, v_id);
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', true, 'skipped', false, 'payment_id', v_id,
        'shop_key', v_shop_key, 'transaction_id', v_txn,
        'member_id', v_member, 'member_matched', v_member is not null
      ));
    end if;
    v_id := null;
    v_existing := null;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(v_results) r
    where coalesce((r->>'ok')::boolean, false) = false
  ) then
    raise exception 'Shop backfill stopped and rolled back. %', v_results;
  end if;

  if v_notice = 'summary' and coalesce(array_length(v_new, 1), 0) > 0 then
    v_summary := public.kos_queue_shop_chair_summary(v_new);
  end if;

  return jsonb_build_object(
    'ok', true,
    'chair_notice', v_notice,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'summary', v_summary,
    'results', v_results
  );
end;
$backfill$;

revoke all on function public.kos_backfill_shop_orders(jsonb, text) from public, anon, authenticated;
grant execute on function public.kos_backfill_shop_orders(jsonb, text) to service_role;
