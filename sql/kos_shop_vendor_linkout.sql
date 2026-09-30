-- ============================================================
-- Krewe of Shamrock — vendor apparel link-out (Phase 1)
--
-- Apply this file in the Supabase SQL editor for project
-- oazwkwflgbthojvnclfc. Deploying the website does not run it.
-- Requires sql/kos_shop_studio.sql (can_manage_shop) to already be applied.
-- Safe to run more than once.
--
-- Shop Studio and shop_products stay Krewe / Zeffy items only.
-- These tables store a vendor's name, store link, and photos.
-- There are no price columns. Public pages read through the
-- list functions. Officers write through the upsert functions,
-- which require can_manage_shop() — the same crowd as Shop Studio.
-- ============================================================

-- ---------- 1. shop_vendors ----------
create table if not exists public.shop_vendors (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  short_name       text not null,
  store_url        text not null,
  website_url      text,
  contact_email    text,
  contact_phone    text,
  logo_url         text,
  showcase_images  text[] not null default '{}'::text[],
  blurb            text,
  fulfillment_note text,
  season_label     text,
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.shop_vendors
  add column if not exists name text,
  add column if not exists short_name text,
  add column if not exists store_url text,
  add column if not exists website_url text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists logo_url text,
  add column if not exists showcase_images text[] not null default '{}'::text[],
  add column if not exists blurb text,
  add column if not exists fulfillment_note text,
  add column if not exists season_label text,
  add column if not exists active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_vendors_short_name_key'
      and conrelid = 'public.shop_vendors'::regclass
  ) then
    alter table public.shop_vendors
      add constraint shop_vendors_short_name_key unique (short_name);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_vendors_store_url_http_check'
      and conrelid = 'public.shop_vendors'::regclass
  ) then
    alter table public.shop_vendors
      add constraint shop_vendors_store_url_http_check
      check (store_url ~* '^https?://[^[:space:]]+$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_vendors_website_url_http_check'
      and conrelid = 'public.shop_vendors'::regclass
  ) then
    alter table public.shop_vendors
      add constraint shop_vendors_website_url_http_check
      check (website_url is null or website_url ~* '^https?://[^[:space:]]+$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_vendors_logo_url_http_check'
      and conrelid = 'public.shop_vendors'::regclass
  ) then
    alter table public.shop_vendors
      add constraint shop_vendors_logo_url_http_check
      check (logo_url is null or logo_url ~* '^https?://[^[:space:]]+$');
  end if;
end $$;

create index if not exists shop_vendors_public_order_idx
  on public.shop_vendors (sort_order, name)
  where active;

-- ---------- 2. shop_vendor_looks (photo cards, still no price) ----------
create table if not exists public.shop_vendor_looks (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.shop_vendors(id) on delete cascade,
  name        text not null,
  image_url   text,
  product_url text,
  category    text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.shop_vendor_looks
  add column if not exists vendor_id uuid references public.shop_vendors(id) on delete cascade,
  add column if not exists name text,
  add column if not exists image_url text,
  add column if not exists product_url text,
  add column if not exists category text,
  add column if not exists active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- A shop photo is an http(s) URL or a file stored on this site under /assets/img/store/.
-- Store links and product links stay http(s) only.
create or replace function public.kos_shop_image_ref(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when btrim(p_value) ~* '^https?://[^[:space:]]+$' then btrim(p_value)
    when btrim(p_value) ~ '^/assets/img/store/[A-Za-z0-9][A-Za-z0-9._/-]*\.(png|jpe?g|webp|gif)$'
      and btrim(p_value) !~ '\.\.'
      then btrim(p_value)
    else null
  end;
$$;

alter table public.shop_vendor_looks drop constraint if exists shop_vendor_looks_image_url_http_check;
alter table public.shop_vendor_looks drop constraint if exists shop_vendor_looks_image_url_check;
alter table public.shop_vendor_looks
  add constraint shop_vendor_looks_image_url_check
  check (
    image_url is null
    or (
      public.kos_shop_image_ref(image_url) is not null
      and public.kos_shop_image_ref(image_url) = image_url
    )
  );

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_vendor_looks_product_url_http_check'
      and conrelid = 'public.shop_vendor_looks'::regclass
  ) then
    alter table public.shop_vendor_looks
      add constraint shop_vendor_looks_product_url_http_check
      check (product_url is null or product_url ~* '^https?://[^[:space:]]+$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_vendor_looks_category_check'
      and conrelid = 'public.shop_vendor_looks'::regclass
  ) then
    alter table public.shop_vendor_looks
      add constraint shop_vendor_looks_category_check
      check (category is null or category in ('womens', 'mens', 'unisex', 'outerwear'));
  end if;
end $$;

create index if not exists shop_vendor_looks_public_order_idx
  on public.shop_vendor_looks (vendor_id, sort_order, name)
  where active;

-- Fail the script if a price-like column ever lands on these tables.
do $$ begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('shop_vendors', 'shop_vendor_looks')
      and column_name ~* '(price|cost|amount|cents)'
  ) then
    raise exception 'Vendor apparel tables must not store prices.';
  end if;
