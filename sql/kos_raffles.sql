-- Krewe of Shamrock raffles: gift baskets + 50/50 for charity.
-- Applied to oazwkwflgbthojvnclfc. Safe to run more than once.
-- Model: themed gift-ready baskets (donated contents); members create;
-- money for charity; internal/external; in-person draws (digital ticket tracking).

-- ========== TABLES ==========
create table if not exists public.raffle_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  raffle_type text not null default 'basket',
  description text,
  ticket_price numeric(10,2) not null default 1,
  event_date date,
  is_active boolean not null default true,
  audience text not null default 'both',
  charity_blurb text,
  created_by uuid references auth.users(id),
  winner_entry_id uuid,
  winner_name text,
  drawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.raffle_events
  add column if not exists name text,
  add column if not exists raffle_type text,
  add column if not exists description text,
  add column if not exists ticket_price numeric(10,2),
  add column if not exists event_date date,
  add column if not exists is_active boolean,
  add column if not exists audience text,
  add column if not exists charity_blurb text,
  add column if not exists created_by uuid,
  add column if not exists winner_entry_id uuid,
  add column if not exists winner_name text,
  add column if not exists drawn_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;
update public.raffle_events set name=coalesce(nullif(btrim(name),''),'Raffle') where nullif(btrim(name),'') is null;
update public.raffle_events set raffle_type=coalesce(nullif(btrim(raffle_type),''),'basket') where nullif(btrim(raffle_type),'') is null;
update public.raffle_events set ticket_price=coalesce(ticket_price,1) where ticket_price is null;
update public.raffle_events set is_active=coalesce(is_active,true) where is_active is null;
update public.raffle_events set audience=coalesce(nullif(btrim(audience),''),'both') where nullif(btrim(audience),'') is null;
update public.raffle_events set created_at=coalesce(created_at,now()) where created_at is null;
update public.raffle_events set updated_at=coalesce(updated_at,now()) where updated_at is null;
alter table public.raffle_events alter column name set not null;
alter table public.raffle_events alter column raffle_type set not null;
alter table public.raffle_events alter column ticket_price set not null;
alter table public.raffle_events alter column is_active set not null;
alter table public.raffle_events alter column audience set not null;
do $$ begin
  alter table public.raffle_events drop constraint if exists raffle_events_type_check;
  alter table public.raffle_events add constraint raffle_events_type_check check (raffle_type in ('basket','fifty_fifty'));
exception when others then null; end $$;
do $$ begin
  alter table public.raffle_events drop constraint if exists raffle_events_audience_check;
  alter table public.raffle_events add constraint raffle_events_audience_check check (audience in ('internal','external','both'));
exception when others then null; end $$;
create index if not exists raffle_events_active_date_idx on public.raffle_events(is_active, event_date);
create index if not exists raffle_events_created_by_idx on public.raffle_events(created_by);

