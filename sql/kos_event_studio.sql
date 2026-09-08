-- Event Studio: authorized officers/chairs create & edit events + optional Stripe ticket links
-- Applied live to Supabase project oazwkwflgbthojvnclfc (2026-09-06).

create or replace function public.can_manage_events()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_krewe_officer()
    or exists (
      select 1 from public.member_roles r
      where r.user_id = auth.uid()
        and r.role in ('board','officer','captain','committee_chair')
    )
    or exists (
      select 1
      from public.members m
      join public.profiles p on p.member_id = m.id
      where p.id = auth.uid()
        and m.membership_status = 'active'
        and (
          m.member_role in ('officer','captain','board')
          or coalesce(m.officer_title,'') ~* '(chair|committee|board|treasurer|secretary|captain|lieutenant)'
        )
    );
$$;

revoke all on function public.can_manage_events() from public;
grant execute on function public.can_manage_events() to authenticated;

alter table public.events
  add column if not exists ticket_price_cents integer,
  add column if not exists ticket_label text,
  add column if not exists ticket_payment_url text,
  add column if not exists flyer_url text,
  add column if not exists status text not null default 'published',
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.events drop constraint if exists events_status_check;
  alter table public.events add constraint events_status_check
    check (status in ('draft','published','cancelled'));
exception when others then null;
end $$;

create or replace function public.officer_upsert_event(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_row public.events%rowtype;
  v_name text;
  v_start timestamptz;
begin
  if not public.can_manage_events() then
    return jsonb_build_object('ok', false, 'message',
      'Only board members, officers, and committee chairs can manage events.');
  end if;

  v_name := nullif(btrim(coalesce(p->>'name','')), '');
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'Event name is required.');
  end if;

  begin
    v_start := (p->>'start_time')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'message', 'A valid start date/time is required.');
  end;
  if v_start is null then
    return jsonb_build_object('ok', false, 'message', 'A valid start date/time is required.');
  end if;

  v_id := nullif(p->>'id','')::uuid;

  if v_id is null then
    insert into public.events (
      name, description, event_type, start_time, end_time, location, capacity,
      is_mandatory, is_public, notes, source, ticket_price_cents, ticket_label,
      ticket_payment_url, flyer_url, status, created_by
    ) values (
      v_name,
      nullif(p->>'description',''),
      coalesce(nullif(p->>'event_type',''), 'social'),
      v_start,
      nullif(p->>'end_time','')::timestamptz,
      nullif(p->>'location',''),
      nullif(p->>'capacity','')::integer,
      coalesce((p->>'is_mandatory')::boolean, false),
      coalesce((p->>'is_public')::boolean, true),
      nullif(p->>'notes',''),
      'member_hub',
      nullif(p->>'ticket_price_cents','')::integer,
      nullif(p->>'ticket_label',''),
      nullif(p->>'ticket_payment_url',''),
      nullif(p->>'flyer_url',''),
      coalesce(nullif(p->>'status',''), 'published'),
      auth.uid()
    )
    returning * into v_row;
  else
    update public.events e set
      name = v_name,
      description = coalesce(nullif(p->>'description',''), e.description),
      event_type = coalesce(nullif(p->>'event_type',''), e.event_type),
      start_time = v_start,
      end_time = coalesce(nullif(p->>'end_time','')::timestamptz, e.end_time),
      location = coalesce(nullif(p->>'location',''), e.location),
      capacity = case when p ? 'capacity' then nullif(p->>'capacity','')::integer else e.capacity end,
      is_mandatory = coalesce((p->>'is_mandatory')::boolean, e.is_mandatory),
      is_public = coalesce((p->>'is_public')::boolean, e.is_public),
      notes = coalesce(nullif(p->>'notes',''), e.notes),
      ticket_price_cents = case when p ? 'ticket_price_cents' then nullif(p->>'ticket_price_cents','')::integer else e.ticket_price_cents end,
      ticket_label = case when p ? 'ticket_label' then nullif(p->>'ticket_label','') else e.ticket_label end,
      ticket_payment_url = case when p ? 'ticket_payment_url' then nullif(p->>'ticket_payment_url','') else e.ticket_payment_url end,
      flyer_url = case when p ? 'flyer_url' then nullif(p->>'flyer_url','') else e.flyer_url end,
      status = coalesce(nullif(p->>'status',''), e.status),
      updated_at = now()
    where e.id = v_id
      and coalesce(e.source,'') <> 'ikc'
    returning * into v_row;

    if not found then
      return jsonb_build_object('ok', false, 'message',
        'Event not found or cannot be edited (IKC sync events are read-only).');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'event', to_jsonb(v_row));
end;
$$;

revoke all on function public.officer_upsert_event(jsonb) from public;
grant execute on function public.officer_upsert_event(jsonb) to authenticated;

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
      select jsonb_agg(to_jsonb(e) order by e.start_time desc)
      from public.events e
      where coalesce(e.source,'') <> 'ikc'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.officer_list_events() from public;
grant execute on function public.officer_list_events() to authenticated;
