-- Event-tied raffle tickets (Krewe of Shamrock).
-- Apply in Supabase SQL editor after kos_raffles.sql + kos_event_ticket_intent_and_reports.sql.
-- Safe to run more than once.
--
-- Adds: raffle ↔ krewe event link, Zeffy URL on the raffle, payment_id on entries,
-- paid-only draws, settlement RPCs, and kos_record_payment raffle credit from
-- Zeffy line items (idempotent on payment id). Prefer 50/50 quantity-as-tickets.

-- ---------------------------------------------------------------------------
-- A. raffle_events: link to krewe events + optional night-of Zeffy URL
-- ---------------------------------------------------------------------------
alter table public.raffle_events
  add column if not exists krewe_event_id uuid references public.events(id) on delete set null,
  add column if not exists zeffy_payment_url text;

comment on column public.raffle_events.krewe_event_id is
  'Krewe events.id this raffle belongs to (one night’s raffle ↔ one event).';
comment on column public.raffle_events.zeffy_payment_url is
  'Optional Zeffy form for card raffle sales (night-of or raffle-only). If blank, the linked event ticket_payment_url is used.';

create index if not exists raffle_events_krewe_event_idx
  on public.raffle_events (krewe_event_id)
  where krewe_event_id is not null;

-- One live raffle of a given type per krewe event (50/50 and basket may coexist).
drop index if exists raffle_events_one_active_type_per_krewe;
create unique index raffle_events_one_active_type_per_krewe
  on public.raffle_events (krewe_event_id, raffle_type)
  where krewe_event_id is not null and is_active;

-- ---------------------------------------------------------------------------
-- B. entries: payment_id for Zeffy idempotency
-- ---------------------------------------------------------------------------
alter table public.raffle_5050_entries
  add column if not exists payment_id uuid references public.payments(id) on delete set null;
alter table public.raffle_basket_entries
  add column if not exists payment_id uuid references public.payments(id) on delete set null;

create unique index if not exists raffle_5050_entries_payment_uidx
  on public.raffle_5050_entries (payment_id)
  where payment_id is not null;
create unique index if not exists raffle_basket_entries_payment_uidx
  on public.raffle_basket_entries (payment_id)
  where payment_id is not null;

create index if not exists raffle_5050_entries_paid_idx
  on public.raffle_5050_entries (event_id, paid);
create index if not exists raffle_basket_entries_paid_idx
  on public.raffle_basket_entries (basket_id, paid);

-- ---------------------------------------------------------------------------
-- C. Public views: paid tickets are the drum; unpaid are listed separately
-- ---------------------------------------------------------------------------
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
  e.krewe_event_id,
  e.zeffy_payment_url,
  ev.name as linked_event_name,
  ev.ticket_payment_url as linked_event_ticket_url,
  coalesce((
    select sum(x.tickets)::int from public.raffle_5050_entries x
    where x.event_id = e.id and x.paid = true
  ), 0) as pot_tickets,
  coalesce((
    select sum(x.tickets)::int from public.raffle_5050_entries x
    where x.event_id = e.id and x.paid = false
  ), 0) as unpaid_tickets,
  coalesce((
    select sum(be.tickets)::int
    from public.raffle_basket_entries be
    join public.raffle_baskets b on b.id = be.basket_id
    where b.raffle_event_id = e.id and be.paid = true
  ), 0) as basket_tickets,
  coalesce((
    select sum(be.tickets)::int
    from public.raffle_basket_entries be
    join public.raffle_baskets b on b.id = be.basket_id
    where b.raffle_event_id = e.id and be.paid = false
  ), 0) as unpaid_basket_tickets
from public.raffle_events e
left join public.events ev on ev.id = e.krewe_event_id;

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
  coalesce((
    select sum(e.tickets)::int from public.raffle_basket_entries e
    where e.basket_id = b.id and e.paid = true
  ), 0) as tickets,
  coalesce((
    select sum(e.tickets)::int from public.raffle_basket_entries e
    where e.basket_id = b.id and e.paid = false
  ), 0) as unpaid_tickets
from public.raffle_baskets b;

grant select on public.v_raffle_events_public to anon, authenticated;
grant select on public.v_raffle_baskets_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- D. create / update raffle (link krewe event)
-- ---------------------------------------------------------------------------
drop function if exists public.create_raffle(text, text, text, numeric, date, text, text);
drop function if exists public.create_raffle(text, text, text, numeric, date);

