-- Event lists stay up through midnight America/New_York at the end of the
-- day after an event's last day. Last day is end_time when set, otherwise
-- start_time.
--
-- Example: an event on Monday at 5 PM ET stays listed through Tuesday
-- 11:59 PM ET, and drops off at Wednesday 12:00 AM ET.
--
-- NOT APPLIED. Run this in the Supabase SQL editor when you are ready.
-- The public site and Member Hub already apply the same cutoff in
-- assets/kos-calendar.js. This function is the one list that filters in
-- SQL, so the guest-march dropdown cannot show the extra day until this
-- is applied. Signup buttons on the site already refuse a parade that
-- has started.

create or replace function public.list_public_parade_guest_events()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'events', coalesce((
      select jsonb_agg(public.kos_parade_guest_public_row(e) order by e.start_time nulls last, e.name)
      from public.events e
      where lower(coalesce(e.event_type, '')) = 'parade'
        and coalesce(e.source, 'krewe') = 'krewe'
        and lower(coalesce(e.status, 'published')) = 'published'
        and coalesce(e.guest_capacity, 0) > 0
        and (
          e.start_time is null
          or (
            ((coalesce(e.end_time, e.start_time) at time zone 'America/New_York')::date + 2)
            > (now() at time zone 'America/New_York')::date
          )
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_public_parade_guest_events() from public;
grant execute on function public.list_public_parade_guest_events() to anon, authenticated;