end $$;

comment on table public.shop_vendors is
  'Vendor apparel link-out: name, store URL, and photos. No prices. Not part of shop_products or Zeffy.';
comment on table public.shop_vendor_looks is
  'Optional photo cards for a vendor store. No price, cart, or size columns.';

-- ---------- 3. updated_at ----------
create or replace function public.kos_shop_vendor_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.kos_shop_vendor_set_updated_at() from public, anon, authenticated;
-- The table owner must still be able to fire the trigger after the revoke above.
do $$ begin
  execute format('grant execute on function public.kos_shop_vendor_set_updated_at() to %I', current_user);
end $$;

drop trigger if exists trg_shop_vendors_updated_at on public.shop_vendors;
create trigger trg_shop_vendors_updated_at
  before update on public.shop_vendors
  for each row execute function public.kos_shop_vendor_set_updated_at();

drop trigger if exists trg_shop_vendor_looks_updated_at on public.shop_vendor_looks;
create trigger trg_shop_vendor_looks_updated_at
  before update on public.shop_vendor_looks
  for each row execute function public.kos_shop_vendor_set_updated_at();

-- ---------- 4. RLS: public reads go through the list functions ----------
alter table public.shop_vendors enable row level security;
alter table public.shop_vendor_looks enable row level security;

drop policy if exists "Shop managers can read vendors" on public.shop_vendors;
create policy "Shop managers can read vendors" on public.shop_vendors
  for select to authenticated
  using (public.can_manage_shop());

drop policy if exists "Shop managers can read vendor looks" on public.shop_vendor_looks;
create policy "Shop managers can read vendor looks" on public.shop_vendor_looks
  for select to authenticated
  using (public.can_manage_shop());

revoke all on table public.shop_vendors from anon;
revoke all on table public.shop_vendor_looks from anon;
revoke insert, update, delete on table public.shop_vendors from public, anon, authenticated;
revoke insert, update, delete on table public.shop_vendor_looks from public, anon, authenticated;
grant select on table public.shop_vendors to authenticated;
grant select on table public.shop_vendor_looks to authenticated;

-- ---------- 5. Public read ----------
create or replace function public.list_public_shop_vendors()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(s.obj order by s.sort_order, s.name)
      from (
        select
          v.sort_order,
          v.name,
          jsonb_build_object(
            'id', v.id,
            'name', v.name,
            'short_name', v.short_name,
            'store_url', v.store_url,
            'website_url', v.website_url,
            'contact_email', v.contact_email,
            'contact_phone', v.contact_phone,
            'logo_url', v.logo_url,
            'showcase_images', coalesce((
              select jsonb_agg(to_jsonb(public.kos_shop_image_ref(t.u)) order by t.ord)
              from unnest(coalesce(v.showcase_images, '{}'::text[])) with ordinality as t(u, ord)
              where public.kos_shop_image_ref(t.u) is not null
            ), '[]'::jsonb),
            'blurb', v.blurb,
            'fulfillment_note', v.fulfillment_note,
            'season_label', v.season_label,
            'sort_order', v.sort_order
          ) as obj
        from public.shop_vendors v
        where v.active
          and v.store_url ~* '^https?://[^[:space:]]+$'
      ) s
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.list_public_shop_vendors() from public;
grant execute on function public.list_public_shop_vendors() to anon, authenticated;