create table if not exists public.raffle_baskets (
  id uuid primary key default gen_random_uuid(),
  raffle_event_id uuid not null references public.raffle_events(id) on delete cascade,
  name text not null,
  description text,
  contents text,
  estimated_value numeric(10,2),
  image_url text,
  display_order integer not null default 0,
  winner_entry_id uuid,
  winner_name text,
  drawn_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.raffle_baskets
  add column if not exists raffle_event_id uuid,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists contents text,
  add column if not exists estimated_value numeric(10,2),
  add column if not exists image_url text,
  add column if not exists display_order integer,
  add column if not exists winner_entry_id uuid,
  add column if not exists winner_name text,
  add column if not exists drawn_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;
update public.raffle_baskets set name=coalesce(nullif(btrim(name),''),'Basket') where nullif(btrim(name),'') is null;
update public.raffle_baskets set display_order=coalesce(display_order,0) where display_order is null;
update public.raffle_baskets set created_at=coalesce(created_at,now()) where created_at is null;
update public.raffle_baskets set updated_at=coalesce(updated_at,now()) where updated_at is null;
alter table public.raffle_baskets alter column name set not null;
alter table public.raffle_baskets alter column display_order set not null;
create index if not exists raffle_baskets_event_idx on public.raffle_baskets(raffle_event_id, display_order);

create table if not exists public.raffle_basket_entries (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.raffle_baskets(id) on delete cascade,
  member_id uuid references public.members(id),
  user_id uuid references auth.users(id),
  guest_name text,
  guest_email text,
  tickets integer not null default 1,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.raffle_basket_entries
  add column if not exists basket_id uuid,
  add column if not exists member_id uuid,
  add column if not exists user_id uuid,
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists tickets integer,
  add column if not exists paid boolean,
  add column if not exists created_at timestamptz;
update public.raffle_basket_entries set tickets=coalesce(nullif(tickets,0),1) where tickets is null or tickets < 1;
update public.raffle_basket_entries set paid=coalesce(paid,false) where paid is null;
update public.raffle_basket_entries set created_at=coalesce(created_at,now()) where created_at is null;
alter table public.raffle_basket_entries alter column tickets set not null;
alter table public.raffle_basket_entries alter column paid set not null;
do $$ begin
  alter table public.raffle_basket_entries drop constraint if exists raffle_basket_entries_tickets_check;
  alter table public.raffle_basket_entries add constraint raffle_basket_entries_tickets_check check (tickets > 0);
exception when others then null; end $$;
create index if not exists raffle_basket_entries_basket_idx on public.raffle_basket_entries(basket_id);
create index if not exists raffle_basket_entries_member_idx on public.raffle_basket_entries(member_id);

create table if not exists public.raffle_5050_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.raffle_events(id) on delete cascade,
  member_id uuid references public.members(id),
  user_id uuid references auth.users(id),
  guest_name text,
  guest_email text,
  tickets integer not null default 1,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.raffle_5050_entries
  add column if not exists event_id uuid,
  add column if not exists member_id uuid,
  add column if not exists user_id uuid,
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists tickets integer,
  add column if not exists paid boolean,
  add column if not exists created_at timestamptz;
update public.raffle_5050_entries set tickets=coalesce(nullif(tickets,0),1) where tickets is null or tickets < 1;
update public.raffle_5050_entries set paid=coalesce(paid,false) where paid is null;
update public.raffle_5050_entries set created_at=coalesce(created_at,now()) where created_at is null;
alter table public.raffle_5050_entries alter column tickets set not null;
alter table public.raffle_5050_entries alter column paid set not null;
do $$ begin
  alter table public.raffle_5050_entries drop constraint if exists raffle_5050_entries_tickets_check;
  alter table public.raffle_5050_entries add constraint raffle_5050_entries_tickets_check check (tickets > 0);
exception when others then null; end $$;
create index if not exists raffle_5050_entries_event_idx on public.raffle_5050_entries(event_id);
create index if not exists raffle_5050_entries_member_idx on public.raffle_5050_entries(member_id);

create table if not exists public.raffle_basket_donations (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.raffle_baskets(id) on delete cascade,
  item_text text not null,
  donor_name text,
  status text not null default 'pledged',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.raffle_basket_donations
  add column if not exists basket_id uuid,
  add column if not exists item_text text,
  add column if not exists donor_name text,
  add column if not exists status text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;
update public.raffle_basket_donations set item_text=coalesce(nullif(btrim(item_text),''),'Item') where nullif(btrim(item_text),'') is null;
update public.raffle_basket_donations set status=coalesce(nullif(btrim(status),''),'pledged') where nullif(btrim(status),'') is null;
update public.raffle_basket_donations set created_at=coalesce(created_at,now()) where created_at is null;
update public.raffle_basket_donations set updated_at=coalesce(updated_at,now()) where updated_at is null;
alter table public.raffle_basket_donations alter column item_text set not null;
alter table public.raffle_basket_donations alter column status set not null;
do $$ begin
  alter table public.raffle_basket_donations drop constraint if exists raffle_basket_donations_status_check;
  alter table public.raffle_basket_donations add constraint raffle_basket_donations_status_check check (status in ('pledged','received'));
exception when others then null; end $$;
create index if not exists raffle_basket_donations_basket_idx on public.raffle_basket_donations(basket_id);

-- ========== RLS (tables locked down; access via views/RPCs) ==========
alter table public.raffle_events enable row level security;
alter table public.raffle_baskets enable row level security;
alter table public.raffle_basket_entries enable row level security;
alter table public.raffle_5050_entries enable row level security;
alter table public.raffle_basket_donations enable row level security;

drop policy if exists "Raffle events readable by authenticated" on public.raffle_events;
create policy "Raffle events readable by authenticated" on public.raffle_events
  for select to authenticated using (true);
drop policy if exists "Raffle baskets readable by authenticated" on public.raffle_baskets;
create policy "Raffle baskets readable by authenticated" on public.raffle_baskets
  for select to authenticated using (true);
drop policy if exists "Raffle donations readable by authenticated" on public.raffle_basket_donations;
create policy "Raffle donations readable by authenticated" on public.raffle_basket_donations
  for select to authenticated using (true);

-- ========== HELPERS ==========
create or replace function public.kos_raffle_display_name(
  p_member_id uuid, p_user_id uuid, p_guest_name text
) returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    nullif(btrim(p_guest_name),''),
    (select nullif(btrim(coalesce(pr.full_name, trim(both ' ' from coalesce(pr.first_name,'')||' '||coalesce(pr.last_name,'')))), '')
       from public.profiles pr where pr.id = p_user_id),
    (select nullif(btrim(trim(both ' ' from coalesce(m.first_name,'')||' '||coalesce(m.last_name,''))), '')
       from public.members m where m.id = p_member_id),
    'Anonymous'
  );
$$;

create or replace function public.kos_can_manage_raffle(p_event_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.is_krewe_officer()
    or exists (
      select 1 from public.raffle_events e
      where e.id = p_event_id and e.created_by = auth.uid()
    );
$$;
revoke all on function public.kos_can_manage_raffle(uuid) from public;
grant execute on function public.kos_can_manage_raffle(uuid) to authenticated;

-- ========== VIEWS (UI columns) ==========
drop view if exists public.v_raffle_events_public cascade;
create view public.v_raffle_events_public
with (security_invoker = false)
as
select
  e.id,
  e.name,
  e.raffle_type,
  e.description,
  e.ticket_price,
  e.event_date,
  e.is_active,
  e.audience,
  e.charity_blurb,
  e.winner_name,
  e.drawn_at,
  e.created_by,
  e.created_at,
  coalesce((
    select sum(x.tickets)::int from public.raffle_5050_entries x where x.event_id = e.id
  ), 0) as pot_tickets,
  coalesce((
    select sum(be.tickets)::int
    from public.raffle_basket_entries be
    join public.raffle_baskets b on b.id = be.basket_id
    where b.raffle_event_id = e.id
  ), 0) as basket_tickets
from public.raffle_events e;

drop view if exists public.v_raffle_baskets_public cascade;
create view public.v_raffle_baskets_public
with (security_invoker = false)
as
select
  b.id,
  b.raffle_event_id,
  b.name,
  b.description,
  b.contents,
  b.estimated_value,
  b.image_url,
  b.display_order,
  b.winner_name,
  b.drawn_at,
  b.created_at,
  coalesce((select sum(e.tickets)::int from public.raffle_basket_entries e where e.basket_id = b.id), 0) as tickets
from public.raffle_baskets b;

grant select on public.v_raffle_events_public to anon, authenticated;
grant select on public.v_raffle_baskets_public to anon, authenticated;

-- ========== RPCs ==========
create or replace function public.create_raffle(
  p_name text,
  p_type text,
  p_description text,
  p_ticket_price numeric,
  p_event_date date,
  p_audience text default 'both',
  p_charity_blurb text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_mid uuid := public.kos_current_member_id();
  v_type text := lower(nullif(btrim(coalesce(p_type,'')),''));
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
  v_aud text := lower(nullif(btrim(coalesce(p_audience,'both')),''));
  v_row public.raffle_events%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to create a raffle.'; end if;
  if v_mid is null then raise exception 'Link your member profile before creating a raffle.'; end if;
  if v_name is null then raise exception 'Please enter a raffle name.'; end if;
  if v_type is null or v_type not in ('basket','fifty_fifty') then
    raise exception 'Type must be basket or fifty_fifty.';
  end if;
  if v_aud is null or v_aud not in ('internal','external','both') then v_aud := 'both'; end if;
  insert into public.raffle_events(
    name, raffle_type, description, ticket_price, event_date, audience, charity_blurb, created_by, is_active
  ) values (
    v_name, v_type, nullif(btrim(coalesce(p_description,'')),''),
    coalesce(p_ticket_price,1), p_event_date, v_aud,
    nullif(btrim(coalesce(p_charity_blurb,'')),''), auth.uid(), true
  ) returning * into v_row;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'event', to_jsonb(v_row));
end;
$$;
revoke all on function public.create_raffle(text,text,text,numeric,date,text,text) from public;
grant execute on function public.create_raffle(text,text,text,numeric,date,text,text) to authenticated;
-- Drop any legacy 5-arg overload so PostgREST has a single candidate (defaults cover JS).
drop function if exists public.create_raffle(text,text,text,numeric,date);

create or replace function public.add_basket(
  p_event_id uuid,
  p_name text,
  p_estimated_value numeric,
  p_contents text,
  p_description text,
  p_image_url text
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
  v_ord int;
  v_row public.raffle_baskets%rowtype;
  v_ev public.raffle_events%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_ev from public.raffle_events where id = p_event_id;
  if not found then raise exception 'Raffle not found.'; end if;
  if v_ev.raffle_type <> 'basket' then raise exception 'Baskets can only be added to basket raffles.'; end if;
  if not public.kos_can_manage_raffle(p_event_id) then raise exception 'Not authorized to manage this raffle.'; end if;
  if v_name is null then raise exception 'Please enter a basket title.'; end if;
  select coalesce(max(display_order),0)+1 into v_ord from public.raffle_baskets where raffle_event_id = p_event_id;
  insert into public.raffle_baskets(
    raffle_event_id, name, estimated_value, contents, description, image_url, display_order, created_by
  ) values (
    p_event_id, v_name, p_estimated_value,
    nullif(btrim(coalesce(p_contents,'')),''),
    nullif(btrim(coalesce(p_description,'')),''),
    nullif(btrim(coalesce(p_image_url,'')),''),
    v_ord, auth.uid()
  ) returning * into v_row;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'basket', to_jsonb(v_row));
end;
$$;
revoke all on function public.add_basket(uuid,text,numeric,text,text,text) from public;
grant execute on function public.add_basket(uuid,text,numeric,text,text,text) to authenticated;

create or replace function public.update_basket(
  p_basket_id uuid,
  p_name text,
  p_estimated_value numeric,
  p_contents text,
  p_description text,
  p_image_url text
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
  v_row public.raffle_baskets%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_row from public.raffle_baskets where id = p_basket_id;
  if not found then raise exception 'Basket not found.'; end if;
  if not public.kos_can_manage_raffle(v_row.raffle_event_id) then raise exception 'Not authorized.'; end if;
  if v_name is null then raise exception 'Please enter a basket title.'; end if;
  update public.raffle_baskets b set
    name = v_name,
    estimated_value = p_estimated_value,
    contents = nullif(btrim(coalesce(p_contents,'')),''),
    description = nullif(btrim(coalesce(p_description,'')),''),
    image_url = coalesce(nullif(btrim(coalesce(p_image_url,'')),''), b.image_url),
    updated_at = now()
  where b.id = p_basket_id
  returning * into v_row;
  return jsonb_build_object('ok', true, 'basket', to_jsonb(v_row));
end;
$$;
revoke all on function public.update_basket(uuid,text,numeric,text,text,text) from public;
grant execute on function public.update_basket(uuid,text,numeric,text,text,text) to authenticated;

create or replace function public.delete_basket(p_basket_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_row public.raffle_baskets%rowtype;
  v_tix int;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_row from public.raffle_baskets where id = p_basket_id;
  if not found then raise exception 'Basket not found.'; end if;
  if not public.kos_can_manage_raffle(v_row.raffle_event_id) then raise exception 'Not authorized.'; end if;
  select coalesce(sum(tickets),0) into v_tix from public.raffle_basket_entries where basket_id = p_basket_id;
  if v_tix > 0 then raise exception 'Cannot delete a basket that already has tickets.'; end if;
  delete from public.raffle_baskets where id = p_basket_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.delete_basket(uuid) from public;
grant execute on function public.delete_basket(uuid) to authenticated;

create or replace function public.enter_basket_as_member(p_basket_id uuid, p_tickets integer) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_mid uuid := public.kos_current_member_id();
  v_b public.raffle_baskets%rowtype;
  v_e public.raffle_events%rowtype;
  v_qty int := greatest(coalesce(p_tickets,1),1);
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to enter.'; end if;
  if v_mid is null then raise exception 'Link your member profile to enter raffles.'; end if;
  select * into v_b from public.raffle_baskets where id = p_basket_id;
  if not found then raise exception 'Basket not found.'; end if;
  select * into v_e from public.raffle_events where id = v_b.raffle_event_id;
  if not found or not v_e.is_active then raise exception 'This raffle is closed.'; end if;
  if v_e.raffle_type <> 'basket' then raise exception 'Not a basket raffle.'; end if;
  if v_b.drawn_at is not null or v_e.drawn_at is not null then raise exception 'Winner already drawn.'; end if;
  if v_qty > 200 then raise exception 'Max 200 tickets per entry.'; end if;
  insert into public.raffle_basket_entries(basket_id, member_id, user_id, tickets)
  values (p_basket_id, v_mid, auth.uid(), v_qty)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'entry_id', v_id, 'tickets', v_qty);
end;
$$;
revoke all on function public.enter_basket_as_member(uuid,integer) from public;
grant execute on function public.enter_basket_as_member(uuid,integer) to authenticated;

create or replace function public.buy_5050_as_member(p_event_id uuid, p_qty integer) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_mid uuid := public.kos_current_member_id();
  v_e public.raffle_events%rowtype;
  v_qty int := greatest(coalesce(p_qty,1),1);
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to buy tickets.'; end if;
  if v_mid is null then raise exception 'Link your member profile to enter raffles.'; end if;
  select * into v_e from public.raffle_events where id = p_event_id;
  if not found or not v_e.is_active then raise exception 'This raffle is closed.'; end if;
  if v_e.raffle_type <> 'fifty_fifty' then raise exception 'Not a 50/50 raffle.'; end if;
  if v_e.drawn_at is not null then raise exception 'Winner already drawn.'; end if;
  if v_qty > 200 then raise exception 'Max 200 tickets per entry.'; end if;
  insert into public.raffle_5050_entries(event_id, member_id, user_id, tickets)
  values (p_event_id, v_mid, auth.uid(), v_qty)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'entry_id', v_id, 'tickets', v_qty);
end;
$$;
revoke all on function public.buy_5050_as_member(uuid,integer) from public;
grant execute on function public.buy_5050_as_member(uuid,integer) to authenticated;

create or replace function public.enter_basket_public(
  p_basket_id uuid, p_qty integer, p_name text, p_email text
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_b public.raffle_baskets%rowtype;
  v_e public.raffle_events%rowtype;
  v_qty int := greatest(coalesce(p_qty,1),1);
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
  v_id uuid;
begin
  if v_name is null then raise exception 'Please enter your name.'; end if;
  select * into v_b from public.raffle_baskets where id = p_basket_id;
  if not found then raise exception 'Basket not found.'; end if;
  select * into v_e from public.raffle_events where id = v_b.raffle_event_id;
  if not found or not v_e.is_active then raise exception 'This raffle is closed.'; end if;
  if v_e.audience = 'internal' then raise exception 'This raffle is members-only.'; end if;
  if v_e.raffle_type <> 'basket' then raise exception 'Not a basket raffle.'; end if;
  if v_b.drawn_at is not null then raise exception 'Winner already drawn.'; end if;
  if v_qty > 200 then raise exception 'Max 200 tickets per entry.'; end if;
  insert into public.raffle_basket_entries(basket_id, guest_name, guest_email, tickets, user_id, member_id)
  values (
    p_basket_id, v_name, nullif(btrim(coalesce(p_email,'')),''), v_qty,
    auth.uid(), public.kos_current_member_id()
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'entry_id', v_id, 'tickets', v_qty);
end;
$$;
revoke all on function public.enter_basket_public(uuid,integer,text,text) from public;
grant execute on function public.enter_basket_public(uuid,integer,text,text) to anon, authenticated;

create or replace function public.buy_5050_public(
  p_event_id uuid, p_qty integer, p_name text, p_email text
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_e public.raffle_events%rowtype;
  v_qty int := greatest(coalesce(p_qty,1),1);
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
  v_id uuid;
begin
  if v_name is null then raise exception 'Please enter your name.'; end if;
  select * into v_e from public.raffle_events where id = p_event_id;
  if not found or not v_e.is_active then raise exception 'This raffle is closed.'; end if;
  if v_e.audience = 'internal' then raise exception 'This raffle is members-only.'; end if;
  if v_e.raffle_type <> 'fifty_fifty' then raise exception 'Not a 50/50 raffle.'; end if;
  if v_e.drawn_at is not null then raise exception 'Winner already drawn.'; end if;
  if v_qty > 200 then raise exception 'Max 200 tickets per entry.'; end if;
  insert into public.raffle_5050_entries(event_id, guest_name, guest_email, tickets, user_id, member_id)
  values (
    p_event_id, v_name, nullif(btrim(coalesce(p_email,'')),''), v_qty,
    auth.uid(), public.kos_current_member_id()
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'entry_id', v_id, 'tickets', v_qty);
end;
$$;
revoke all on function public.buy_5050_public(uuid,integer,text,text) from public;
grant execute on function public.buy_5050_public(uuid,integer,text,text) to anon, authenticated;

create or replace function public.get_my_raffle_summary() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_mid uuid := public.kos_current_member_id();
  v_baskets jsonb;
  v_pot jsonb;
begin
  if auth.uid() is null or v_mid is null then
    return jsonb_build_object('baskets','[]'::jsonb,'pot','[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('basket_id', s.basket_id, 'tickets', s.tickets) order by s.basket_id), '[]'::jsonb)
  into v_baskets
  from (
    select basket_id, sum(tickets)::int as tickets
    from public.raffle_basket_entries
    where member_id = v_mid
    group by basket_id
  ) s;
  select coalesce(jsonb_agg(jsonb_build_object('event_id', s.event_id, 'tickets', s.tickets) order by s.event_id), '[]'::jsonb)
  into v_pot
  from (
    select event_id, sum(tickets)::int as tickets
    from public.raffle_5050_entries
    where member_id = v_mid
    group by event_id
  ) s;
  return jsonb_build_object('baskets', v_baskets, 'pot', v_pot);
end;
$$;
revoke all on function public.get_my_raffle_summary() from public;
grant execute on function public.get_my_raffle_summary() to authenticated;

create or replace function public.get_my_raffles() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_off boolean := public.is_krewe_officer();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
    from (
      select
        e.id,
        e.name,
        e.raffle_type,
        e.description,
        e.ticket_price,
        e.event_date,
        e.is_active,
        e.audience,
        e.charity_blurb,
        e.winner_name,
        e.drawn_at,
        e.created_at,
        (e.created_by = v_uid) as mine,
        coalesce((select sum(t.tickets)::int from public.raffle_5050_entries t where t.event_id = e.id),0) as pot_tickets,
        case when e.raffle_type = 'basket' then coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'description', b.description,
            'contents', b.contents,
            'estimated_value', b.estimated_value,
            'image_url', b.image_url,
            'display_order', b.display_order,
            'winner_name', b.winner_name,
            'drawn_at', b.drawn_at,
            'tickets', coalesce((select sum(en.tickets)::int from public.raffle_basket_entries en where en.basket_id = b.id),0)
          ) order by b.display_order, b.created_at)
          from public.raffle_baskets b where b.raffle_event_id = e.id
        ), '[]'::jsonb) else '[]'::jsonb end as baskets
      from public.raffle_events e
      where e.created_by = v_uid or v_off
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_my_raffles() from public;
grant execute on function public.get_my_raffles() to authenticated;

create or replace function public.draw_basket_winner(p_basket_id uuid, p_redraw boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_b public.raffle_baskets%rowtype;
  v_total int;
  v_pick int;
  v_entry public.raffle_basket_entries%rowtype;
  v_name text;
  v_running int := 0;
  r record;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_b from public.raffle_baskets where id = p_basket_id for update;
  if not found then raise exception 'Basket not found.'; end if;
  if not public.kos_can_manage_raffle(v_b.raffle_event_id) then raise exception 'Not authorized.'; end if;
  if v_b.drawn_at is not null and not coalesce(p_redraw,false) then
    raise exception 'Winner already drawn. Pass redraw to draw again.';
  end if;
  select coalesce(sum(tickets),0) into v_total from public.raffle_basket_entries where basket_id = p_basket_id;
  if v_total < 1 then raise exception 'No tickets to draw.'; end if;
  v_pick := 1 + floor(random() * v_total)::int;
  for r in
    select * from public.raffle_basket_entries where basket_id = p_basket_id order by created_at, id
  loop
    v_running := v_running + r.tickets;
    if v_running >= v_pick then
      v_entry := r;
      exit;
    end if;
  end loop;
  if v_entry.id is null then raise exception 'Draw failed.'; end if;
  v_name := public.kos_raffle_display_name(v_entry.member_id, v_entry.user_id, v_entry.guest_name);
  update public.raffle_baskets set
    winner_entry_id = v_entry.id,
    winner_name = v_name,
    drawn_at = now(),
    updated_at = now()
  where id = p_basket_id;
  return jsonb_build_object('ok', true, 'winner_name', v_name, 'entry_id', v_entry.id, 'tickets', v_total);
end;
$$;
revoke all on function public.draw_basket_winner(uuid,boolean) from public;
grant execute on function public.draw_basket_winner(uuid,boolean) to authenticated;

create or replace function public.draw_5050_winner(p_event_id uuid, p_redraw boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_e public.raffle_events%rowtype;
  v_total int;
  v_pick int;
  v_entry public.raffle_5050_entries%rowtype;
  v_name text;
  v_running int := 0;
  v_pot numeric;
  r record;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_e from public.raffle_events where id = p_event_id for update;
  if not found then raise exception 'Raffle not found.'; end if;
  if v_e.raffle_type <> 'fifty_fifty' then raise exception 'Not a 50/50 raffle.'; end if;
  if not public.kos_can_manage_raffle(p_event_id) then raise exception 'Not authorized.'; end if;
  if v_e.drawn_at is not null and not coalesce(p_redraw,false) then
    raise exception 'Winner already drawn. Pass redraw to draw again.';
  end if;
  select coalesce(sum(tickets),0) into v_total from public.raffle_5050_entries where event_id = p_event_id;
  if v_total < 1 then raise exception 'No tickets to draw.'; end if;
  v_pick := 1 + floor(random() * v_total)::int;
  for r in
    select * from public.raffle_5050_entries where event_id = p_event_id order by created_at, id
  loop
    v_running := v_running + r.tickets;
    if v_running >= v_pick then
      v_entry := r;
      exit;
    end if;
  end loop;
  if v_entry.id is null then raise exception 'Draw failed.'; end if;
  v_name := public.kos_raffle_display_name(v_entry.member_id, v_entry.user_id, v_entry.guest_name);
  v_pot := round(v_total * coalesce(v_e.ticket_price,0), 2);
  update public.raffle_events set
    winner_entry_id = v_entry.id,
    winner_name = v_name,
    drawn_at = now(),
    updated_at = now()
  where id = p_event_id;
  return jsonb_build_object('ok', true, 'winner_name', v_name, 'entry_id', v_entry.id, 'pot', v_pot, 'tickets', v_total);
end;
$$;
revoke all on function public.draw_5050_winner(uuid,boolean) from public;
grant execute on function public.draw_5050_winner(uuid,boolean) to authenticated;

-- Donation planning RPCs
create or replace function public.list_basket_donations(p_basket_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(d) order by d.created_at)
    from public.raffle_basket_donations d where d.basket_id = p_basket_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_basket_donations(uuid) from public;
grant execute on function public.list_basket_donations(uuid) to authenticated;

create or replace function public.add_basket_donation(
  p_basket_id uuid, p_item_text text, p_donor_name text, p_status text default 'pledged'
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_b public.raffle_baskets%rowtype;
  v_item text := nullif(btrim(coalesce(p_item_text,'')),'');
  v_status text := lower(coalesce(nullif(btrim(p_status),''),'pledged'));
  v_row public.raffle_basket_donations%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_b from public.raffle_baskets where id = p_basket_id;
  if not found then raise exception 'Basket not found.'; end if;
  if not public.kos_can_manage_raffle(v_b.raffle_event_id) then raise exception 'Not authorized.'; end if;
  if v_item is null then raise exception 'Item text is required.'; end if;
  if v_status not in ('pledged','received') then v_status := 'pledged'; end if;
  insert into public.raffle_basket_donations(basket_id, item_text, donor_name, status, created_by)
  values (p_basket_id, v_item, nullif(btrim(coalesce(p_donor_name,'')),''), v_status, auth.uid())
  returning * into v_row;
  return jsonb_build_object('ok', true, 'donation', to_jsonb(v_row));
end;
$$;
revoke all on function public.add_basket_donation(uuid,text,text,text) from public;
grant execute on function public.add_basket_donation(uuid,text,text,text) to authenticated;

create or replace function public.update_basket_donation(
  p_donation_id uuid, p_item_text text, p_donor_name text, p_status text
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_row public.raffle_basket_donations%rowtype;
  v_b public.raffle_baskets%rowtype;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_row from public.raffle_basket_donations where id = p_donation_id;
  if not found then raise exception 'Donation not found.'; end if;
  select * into v_b from public.raffle_baskets where id = v_row.basket_id;
  if not public.kos_can_manage_raffle(v_b.raffle_event_id) then raise exception 'Not authorized.'; end if;
  v_status := lower(nullif(btrim(coalesce(p_status,'')),''));
  if v_status is not null and v_status not in ('pledged','received') then
    raise exception 'Status must be pledged or received.';
  end if;
  update public.raffle_basket_donations d set
    item_text = coalesce(nullif(btrim(coalesce(p_item_text,'')),''), d.item_text),
    donor_name = case when p_donor_name is null then d.donor_name else nullif(btrim(p_donor_name),'') end,
    status = coalesce(v_status, d.status),
    updated_at = now()
  where d.id = p_donation_id
  returning * into v_row;
  return jsonb_build_object('ok', true, 'donation', to_jsonb(v_row));
end;
$$;
revoke all on function public.update_basket_donation(uuid,text,text,text) from public;
grant execute on function public.update_basket_donation(uuid,text,text,text) to authenticated;

-- ========== STORAGE ==========
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('raffle-baskets','raffle-baskets', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Raffle basket images are publicly readable" on storage.objects;
create policy "Raffle basket images are publicly readable" on storage.objects
  for select using (bucket_id = 'raffle-baskets');

drop policy if exists "Authenticated members upload raffle basket images" on storage.objects;
create policy "Authenticated members upload raffle basket images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'raffle-baskets' and public.kos_current_member_id() is not null);

drop policy if exists "Authenticated members update raffle basket images" on storage.objects;
create policy "Authenticated members update raffle basket images" on storage.objects
  for update to authenticated
  using (bucket_id = 'raffle-baskets' and public.kos_current_member_id() is not null)
  with check (bucket_id = 'raffle-baskets' and public.kos_current_member_id() is not null);

drop policy if exists "Authenticated members delete raffle basket images" on storage.objects;
create policy "Authenticated members delete raffle basket images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'raffle-baskets' and (public.kos_current_member_id() is not null or public.is_krewe_officer()));

-- Grant execute on is_krewe_officer to authenticated (used by members.html)
grant execute on function public.is_krewe_officer() to authenticated;
