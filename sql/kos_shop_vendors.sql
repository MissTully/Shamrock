-- Vendor shirts: apparel vendors and vendor-fulfilled Shop products.
-- DRAFT (2026-09-30): not yet tested and NOT applied to Supabase. Do not run it
-- on the live project until it has been tested and reviewed.
-- Plan: VENDOR_SHIRTS_PLAN.md. Safe to run more than once.
--
-- A vendor-fulfilled product is ordered, paid for, printed and shipped by an
-- outside vendor (Red's Team Sports, Studio 19). The Krewe earns nothing from
-- these sales, so they never get a Zeffy campaign or a payments ledger row.
-- The Shop links members to the vendor's own store instead.

-- 1. Vendors -----------------------------------------------------------------
create table if not exists public.shop_vendors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text,
  store_url text not null,
  website_url text,
  contact_email text,
  contact_phone text,
  logo_url text,
  tagline text,
  fulfillment_note text,
  showcase_images text[] not null default '{}'::text[],
  season_label text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_vendors enable row level security;
drop policy if exists "Shop managers can read vendors" on public.shop_vendors;
create policy "Shop managers can read vendors" on public.shop_vendors
  for select to authenticated using (public.can_manage_shop());

-- 2. Vendor fields on products ----------------------------------------------
alter table public.shop_products
  add column if not exists fulfillment text not null default 'krewe',
  add column if not exists vendor_id uuid references public.shop_vendors(id) on delete set null,
  add column if not exists vendor_url text,
  add column if not exists price_is_from boolean not null default false,
  add column if not exists color_count integer,
  add column if not exists category text;

do $$ begin
  alter table public.shop_products drop constraint if exists shop_products_fulfillment_check;
  alter table public.shop_products add constraint shop_products_fulfillment_check
    check (fulfillment in ('krewe','vendor'));
  alter table public.shop_products drop constraint if exists shop_products_category_check;
  alter table public.shop_products add constraint shop_products_category_check
    check (category is null or category in ('womens','mens','unisex','outerwear','accessories'));
end $$;

create index if not exists shop_products_vendor_idx on public.shop_products(vendor_id);

-- 3. Save a product ----------------------------------------------------------
-- Same behavior as before for Krewe products (Zeffy rules unchanged). Vendor
-- products skip the Zeffy rules: a price with no Zeffy link does NOT make them
-- "awaiting Zeffy". A vendor product needs a vendor before it can go live.
create or replace function public.upsert_shop_product(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid := nullif(p->>'id','')::uuid;
  v_slug text;
  v_name text := nullif(btrim(p->>'name'),'');
  v_status text := coalesce(nullif(p->>'status',''), 'awaiting_zeffy');
  v_price numeric;
  v_price_cents int;
  v_sizes text[];
  v_zeffy text := nullif(btrim(p->>'zeffy_url'),'');
  v_fulfillment text := coalesce(nullif(p->>'fulfillment',''), 'krewe');
  v_vendor uuid := nullif(p->>'vendor_id','')::uuid;
  v_vendor_url text := nullif(btrim(p->>'vendor_url'),'');
  v_from boolean := coalesce((p->>'price_is_from')::boolean, false);
  v_colors int := nullif(p->>'color_count','')::int;
  v_category text := nullif(btrim(p->>'category'),'');
  v_row public.shop_products%rowtype;
begin
  if not public.can_manage_shop() then
    raise exception 'Only officers or the merchandise chair can manage shop products';
  end if;
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'Name is required');
  end if;
  if v_status not in ('draft','awaiting_zeffy','live','coming_soon','archived') then
    v_status := 'awaiting_zeffy';
  end if;
  if v_fulfillment not in ('krewe','vendor') then
    return jsonb_build_object('ok', false, 'message', 'Choose who fulfills this product.');
  end if;
  if v_category is not null and v_category not in ('womens','mens','unisex','outerwear','accessories') then
    return jsonb_build_object('ok', false, 'message', 'Invalid category.');
  end if;
  if v_vendor_url is not null and v_vendor_url !~* '^https?://' then
    return jsonb_build_object('ok', false, 'message', 'The vendor product link must start with https://');
  end if;
  if v_colors is not null and v_colors < 0 then v_colors := null; end if;

  v_slug := nullif(btrim(p->>'slug'),'');
  if v_slug is null then v_slug := public.shop_slugify(v_name); end if;
  v_slug := left(v_slug, 80);

  if p ? 'price_dollars' and nullif(p->>'price_dollars','') is not null then
    v_price := (p->>'price_dollars')::numeric;
    v_price_cents := round(v_price * 100)::int;
  elsif p ? 'price_cents' and nullif(p->>'price_cents','') is not null then
    v_price_cents := (p->>'price_cents')::int;
  else
    v_price_cents := null;
  end if;

  if jsonb_typeof(p->'sizes') = 'array' then
    select coalesce(array_agg(x), array['One size']::text[]) into v_sizes
    from jsonb_array_elements_text(p->'sizes') as t(x) where btrim(x) <> '';
  elsif nullif(btrim(p->>'sizes'),'') is not null then
    select coalesce(array_agg(btrim(x)), array['One size']::text[]) into v_sizes
    from unnest(string_to_array(p->>'sizes', ',')) as x where btrim(x) <> '';
  else
    v_sizes := array['One size']::text[];
  end if;

  if v_fulfillment = 'vendor' then
    -- Vendor items are paid on the vendor's site: no Zeffy link, no Zeffy wait.
    v_zeffy := null;
    if v_status = 'awaiting_zeffy' then v_status := 'draft'; end if;
    if v_status = 'live' then
      if v_vendor is null then
        return jsonb_build_object('ok', false, 'message', 'Choose a vendor before making this product live.');
      end if;
      if not exists (select 1 from public.shop_vendors where id = v_vendor) then
        return jsonb_build_object('ok', false, 'message', 'Vendor not found.');
      end if;
    end if;
  else
    v_vendor := null; v_vendor_url := null; v_from := false;
    -- If they already pasted a Zeffy URL, go live immediately.
    if v_zeffy is not null and v_status in ('draft','awaiting_zeffy') then
      v_status := 'live';
    elsif v_zeffy is null and v_status = 'live' and v_price_cents is not null then
      v_status := 'awaiting_zeffy';
    end if;
  end if;

  if v_id is null then
    insert into public.shop_products as sp (
      slug, name, description, price_cents, image_url, sizes,
      zeffy_url, zeffy_campaign_name, status, sort_order, is_demo,
      created_by, zeffy_requested_at, zeffy_linked_at, notes,
      fulfillment, vendor_id, vendor_url, price_is_from, color_count, category
    ) values (
      v_slug, v_name, nullif(btrim(p->>'description'),''), v_price_cents,
      nullif(btrim(p->>'image_url'),''), v_sizes,
      v_zeffy, nullif(btrim(p->>'zeffy_campaign_name'),''), v_status,
      coalesce((p->>'sort_order')::int, 100), coalesce((p->>'is_demo')::boolean, false),
      auth.uid(),
      case when v_status = 'awaiting_zeffy' then now() else null end,
      case when v_zeffy is not null then now() else null end,
      nullif(btrim(p->>'notes'),''),
      v_fulfillment, v_vendor, v_vendor_url, v_from, v_colors, v_category
    )
    on conflict (slug) do update set
      name = excluded.name,
      description = excluded.description,
      price_cents = excluded.price_cents,
      image_url = coalesce(excluded.image_url, sp.image_url),
      sizes = excluded.sizes,
      zeffy_url = case when excluded.fulfillment = 'vendor' then null else coalesce(excluded.zeffy_url, sp.zeffy_url) end,
      status = excluded.status,
      sort_order = excluded.sort_order,
      fulfillment = excluded.fulfillment,
      vendor_id = excluded.vendor_id,
      vendor_url = excluded.vendor_url,
      price_is_from = excluded.price_is_from,
      color_count = excluded.color_count,
      category = excluded.category,
      updated_at = now(),
      zeffy_requested_at = case when excluded.status = 'awaiting_zeffy' then coalesce(sp.zeffy_requested_at, now()) else sp.zeffy_requested_at end,
      zeffy_linked_at = case when excluded.zeffy_url is not null then now() else sp.zeffy_linked_at end
    returning * into v_row;
  else
    update public.shop_products set
      slug = v_slug,
      name = v_name,
      description = nullif(btrim(p->>'description'),''),
      price_cents = v_price_cents,
      image_url = coalesce(nullif(btrim(p->>'image_url'),''), image_url),
      sizes = v_sizes,
      zeffy_url = case when v_fulfillment = 'vendor' then null else coalesce(v_zeffy, zeffy_url) end,
      zeffy_campaign_name = coalesce(nullif(btrim(p->>'zeffy_campaign_name'),''), zeffy_campaign_name),
      status = v_status,
      sort_order = coalesce((p->>'sort_order')::int, sort_order),
      notes = coalesce(nullif(btrim(p->>'notes'),''), notes),
      fulfillment = v_fulfillment,
      vendor_id = v_vendor,
      vendor_url = v_vendor_url,
      price_is_from = v_from,
      color_count = v_colors,
      category = v_category,
      updated_at = now(),
      zeffy_requested_at = case when v_status = 'awaiting_zeffy' then coalesce(zeffy_requested_at, now()) else zeffy_requested_at end,
      zeffy_linked_at = case when v_zeffy is not null then now() else zeffy_linked_at end,
      zeffy_error = case when v_zeffy is not null then null else zeffy_error end
    where id = v_id
    returning * into v_row;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'Product not found');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'product', to_jsonb(v_row));
