-- Krewe-curated IKC / Shamrock calendar entries for the 2026–27 season.
-- Safe to run more than once.
-- APPLIED LIVE on the Krewe project oazwkwflgbthojvnclfc on 2026-09-22.
--
-- The public events page reads public.events (via v_public_events). Krewe of
-- Shamrock rows use source = 'krewe' (gold month dots). Other krewes use
-- source = 'ikc' (Dates to Remember). sync_ikc_calendar() rewrites future IKC
-- rows from the Tockify feed every morning and deletes any future IKC row
-- whose uid disappeared. calendar_curated marks listings Missy sent for the
-- Krewe site so that sync keeps the name, time, and place we recorded.
--
-- Weekdays in the request that disagree with the calendar date (Tue Sep 30
-- is a Wednesday; Fri Oct 3 is a Saturday) follow the date already on the
-- site. Brigadoon's quarter auction is intentionally not added.

alter table public.events
  add column if not exists calendar_curated boolean not null default false;

comment on column public.events.calendar_curated is
  'When true, sync_ikc_calendar keeps this row and does not overwrite its name, start, end, or location.';

-- Same-day feed copies of a curated listing are not inserted again.
create or replace function public.ikc_names_match(a text, b text)
returns boolean
language sql
immutable
set search_path to ''
as $nm$
  with n as (
    select
      nullif(btrim(regexp_replace(lower(coalesce(a, '')), '[^a-z0-9]+', ' ', 'g')), '') as na,
      nullif(btrim(regexp_replace(lower(coalesce(b, '')), '[^a-z0-9]+', ' ', 'g')), '') as nb
  )
  select coalesce(
    na = nb
    or (length(na) >= 12 and position(na in nb) > 0)
    or (length(nb) >= 12 and position(nb in na) > 0),
    false
  )
  from n;
$nm$;

revoke execute on function public.ikc_names_match(text, text) from public, anon, authenticated;

create or replace function public.sync_ikc_calendar()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
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

    v_raw := trim(trailing E'\r' from (regexp_match(v_block, E'(?m)^DTSTART[^:]*:([0-9TZ]+)'))[1]);
    v_tz  := (regexp_match(v_block, E'(?m)^DTSTART;[^:]*TZID=([^:;\r]+)'))[1];
    v_start := public.ikc_parse_ics_ts(v_raw, v_tz);
    v_raw := trim(trailing E'\r' from (regexp_match(v_block, E'(?m)^DTEND[^:]*:([0-9TZ]+)'))[1]);
    v_tz  := (regexp_match(v_block, E'(?m)^DTEND;[^:]*TZID=([^:;\r]+)'))[1];
    v_end := public.ikc_parse_ics_ts(v_raw, v_tz);

    if v_start is null or v_start < now() - interval '1 day' or v_start > now() + interval '400 days' then
      continue;
    end if;

    -- A curated row already covers this listing. Leave its name, time, and place.
    if exists (
      select 1 from public.events e
      where coalesce(e.calendar_curated, false)
        and e.source = 'ikc'
        and e.external_uid is distinct from v_uid
        and e.start_time is not null
        and (e.start_time at time zone 'America/New_York')::date
            = (v_start at time zone 'America/New_York')::date
        and public.ikc_names_match(e.name, v_name)
    ) then
      continue;
    end if;

    insert into public.events (name, event_type, start_time, end_time, location, is_public, source, external_uid, external_url, notes)
    values (v_name, 'other', v_start, v_end, v_loc, true, 'ikc', v_uid, v_url,
            'Synced automatically from the Inter-Krewe Council calendar.')
    on conflict (external_uid) where source = 'ikc'
    do update set
      name = case when public.events.calendar_curated then public.events.name else excluded.name end,
      start_time = case when public.events.calendar_curated then public.events.start_time else excluded.start_time end,
      end_time = case when public.events.calendar_curated then public.events.end_time else excluded.end_time end,
      location = case when public.events.calendar_curated then public.events.location else excluded.location end,
      external_url = excluded.external_url;
    v_upserts := v_upserts + 1;
    v_seen := v_seen || v_uid;
  end loop;

  if array_length(v_seen, 1) is not null then
    delete from public.events
    where source = 'ikc'
      and start_time > now()
      and coalesce(calendar_curated, false) = false
      and (external_uid is null or not (external_uid = any(v_seen)));
    get diagnostics v_removed = row_count;
  end if;

  return jsonb_build_object('ok', true, 'upserted', v_upserts, 'removed', v_removed);
end;
$fn$;

revoke execute on function public.sync_ikc_calendar() from public, anon, authenticated;