create or replace function public.list_public_shop_vendor_looks()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(s.obj order by s.vendor_sort, s.sort_order, s.name)
      from (
        select
          v.sort_order as vendor_sort,
          l.sort_order,
          l.name,
          jsonb_build_object(
            'id', l.id,
            'vendor_id', l.vendor_id,
            'name', l.name,
            'image_url', public.kos_shop_image_ref(l.image_url),
            'product_url', case
              when btrim(coalesce(l.product_url, '')) ~* '^https?://[^[:space:]]+$' then btrim(l.product_url)
              else null
            end,
            'outbound_url', coalesce(
              case
                when btrim(coalesce(l.product_url, '')) ~* '^https?://[^[:space:]]+$' then btrim(l.product_url)
                else null
              end,
              case
                when v.store_url ~* '^https?://[^[:space:]]+$' then v.store_url
                else null
              end
            ),
            'category', l.category,
            'sort_order', l.sort_order
          ) as obj
        from public.shop_vendor_looks l
        join public.shop_vendors v on v.id = l.vendor_id
        where l.active
          and v.active
          and v.store_url ~* '^https?://[^[:space:]]+$'
      ) s
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.list_public_shop_vendor_looks() from public;
grant execute on function public.list_public_shop_vendor_looks() to anon, authenticated;