create or replace function public.create_raffle(
  p_name text,
  p_type text,
  p_description text,
  p_ticket_price numeric,
  p_event_date date,
  p_audience text default 'both',
  p_charity_blurb text default null,
  p_krewe_event_id uuid default null,
  p_zeffy_payment_url text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_mid uuid := public.kos_current_member_id();
  v_type text := lower(nullif(btrim(coalesce(p_type,'')),''));
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
  v_aud text := lower(nullif(btrim(coalesce(p_audience,'both')),''));
  v_url text := nullif(btrim(coalesce(p_zeffy_payment_url,'')),'');
  v_row public.raffle_events%rowtype;
  v_event public.events%rowtype;
  v_date date := p_event_date;
begin
  if auth.uid() is null then raise exception 'Sign in to create a raffle.'; end if;
  if v_mid is null then raise exception 'Link your member profile before creating a raffle.'; end if;
  if v_name is null then raise exception 'Please enter a raffle name.'; end if;
  if v_type is null or v_type not in ('basket','fifty_fifty') then
    raise exception 'Type must be basket or fifty_fifty.';
  end if;
  if v_aud is null or v_aud not in ('internal','external','both') then v_aud := 'both'; end if;

  if p_krewe_event_id is not null then
    select * into v_event from public.events
     where id = p_krewe_event_id and coalesce(source,'') <> 'ikc';
    if not found then raise exception 'Linked krewe event was not found.'; end if;
    if v_date is null and v_event.start_time is not null then
      v_date := (v_event.start_time at time zone 'America/New_York')::date;
    end if;
  end if;

  begin
    insert into public.raffle_events(
      name, raffle_type, description, ticket_price, event_date, audience,
      charity_blurb, created_by, is_active, krewe_event_id, zeffy_payment_url
    ) values (
      v_name, v_type, nullif(btrim(coalesce(p_description,'')),''),
      coalesce(p_ticket_price,1), v_date, v_aud,
      nullif(btrim(coalesce(p_charity_blurb,'')),''), auth.uid(), true,
      p_krewe_event_id, v_url
    ) returning * into v_row;
  exception when unique_violation then
    raise exception 'That krewe event already has an active % raffle. Unlink or close the other one first.', v_type;
  end;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'event', to_jsonb(v_row));
end;
$$;
revoke all on function public.create_raffle(text,text,text,numeric,date,text,text,uuid,text) from public;
grant execute on function public.create_raffle(text,text,text,numeric,date,text,text,uuid,text) to authenticated;

create or replace function public.update_raffle(p_id uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_row public.raffle_events%rowtype;
  v_event public.events%rowtype;
  v_krewe uuid;
  v_url text;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_row from public.raffle_events where id = p_id;
  if not found then raise exception 'Raffle not found.'; end if;
  if not public.kos_can_manage_raffle(p_id) then raise exception 'Not authorized to manage this raffle.'; end if;

  v_krewe := v_row.krewe_event_id;
  if p ? 'krewe_event_id' then
    v_krewe := nullif(btrim(coalesce(p->>'krewe_event_id','')), '')::uuid;
  end if;
  if v_krewe is not null then
    select * into v_event from public.events
     where id = v_krewe and coalesce(source,'') <> 'ikc';
    if not found then raise exception 'Linked krewe event was not found.'; end if;
  end if;

  v_url := v_row.zeffy_payment_url;
  if p ? 'zeffy_payment_url' then
    v_url := nullif(btrim(coalesce(p->>'zeffy_payment_url','')), '');
  end if;

  begin
    update public.raffle_events e set
      name = coalesce(nullif(btrim(coalesce(p->>'name','')),''), e.name),
      description = case when p ? 'description' then nullif(btrim(coalesce(p->>'description','')),'') else e.description end,
      charity_blurb = case when p ? 'charity_blurb' then nullif(btrim(coalesce(p->>'charity_blurb','')),'') else e.charity_blurb end,
      ticket_price = case when p ? 'ticket_price' then coalesce(nullif(p->>'ticket_price','')::numeric, e.ticket_price) else e.ticket_price end,
      event_date = case when p ? 'event_date' then nullif(p->>'event_date','')::date else e.event_date end,
      audience = case when p ? 'audience' then coalesce(nullif(btrim(p->>'audience'),''), e.audience) else e.audience end,
      is_active = case when p ? 'is_active' then coalesce((p->>'is_active')::boolean, e.is_active) else e.is_active end,
      krewe_event_id = v_krewe,
      zeffy_payment_url = v_url,
      updated_at = now()
    where e.id = p_id
    returning * into v_row;
  exception when unique_violation then
    raise exception 'That krewe event already has an active raffle of this type.';
  end;

  return jsonb_build_object('ok', true, 'event', to_jsonb(v_row));
end;
$$;
revoke all on function public.update_raffle(uuid, jsonb) from public;
grant execute on function public.update_raffle(uuid, jsonb) to authenticated;

create or replace function public.list_events_for_raffle_link()
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'start_time', e.start_time,
      'ticket_payment_url', e.ticket_payment_url,
      'ticket_price_cents', e.ticket_price_cents
    ) order by e.start_time desc nulls last)
    from public.events e
    where coalesce(e.source,'') <> 'ikc'
      and lower(coalesce(e.status,'published')) <> 'cancelled'
      and (
        e.start_time is null
        or e.start_time > now() - interval '21 days'
        or exists (select 1 from public.raffle_events r where r.krewe_event_id = e.id)
      )
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_events_for_raffle_link() from public;
grant execute on function public.list_events_for_raffle_link() to authenticated;