-- Drop an all-day "time TBA" Tartan Ball if a timed Oct 24 ball is also present.
delete from public.events e
where coalesce(e.source, 'krewe') = 'krewe'
  and e.name ilike '%tartan ball%'
  and e.name not ilike '%basket%'
  and e.name not ilike '%happy hour%'
  and (e.start_time at time zone 'America/New_York')::date = date '2026-10-24'
  and (e.start_time at time zone 'America/New_York')::time = time '00:00'
  and exists (
    select 1 from public.events t
    where t.id <> e.id
      and coalesce(t.source, 'krewe') = 'krewe'
      and t.name ilike '%tartan ball%'
      and t.name not ilike '%basket%'
      and t.name not ilike '%happy hour%'
      and (t.start_time at time zone 'America/New_York')::date = date '2026-10-24'
      and (t.start_time at time zone 'America/New_York')::time <> time '00:00'
  );

-- ---------------------------------------------------------------------------
-- Krewe of Shamrock rows (source = krewe). Update the matching event.
-- ---------------------------------------------------------------------------

update public.events
set start_time = timestamptz '2026-09-30 18:30:00-04',
    end_time = timestamptz '2026-09-30 20:30:00-04',
    location = 'University Bobo Tea House, 2828 E Bearss Ave, Tampa, FL 33613',
    description = 'Yesteryear. $1 admission.',
    is_public = true,
    status = 'published'
where coalesce(source, 'krewe') = 'krewe'
  and name = 'Shamrock Book Club Night'
  and (start_time at time zone 'America/New_York')::date = date '2026-09-30';

update public.events
set name = 'Tartan Ball Basket-Making Happy Hour',
    start_time = timestamptz '2026-10-03 15:00:00-04',
    end_time = timestamptz '2026-10-03 17:00:00-04',
    location = 'The Fitzpatrick House, 15918 Muirfield Drive, Odessa, FL 33556',
    members_only = true,
    is_public = true,
    status = 'published',
    notes = 'Hosted by Debbie Fitzpatrick · (813) 382-0010. Members only. 3:00–5:00 PM. Basket-making happy hour for Tartan Ball raffle prep.'
where coalesce(source, 'krewe') = 'krewe'
  and name ilike '%basket%'
  and (start_time at time zone 'America/New_York')::date = date '2026-10-03';

update public.events
set start_time = timestamptz '2026-10-24 18:00:00-04',
    end_time = timestamptz '2026-10-24 22:00:00-04',
    notes = 'Crowning of the new King and Queen. Cocktail hour 6–7, dinner and presentations 7–8, dancing and raffles 8–10. Black-tie and tartan encouraged.',
    description = case
      when coalesce(description, '') ilike '%cocktail hour 6%' then description
      else rtrim(coalesce(description, '')) || E'\n\nProgram: cocktail hour 6–7, dinner and presentations 7–8, dancing and raffles 8–10. Crowning of the new King and Queen. Black-tie and tartan encouraged.'
    end
where coalesce(source, 'krewe') = 'krewe'
  and name = 'Tartan Ball'
  and (start_time at time zone 'America/New_York')::date = date '2026-10-24';

update public.events
set start_time = timestamptz '2026-12-05 17:00:00-05',
    end_time = timestamptz '2026-12-05 21:00:00-05',
    location = 'Downtown Tampa, FL',
    description = 'Tampa''s downtown holiday kickoff parade, a festive start to the krewe''s marching season. Shamrock marches about 5:00–9:00 PM. Exact step-off and staging post on the Member Hub closer to the date.',
    notes = 'Public step-off times are approximate until Member Hub staging is posted. Add the private staging address in Event Studio. Never put a street address in the public teaser.'
where coalesce(source, 'krewe') = 'krewe'
  and event_type = 'parade'
  and name = 'SantaFest'
  and start_time >= timestamptz '2026-12-05 00:00:00-05'
  and start_time < timestamptz '2026-12-06 00:00:00-05';

update public.events
set start_time = timestamptz '2027-01-23 09:00:00-05',
    end_time = timestamptz '2027-01-23 14:00:00-05',
    location = 'Bayshore Boulevard, Tampa, FL',
    description = 'The family-friendly, alcohol-free daytime parade along Bayshore. Shamrock marches about 9:00 AM–2:00 PM. Staging posts on the Member Hub.',
    notes = 'Public step-off times are approximate until Member Hub staging is posted. Family-friendly and alcohol-free. Add the private staging address in Event Studio. Never put a street address in the public teaser.'
