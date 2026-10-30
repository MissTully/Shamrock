-- Feature on public site.
-- Apply manually in the Supabase SQL editor on project oazwkwflgbthojvnclfc.
-- Safe to re-run. Do not apply from the app.
--
-- officer_upsert_event (latest body in sql/kos_parade_season.sql) already
-- writes events.is_featured and clears the flag on other rows. This file
-- makes sure the column exists, and a trigger finishes that write:
-- featuring an event makes it public and published and clears members only.
-- officer_list_events already returns the full row via to_jsonb, restated
-- here so is_featured is included. v_public_events already exposes
-- is_featured to the public home page and events listing.

alter table public.events
  add column if not exists is_featured boolean not null default false;

comment on column public.events.is_featured is
  'When true, public pages highlight this event. Featuring also sets is_public, clears members_only, and sets status to published. Only one row stays featured. Pages skip a featured event after it has ended.';

create or replace function public.events_apply_featured_rules()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.is_featured, false) then
    new.is_public := true;
    new.members_only := false;
    if lower(coalesce(new.status, '')) is distinct from 'published' then
      new.status := 'published';
    end if;
    update public.events
       set is_featured = false
     where is_featured is true
       and id is distinct from new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists events_apply_featured_rules on public.events;
create trigger events_apply_featured_rules
  before insert or update of is_featured on public.events
  for each row
  execute function public.events_apply_featured_rules();

-- Same list officers already use. to_jsonb(e) includes is_featured.
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
          'raffle_ticket_price', r.ticket_price,
          'raffle_event_name', r.name
        )
        order by e.start_time desc
      )
      from public.events e
      left join public.raffle_events r on r.id = e.raffle_event_id
      where coalesce(e.source,'') <> 'ikc'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.officer_list_events() from public;
grant execute on function public.officer_list_events() to authenticated;

-- Public read view. Includes volunteer_cap from sql/kos_hub_volunteer_hours.sql
-- and is_featured for the home page and events listing.
drop view if exists public.v_public_events;
create view public.v_public_events
with (security_invoker = true) as
select
  id, name, description, event_type, start_time, end_time, location,
  capacity, volunteer_cap, is_public, source, external_url,
  ticket_price_cents, ticket_label, ticket_payment_url, flyer_url,
  status, is_featured, collect_guests, collect_guest_names,
  collect_raffle, raffle_options, raffle_event_id, collect_meals,
  meal_options, is_online, registration_closes_at, members_only
from public.events
where is_public = true;

grant select on public.v_public_events to anon, authenticated;