-- ---------- 6. Officer writes ----------
create or replace function public.upsert_shop_vendor(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.shop_vendors%rowtype;
  v_name text;
  v_short text;
  v_store text;
  v_website text;
  v_email text;
  v_phone text;
  v_logo text;
  v_blurb text;
  v_note text;
  v_season text;
  v_images text[] := '{}'::text[];
  v_active boolean;
  v_sort integer;
  v_bad_image text;
begin
  if not public.can_manage_shop() then
    return jsonb_build_object('ok', false, 'message', 'Only board members, officers, and committee chairs can manage the shop.');
  end if;
  if p ? 'price' or p ? 'price_cents' or p ? 'price_dollars' or p ? 'amount' or p ? 'amount_cents' or p ? 'cost' or p ? 'sizes' then
    return jsonb_build_object('ok', false, 'message', 'Vendor apparel does not store a price or sizes. Those stay on the vendor site.');
  end if;

  v_id := nullif(btrim(coalesce(p->>'id', '')), '')::uuid;
  v_name := nullif(btrim(coalesce(p->>'name', '')), '');
  if v_name is null and v_id is not null then
    select name into v_name from public.shop_vendors where id = v_id;
  end if;
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'Vendor name is required.');
  end if;
  if char_length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'message', 'Vendor name is too long.');
  end if;

  v_store := nullif(btrim(coalesce(p->>'store_url', '')), '');
  if v_store is null and v_id is not null and not (p ? 'store_url') then
    select store_url into v_store from public.shop_vendors where id = v_id;
  end if;
  if v_store is null or v_store !~* '^https?://[^[:space:]]+$' then
    return jsonb_build_object('ok', false, 'message', 'Store link must start with http:// or https://.');
  end if;

  v_short := nullif(btrim(coalesce(p->>'short_name', '')), '');
  if v_short is null and v_id is not null and not (p ? 'short_name') then
    select short_name into v_short from public.shop_vendors where id = v_id;
  end if;
  if v_short is null then
    v_short := left(v_name, 40);
  end if;
  if char_length(v_short) > 40 then
    return jsonb_build_object('ok', false, 'message', 'Short name must be 40 characters or fewer.');
  end if;

  v_website := nullif(btrim(coalesce(p->>'website_url', '')), '');
  if v_website is not null and v_website !~* '^https?://[^[:space:]]+$' then
    return jsonb_build_object('ok', false, 'message', 'Website link must start with http:// or https://.');
  end if;
  v_logo := nullif(btrim(coalesce(p->>'logo_url', '')), '');
  if v_logo is not null and v_logo !~* '^https?://[^[:space:]]+$' then
    return jsonb_build_object('ok', false, 'message', 'Logo link must start with http:// or https://.');
  end if;

  v_email := nullif(btrim(coalesce(p->>'contact_email', '')), '');
  if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'message', 'Contact email does not look like an email address.');
  end if;
  v_phone := nullif(btrim(coalesce(p->>'contact_phone', '')), '');
  if v_phone is not null and (char_length(v_phone) > 40 or v_phone ~ '[[:cntrl:]]') then
    return jsonb_build_object('ok', false, 'message', 'Contact phone is not valid.');
  end if;

  v_blurb := nullif(btrim(coalesce(p->>'blurb', '')), '');
  v_note := nullif(btrim(coalesce(p->>'fulfillment_note', '')), '');
  v_season := nullif(btrim(coalesce(p->>'season_label', '')), '');
  if char_length(coalesce(v_blurb, '')) > 280 then
    return jsonb_build_object('ok', false, 'message', 'Blurb must be 280 characters or fewer.');
  end if;
  if char_length(coalesce(v_note, '')) > 400 then
    return jsonb_build_object('ok', false, 'message', 'Fulfillment note must be 400 characters or fewer.');
  end if;
  if char_length(coalesce(v_season, '')) > 40 then
    return jsonb_build_object('ok', false, 'message', 'Season label must be 40 characters or fewer.');
  end if;

  if p ? 'showcase_images' then
    if jsonb_typeof(p->'showcase_images') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'message', 'Showcase photos must be a list of links.');
    end if;
    select btrim(e.value) into v_bad_image
    from jsonb_array_elements_text(p->'showcase_images') as e(value)
    where nullif(btrim(e.value), '') is not null
      and public.kos_shop_image_ref(e.value) is null
    limit 1;
    if v_bad_image is not null then
      return jsonb_build_object('ok', false, 'message', 'Showcase photos must be an http(s) link or a Krewe shop image path.');
    end if;
    select coalesce(array_agg(public.kos_shop_image_ref(x.value) order by x.ordinality), '{}'::text[])
      into v_images
    from jsonb_array_elements_text(p->'showcase_images') with ordinality as x(value, ordinality)
    where public.kos_shop_image_ref(x.value) is not null;
    if coalesce(array_length(v_images, 1), 0) > 8 then
      return jsonb_build_object('ok', false, 'message', 'Use at most 8 showcase photos.');
    end if;
  end if;

  if p ? 'active' and jsonb_typeof(p->'active') = 'boolean' then
    v_active := (p->>'active')::boolean;
  elsif p ? 'active' and nullif(btrim(p->>'active'), '') is not null then
    v_active := lower(btrim(p->>'active')) in ('true', 't', '1', 'yes');
  else
    v_active := true;
  end if;
  v_sort := coalesce(nullif(btrim(coalesce(p->>'sort_order', '')), '')::integer, 0);

  if v_id is null then
    insert into public.shop_vendors (
      name, short_name, store_url, website_url, contact_email, contact_phone,
      logo_url, showcase_images, blurb, fulfillment_note, season_label,
      active, sort_order, created_by
    ) values (
      v_name, v_short, v_store, v_website, v_email, v_phone,
      v_logo, v_images, v_blurb, v_note, v_season,
      v_active, v_sort, auth.uid()
    )
    returning * into v_row;
  else
    update public.shop_vendors s set
      name = v_name,
      short_name = v_short,
      store_url = v_store,
      website_url = case when p ? 'website_url' then v_website else s.website_url end,
      contact_email = case when p ? 'contact_email' then v_email else s.contact_email end,
      contact_phone = case when p ? 'contact_phone' then v_phone else s.contact_phone end,
      logo_url = case when p ? 'logo_url' then v_logo else s.logo_url end,
      showcase_images = case when p ? 'showcase_images' then v_images else s.showcase_images end,
      blurb = case when p ? 'blurb' then v_blurb else s.blurb end,
      fulfillment_note = case when p ? 'fulfillment_note' then v_note else s.fulfillment_note end,
      season_label = case when p ? 'season_label' then v_season else s.season_label end,
      active = case when p ? 'active' then v_active else s.active end,
      sort_order = case when p ? 'sort_order' then v_sort else s.sort_order end
    where s.id = v_id
    returning * into v_row;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'Vendor not found.');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'vendor', jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'short_name', v_row.short_name,
    'store_url', v_row.store_url,
    'website_url', v_row.website_url,
    'contact_email', v_row.contact_email,
    'contact_phone', v_row.contact_phone,
    'logo_url', v_row.logo_url,
    'showcase_images', to_jsonb(coalesce(v_row.showcase_images, '{}'::text[])),
    'blurb', v_row.blurb,
    'fulfillment_note', v_row.fulfillment_note,
    'season_label', v_row.season_label,
    'active', v_row.active,
    'sort_order', v_row.sort_order
  ));
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'message', 'A vendor with that short name already exists.');
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'message', 'A field is not in the expected format.');
end $$;

