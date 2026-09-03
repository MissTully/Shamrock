-- Inter-Krewe Council (IKC) calendar sync.
-- Applied to the Krewe of Shamrock project (oazwkwflgbthojvnclfc) on 2026-09-03
-- as migrations kos_ikc_calendar_sync, kos_rsvp_excludes_ikc_and_first_sync,
-- and kos_ikc_sync_trim_names.
--
-- WHAT IT DOES: the IKC calendar (https://interkrewe.com/Calendar) is hosted
-- on Tockify, which publishes a standard iCalendar feed at
-- https://tockify.com/api/feeds/ics/inter.krewe. A database function fetches
-- that feed (the `http` extension), parses each VEVENT, and upserts it into
-- public.events with source = 'ikc'. pg_cron re-runs it every morning at
-- 07:30 UTC (3:30 AM Eastern), and future IKC events that vanish from the
-- feed (cancelled/moved) are removed. The website renders source='ikc'
-- events in purple, keeps them out of the RSVP dropdown, and links each one
-- to its detail page so members can attend other krewes' events.
--
-- The rsvp_to_event function (sql/kos_public_events_and_rsvp.sql) was also
-- updated: its event lookup now requires `and source <> 'ikc'`.

-- 1. Where did this event come from?
alter table public.events add column if not exists source text not null default 'krewe';
alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check check (source in ('krewe','ikc'));
alter table public.events add column if not exists external_uid text;
alter table public.events add column if not exists external_url text;
create unique index if not exists events_ikc_uid_key on public.events (external_uid) where source = 'ikc';

-- 2. Extensions: synchronous HTTP client + cron scheduler
create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

-- 3. Helpers
-- Un-escape ICS text (\, \; \n \\) and trim it; empty becomes NULL.
create or replace function public.ikc_clean_text(p text)
returns text language sql immutable set search_path to '' as
$$ select nullif(btrim(replace(replace(replace(replace(coalesce(p,''), '\,', ','), '\;', ';'), '\n', ' '), '\\', '\')), '') $$;

-- Parse an ICS timestamp. All-day dates are treated as midnight Eastern
-- (the site renders midnight as "Time TBA").
create or replace function public.ikc_parse_ics_ts(p_raw text, p_tz text)
returns timestamptz
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_ts timestamp;
begin
  if p_raw is null then return null; end if;
  if length(p_raw) = 8 then
    v_ts := to_date(p_raw, 'YYYYMMDD')::timestamp;
    return v_ts at time zone 'America/New_York';
  end if;
  v_ts := (substr(p_raw,1,4) || '-' || substr(p_raw,5,2) || '-' || substr(p_raw,7,2) || ' '
        || substr(p_raw,10,2) || ':' || substr(p_raw,12,2) || ':' || substr(p_raw,14,2))::timestamp;
  if p_raw like '%Z' then
    return v_ts at time zone 'UTC';
  end if;
  return v_ts at time zone coalesce(p_tz, 'America/New_York');
exception when others then
  return null;
end;
$function$;

-- 4. The sync function
create or replace function public.sync_ikc_calendar()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_resp   extensions.http_response;
  v_body   text;
  v_block  text;
  v_uid    text;
  v_name   text;
  v_loc    text;
  v_url    text;
  v_tz     text;
  v_raw    text;
  v_start  timestamptz;
  v_end    timestamptz;
  v_seen   text[] := '{}';
  v_upserts int := 0;
  v_removed int := 0;
begin
  v_resp := extensions.http_get('https://tockify.com/api/feeds/ics/inter.krewe');
  if v_resp.status <> 200 then
    return jsonb_build_object('ok', false, 'status', v_resp.status);
  end if;

  -- Unfold RFC 5545 continuation lines (a newline followed by a space or tab)
  v_body := regexp_replace(v_resp.content, E'\r?\n[ \t]', '', 'g');

  for v_block in
    select m[1] from regexp_matches(v_body, 'BEGIN:VEVENT(.*?)END:VEVENT', 'g') m
  loop
    v_uid  := trim(trailing E'\r' from (regexp_match(v_block, E'(?m)^UID[^:]*:(.*)$'))[1]);
    v_name := public.ikc_clean_text(trim(trailing E'\r' from (regexp_match(v_block, E'(?m)^SUMMARY[^:]*:(.*)$'))[1]));
    v_loc  := public.ikc_clean_text(trim(trailing E'\r' from (regexp_match(v_block, E'(?m)^LOCATION[^:]*:(.*)$'))[1]));
    v_url  := trim(trailing E'\r' from (regexp_match(v_block, E'(?m)^URL[^:]*:(.*)$'))[1]);
    if v_uid is null or v_name is null then
      continue;
    end if;

    -- Start/end: 20261024T180000Z (UTC), TZID=...:20261024T180000, or all-day 20261024
    v_raw := trim(trailing E'\r' from (regexp_match(v_block, E'(?m)^DTSTART[^:]*:([0-9TZ]+)'))[1]);
    v_tz  := (regexp_match(v_block, E'(?m)^DTSTART;[^:]*TZID=([^:;\r]+)'))[1];
    v_start := public.ikc_parse_ics_ts(v_raw, v_tz);
    v_raw := trim(trailing E'\r' from (regexp_match(v_block, E'(?m)^DTEND[^:]*:([0-9TZ]+)'))[1]);
    v_tz  := (regexp_match(v_block, E'(?m)^DTEND;[^:]*TZID=([^:;\r]+)'))[1];
    v_end := public.ikc_parse_ics_ts(v_raw, v_tz);

    -- Only future events (and nothing absurdly far out)
    if v_start is null or v_start < now() - interval '1 day' or v_start > now() + interval '400 days' then
      continue;
    end if;

    insert into public.events (name, event_type, start_time, end_time, location, is_public, source, external_uid, external_url, notes)
    values (v_name, 'other', v_start, v_end, v_loc, true, 'ikc', v_uid, v_url,
            'Synced automatically from the Inter-Krewe Council calendar.')
    on conflict (external_uid) where source = 'ikc'
    do update set name = excluded.name,
                  start_time = excluded.start_time,
                  end_time = excluded.end_time,
                  location = excluded.location,
                  external_url = excluded.external_url;
    v_upserts := v_upserts + 1;
    v_seen := v_seen || v_uid;
  end loop;

  -- A future IKC event that vanished from the feed was cancelled or moved
  if array_length(v_seen, 1) is not null then
    delete from public.events
    where source = 'ikc' and start_time > now()
      and (external_uid is null or not (external_uid = any(v_seen)));
    get diagnostics v_removed = row_count;
  end if;

  return jsonb_build_object('ok', true, 'upserted', v_upserts, 'removed', v_removed);
end;
$function$;

-- Internal only: cron runs it; clients cannot
revoke execute on function public.sync_ikc_calendar() from public, anon, authenticated;
revoke execute on function public.ikc_parse_ics_ts(text, text) from public, anon, authenticated;
revoke execute on function public.ikc_clean_text(text) from public, anon, authenticated;

-- 5. Refresh daily at 07:30 UTC (3:30 AM Eastern). Run once by hand with:
--    select public.sync_ikc_calendar();
select cron.schedule('sync-ikc-calendar-daily', '30 7 * * *', $$select public.sync_ikc_calendar()$$);