where coalesce(source, 'krewe') = 'krewe'
  and event_type = 'parade'
  and name = 'Children''s Gasparilla'
  and start_time >= timestamptz '2027-01-23 00:00:00-05'
  and start_time < timestamptz '2027-01-24 00:00:00-05';

update public.events
set start_time = timestamptz '2027-01-30 12:00:00-05',
    end_time = timestamptz '2027-01-30 18:00:00-05',
    location = 'Bayshore Boulevard, Tampa, FL',
    description = 'The legendary pirate parade down Bayshore Boulevard, with the Castle of Shenanigans float. Shamrock marches about 12:00–6:00 PM. Staging posts on the Member Hub.',
    notes = 'Public step-off times are approximate until Member Hub staging is posted. Castle of Shenanigans float. Add the private staging address in Event Studio. Never put a street address in the public teaser.'
where coalesce(source, 'krewe') = 'krewe'
  and event_type = 'parade'
  and name = 'Gasparilla Parade of Pirates'
  and start_time >= timestamptz '2027-01-30 00:00:00-05'
  and start_time < timestamptz '2027-01-31 00:00:00-05';

update public.events
set start_time = timestamptz '2027-02-13 18:00:00-05',
    end_time = timestamptz '2027-02-13 23:00:00-05',
    location = 'Ybor City, Tampa, FL',
    description = 'The night parade through historic Ybor City. Shamrock marches about 6:00–11:00 PM. Staging posts on the Member Hub.',
    notes = 'Public step-off times are approximate until Member Hub staging is posted. Add the private staging address in Event Studio. Never put a street address in the public teaser.'
where coalesce(source, 'krewe') = 'krewe'
  and event_type = 'parade'
  and name = 'Sant''Yago Knight Parade'
  and start_time >= timestamptz '2027-02-13 00:00:00-05'
  and start_time < timestamptz '2027-02-14 12:00:00-05';

insert into public.events (
  name, description, event_type, start_time, end_time, location,
  is_public, members_only, status, source, external_url, flyer_url, notes
)
select
  'Watch: Rough Riders'' St. Patrick''s Day Parade',
  'March 2027 · date TBA. Shamrock home holiday. Update when IKC posts the firm date.',
  'parade',
  null,
  null,
  'Tampa, FL',
  true,
  true,
  'published',
  'krewe',
  'https://tamparoughriders.org/stpats',
  'assets/img/parades/st-patricks.webp',
  'Placeholder until IKC posts a firm date. Do not invent a step-off day.'
where not exists (
  select 1 from public.events e
  where coalesce(e.source, 'krewe') = 'krewe'
    and e.name ilike '%rough rider%patrick%'
);

-- ---------------------------------------------------------------------------
-- IKC rows. Update a similar feed row when one exists; otherwise insert a
-- curated row the daily sync will not delete.
-- ---------------------------------------------------------------------------

update public.events
set name = 'Krewe of Pandora — Topgolf Tampa Takeover',
    location = 'Topgolf Tampa, 10690 Palm River Road, Tampa, FL 33619',
    description = '$20 prepaid (Zelle) or $21 PayPal. Soft drinks included. Tickets are not sold day-of. kreweofpandora.com',
    calendar_curated = true,
    notes = 'Curated on the Krewe calendar. Fundraiser. The daily IKC sync keeps this name, time, and place.'
where source = 'ikc'
  and external_uid = 'TKF/5f53166fe9d13371e243d138/1620/29842320/0/0';

update public.events
set name = 'Krewe of Italia — Indoor bocce fundraiser / membership drive',
    end_time = timestamptz '2026-10-09 21:30:00-04',
    location = 'The Italian Club, 2nd Floor Theater, Tampa, FL',
    calendar_curated = true,
    notes = 'Curated on the Krewe calendar. The daily IKC sync keeps this name, time, and place.'
where source = 'ikc'
  and external_uid = 'TKF/5f53166fe9d13371e243d138/1618/29859690/0/0';

update public.events
set name = 'Krewe of Brigadoon — Dragons Glo Music Bingo Night',
    location = 'Gasparilla Rum Company, 2102 E 4th Ave, Tampa, FL',
    description = '$20 for 10 games. Glow accessories. Music by DJ Fletch.',
    calendar_curated = true,
    notes = 'Curated on the Krewe calendar. The daily IKC sync keeps this name, time, and place.'
where source = 'ikc'
  and external_uid = 'TKF/5f53166fe9d13371e243d138/1622/29878500/0/0';