end;
$function$;
revoke all on function public.upsert_shop_product(jsonb) from public;
grant execute on function public.upsert_shop_product(jsonb) to authenticated;

-- 4. Save a vendor -----------------------------------------------------------
create or replace function public.upsert_shop_vendor(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid := nullif(p->>'id','')::uuid;
  v_name text := nullif(btrim(p->>'name'),'');
  v_slug text := nullif(btrim(p->>'slug'),'');
  v_store text := nullif(btrim(p->>'store_url'),'');
  v_site text := nullif(btrim(p->>'website_url'),'');
  v_logo text := nullif(btrim(p->>'logo_url'),'');
  v_images text[] := '{}'::text[];
  v_row public.shop_vendors%rowtype;
begin
  if not public.can_manage_shop() then
    return jsonb_build_object('ok', false, 'message', 'Only board members, officers, and committee chairs can manage vendors.');
  end if;
  if v_name is null then return jsonb_build_object('ok', false, 'message', 'Vendor name is required.'); end if;
  if v_store is null then return jsonb_build_object('ok', false, 'message', 'The vendor''s Krewe store link is required.'); end if;
  if v_store !~* '^https?://' or (v_site is not null and v_site !~* '^https?://') or (v_logo is not null and v_logo !~* '^https?://') then
    return jsonb_build_object('ok', false, 'message', 'Links must start with https://');
  end if;
  if jsonb_typeof(p->'showcase_images') = 'array' then
    select coalesce(array_agg(btrim(x) order by n), '{}'::text[]) into v_images
    from jsonb_array_elements_text(p->'showcase_images') with ordinality t(x, n)
    where btrim(x) ~* '^https?://';
  end if;
  if v_slug is null then v_slug := public.shop_slugify(v_name); end if;

  if v_id is null then
    insert into public.shop_vendors (slug, name, short_name, store_url, website_url, contact_email, contact_phone,
      logo_url, tagline, fulfillment_note, showcase_images, season_label, active, sort_order, created_by)
    values (left(v_slug, 80), v_name, nullif(btrim(p->>'short_name'),''), v_store, v_site,
      nullif(btrim(p->>'contact_email'),''), nullif(btrim(p->>'contact_phone'),''), v_logo,
      nullif(btrim(p->>'tagline'),''), nullif(btrim(p->>'fulfillment_note'),''), v_images,
      nullif(btrim(p->>'season_label'),''), coalesce((p->>'active')::boolean, true),
      coalesce(nullif(p->>'sort_order','')::int, 0), auth.uid())
    returning * into v_row;
  else
    update public.shop_vendors set
      name = v_name,
      short_name = nullif(btrim(p->>'short_name'),''),
      store_url = v_store,
      website_url = v_site,
      contact_email = nullif(btrim(p->>'contact_email'),''),
      contact_phone = nullif(btrim(p->>'contact_phone'),''),
      logo_url = v_logo,
      tagline = nullif(btrim(p->>'tagline'),''),
      fulfillment_note = nullif(btrim(p->>'fulfillment_note'),''),
      showcase_images = v_images,
      season_label = nullif(btrim(p->>'season_label'),''),
      active = coalesce((p->>'active')::boolean, active),
      sort_order = coalesce(nullif(p->>'sort_order','')::int, sort_order),
      updated_at = now()
    where id = v_id
    returning * into v_row;
    if not found then return jsonb_build_object('ok', false, 'message', 'Vendor not found.'); end if;
  end if;
  return jsonb_build_object('ok', true, 'vendor', to_jsonb(v_row));
exception when unique_violation then
  return jsonb_build_object('ok', false, 'message', 'A vendor with that name already exists.');
end;
$function$;
revoke all on function public.upsert_shop_vendor(jsonb) from public;
grant execute on function public.upsert_shop_vendor(jsonb) to authenticated;

-- 5. Public vendor list (the Shop is open to everyone) -----------------------
create or replace function public.list_public_shop_vendors()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'slug', v.slug, 'name', v.name, 'short_name', v.short_name,
      'store_url', v.store_url, 'website_url', v.website_url,
      'contact_email', v.contact_email, 'contact_phone', v.contact_phone,
      'logo_url', v.logo_url, 'tagline', v.tagline, 'fulfillment_note', v.fulfillment_note,
      'showcase_images', v.showcase_images, 'season_label', v.season_label
    ) order by v.sort_order, v.name), '[]'::jsonb)
  from public.shop_vendors v
  where v.active;
