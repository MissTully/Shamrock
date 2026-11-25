-- kos_shop_inventory.sql
-- Shop stock counts that mirror Zeffy. Apply this file in the Supabase
-- SQL editor for project oazwkwflgbthojvnclfc. Deploying the website
-- does not run it. Do not apply automatically. Safe to run more than once.
--
-- Zeffy is the source of truth and the hard cap (Total available under
-- More options, or Manage inventory for variants). The documented Zeffy
-- API and payment webhooks do not expose remaining quantity or sold-out
-- state, so this file does not pull live Zeffy counts. The site count is
-- a manual starting mirror plus automatic decrement when a paid store
-- payment is recorded.
--
-- What this adds:
--   * shop_products.stock_on_hand integer, null meaning not mirrored yet.
--     0 means sold out on the public shop page.
--   * Shop Studio (upsert_shop_product) can set and edit the count, labeled
--     Match Zeffy Total available, with a Sold out path that stores 0.
--   * After a paid store payment is recorded, kos_apply_shop_stock_for_payment
--     decrements stock for each line item whose name matches a tracked
--     product. Idempotent per payment and product. Unmatched lines (for
--     example a Zeffy tip) and untracked products are skipped.
--   * This does not change historical payments already in the table.
--     Do not re-insert old shop payments after you set counts, or the
--     trigger will decrement them.
--
-- Limits:
--   * Matching uses the same name match as shop order emails
--     (product name, Zeffy campaign name, or slug). If a Zeffy ticket
--     title does not match, adjust the count by hand in Shop Studio.
--   * The public shop shows Sold out and removes that card's link.
--     Buyers can still purchase the item in the shared KOS Shop unless
--     Tammy also sets Total available to the number already sold, or
--     hides the item, in Zeffy.

alter table public.shop_products
  add column if not exists stock_on_hand integer;

do $$ begin
  alter table public.shop_products drop constraint if exists shop_products_stock_on_hand_check;
  alter table public.shop_products
    add constraint shop_products_stock_on_hand_check
    check (stock_on_hand is null or stock_on_hand >= 0);
exception when others then null; end $$;

comment on column public.shop_products.stock_on_hand is
  'Site mirror of Zeffy remaining count. Null means not mirrored yet. 0 is sold out on the public shop.';

create table if not exists public.shop_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  product_id uuid not null references public.shop_products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, product_id)
);

comment on table public.shop_stock_ledger is
  'Idempotent record of stock decrements from store payments. One row per payment and product.';

create index if not exists shop_stock_ledger_product_idx
  on public.shop_stock_ledger(product_id, created_at desc);

alter table public.shop_stock_ledger enable row level security;

drop policy if exists "Shop managers can read stock ledger" on public.shop_stock_ledger;
create policy "Shop managers can read stock ledger"
  on public.shop_stock_ledger
  for select to authenticated
  using (public.can_manage_shop());

