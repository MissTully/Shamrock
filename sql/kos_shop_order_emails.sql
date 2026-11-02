-- kos_shop_order_emails.sql
-- Shop orders: buyer receipt + purchase order email to the Merchandise Chair(s).
--
-- 1. BEFORE INSERT on payments: any Zeffy payment whose campaign URL, slug or
--    name matches a shop_products row is reclassified product_kind = 'store'
--    (and event_id cleared). Backstop for the zeffy-webhook inferKind fix,
--    because Shop Studio products are Zeffy *ticketing* campaigns.
-- 2. AFTER INSERT on payments (store rows): queues into outbound_emails
--      a) a receipt to the buyer (payer_email)
--      b) a purchase order to every member whose officer_title ILIKE
--         '%Merchandise%' plus the Treasurer (officer_title ILIKE '%Treasurer%'),
--         looked up live at send time. If no Merchandise Chair is found, the
--         PO goes to the Treasurer and secretary@kreweofshamrock.com.
--    Idempotent per payment id: purpose is 'shop_receipt:<payment id>' /
--    'shop_po:<payment id>' and nothing is queued if that purpose exists.
-- The existing process-outbound-emails cron sends them through Resend.
-- Safe to re-run.

create or replace function public.kos_html_esc(t text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(coalesce(t, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- Find the shop product a payment belongs to (null if none).
create or replace function public.kos_shop_product_for_payment(
  p_raw jsonb, p_description text
) returns uuid
language sql stable security definer set search_path = '' as $$
  select sp.id
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
$$;

create or replace function public.kos_payments_classify_shop()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.provider, '') = 'zeffy'
     and coalesce(new.product_kind, 'other') <> 'store'
     and public.kos_shop_product_for_payment(new.raw, new.description) is not null
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

-- Item lines as HTML table rows, from Zeffy items when present.
create or replace function public.kos_shop_order_lines(
  p_raw jsonb, p_fallback_name text, p_amount_cents int
) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_obj jsonb;
  v_items jsonb;
  v_it jsonb;
  v_html text := '';
  v_name text;
  v_qty int;
  v_cents int;
begin
  v_obj := coalesce(p_raw->'data'->'object', p_raw->'data', p_raw->'payment', p_raw, '{}'::jsonb);
  v_items := case when jsonb_typeof(v_obj->'items') = 'array' then v_obj->'items' else '[]'::jsonb end;
  for v_it in select * from jsonb_array_elements(v_items) loop
    v_name := coalesce(v_it->>'rate_title', v_it->>'name', v_it->>'title', v_it->>'product_name', p_fallback_name, 'Krewe item');
    v_qty := coalesce(nullif(v_it->>'quantity', '')::int, 1);
    v_cents := coalesce(nullif(v_it->>'amount_cents', '')::int,
                        (nullif(v_it->>'amount', '')::numeric * 100)::int);
    v_html := v_html || '<tr><td style="padding:6px 0">' || public.kos_html_esc(v_name)
      || case when coalesce(v_it->>'size', v_it->>'option', '') <> ''
              then ' (' || public.kos_html_esc(coalesce(v_it->>'size', v_it->>'option')) || ')' else '' end
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

create or replace function public.kos_queue_shop_order_emails(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
  v_product text;
  v_lines text;
  v_total text;
  v_date text;
  v_order text;
  v_buyer text;
  v_first text;
  v_member text;
  v_table text;
  v_body text;
  v_r record;
  v_chairs int := 0;
  v_sent text[] := '{}';
  v_queued int := 0;
  v_phone text;
begin
  select * into pay from public.payments where id = p_payment_id;
  if not found or pay.product_kind <> 'store' then
    return jsonb_build_object('ok', false, 'reason', 'not_store');
  end if;
  if coalesce(pay.status, 'succeeded') not in ('succeeded', 'paid', 'completed', 'succeded') then
    return jsonb_build_object('ok', false, 'reason', 'not_paid');
  end if;

  select sp.name into v_product from public.shop_products sp
   where sp.id = public.kos_shop_product_for_payment(pay.raw, pay.description);
  v_product := coalesce(v_product, pay.description, 'Krewe item');
  v_lines := public.kos_shop_order_lines(pay.raw, v_product, pay.amount_cents);
  v_total := '$' || to_char(coalesce(pay.amount_cents, 0) / 100.0, 'FM999990.00');
  v_date := to_char(pay.created_at at time zone 'America/New_York', 'FMMonth FMDD, YYYY');
  v_order := coalesce(pay.provider_payment_id, pay.id::text);
  v_buyer := coalesce(pay.payer_name, pay.payer_email, 'Shop customer');
  v_first := split_part(coalesce(pay.payer_name, ''), ' ', 1);
  v_phone := coalesce(pay.raw#>>'{data,object,phone}', pay.raw#>>'{data,phone}', pay.raw#>>'{data,buyer,phone}');
  select m.first_name || ' ' || m.last_name into v_member from public.members m where m.id = pay.member_id;

  v_table := '<table style="width:100%;border-collapse:collapse;font-size:15px"><tr style="border-bottom:1px solid #d9e6dc">'
    || '<th style="text-align:left;padding:6px 0">Item</th><th style="padding:6px 0">Qty</th><th style="text-align:right;padding:6px 0">Price</th></tr>'
    || v_lines
    || '<tr style="border-top:1px solid #d9e6dc"><td style="padding:8px 0;font-weight:700">Total paid</td><td></td><td style="padding:8px 0;text-align:right;font-weight:700">'
    || v_total || '</td></tr></table>';

  -- a) Buyer receipt
  if pay.payer_email is not null
     and not exists (select 1 from public.outbound_emails where purpose = 'shop_receipt:' || pay.id)
  then
    v_body := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d24">'
      || '<div style="background:#0b5d33;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><div style="font-size:20px;font-weight:700">Krewe of Shamrock</div><div style="font-size:14px;opacity:.9">Order receipt</div></div>'
      || '<div style="border:1px solid #d9e6dc;border-top:0;padding:22px;border-radius:0 0 10px 10px">'
      || '<p>Hi' || case when v_first <> '' then ' ' || public.kos_html_esc(v_first) else '' end || ',</p>'
      || '<p>Thank you for supporting the Krewe of Shamrock! Here is your receipt.</p>'
      || '<p style="font-size:14px;color:#4a5a50">Order number: <b>' || public.kos_html_esc(v_order) || '</b><br>Date: ' || v_date || '</p>'
      || v_table
      || '<p style="background:#eef6f0;padding:12px 14px;border-radius:8px"><b>Getting your items:</b> a Merchandise Chair will contact you to arrange getting your items.</p>'
      || '<p>Questions? Reply to this email or write to <a href="mailto:secretary@kreweofshamrock.com">secretary@kreweofshamrock.com</a>.</p>'
      || '<p>Slainte,<br>Krewe of Shamrock</p></div></div>';
    perform public.enqueue_email(pay.payer_email, pay.payer_name,
      'Your Krewe of Shamrock order receipt', v_body, 'shop_receipt:' || pay.id, pay.member_id);
    v_queued := v_queued + 1;
  end if;

  -- b) Purchase order to Merchandise Chair(s) + Treasurer
  if not exists (select 1 from public.outbound_emails where purpose = 'shop_po:' || pay.id) then
    select count(*) into v_chairs from public.members m
     where m.officer_title ilike '%Merchandise%' and position('@' in coalesce(m.email, '')) > 0;

    v_body := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d24">'
      || '<div style="background:#0b5d33;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><div style="font-size:20px;font-weight:700">New shop order</div><div style="font-size:14px;opacity:.9">Purchase order ' || public.kos_html_esc(v_order) || '</div></div>'
      || '<div style="border:1px solid #d9e6dc;border-top:0;padding:22px;border-radius:0 0 10px 10px">'
      || '<p>Hi,</p><p>A new order came in through the website shop. Please contact the buyer to arrange getting their items to them.</p>'
      || '<table style="font-size:15px;margin-bottom:14px">'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Buyer</td><td><b>' || public.kos_html_esc(v_buyer) || '</b></td></tr>'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Email</td><td>' || case when pay.payer_email is null then 'Not provided' else '<a href="mailto:' || public.kos_html_esc(pay.payer_email) || '">' || public.kos_html_esc(pay.payer_email) || '</a>' end || '</td></tr>'
      || case when v_phone is not null then '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Phone</td><td>' || public.kos_html_esc(v_phone) || '</td></tr>' else '' end
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Member</td><td>' || case when v_member is null then 'Not matched to a member' else 'Yes, ' || public.kos_html_esc(v_member) end || '</td></tr>'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Date</td><td>' || v_date || '</td></tr>'
      || '<tr><td style="padding:3px 12px 3px 0;color:#4a5a50">Order number</td><td>' || public.kos_html_esc(v_order) || '</td></tr></table>'
      || v_table
      || case when v_chairs = 0 then '<p style="color:#9a3b00"><b>Note:</b> no Merchandise Chair is listed in the roster, so this went to the Treasurer and Secretary.</p>' else '' end
      || '<p><a href="https://www.kreweofshamrock.com/members.html" style="color:#0b5d33;font-weight:700">Open Shop Studio in the Member Hub</a></p></div></div>';

    for v_r in
      select m.email, m.first_name || ' ' || m.last_name as nm, m.id
        from public.members m
       where position('@' in coalesce(m.email, '')) > 0
         and (m.officer_title ilike '%Merchandise%' or m.officer_title ilike '%Treasurer%')
      union all
      select 'secretary@kreweofshamrock.com', 'Krewe Secretary', null::uuid where v_chairs = 0
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

revoke all on function public.kos_queue_shop_order_emails(uuid) from public, anon, authenticated;
revoke all on function public.kos_shop_product_for_payment(jsonb, text) from public, anon, authenticated;