-- ---------------------------------------------------------------------------
-- E. Paid-only draws
-- ---------------------------------------------------------------------------
create or replace function public.draw_basket_winner(p_basket_id uuid, p_redraw boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_b public.raffle_baskets%rowtype;
  v_total int;
  v_unpaid int;
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
  select coalesce(sum(tickets),0) into v_total
    from public.raffle_basket_entries where basket_id = p_basket_id and paid = true;
  select coalesce(sum(tickets),0) into v_unpaid
    from public.raffle_basket_entries where basket_id = p_basket_id and paid = false;
  if v_total < 1 then
    if v_unpaid > 0 then
      raise exception 'No paid tickets to draw. % unpaid ticket(s) are waiting for a volunteer to mark paid.', v_unpaid;
    end if;
    raise exception 'No tickets to draw.';
  end if;
  v_pick := 1 + floor(random() * v_total)::int;
  for r in
    select * from public.raffle_basket_entries
     where basket_id = p_basket_id and paid = true
     order by created_at, id
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
  return jsonb_build_object(
    'ok', true, 'winner_name', v_name, 'entry_id', v_entry.id,
    'tickets', v_total, 'unpaid_skipped', v_unpaid
  );
end;
$$;
revoke all on function public.draw_basket_winner(uuid,boolean) from public;
grant execute on function public.draw_basket_winner(uuid,boolean) to authenticated;

create or replace function public.draw_5050_winner(p_event_id uuid, p_redraw boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_e public.raffle_events%rowtype;
  v_total int;
  v_unpaid int;
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
  select coalesce(sum(tickets),0) into v_total
    from public.raffle_5050_entries where event_id = p_event_id and paid = true;
  select coalesce(sum(tickets),0) into v_unpaid
    from public.raffle_5050_entries where event_id = p_event_id and paid = false;
  if v_total < 1 then
    if v_unpaid > 0 then
      raise exception 'No paid tickets to draw. % unpaid ticket(s) are waiting for a volunteer to mark paid.', v_unpaid;
    end if;
    raise exception 'No tickets to draw.';
  end if;
  v_pick := 1 + floor(random() * v_total)::int;
  for r in
    select * from public.raffle_5050_entries
     where event_id = p_event_id and paid = true
     order by created_at, id
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
  return jsonb_build_object(
    'ok', true, 'winner_name', v_name, 'entry_id', v_entry.id,
    'pot', v_pot, 'tickets', v_total, 'unpaid_skipped', v_unpaid
  );
end;
$$;
revoke all on function public.draw_5050_winner(uuid,boolean) from public;
grant execute on function public.draw_5050_winner(uuid,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- F. Officer settlement: paid vs unpaid list + mark paid
-- ---------------------------------------------------------------------------
create or replace function public.get_raffle_settlement(p_raffle_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_e public.raffle_events%rowtype;
  v_paid int := 0;
  v_unpaid int := 0;
  v_entries jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into v_e from public.raffle_events where id = p_raffle_id;
  if not found then raise exception 'Raffle not found.'; end if;
  if not public.kos_can_manage_raffle(p_raffle_id) then raise exception 'Not authorized.'; end if;

  if v_e.raffle_type = 'fifty_fifty' then
    select coalesce(sum(tickets) filter (where paid), 0),
           coalesce(sum(tickets) filter (where not paid), 0)
      into v_paid, v_unpaid
    from public.raffle_5050_entries where event_id = p_raffle_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id,
      'kind', 'fifty_fifty',
      'name', public.kos_raffle_display_name(x.member_id, x.user_id, x.guest_name),
      'email', x.guest_email,
      'tickets', x.tickets,
      'paid', x.paid,
      'payment_id', x.payment_id,
      'created_at', x.created_at
    ) order by x.paid, x.created_at, x.id), '[]'::jsonb)
      into v_entries
    from public.raffle_5050_entries x
    where x.event_id = p_raffle_id;
  else
    select coalesce(sum(be.tickets) filter (where be.paid), 0),
           coalesce(sum(be.tickets) filter (where not be.paid), 0)
      into v_paid, v_unpaid
    from public.raffle_basket_entries be
    join public.raffle_baskets b on b.id = be.basket_id
    where b.raffle_event_id = p_raffle_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', be.id,
      'kind', 'basket',
      'basket_id', be.basket_id,
      'basket_name', b.name,
      'name', public.kos_raffle_display_name(be.member_id, be.user_id, be.guest_name),
      'email', be.guest_email,
      'tickets', be.tickets,
      'paid', be.paid,
      'payment_id', be.payment_id,
      'created_at', be.created_at
    ) order by be.paid, b.display_order, be.created_at, be.id), '[]'::jsonb)
      into v_entries
    from public.raffle_basket_entries be
    join public.raffle_baskets b on b.id = be.basket_id
    where b.raffle_event_id = p_raffle_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'raffle_id', p_raffle_id,
    'raffle_type', v_e.raffle_type,
    'name', v_e.name,
    'krewe_event_id', v_e.krewe_event_id,
    'paid_tickets', v_paid,
    'unpaid_tickets', v_unpaid,
    'entries', v_entries
  );