update public.events
set name = 'Trainwrecked IV — The Reckoning',
    start_time = timestamptz '2026-11-07 16:30:00-05',
    end_time = timestamptz '2026-11-07 19:30:00-05',
    location = 'Ralph''s aka San Antonio Liquors',
    calendar_curated = true,
    notes = 'Curated on the Krewe calendar. The daily IKC sync keeps this name, time, and place.'
where source = 'ikc'
  and external_uid = 'TKF/5f53166fe9d13371e243d138/1558/29900790/0/0';

update public.events
set name = 'Les Belles Femmes — Silver Soirée (25th)',
    start_time = timestamptz '2026-11-14 18:00:00-05',
    end_time = timestamptz '2026-11-14 23:00:00-05',
    location = 'Carrollwood Country Club, 13903 Clubhouse Dr, Tampa, FL 33618',
    description = '$150',
    calendar_curated = true,
    notes = 'Curated on the Krewe calendar. Timed 6:00–11:00 PM in place of the all-day feed entry. The daily IKC sync keeps this name, time, and place.'
where source = 'ikc'
  and external_uid = 'TKF/5f53166fe9d13371e243d138/1598/29910540/0/0';

insert into public.events (
  name, description, event_type, start_time, end_time, location,
  is_public, status, source, external_uid, notes, calendar_curated
)
values
  (
    'Krewe of Brigadoon — Membership meeting + Clan 3 bowling social',
    'Membership meeting, then the Clan 3 bowling social.',
    'other',
    timestamptz '2026-09-26 18:30:00-04',
    timestamptz '2026-09-26 22:00:00-04',
    'O''Brien''s Irish Pub, 701 W Lumsden Rd, Brandon → Pinchasers Bowl, 12833 US-301',
    true, 'published', 'ikc', 'kos-curated:brigadoon-2026-09-26',
    'Curated on the Krewe calendar. Not yet on the IKC feed. The daily sync will not remove it.',
    true
  ),
  (
    'Krewe of Agustina (KOA) — Get Your Spook On',
    null,
    'other',
    timestamptz '2026-10-11 14:00:00-04',
    timestamptz '2026-10-11 16:00:00-04',
    'Dracula''s Legacy Wine Bar, 811 N Tampa St, Tampa, FL 33602',
    true, 'published', 'ikc', 'kos-curated:koa-spook-2026-10-11',
    'Curated on the Krewe calendar. Not yet on the IKC feed. The daily sync will not remove it.',
    true
  ),
  (
    '10th Annual F.R.I.E.N.D.S. Buddy Walk with Krewe of Ann Jeffrey (Team KAJ)',
    'Support for individuals with Down syndrome and families. kreweofannjeffrey.com',
    'other',
    timestamptz '2026-10-17 10:00:00-04',
    timestamptz '2026-10-17 14:00:00-04',
    'Carrollwood Village Park, 4680 W Village Dr, Tampa, FL 33624',
    true, 'published', 'ikc', 'kos-curated:buddy-walk-2026-10-17',
    'Curated on the Krewe calendar. Not yet on the IKC feed. The daily sync will not remove it.',
    true
  ),
  (
    'Ye Royal Krewe of Charlotte de Berry — Boo Bingo',
    '$20 (first bingo cards included). Costumes encouraged. Venmo @YRKOCDB. Benefits Liberty Manor for Veterans and Bloom Girls Club.',
    'other',
    timestamptz '2026-10-27 18:00:00-04',
    timestamptz '2026-10-27 21:00:00-04',
    'JF Kicks Restaurant & Patio Bar, 3345 Lithia Pinecrest Rd, Valrico, FL 33596',
    true, 'published', 'ikc', 'kos-curated:boo-bingo-2026-10-27',
    'Curated on the Krewe calendar. Not yet on the IKC feed. The daily sync will not remove it.',
    true
  ),
  (
    'Ye Loyal Krewe of Grace O''Malley — 35th Annual Celebration Ball',
    '$150. Black and white formal or krewe costume. Open bar. Cuban menu. Band: DeLeon. Installation of O''Malley XXXIV Dinah Lang Swickey. Where It All Began.',
    'other',
    timestamptz '2027-03-06 18:00:00-05',
    timestamptz '2027-03-06 23:00:00-05',
    'The Italian Club, Ybor City, Tampa, FL',
    true, 'published', 'ikc', 'kos-curated:omalley-ball-2027-03-06',
    'Curated on the Krewe calendar. Not yet on the IKC feed. The daily sync will not remove it.',
    true
  )
on conflict (external_uid) where source = 'ikc'
do update set
  name = excluded.name,
  description = excluded.description,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  location = excluded.location,
  notes = excluded.notes,
  calendar_curated = true,
  is_public = true,
  status = 'published';