-- Officers set and edit stock_on_hand through this RPC. Other product fields
-- stay the same as sql/kos_shop_unified_checkout.sql.
create or replace function public.upsert_shop_product(p jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
 v_id uuid; v_row public.shop_products%rowtype; v_name text:=nullif(btrim(coalesce(p->>'name','')),''); v_slug text:=nullif(btrim(coalesce(p->>'slug','')),''); v_description text; v_image text; v_zeffy text; v_campaign text; v_status text; v_sizes text[]:='{}'; v_price integer; v_sort integer; v_raw numeric;
 v_stock integer; v_stock_set boolean:=false;
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
 if p ? 'stock_on_hand' then
   v_stock_set:=true;
   if jsonb_typeof(p->'stock_on_hand')='null' or nullif(btrim(coalesce(p->>'stock_on_hand','')),'') is null then
     v_stock:=null;
   else
     begin
       v_stock:=(p->>'stock_on_hand')::integer;
     exception when others then
       return jsonb_build_object('ok',false,'message','Match Zeffy Total available must be a whole number of zero or more, or left blank.');
     end;
     if v_stock < 0 then
       return jsonb_build_object('ok',false,'message','Match Zeffy Total available must be a whole number of zero or more, or left blank.');
     end if;
   end if;
 end if;
 if v_id is null then
   insert into public.shop_products(slug,name,description,price_cents,image_url,sizes,zeffy_url,zeffy_campaign_name,status,sort_order,stock_on_hand,created_by) values(v_slug,v_name,v_description,v_price,v_image,v_sizes,v_zeffy,v_campaign,v_status,v_sort,v_stock,auth.uid()) returning * into v_row;
 else
   update public.shop_products s set slug=coalesce(nullif(p->>'slug',''),s.slug),name=v_name,description=case when p ? 'description' then v_description else s.description end,price_cents=case when p ? 'price_dollars' or p ? 'price_cents' then v_price else s.price_cents end,image_url=case when p ? 'image_url' then v_image else s.image_url end,sizes=case when p ? 'sizes' then v_sizes else s.sizes end,zeffy_url=case when p ? 'zeffy_url' then v_zeffy else s.zeffy_url end,zeffy_campaign_name=case when p ? 'zeffy_campaign_name' then v_campaign else s.zeffy_campaign_name end,status=v_status,sort_order=v_sort,stock_on_hand=case when v_stock_set then v_stock else s.stock_on_hand end,updated_at=now() where s.id=v_id returning * into v_row;
   if not found then return jsonb_build_object('ok',false,'message','Product not found.'); end if;
 end if;
 return jsonb_build_object('ok',true,'product',to_jsonb(v_row));
exception when unique_violation then return jsonb_build_object('ok',false,'message','That product slug is already in use.');
end; $$;

revoke all on function public.upsert_shop_product(jsonb) from public;
grant execute on function public.upsert_shop_product(jsonb) to authenticated;

-- Decrement tracked stock for a recorded store payment. Safe to call again.
create or replace function public.kos_apply_shop_stock_for_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  pay public.payments%rowtype;
  v_obj jsonb;
  v_items jsonb;
  v_it jsonb;
  v_name text;
  v_qty integer;
  v_id uuid;
  v_pending jsonb := '[]'::jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_row record;
  v_inserted integer;
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_payment');
  end if;
  select * into pay from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if pay.product_kind <> 'store' then
    return jsonb_build_object('ok', false, 'reason', 'not_store');
  end if;
  if coalesce(pay.status, 'succeeded') not in ('succeeded', 'paid', 'completed', 'succeded') then
    return jsonb_build_object('ok', false, 'reason', 'not_paid');
  end if;

  v_obj := public.kos_zeffy_payment_obj(pay.raw);
  v_items := case when jsonb_typeof(v_obj->'items') = 'array' then v_obj->'items' else '[]'::jsonb end;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    v_items := jsonb_build_array(jsonb_build_object(
      'name', coalesce(pay.description, 'Krewe item'),
      'quantity', 1
    ));
  end if;

  for v_it in select * from jsonb_array_elements(v_items) loop
    v_name := coalesce(
      v_it->>'rate_title', v_it->>'name', v_it->>'title', v_it->>'product_name',
      v_it->'rate'->>'name', v_it->'rate'->>'title'
    );
    begin
      v_qty := coalesce(nullif(v_it->>'quantity', '')::integer, 1);
    exception when others then
      v_qty := 1;
    end;
    if v_qty is null or v_qty < 1 then
      v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', 'bad_quantity');
      continue;
    end if;
    v_id := public.kos_shop_match_product_name(v_name);
    if v_id is null then
      v_skipped := v_skipped || jsonb_build_object('name', coalesce(v_name, ''), 'reason', 'unmatched');
      continue;
    end if;
    v_pending := v_pending || jsonb_build_object('product_id', v_id, 'name', v_name, 'quantity', v_qty);
  end loop;

  -- Sum quantities per matched product so one payment cannot double-apply
  -- the same item if Zeffy splits it across two lines.
  for v_row in
    select sp.id as product_id,
           sp.name,
           sp.stock_on_hand,
           sum((x.elem->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(v_pending) x(elem)
      join public.shop_products sp on sp.id = (x.elem->>'product_id')::uuid
     group by sp.id, sp.name, sp.stock_on_hand
  loop
    if v_row.stock_on_hand is null then
      v_skipped := v_skipped || jsonb_build_object('name', v_row.name, 'product_id', v_row.product_id, 'reason', 'untracked');
      continue;
    end if;

    perform 1 from public.shop_products where id = v_row.product_id for update;

    insert into public.shop_stock_ledger(payment_id, product_id, quantity)
    values (p_payment_id, v_row.product_id, v_row.quantity)
    on conflict (payment_id, product_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      v_skipped := v_skipped || jsonb_build_object('name', v_row.name, 'product_id', v_row.product_id, 'reason', 'already_applied');
      continue;
    end if;

    update public.shop_products
       set stock_on_hand = greatest(0, stock_on_hand - v_row.quantity),
           updated_at = now()
     where id = v_row.product_id
       and stock_on_hand is not null;

    v_applied := v_applied || jsonb_build_object(
      'name', v_row.name,
      'product_id', v_row.product_id,
      'quantity', v_row.quantity
    );
  end loop;

  return jsonb_build_object('ok', true, 'applied', v_applied, 'skipped', v_skipped);
end;
$$;

revoke all on function public.kos_apply_shop_stock_for_payment(uuid) from public, anon, authenticated;

create or replace function public.kos_payments_shop_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.product_kind = 'store' then
    perform public.kos_apply_shop_stock_for_payment(new.id);
  end if;
  return new;
exception when others then
  raise warning 'kos_payments_shop_stock failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.kos_payments_shop_stock() from public, anon, authenticated;

drop trigger if exists kos_payments_shop_stock on public.payments;
create trigger kos_payments_shop_stock
  after insert on public.payments
  for each row execute function public.kos_payments_shop_stock();
