-- NOT APPLIED. Review, then run in the Supabase SQL editor on oazwkwflgbthojvnclfc.
-- Krewe of Shamrock: one shared Zeffy "KOS Shop" Online Store for multi-item checkout.
-- Safe to re-run.
--
-- What this changes:
--   * kos_runtime_flags.kos_shop_zeffy_url holds the public KOS Shop URL
--     (https://www.zeffy.com/en-US/ticketing/kos-shop).
--   * list_public_shop_checkout() lets the public shop page read that URL.
--   * Payments from the KOS Shop campaign are classified as store.
--   * Line items in the Zeffy items array are matched to shop_products by name
--     so buyer and merch-chair emails list every item.
--   * After a paid store order, kos_queue_shop_order_emails sends a receipt to
--     the buyer and a purchase order to the current Merchandise Chair(s). If
--     no chair is listed, it falls back to the Treasurer and
--     secretary@kreweofshamrock.com. The chair email includes buyer contact
--     (mailto / tel) and a delivery line; the buyer email says the chair will
--     reach out to arrange delivery.
--   * New priced products no longer auto-mark awaiting_zeffy (no per-item
--     ticketing campaign). They can go live on the shared shop list.
-- Legacy per-product zeffy_url values are kept and still match if present.

create table if not exists public.kos_runtime_flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.kos_runtime_flags (key, value)
values (
  'kos_shop_zeffy_url',
  jsonb_build_object('url', 'https://www.zeffy.com/en-US/ticketing/kos-shop')
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

comment on table public.kos_runtime_flags is
  'Small runtime switches. kos_shop_zeffy_url.url is the shared KOS Shop Zeffy Online Store link.';

create or replace function public.kos_shop_checkout_url()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select nullif(btrim(coalesce(
    f.value->>'url',
    f.value #>> '{}',
    ''
  )), '')
  from public.kos_runtime_flags f
  where f.key = 'kos_shop_zeffy_url';
$$;

revoke all on function public.kos_shop_checkout_url() from public, anon;
grant execute on function public.kos_shop_checkout_url() to authenticated;

create or replace function public.list_public_shop_checkout()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object('zeffy_url', coalesce(public.kos_shop_checkout_url(), ''));
$$;

revoke all on function public.list_public_shop_checkout() from public;
grant execute on function public.list_public_shop_checkout() to anon, authenticated;

-- True if this Zeffy payment belongs to the shared KOS Shop (or a legacy per-item shop link).
create or replace function public.kos_payment_is_kos_shop(p_raw jsonb, p_description text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_blob text := lower(coalesce(p_raw::text, '') || ' ' || coalesce(p_description, ''));
  v_url text := lower(coalesce(public.kos_shop_checkout_url(), ''));
  v_slug text;
begin
  -- Match the shared campaign by slug kos-shop or name "KOS Shop",
  -- not only by /ticketing/ vs /online-store/ in the path.
  if v_blob ~ '(^|[^a-z0-9])kos-shop([^a-z0-9]|$)' or v_blob ~ '(^|[^a-z0-9])kos shop([^a-z0-9]|$)' then
    return true;
  end if;
  if v_url <> '' and position('placeholder' in v_url) = 0 then
    v_slug := regexp_replace(rtrim(v_url, '/'), '^.*/', '');
    if v_slug <> '' and position(v_slug in v_blob) > 0 then
      return true;
    end if;
    if position(v_url in v_blob) > 0 then
      return true;
    end if;
  end if;
  return false;
end;
$$;

revoke all on function public.kos_payment_is_kos_shop(jsonb, text) from public, anon;

create or replace function public.kos_shop_match_product_name(p_name text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select sp.id
  from public.shop_products sp
  where nullif(btrim(coalesce(p_name, '')), '') is not null
    and (
      lower(btrim(sp.name)) = lower(btrim(p_name))
      or lower(btrim(coalesce(sp.zeffy_campaign_name, ''))) = lower(btrim(p_name))
      or lower(btrim(sp.slug)) = lower(btrim(p_name))
    )
  order by case when sp.status = 'live' then 0 else 1 end, sp.sort_order
  limit 1;
$$;

revoke all on function public.kos_shop_match_product_name(text) from public, anon;

-- Map one Zeffy line to a display name, preferring shop_products.name.
create or replace function public.kos_shop_line_label(p_item jsonb, p_fallback text)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_raw text;
  v_id uuid;
  v_name text;
  v_opt text;
begin
  v_raw := nullif(btrim(coalesce(
    p_item->>'rate_title',
    p_item->>'name',
    p_item->>'title',
    p_item->>'product_name',
    p_item->'rate'->>'name',
    p_item->'rate'->>'title',
    p_fallback,
    ''
  )), '');
  v_id := public.kos_shop_match_product_name(v_raw);
  if v_id is not null then
    select sp.name into v_name from public.shop_products sp where sp.id = v_id;
  end if;
  v_name := coalesce(nullif(btrim(coalesce(v_name, '')), ''), v_raw, 'Krewe item');
  v_opt := nullif(btrim(coalesce(
    p_item->>'size',
    p_item->>'option',
    p_item->>'variant',
    p_item->>'variant_name',
    p_item->'variant'->>'name',
    p_item->'options'->>0,
    ''
  )), '');
  if v_opt is not null then
    return v_name || ' (' || v_opt || ')';
  end if;
  return v_name;
end;
$$;

revoke all on function public.kos_shop_line_label(jsonb, text) from public, anon;

create or replace function public.kos_shop_product_for_payment(
  p_raw jsonb, p_description text
) returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_obj jsonb;
  v_items jsonb;
  v_it jsonb;
  v_id uuid;
  v_name text;
begin
  -- Prefer matching each Zeffy line item to a catalog product by name.
  v_obj := public.kos_zeffy_payment_obj(p_raw);
  v_items := case when jsonb_typeof(v_obj->'items') = 'array' then v_obj->'items' else '[]'::jsonb end;
  for v_it in select * from jsonb_array_elements(v_items) loop
    v_name := coalesce(
      v_it->>'rate_title', v_it->>'name', v_it->>'title', v_it->>'product_name',
      v_it->'rate'->>'name', v_it->'rate'->>'title'
    );
    v_id := public.kos_shop_match_product_name(v_name);
    if v_id is not null then
      return v_id;
    end if;
  end loop;

  -- Legacy: one campaign URL or name per product.
  select sp.id into v_id
  from public.shop_products sp
  where sp.zeffy_url is not null
    and (
      position(lower(regexp_replace(rtrim(sp.zeffy_url, '/'), '^.*/', ''))
               in lower(coalesce(p_raw::text, ''))) > 0
      or lower(btrim(coalesce(p_description, ''))) in (
           lower(btrim(sp.name)), lower(btrim(coalesce(sp.zeffy_campaign_name, '')))
         )
    )
  order by length(sp.zeffy_url) desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  return null;
end;
$$;

revoke all on function public.kos_shop_product_for_payment(jsonb, text) from public, anon, authenticated;

create or replace function public.kos_payments_classify_shop()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.provider, '') = 'zeffy'
     and coalesce(new.product_kind, 'other') <> 'store'
     and (
       public.kos_payment_is_kos_shop(new.raw, new.description)
       or public.kos_shop_product_for_payment(new.raw, new.description) is not null
     )
  then
    new.product_kind := 'store';
    new.event_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists kos_payments_classify_shop on public.payments;
create trigger kos_payments_classify_shop
  before insert on public.payments
  for each row execute function public.kos_payments_classify_shop();


-- Live Zeffy webhooks store the payment under raw.data. raw.data.object is the
-- string 'payment', not an object, so do not coalesce that key first.
create or replace function public.kos_zeffy_payment_obj(p_raw jsonb)
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select case
    when jsonb_typeof(p_raw->'data') = 'object'
         and (
           jsonb_typeof(p_raw->'data'->'items') = 'array'
           or jsonb_typeof(p_raw->'data'->'buyer') = 'object'
           or (p_raw->'data' ? 'amount')
         )
      then p_raw->'data'
    when jsonb_typeof(p_raw->'data'->'payment') = 'object' then p_raw->'data'->'payment'
    when jsonb_typeof(p_raw->'data'->'object') = 'object' then p_raw->'data'->'object'
    when jsonb_typeof(p_raw->'payment') = 'object' then p_raw->'payment'
    when jsonb_typeof(p_raw) = 'object' then p_raw
    else '{}'::jsonb
  end;
$$;

revoke all on function public.kos_zeffy_payment_obj(jsonb) from public, anon;

-- Zeffy item.amount is already cents when it is a whole number (same rule as
-- the zeffy-webhook). Only multiply by 100 when the value looks like dollars.
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
  v := nullif(p_item->>'amount_cents', '')::numeric;
  if v is not null then return round(v)::integer; end if;
  v := nullif(p_item->>'amount_in_cents', '')::numeric;
  if v is not null then return round(v)::integer; end if;
  v := coalesce(nullif(p_item->>'amount', '')::numeric, nullif(p_item->>'total', '')::numeric);
  if v is not null then
    if v <> trunc(v) then return round(v * 100)::integer; end if;
    return round(v)::integer;
  end if;
  v := coalesce(nullif(p_item->>'unit_amount', '')::numeric, nullif(p_item->>'price', '')::numeric);
  if v is not null then
    v_qty := coalesce(nullif(p_item->>'quantity', '')::integer, 1);
    if v <> trunc(v) then v := v * 100; end if;
    return round(v * v_qty)::integer;
  end if;
  return null;
end;
$$;

revoke all on function public.kos_zeffy_item_cents(jsonb) from public, anon;

-- Phone from the payment, buyer object, or a phone/mobile question answer.
create or replace function public.kos_shop_buyer_phone(p_raw jsonb)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_obj jsonb;
  v_phone text;
  v_q jsonb;
  v_it jsonb;
  v_label text;
  v_ans text;
  v_type text;
begin
  v_obj := public.kos_zeffy_payment_obj(p_raw);
  v_phone := nullif(btrim(coalesce(
    v_obj->>'phone',
    v_obj->>'phone_number',
    v_obj->>'phoneNumber',
    v_obj->>'mobile',
    v_obj->>'mobile_phone',
    v_obj->'buyer'->>'phone',
    v_obj->'buyer'->>'phone_number',
    v_obj->'buyer'->>'phoneNumber',
    v_obj->'buyer'->>'mobile',
    case when jsonb_typeof(v_obj->'contact') = 'object' then coalesce(
      v_obj->'contact'->>'phone',
      v_obj->'contact'->>'phone_number',
      v_obj->'contact'->>'phoneNumber'
    ) else null end,
    ''
  )), '');
  if v_phone is not null then
    return v_phone;
  end if;
  for v_q in
    select q
    from jsonb_array_elements(
      case when jsonb_typeof(v_obj->'buyer_questions') = 'array' then v_obj->'buyer_questions' else '[]'::jsonb end
    ) q
  loop
    v_type := lower(coalesce(v_q->>'type', ''));
    v_label := lower(coalesce(v_q->>'question', v_q->>'label', v_q->>'name', ''));
    v_ans := nullif(btrim(coalesce(v_q->>'answer', v_q->>'value', v_q->>'response', '')), '');
    if v_ans is not null and (v_type ~ 'phone|mobile|tel' or v_label ~ 'phone|mobile|cell') then
      return v_ans;
    end if;
  end loop;
  for v_q in
    select q
    from jsonb_array_elements(
      case when jsonb_typeof(v_obj->'questions') = 'array' then v_obj->'questions' else '[]'::jsonb end
    ) q
  loop
    v_type := lower(coalesce(v_q->>'type', ''));
    v_label := lower(coalesce(v_q->>'question', v_q->>'label', v_q->>'name', ''));
    v_ans := nullif(btrim(coalesce(v_q->>'answer', v_q->>'value', v_q->>'response', '')), '');
    if v_ans is not null and (v_type ~ 'phone|mobile|tel' or v_label ~ 'phone|mobile|cell') then
      return v_ans;
    end if;
  end loop;
  for v_it in
    select it
    from jsonb_array_elements(
      case when jsonb_typeof(v_obj->'items') = 'array' then v_obj->'items' else '[]'::jsonb end
    ) it
  loop
    for v_q in
      select q
      from jsonb_array_elements(
        case when jsonb_typeof(v_it->'questions') = 'array' then v_it->'questions' else '[]'::jsonb end
      ) q
    loop
      v_type := lower(coalesce(v_q->>'type', ''));
      v_label := lower(coalesce(v_q->>'question', v_q->>'label', v_q->>'name', ''));
      v_ans := nullif(btrim(coalesce(v_q->>'answer', v_q->>'value', v_q->>'response', '')), '');
      if v_ans is not null and (v_type ~ 'phone|mobile|tel' or v_label ~ 'phone|mobile|cell') then
        return v_ans;
      end if;
    end loop;
  end loop;
  return null;
end;
$$;

revoke all on function public.kos_shop_buyer_phone(jsonb) from public, anon;

create or replace function public.kos_tel_href(p_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when nullif(btrim(coalesce(p_phone, '')), '') is null then null
    when left(regexp_replace(p_phone, '[^0-9+]', '', 'g'), 1) = '+'
      then 'tel:' || regexp_replace(p_phone, '[^0-9+]', '', 'g')
    else 'tel:' || regexp_replace(p_phone, '[^0-9]', '', 'g')
  end;
$$;

revoke all on function public.kos_tel_href(text) from public, anon;

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
begin
  v_obj := public.kos_zeffy_payment_obj(p_raw);
  v_items := case when jsonb_typeof(v_obj->'items') = 'array' then v_obj->'items' else '[]'::jsonb end;
  for v_it in select * from jsonb_array_elements(v_items) loop
    v_name := public.kos_shop_line_label(v_it, p_fallback_name);
    v_qty := coalesce(nullif(v_it->>'quantity', '')::int, 1);
    v_cents := public.kos_zeffy_item_cents(v_it);
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
  end if;
  return v_html;
end;
$$;

-- Subject line: list every matched item name, not only the first.
create or replace function public.kos_shop_order_title(p_raw jsonb, p_fallback text)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_obj jsonb;
  v_items jsonb;
  v_it jsonb;
  v_names text[] := '{}';
  v_label text;
begin
  v_obj := public.kos_zeffy_payment_obj(p_raw);
  v_items := case when jsonb_typeof(v_obj->'items') = 'array' then v_obj->'items' else '[]'::jsonb end;
  for v_it in select * from jsonb_array_elements(v_items) loop
    v_label := public.kos_shop_line_label(v_it, p_fallback);
    if v_label is not null and not (v_label = any (v_names)) then
      v_names := array_append(v_names, v_label);
    end if;
  end loop;
  if array_length(v_names, 1) is null then
    return coalesce(p_fallback, 'Krewe item');
  end if;
  if array_length(v_names, 1) = 1 then
    return v_names[1];
  end if;
  return array_length(v_names, 1)::text || ' items (' || array_to_string(v_names, ', ') || ')';
end;
$$;

-- Recreate queue function with the multi-item subject. Body already uses order lines.
create or replace function public.kos_queue_shop_order_emails(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
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

  if not exists (select 1 from public.outbound_emails where purpose = 'shop_po:' || pay.id) then
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

    -- Current Merchandise Chair(s) only. Treasurer and Secretary are the
    -- fallback when no chair with an email is listed on the roster.
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

  return jsonb_build_object('ok', true, 'queued', v_queued, 'po_recipients', to_jsonb(v_sent));
end;
$$;

revoke all on function public.kos_queue_shop_order_emails(uuid) from public, anon, authenticated;

create or replace function public.kos_payments_shop_order_emails()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.product_kind = 'store' then
    perform public.kos_queue_shop_order_emails(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists kos_payments_shop_order_emails on public.payments;
create trigger kos_payments_shop_order_emails
  after insert on public.payments
  for each row execute function public.kos_payments_shop_order_emails();



-- Shared shop: a priced product without a per-item Zeffy URL can go live.
-- Officers should still add the same item to the KOS Shop campaign in Zeffy.
create or replace function public.upsert_shop_product(p jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
 v_id uuid; v_row public.shop_products%rowtype; v_name text:=nullif(btrim(coalesce(p->>'name','')),''); v_slug text:=nullif(btrim(coalesce(p->>'slug','')),''); v_description text; v_image text; v_zeffy text; v_campaign text; v_status text; v_sizes text[]:='{}'; v_price integer; v_sort integer; v_raw numeric;
begin
 if not public.can_manage_shop() then return jsonb_build_object('ok',false,'message','Only board members, officers, and committee chairs can manage the shop.'); end if;
 v_id:=nullif(p->>'id','')::uuid;
 if v_name is null and v_id is not null then select name into v_name from public.shop_products where id=v_id; end if; if v_name is null then return jsonb_build_object('ok',false,'message','Product name is required.'); end if; v_description:=nullif(btrim(coalesce(p->>'description','')),''); v_image:=nullif(btrim(coalesce(p->>'image_url','')),''); v_zeffy:=nullif(btrim(coalesce(p->>'zeffy_url','')),''); v_campaign:=nullif(btrim(coalesce(p->>'zeffy_campaign_name','')),'');
 if p ? 'price_dollars' and nullif(p->>'price_dollars','') is not null then v_raw:=(p->>'price_dollars')::numeric*100; elsif p ? 'price_cents' and nullif(p->>'price_cents','') is not null then v_raw:=(p->>'price_cents')::numeric; end if;
 if v_raw is not null then v_price:=round(v_raw)::integer; end if; v_sort:=coalesce(nullif(p->>'sort_order','')::integer,0);
 if jsonb_typeof(p->'sizes')='array' then select coalesce(array_agg(nullif(btrim(x.value),'') order by x.ordinality) filter(where nullif(btrim(x.value),'') is not null),'{}') into v_sizes from jsonb_array_elements_text(p->'sizes') with ordinality x(value,ordinality);
 elsif p ? 'sizes' then select coalesce(array_agg(nullif(btrim(x),'') order by n) filter(where nullif(btrim(x),'') is not null),'{}') into v_sizes from unnest(regexp_split_to_array(coalesce(p->>'sizes',''),'\\s*,\\s*')) with ordinality z(x,n); end if;
 if v_slug is null then v_slug:=trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g')); end if; if v_slug='' then v_slug:='product-'||coalesce(v_id::text,extract(epoch from now())::bigint::text); end if;
 v_status:=nullif(p->>'status','');
 if v_status is null then
   v_status:=case when coalesce(v_price,0)>0 or v_zeffy is not null then 'live' else 'draft' end;
 end if;
 if v_status not in('draft','awaiting_zeffy','live','coming_soon','archived') then return jsonb_build_object('ok',false,'message','Invalid product status.'); end if;
 if v_id is null then
   insert into public.shop_products(slug,name,description,price_cents,image_url,sizes,zeffy_url,zeffy_campaign_name,status,sort_order,created_by) values(v_slug,v_name,v_description,v_price,v_image,v_sizes,v_zeffy,v_campaign,v_status,v_sort,auth.uid()) returning * into v_row;
 else
   update public.shop_products s set slug=coalesce(nullif(p->>'slug',''),s.slug),name=v_name,description=case when p ? 'description' then v_description else s.description end,price_cents=case when p ? 'price_dollars' or p ? 'price_cents' then v_price else s.price_cents end,image_url=case when p ? 'image_url' then v_image else s.image_url end,sizes=case when p ? 'sizes' then v_sizes else s.sizes end,zeffy_url=case when p ? 'zeffy_url' then v_zeffy else s.zeffy_url end,zeffy_campaign_name=case when p ? 'zeffy_campaign_name' then v_campaign else s.zeffy_campaign_name end,status=v_status,sort_order=v_sort,updated_at=now() where s.id=v_id returning * into v_row;
   if not found then return jsonb_build_object('ok',false,'message','Product not found.'); end if;
 end if;
 return jsonb_build_object('ok',true,'product',to_jsonb(v_row));
exception when unique_violation then return jsonb_build_object('ok',false,'message','That product slug is already in use.');
end; $$;

revoke all on function public.upsert_shop_product(jsonb) from public;
grant execute on function public.upsert_shop_product(jsonb) to authenticated;