revoke all on function public.upsert_shop_vendor(jsonb) from public, anon;
grant execute on function public.upsert_shop_vendor(jsonb) to authenticated;

create or replace function public.upsert_shop_vendor_look(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_vendor uuid;
  v_row public.shop_vendor_looks%rowtype;
  v_name text;
  v_image text;
  v_product text;
  v_category text;
  v_active boolean;
  v_sort integer;
begin
  if not public.can_manage_shop() then
    return jsonb_build_object('ok', false, 'message', 'Only board members, officers, and committee chairs can manage the shop.');
  end if;
  if p ? 'price' or p ? 'price_cents' or p ? 'price_dollars' or p ? 'amount' or p ? 'amount_cents' or p ? 'cost' or p ? 'sizes' then
    return jsonb_build_object('ok', false, 'message', 'Vendor looks do not store a price or sizes. Those stay on the vendor site.');
  end if;

  v_id := nullif(btrim(coalesce(p->>'id', '')), '')::uuid;
  v_vendor := nullif(btrim(coalesce(p->>'vendor_id', '')), '')::uuid;
  if v_vendor is null and v_id is not null then
    select vendor_id into v_vendor from public.shop_vendor_looks where id = v_id;
  end if;
  if v_vendor is null or not exists (select 1 from public.shop_vendors where id = v_vendor) then
    return jsonb_build_object('ok', false, 'message', 'Choose a vendor for this photo.');
  end if;

  v_name := nullif(btrim(coalesce(p->>'name', '')), '');
  if v_name is null and v_id is not null then
    select name into v_name from public.shop_vendor_looks where id = v_id;
  end if;
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'Look name is required.');
  end if;
  if char_length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'message', 'Look name is too long.');
  end if;

  v_image := public.kos_shop_image_ref(p->>'image_url');
  if nullif(btrim(coalesce(p->>'image_url', '')), '') is not null and v_image is null then
    return jsonb_build_object('ok', false, 'message', 'Photo must be an http(s) link or a Krewe shop image path.');
  end if;
  v_product := nullif(btrim(coalesce(p->>'product_url', '')), '');
  if v_product is not null and v_product !~* '^https?://[^[:space:]]+$' then
    return jsonb_build_object('ok', false, 'message', 'Product link must start with http:// or https://.');
  end if;

  v_category := lower(nullif(btrim(coalesce(p->>'category', '')), ''));
  if v_category is not null and v_category not in ('womens', 'mens', 'unisex', 'outerwear') then
    return jsonb_build_object('ok', false, 'message', 'Category must be womens, mens, unisex, or outerwear.');
  end if;

  if p ? 'active' and jsonb_typeof(p->'active') = 'boolean' then
    v_active := (p->>'active')::boolean;
  elsif p ? 'active' and nullif(btrim(p->>'active'), '') is not null then
    v_active := lower(btrim(p->>'active')) in ('true', 't', '1', 'yes');
  else
    v_active := true;
  end if;
  v_sort := coalesce(nullif(btrim(coalesce(p->>'sort_order', '')), '')::integer, 0);

  if v_id is null then
    insert into public.shop_vendor_looks (
      vendor_id, name, image_url, product_url, category, active, sort_order, created_by
    ) values (
      v_vendor, v_name, v_image, v_product, v_category, v_active, v_sort, auth.uid()
    )
    returning * into v_row;
  else
    update public.shop_vendor_looks s set
      vendor_id = v_vendor,
      name = v_name,
      image_url = case when p ? 'image_url' then v_image else s.image_url end,
      product_url = case when p ? 'product_url' then v_product else s.product_url end,
      category = case when p ? 'category' then v_category else s.category end,
      active = case when p ? 'active' then v_active else s.active end,
      sort_order = case when p ? 'sort_order' then v_sort else s.sort_order end
    where s.id = v_id
    returning * into v_row;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'Look not found.');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'look', jsonb_build_object(
    'id', v_row.id,
    'vendor_id', v_row.vendor_id,
    'name', v_row.name,
    'image_url', v_row.image_url,
    'product_url', v_row.product_url,
    'category', v_row.category,
    'active', v_row.active,
    'sort_order', v_row.sort_order
  ));
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'message', 'A field is not in the expected format.');
end $$;