end;
$$;
revoke all on function public.get_raffle_settlement(uuid) from public;
grant execute on function public.get_raffle_settlement(uuid) to authenticated;

create or replace function public.set_raffle_entry_paid(
  p_kind text,
  p_entry_id uuid,
  p_paid boolean default true
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_kind text := lower(nullif(btrim(coalesce(p_kind,'')),''));
  v_raffle uuid;
  v_paid boolean := coalesce(p_paid, true);
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if v_kind is null or v_kind not in ('fifty_fifty','basket','5050') then
    raise exception 'Kind must be fifty_fifty or basket.';
  end if;
  if v_kind = '5050' then v_kind := 'fifty_fifty'; end if;

  if v_kind = 'fifty_fifty' then
    select event_id into v_raffle from public.raffle_5050_entries where id = p_entry_id;
    if not found then raise exception 'Entry not found.'; end if;
    if not public.kos_can_manage_raffle(v_raffle) then raise exception 'Not authorized.'; end if;
    update public.raffle_5050_entries set paid = v_paid where id = p_entry_id;
  else
    select b.raffle_event_id into v_raffle
      from public.raffle_basket_entries e
      join public.raffle_baskets b on b.id = e.basket_id
     where e.id = p_entry_id;
    if not found then raise exception 'Entry not found.'; end if;
    if not public.kos_can_manage_raffle(v_raffle) then raise exception 'Not authorized.'; end if;
    update public.raffle_basket_entries set paid = v_paid where id = p_entry_id;
  end if;

  return jsonb_build_object('ok', true, 'entry_id', p_entry_id, 'paid', v_paid, 'kind', v_kind);
end;
$$;
revoke all on function public.set_raffle_entry_paid(text, uuid, boolean) from public;
grant execute on function public.set_raffle_entry_paid(text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- G. get_my_raffles: include link + paid/unpaid
-- ---------------------------------------------------------------------------
create or replace function public.get_my_raffles() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_off boolean := public.is_krewe_officer();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  if not v_off then
    begin
      v_off := public.can_manage_raffles();
    exception when others then
      v_off := false;
    end;
  end if;
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
        e.krewe_event_id,
        e.zeffy_payment_url,
        ev.name as linked_event_name,
        ev.ticket_payment_url as linked_event_ticket_url,
        (e.created_by = v_uid) as mine,
        coalesce((select sum(t.tickets)::int from public.raffle_5050_entries t where t.event_id = e.id and t.paid),0) as pot_tickets,
        coalesce((select sum(t.tickets)::int from public.raffle_5050_entries t where t.event_id = e.id and not t.paid),0) as unpaid_tickets,
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
            'tickets', coalesce((select sum(en.tickets)::int from public.raffle_basket_entries en where en.basket_id = b.id and en.paid),0),
            'unpaid_tickets', coalesce((select sum(en.tickets)::int from public.raffle_basket_entries en where en.basket_id = b.id and not en.paid),0)
          ) order by b.display_order, b.created_at)
          from public.raffle_baskets b where b.raffle_event_id = e.id
        ), '[]'::jsonb) else '[]'::jsonb end as baskets
      from public.raffle_events e
      left join public.events ev on ev.id = e.krewe_event_id
      where e.created_by = v_uid or v_off
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_my_raffles() from public;
grant execute on function public.get_my_raffles() to authenticated;