$function$;
revoke all on function public.list_public_shop_vendors() from public;
grant execute on function public.list_public_shop_vendors() to anon, authenticated;

-- list_public_shop_products() is unchanged: it returns live, non-demo rows of
-- shop_products, so it now also carries the new vendor columns.

-- 6. Starting vendors (only inserted once; officers edit them in Shop Studio) --
insert into public.shop_vendors (slug, name, short_name, store_url, website_url, contact_email, contact_phone,
  tagline, fulfillment_note, season_label, sort_order)
values
  ('reds-team-sports', 'Red''s Team Sports', 'RTS',
   'https://kreweofshamrock2025.itemorder.com/shop/category/107919/', 'http://www.redsteamsports.com/',
   'teamstores@redsteamsports.com', '813-612-5999',
   'Tees, tanks and outerwear with the Family Crest, Skeleton and Established logos.',
   'Ordered and paid on the vendor''s website and shipped to your home. Orders are processed weekly; allow 2–3 weeks.',
   '2025–26', 10),
  ('studio-19', 'Studio 19', 'Studio 19',
   'https://studio19shop.com/shop/ols/categories/krewe-of-shamrock', 'https://studio19shop.com',
   null, null,
   'The Shenanigator, the Purveyors raglan and the Krewe full-zip hoodie.',
   'Ordered and paid on the vendor''s website and shipped to your home. Orders are processed weekly; allow 2–3 weeks.',
   '2025–26', 20)
on conflict (slug) do nothing;