revoke all on function public.upsert_shop_vendor_look(jsonb) from public, anon;
grant execute on function public.upsert_shop_vendor_look(jsonb) to authenticated;

-- ---------- 7. Seed Red's Team Sports and Studio 19 ----------
-- Inserts a vendor only when its short name is new.
-- Re-running fills blank contact, blurb, and season fields.
-- It does not overwrite a store URL an officer has already changed.
-- Studio 19 gets cheryl@studio19designs.com when that email is blank.
-- No phone is stored for Studio 19.
-- A re-run also replaces Studio 19's earlier generic shipping note
-- with the tailor-made note. A note an officer already rewrote stays.
-- Melissa assigned the family-crest long-sleeve and mermaid tee to Red's.
-- The hoodie and raglan stay on Studio 19 until she assigns them.
-- Each tile still opens that vendor's store. No product-page URLs.
insert into public.shop_vendors (
  name, short_name, store_url, website_url,
  contact_email, contact_phone,
  showcase_images,
  blurb, fulfillment_note, season_label, active, sort_order
) values (
  'Red''s Team Sports',
  'Red''s',
  'https://kreweofshamrock2025.itemorder.com/shop/category/107919/',
  'http://www.redsteamsports.com/',
  'teamstores@redsteamsports.com',
  '813-612-5999',
  array[
    '/assets/img/store/vendor-family-crest-ls.png',
    '/assets/img/store/vendor-mermaid-tee.png'
  ],
  'Crest tees, jackets, and parade layers in green and gold.',
  'Shipped to your home. Orders are processed weekly and usually finish 2–3 weeks later.',
  '2025–26',
  true,
  10
) on conflict (short_name) do nothing;

insert into public.shop_vendors (
  name, short_name, store_url, website_url,
  contact_email,
  showcase_images,
  blurb, fulfillment_note, active, sort_order
) values (
  'Studio 19',
  'Studio 19',
  'https://studio19shop.com/shop/ols/categories/krewe-of-shamrock',
  'https://studio19shop.com',
  'cheryl@studio19designs.com',
  array[
    '/assets/img/store/vendor-crest-hoodie.png',
    '/assets/img/store/vendor-shenanigans-raglan.png'
  ],
  'Tanks, jackets, and extra colors for parade season and the rest of the year.',
  'Custom orders are tailor-made and take a few weeks. Returns are rare. Sizing and status questions go to cheryl@studio19designs.com.',
  true,
  20
) on conflict (short_name) do nothing;