-- ---------------------------------------------------------------------------
-- H. Payment → raffle: find raffle + credit paid entries (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.kos_find_raffle_for_payment(p jsonb, p_event_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_slug text := nullif(lower(btrim(coalesce(p->>'campaign_slug', ''))), '');
  v_desc_key text := public.kos_normalize_event_key(p->>'description');
begin
  if nullif(p->>'raffle_event_id', '') is not null then
    select id into v_id from public.raffle_events where id = (p->>'raffle_event_id')::uuid;
    if v_id is not null then return v_id; end if;
  end if;

  if p_event_id is not null then
    -- Prefer a live 50/50 tied to this krewe event.
    select r.id into v_id
    from public.raffle_events r
    where r.krewe_event_id = p_event_id
      and r.is_active
      and r.drawn_at is null
    order by case when r.raffle_type = 'fifty_fifty' then 0 else 1 end, r.created_at desc
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if v_slug is not null then
    select r.id into v_id
    from public.raffle_events r
    where coalesce(r.zeffy_payment_url, '') ilike '%' || v_slug || '%'
    order by r.is_active desc, r.created_at desc
    limit 1;
    if v_id is not null then return v_id; end if;

    select r.id into v_id
    from public.raffle_events r
    join public.events e on e.id = r.krewe_event_id
    where coalesce(e.ticket_payment_url, '') ilike '%' || v_slug || '%'
    order by r.is_active desc, r.created_at desc
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if v_desc_key is not null then
    select r.id into v_id
    from public.raffle_events r
    where public.kos_normalize_event_key(r.name) = v_desc_key
    order by r.is_active desc, r.created_at desc
    limit 1;
  end if;

  return v_id;
end;
$$;
revoke all on function public.kos_find_raffle_for_payment(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.kos_find_raffle_for_payment(jsonb, uuid) to service_role;

create or replace function public.kos_credit_raffle_from_payment(
  p_payment_id uuid,
  p_raffle_id uuid,
  p_qty integer,
  p_member_id uuid,
  p_guest_name text,
  p_guest_email text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_e public.raffle_events%rowtype;
  v_qty int := greatest(coalesce(p_qty, 0), 0);
  v_entry uuid;
  v_basket uuid;
  v_basket_count int;
  v_name text := nullif(btrim(coalesce(p_guest_name, '')), '');
begin
  if p_payment_id is null or p_raffle_id is null or v_qty < 1 then
    return jsonb_build_object('ok', false, 'reason', 'skipped');
  end if;

  select * into v_e from public.raffle_events where id = p_raffle_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_raffle');
  end if;
  if v_e.drawn_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_drawn');
  end if;

  if v_name is null then v_name := 'Zeffy guest'; end if;

  if v_e.raffle_type = 'fifty_fifty' then
    select id into v_entry from public.raffle_5050_entries
     where payment_id = p_payment_id limit 1;
    if v_entry is not null then
      return jsonb_build_object('ok', true, 'duplicate', true, 'entry_id', v_entry, 'tickets', v_qty, 'kind', 'fifty_fifty');
    end if;
    begin
      insert into public.raffle_5050_entries (
        event_id, member_id, guest_name, guest_email, tickets, paid, payment_id
      ) values (
        p_raffle_id, p_member_id, v_name, nullif(btrim(coalesce(p_guest_email, '')), ''),
        v_qty, true, p_payment_id
      )
      returning id into v_entry;
    exception when unique_violation then
      select id into v_entry from public.raffle_5050_entries where payment_id = p_payment_id limit 1;
      return jsonb_build_object('ok', true, 'duplicate', true, 'entry_id', v_entry, 'tickets', v_qty, 'kind', 'fifty_fifty');
    end;
    return jsonb_build_object('ok', true, 'entry_id', v_entry, 'tickets', v_qty, 'kind', 'fifty_fifty');
  end if;

  -- Basket: only when there is exactly one basket (otherwise we cannot pick a line).
  select count(*)::int into v_basket_count
    from public.raffle_baskets where raffle_event_id = p_raffle_id;
  if v_basket_count <> 1 then
    return jsonb_build_object(
      'ok', false, 'reason', 'basket_ambiguous',
      'baskets', v_basket_count,
      'hint', '50/50 is credited automatically. Multi-basket raffles need a dedicated Zeffy line or cash entry.'
    );
  end if;
  select id into v_basket from public.raffle_baskets where raffle_event_id = p_raffle_id limit 1;

  select id into v_entry from public.raffle_basket_entries
   where payment_id = p_payment_id limit 1;
  if v_entry is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'entry_id', v_entry, 'tickets', v_qty, 'kind', 'basket');
  end if;
  begin
    insert into public.raffle_basket_entries (
      basket_id, member_id, guest_name, guest_email, tickets, paid, payment_id
    ) values (
      v_basket, p_member_id, v_name, nullif(btrim(coalesce(p_guest_email, '')), ''),
      v_qty, true, p_payment_id
    )
    returning id into v_entry;
  exception when unique_violation then
    select id into v_entry from public.raffle_basket_entries where payment_id = p_payment_id limit 1;
    return jsonb_build_object('ok', true, 'duplicate', true, 'entry_id', v_entry, 'tickets', v_qty, 'kind', 'basket');
  end;
  return jsonb_build_object('ok', true, 'entry_id', v_entry, 'tickets', v_qty, 'kind', 'basket', 'basket_id', v_basket);
end;
$$;
revoke all on function public.kos_credit_raffle_from_payment(uuid, uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.kos_credit_raffle_from_payment(uuid, uuid, integer, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- I. kos_record_payment: keep dues + auto-RSVP; add raffle credit
--     (replaces the live function from kos_event_ticket_intent_and_reports.sql)
-- ---------------------------------------------------------------------------
create or replace function public.kos_record_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- Mixed cart: guests = admission tickets minus the payer, never raffle qty.
  if v_admission_qty > 0 then
    v_ticket_count := v_admission_qty;
  elsif v_raffle_qty > 0 and v_kind = 'raffle' then
    v_ticket_count := 0;
  end if;

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
    v_event,
    v_year,
    p->'raw'
  )
  on conflict (provider_event_id) do nothing
  returning id into v_id;

  if v_id is null then
    v_duplicate := true;
    select id, member_id, event_id
      into v_id, v_member, v_event
    from public.payments
    where provider_event_id = p->>'provider_event_id'
    limit 1;
  end if;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_recorded');
  end if;

  if not v_duplicate then
    if v_kind = 'dues' and v_member is not null then
      update public.dues_payments
         set paid = true, paid_date = current_date, payment_method = 'card'
       where member_id = v_member
         and membership_year = v_year
         and paid = false;
    end if;

    -- Auto-RSVP when this payment includes event admission (kind=event or
    -- parsed admission qty), even if the same cart also has raffle tickets.
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

  -- Paid raffle entries from Zeffy raffle line items. Always attempted so a
  -- webhook retry after a partial first write still credits the drum once.
  if v_raffle_qty > 0 or v_kind = 'raffle' then
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
    'event_id', v_event,
    'matched_members', to_jsonb(v_matched),
    'rsvps', v_rsvp_results,
    'raffle_id', v_raffle,
    'raffle_qty', v_raffle_qty,
    'raffle', v_raffle_result
  );
end;
$function$;

revoke all on function public.kos_record_payment(jsonb) from public, anon, authenticated;
grant execute on function public.kos_record_payment(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- J. officer_list_events: attach linked raffles for Event Studio QR
-- ---------------------------------------------------------------------------
create or replace function public.officer_list_events()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.can_manage_events() then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.', 'events', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'events', coalesce((
      select jsonb_agg(
        to_jsonb(e) || jsonb_build_object(
          'linked_raffles', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', r.id,
              'name', r.name,
              'raffle_type', r.raffle_type,
              'ticket_price', r.ticket_price,
              'zeffy_payment_url', r.zeffy_payment_url,
              'is_active', r.is_active
            ) order by case when r.raffle_type = 'fifty_fifty' then 0 else 1 end, r.created_at)
            from public.raffle_events r
            where r.krewe_event_id = e.id
          ), '[]'::jsonb)
        )
        order by e.start_time desc
      )
      from public.events e
      where coalesce(e.source,'') <> 'ikc'
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.officer_list_events() from public;
grant execute on function public.officer_list_events() to authenticated;
