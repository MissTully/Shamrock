-- Shop Studio schema and RPCs. Applied to oazwkwflgbthojvnclfc (2026-09-07).
-- Safe to run more than once.

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null, description text, price_cents integer, image_url text,
  sizes text[] not null default '{}'::text[], zeffy_url text,
  zeffy_campaign_name text, status text not null default 'draft',
  sort_order integer not null default 0, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.shop_products
  add column if not exists slug text,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists price_cents integer,
  add column if not exists image_url text,
  add column if not exists sizes text[] not null default '{}'::text[],
  add column if not exists zeffy_url text,
  add column if not exists zeffy_campaign_name text,
  add column if not exists status text not null default 'draft',
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
update public.shop_products set slug='product-'||id::text where nullif(btrim(slug),'') is null;
update public.shop_products set name=coalesce(nullif(btrim(name),''),'Krewe product') where nullif(btrim(name),'') is null;
alter table public.shop_products alter column slug set not null;
alter table public.shop_products alter column name set not null;
do $$ begin
  alter table public.shop_products drop constraint if exists shop_products_status_check;
  alter table public.shop_products add constraint shop_products_status_check check (status in ('draft','awaiting_zeffy','live','coming_soon','archived'));
exception when others then null; end $$;
create index if not exists shop_products_public_order_idx on public.shop_products(sort_order,created_at desc) where status in ('live','coming_soon','awaiting_zeffy');

create or replace function public.can_manage_shop() returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_krewe_officer()
  or exists(select 1 from public.member_roles r where r.user_id=auth.uid() and r.role in ('board','officer','captain','committee_chair'))
  or exists(select 1 from public.members m join public.profiles p on p.member_id=m.id where p.id=auth.uid() and m.membership_status='active' and (m.member_role in ('officer','captain','board') or coalesce(m.officer_title,'') ~* '(chair|committee|board|treasurer|secretary|captain|lieutenant)'));
$$;
revoke all on function public.can_manage_shop() from public;
grant execute on function public.can_manage_shop() to authenticated;

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
 v_status:=nullif(p->>'status',''); if v_status is null then v_status:=case when v_zeffy is not null then 'live' when coalesce(v_price,0)>0 then 'awaiting_zeffy' else 'draft' end; end if;
 if v_zeffy is null and coalesce(v_price,0)>0 and v_status not in('coming_soon','archived') then v_status:='awaiting_zeffy'; end if;
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

create or replace function public.attach_shop_zeffy_url(p_id uuid,p_url text,p_campaign_name text default null) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_row public.shop_products%rowtype; v_url text:=nullif(btrim(p_url),'');
begin
 if not public.can_manage_shop() then return jsonb_build_object('ok',false,'message','Not authorized.'); end if;
 if v_url is null then return jsonb_build_object('ok',false,'message','A Zeffy URL is required.'); end if;
 update public.shop_products set zeffy_url=v_url,zeffy_campaign_name=nullif(btrim(p_campaign_name),''),status='live',updated_at=now() where id=p_id returning * into v_row;
 if not found then return jsonb_build_object('ok',false,'message','Product not found.'); end if;
 return jsonb_build_object('ok',true,'product',to_jsonb(v_row));
end; $$;
revoke all on function public.attach_shop_zeffy_url(uuid,text,text) from public;
grant execute on function public.attach_shop_zeffy_url(uuid,text,text) to authenticated;

create or replace function public.list_public_shop_products() returns jsonb language sql stable security definer set search_path to 'public' as $$
 select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order,s.created_at desc),'[]'::jsonb) from public.shop_products s where s.status in('live','coming_soon','awaiting_zeffy');
$$;
revoke all on function public.list_public_shop_products() from public;
grant execute on function public.list_public_shop_products() to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('shop-products','shop-products',true,10485760,array['image/jpeg','image/png','image/webp','image/gif']) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Shop product images are publicly readable" on storage.objects;
create policy "Shop product images are publicly readable" on storage.objects for select using(bucket_id='shop-products');
drop policy if exists "Shop managers upload product images" on storage.objects;
create policy "Shop managers upload product images" on storage.objects for insert to authenticated with check(bucket_id='shop-products' and public.can_manage_shop());
drop policy if exists "Shop managers update product images" on storage.objects;
create policy "Shop managers update product images" on storage.objects for update to authenticated using(bucket_id='shop-products' and public.can_manage_shop()) with check(bucket_id='shop-products' and public.can_manage_shop());
drop policy if exists "Shop managers delete product images" on storage.objects;
create policy "Shop managers delete product images" on storage.objects for delete to authenticated using(bucket_id='shop-products' and public.can_manage_shop());

-- Managers can read drafts in Shop Studio; the public uses the RPC above.
alter table public.shop_products enable row level security;
drop policy if exists "Shop managers can read products" on public.shop_products;
create policy "Shop managers can read products" on public.shop_products for select to authenticated using (public.can_manage_shop());