update public.shop_vendors v
set
  store_url = case
    when v.store_url in (
      'https://kreweofshamrock2025.itemorder.com/shop/home/',
      'https://kreweofshamrock2025.itemorder.com/shop/home',
      'https://kreweofshamrock2025.itemorder.com/shop/category/107919'
    ) then 'https://kreweofshamrock2025.itemorder.com/shop/category/107919/'
    else v.store_url
  end,
  website_url = coalesce(nullif(btrim(v.website_url), ''), 'http://www.redsteamsports.com/'),
  contact_email = coalesce(nullif(btrim(v.contact_email), ''), 'teamstores@redsteamsports.com'),
  contact_phone = coalesce(nullif(btrim(v.contact_phone), ''), '813-612-5999'),
  blurb = coalesce(nullif(btrim(v.blurb), ''), 'Crest tees, jackets, and parade layers in green and gold.'),
  fulfillment_note = coalesce(nullif(btrim(v.fulfillment_note), ''), 'Shipped to your home. Orders are processed weekly and usually finish 2–3 weeks later.'),
  season_label = coalesce(nullif(btrim(v.season_label), ''), '2025–26')
where v.short_name = 'Red''s'
  and (
    v.store_url in (
      'https://kreweofshamrock2025.itemorder.com/shop/home/',
      'https://kreweofshamrock2025.itemorder.com/shop/home',
      'https://kreweofshamrock2025.itemorder.com/shop/category/107919'
    )
    or nullif(btrim(v.website_url), '') is null
    or nullif(btrim(v.contact_email), '') is null
    or nullif(btrim(v.contact_phone), '') is null
    or nullif(btrim(v.blurb), '') is null
    or nullif(btrim(v.fulfillment_note), '') is null
    or nullif(btrim(v.season_label), '') is null
  );

update public.shop_vendors v
set
  website_url = coalesce(nullif(btrim(v.website_url), ''), 'https://studio19shop.com'),
  contact_email = coalesce(nullif(btrim(v.contact_email), ''), 'cheryl@studio19designs.com'),
  blurb = coalesce(nullif(btrim(v.blurb), ''), 'Tanks, jackets, and extra colors for parade season and the rest of the year.'),
  fulfillment_note = case
    when nullif(btrim(v.fulfillment_note), '') is null
      or btrim(v.fulfillment_note) = 'Shipped to your home. Orders are processed weekly and usually finish 2–3 weeks later.'
    then 'Custom orders are tailor-made and take a few weeks. Returns are rare. Sizing and status questions go to cheryl@studio19designs.com.'
    else v.fulfillment_note
  end
where v.short_name = 'Studio 19'
  and (
    nullif(btrim(v.website_url), '') is null
    or nullif(btrim(v.contact_email), '') is null
    or nullif(btrim(v.blurb), '') is null
    or nullif(btrim(v.fulfillment_note), '') is null
    or btrim(v.fulfillment_note) = 'Shipped to your home. Orders are processed weekly and usually finish 2–3 weeks later.'
  );

-- Set each collage on every run. Does not change store_url.
update public.shop_vendors
set showcase_images = array[
  '/assets/img/store/vendor-family-crest-ls.png',
  '/assets/img/store/vendor-mermaid-tee.png'
]
where short_name = 'Red''s'
  and showcase_images is distinct from array[
    '/assets/img/store/vendor-family-crest-ls.png',
    '/assets/img/store/vendor-mermaid-tee.png'
  ];

update public.shop_vendors
set showcase_images = array[
  '/assets/img/store/vendor-crest-hoodie.png',
  '/assets/img/store/vendor-shenanigans-raglan.png'
]
where short_name = 'Studio 19'
  and showcase_images is distinct from array[
    '/assets/img/store/vendor-crest-hoodie.png',
    '/assets/img/store/vendor-shenanigans-raglan.png'
  ];

-- Drop look cards that put a shirt on the wrong vendor.
delete from public.shop_vendor_looks l
using public.shop_vendors v
where l.vendor_id = v.id
  and v.short_name = 'Red''s'
  and l.image_url in (
    '/assets/img/store/vendor-crest-hoodie.png',
    '/assets/img/store/vendor-shenanigans-raglan.png'
  );

delete from public.shop_vendor_looks l
using public.shop_vendors v
where l.vendor_id = v.id
  and v.short_name = 'Studio 19'
  and l.image_url in (
    '/assets/img/store/vendor-family-crest-ls.png',
    '/assets/img/store/vendor-mermaid-tee.png'
  );
