-- NOT APPLIED. Review, then run in the Supabase SQL editor on
-- oazwkwflgbthojvnclfc. The website does not run this file.
-- Safe to re-run.
--
-- Charity desk: every active member's volunteer hours for a June-May season,
-- plus approve / reject for the same people who can open that roster.
--
-- Who can read the roster and decide pending logs (kos_can_review_charity_hours):
--   * Charity chair and co-chair titles (Committee Chair of Charity,
--     Chair of Charity, Co-Chair of Charity, Charity/Fundraising, and the
--     chair_charity title key / kos_member_chairs_committee helper)
--   * Charity committee members, only when member_roles says so
--     (role = committee and the committee name matches charity or fundraising).
--     Self-picked committee interests are not a grant. Any member can save
--     those on My Krewe, so they do not open this roster.
--   * President (a title segment that is exactly President, not Vice President)
--   * Anyone who already opens the Charity section:
--     has_tool('volunteer_inquiries') or can_review_volunteer_inquiries()
--     (officers, board, captains, and the other chairs who already see it)
--   * Admins and webmasters (kos_is_site_admin, the known webmaster emails,
--     or a webmaster title)
--
-- Regular members still see only their own hours through the existing
-- volunteer_hours row security policy. This file does not add a select
-- policy. The roster is a security definer RPC that returns nothing unless
-- the check above passes.
--
-- Approvals reuse decide_volunteer_hours. The update still sets status and
-- approved, which is what kos_volunteer_hours_clover_bonus watches. Worked
-- hours that become approved earn volunteer_bonus. In-kind and rejected
-- logs do not. This file does not replace that trigger.
--
-- Depends on: members, profiles, volunteer_hours, events, member_roles,
--   kos_current_member_id(), krewe_volunteer_season_year(),
--   is_krewe_officer(), kos_is_event_hours_host().
--   Optional when present: kos_is_site_admin(), has_tool(text),
--   can_review_volunteer_inquiries(), kos_title_keys_in(text),
--   kos_member_chairs_committee(text, text).

begin;

-- ---------------------------------------------------------------------------
-- 1) Log type shown on the roster. Shift, in-kind, or season hours on file.
-- ---------------------------------------------------------------------------
create or replace function public.kos_volunteer_log_type(
  p_source text,
  p_activity text,
  p_notes text
)
returns text
language sql
immutable
set search_path to public
as $$
  select case
    when coalesce(p_source, '') = 'in_kind'
      or (coalesce(p_activity, '') || ' ' || coalesce(p_notes, '')) ~* 'in[- ]kind'
      then 'In-kind'
    when coalesce(p_source, '') = 'trackitforward_import'
      or coalesce(p_activity, '') ~* 'season hours on file'
      or coalesce(p_notes, '') ~* 'one-time season balance|season hours imported'
      then 'Season hours on file'
    else 'Shift'
  end;
$$;

comment on function public.kos_volunteer_log_type(text, text, text) is
  'Roster label: In-kind, Season hours on file, or Shift.';

revoke all on function public.kos_volunteer_log_type(text, text, text) from public, anon;
grant execute on function public.kos_volunteer_log_type(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Pending row that repeats an approved log: same member, same date, and
--    the same activity text or the same event.
-- ---------------------------------------------------------------------------
create or replace function public.kos_volunteer_hours_possible_duplicate(
  p_id uuid,
  p_member uuid,
  p_worked_on date,
  p_activity text,
  p_event uuid
)
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select p_member is not null
     and p_worked_on is not null
     and exists (
       select 1
       from public.volunteer_hours o
       where o.member_id = p_member
         and o.id is distinct from p_id
         and coalesce(o.is_demo, false) = false
         and (o.status = 'approved' or (o.approved and o.status is distinct from 'rejected'))
         and o.worked_on = p_worked_on
         and (
           (
             length(btrim(coalesce(p_activity, ''))) > 0
             and lower(btrim(o.activity)) = lower(btrim(p_activity))
           )
           or (p_event is not null and o.event_id = p_event)
         )
     );
$$;

comment on function public.kos_volunteer_hours_possible_duplicate(uuid, uuid, date, text, uuid) is
  'True when a pending log matches an approved log for the same member, date, and activity or event.';

revoke all on function public.kos_volunteer_hours_possible_duplicate(uuid, uuid, date, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Who may open the roster and decide hours from the Charity section.
-- ---------------------------------------------------------------------------
create or replace function public.kos_can_review_charity_hours()
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_member uuid;
  v_title text := '';
  v_email text := '';
  v_status text := '';
  v_ok boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  if to_regprocedure('public.kos_is_site_admin()') is not null then
    execute 'select public.kos_is_site_admin()' into v_ok;
    if coalesce(v_ok, false) then
      return true;
    end if;
  end if;

  v_member := public.kos_current_member_id();
  if v_member is not null then
    select coalesce(m.officer_title, ''),
           lower(coalesce(m.email, '')),
           coalesce(m.membership_status, '')
      into v_title, v_email, v_status
    from public.members m
    where m.id = v_member
      and m.merged_into is null;
  end if;

  if coalesce(v_email, '') = '' then
    begin
      v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    exception when undefined_function then
      v_email := '';
    end;
  end if;

  if v_email in (
    'melissajotully@gmail.com',
    'melissa@encountive.com',
    'dougtully@protonmail.com',
    'doug@encountive.com',
    'doug@theonefor.ai'
  ) or coalesce(v_title, '') ~* 'webmaster' then
    return true;
  end if;

  if v_member is null or v_status not in ('active', 'pending-renewal') then
    return false;
  end if;

  -- President only. Vice President is a different title segment.
  if exists (
    select 1
    from unnest(regexp_split_to_array(coalesce(v_title, ''), '\s*[·|,;]\s*')) seg
    where lower(btrim(seg)) = 'president'
  ) then
    return true;
  end if;

  if to_regprocedure('public.kos_title_keys_in(text)') is not null then
    execute $sql$
      select 'president' = any (public.kos_title_keys_in($1))
          or 'chair_charity' = any (public.kos_title_keys_in($1))
    $sql$
      into v_ok
      using v_title;
    if coalesce(v_ok, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.kos_member_chairs_committee(text, text)') is not null then
    execute $sql$
      select public.kos_member_chairs_committee($1, $2)
          or public.kos_member_chairs_committee($1, $3)
    $sql$
      into v_ok
      using v_title, 'Charity/Fundraising', 'Charity';
    if coalesce(v_ok, false) then
      return true;
    end if;
  end if;

  -- Chair or co-chair segment that names Charity. One title string can hold
  -- several jobs, so each segment is checked on its own.
  if exists (
    select 1
    from unnest(regexp_split_to_array(coalesce(v_title, ''), '\s*[·|,;]\s*')) seg
    where btrim(seg) ~* 'charit'
      and btrim(seg) ~* '(co[ -]?chair|committee chair|\ychair\y)'
  ) then
    return true;
  end if;

  -- Assigned Charity committee membership. Not a profile interest checkbox.
  if to_regclass('public.member_roles') is not null and exists (
    select 1
    from public.member_roles r
    where r.user_id = auth.uid()
      and r.role = 'committee'
      and coalesce(r.committee, '') ~* 'charit|fundrais'
  ) then
    return true;
  end if;

  -- Officers and chairs who already open the Charity section (Volunteer inquiries).
  if to_regprocedure('public.has_tool(text)') is not null then
    execute 'select public.has_tool($1)' into v_ok using 'volunteer_inquiries';
    if coalesce(v_ok, false) then
      return true;
    end if;
  end if;

  if to_regprocedure('public.can_review_volunteer_inquiries()') is not null then
    execute 'select public.can_review_volunteer_inquiries()' into v_ok;
    if coalesce(v_ok, false) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

comment on function public.kos_can_review_charity_hours() is
  'Charity chairs and co-chairs, Charity committee member_roles, President, people who already open the Charity section, and admins or webmasters. Not regular members, and not a self-picked committee interest.';

revoke all on function public.kos_can_review_charity_hours() from public, anon;
grant execute on function public.kos_can_review_charity_hours() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Roster. One row per active member, logs for the selected season.
--    season_year is the year the June-May season ends (2027 = June 2026
--    through May 2027). Null uses the current season.
-- ---------------------------------------------------------------------------
create index if not exists volunteer_hours_member_season_idx
  on public.volunteer_hours (member_id, season_year);

create or replace function public.list_charity_volunteer_hours(p_season integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_season integer;
  v_members jsonb;
  v_pending jsonb;
  v_seasons jsonb;
begin
  if auth.uid() is null or not public.kos_can_review_charity_hours() then
    return jsonb_build_object(
      'ok', false,
      'message', 'You cannot view other members'' volunteer hours.'
    );
  end if;

  v_season := p_season;
  if v_season is null then
    v_season := public.krewe_volunteer_season_year(current_date);
  end if;
  if v_season < 2000 or v_season > 2100 then
    return jsonb_build_object('ok', false, 'message', 'Pick a season year between 2000 and 2100.');
  end if;

  with active as (
    select
      m.id,
      m.first_name,
      m.last_name,
      coalesce(m.membership_level, 'full') as membership_level,
      m.membership_status
    from public.members m
    where m.merged_into is null
      and coalesce(m.member_role, '') <> 'prospect'
      and m.membership_status in ('active', 'pending-renewal')
  ),
  log_rows as (
    select
      v.id,
      v.member_id,
      v.season_year,
      v.activity,
      v.hours,
      v.worked_on,
      v.approved,
      v.source,
      v.notes,
      v.review_note,
      v.event_id,
      e.name as event_name,
      public.kos_volunteer_log_type(v.source, v.activity, v.notes) as type_label,
      case
        when v.status = 'rejected' then 'rejected'
        when v.status = 'approved' or (v.approved and v.status is distinct from 'rejected') then 'approved'
        else 'pending'
      end as norm_status,
      (
        select nullif(btrim(coalesce(rm.first_name, '') || ' ' || coalesce(rm.last_name, '')), '')
        from public.profiles rp
        join public.members rm on rm.id = rp.member_id
        where rp.id = v.reviewed_by
      ) as approved_by
    from public.volunteer_hours v
    join active a on a.id = v.member_id
    left join public.events e on e.id = v.event_id
    where v.season_year = v_season
      and coalesce(v.is_demo, false) = false
  ),
  shaped as (
    select
      a.last_name,
      a.first_name,
      jsonb_build_object(
        'member_id', a.id,
        'first_name', a.first_name,
        'last_name', a.last_name,
        'name', nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
        'membership_level', a.membership_level,
        'membership_status', a.membership_status,
        'hours_approved', coalesce(s.approved_hours, 0),
        'hours_pending', coalesce(s.pending_hours, 0),
        'hours_needed', case
          when a.membership_level = 'full' then greatest(0, 12 - coalesce(s.approved_hours, 0))
          else null
        end,
        'buyout_estimate', case
          when a.membership_level = 'full' then greatest(0, 12 - coalesce(s.approved_hours, 0)) * 12
          else null
        end,
        'log_count', coalesce(s.log_count, 0),
        'logs', coalesce(s.logs, '[]'::jsonb)
      ) as member_row
    from active a
    left join lateral (
      select
        sum(l.hours) filter (where l.norm_status = 'approved') as approved_hours,
        sum(l.hours) filter (where l.norm_status = 'pending') as pending_hours,
        count(*)::int as log_count,
        jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'member_id', l.member_id,
            'season_year', l.season_year,
            'worked_on', l.worked_on,
            'activity', l.activity,
            'event_id', l.event_id,
            'event_name', l.event_name,
            'hours', l.hours,
            'source', l.source,
            'notes', l.notes,
            'review_note', l.review_note,
            'type_label', l.type_label,
            'status', l.norm_status,
            'approved_by', l.approved_by,
            'possible_duplicate', case
              when l.norm_status = 'pending' then public.kos_volunteer_hours_possible_duplicate(
                l.id, l.member_id, l.worked_on, l.activity, l.event_id
              )
              else false
            end
          )
          order by l.worked_on desc nulls last, l.id
        ) as logs
      from log_rows l
      where l.member_id = a.id
    ) s on true
  )
  select coalesce(jsonb_agg(member_row order by last_name, first_name), '[]'::jsonb)
    into v_members
  from shaped;

  select coalesce(jsonb_agg(item order by item->>'worked_on', item->>'member_name'), '[]'::jsonb)
    into v_pending
  from (
    select jsonb_build_object(
      'id', log->>'id',
      'member_id', log->>'member_id',
      'member_name', m->>'name',
      'worked_on', log->>'worked_on',
      'activity', log->>'activity',
      'event_id', log->>'event_id',
      'event_name', log->>'event_name',
      'hours', log->'hours',
      'source', log->>'source',
      'notes', log->>'notes',
      'type_label', log->>'type_label',
      'status', log->>'status',
      'possible_duplicate', coalesce((log->>'possible_duplicate')::boolean, false),
      'duplicate_note', case
        when coalesce((log->>'possible_duplicate')::boolean, false)
          then 'Possible duplicate of an approved log for the same day and the same activity or event.'
        else null
      end
    ) as item
    from jsonb_array_elements(v_members) m
    cross join lateral jsonb_array_elements(coalesce(m->'logs', '[]'::jsonb)) log
    where log->>'status' = 'pending'
  ) pending_rows;

  select coalesce(jsonb_agg(y order by y desc), '[]'::jsonb)
    into v_seasons
  from (
    select distinct v.season_year as y
    from public.volunteer_hours v
    join public.members m on m.id = v.member_id
    where m.merged_into is null
      and coalesce(m.member_role, '') <> 'prospect'
      and m.membership_status in ('active', 'pending-renewal')
      and coalesce(v.is_demo, false) = false
    union
    select v_season
  ) seasons;

  return jsonb_build_object(
    'ok', true,
    'season_year', v_season,
    'season_label', 'June ' || (v_season - 1)::text || ' through May ' || v_season::text,
    'seasons', v_seasons,
    'required_hours', 12,
    'buyout_rate', 12,
    'members', v_members,
    'pending', v_pending
  );
end;
$$;

comment on function public.list_charity_volunteer_hours(integer) is
  'Read-only season roster of active members'' volunteer hours. Empty unless kos_can_review_charity_hours() is true. Full members show hours still needed toward 12 and the $12 buyout. Other levels do not.';

revoke all on function public.list_charity_volunteer_hours(integer) from public, anon;
grant execute on function public.list_charity_volunteer_hours(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Pending queue. Officers, Approvals-tool holders, event hosts, and the
--    Charity review group. Hosts still see only their events. The Charity
--    group sees every pending log, same as an officer.
-- ---------------------------------------------------------------------------
create or replace function public.list_pending_volunteer_hours()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_reviewer boolean := false;
  v_host boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('viewer', 'none', 'hours', '[]'::jsonb);
  end if;

  v_reviewer := public.is_krewe_officer() or public.kos_can_review_charity_hours();
  if not v_reviewer and to_regprocedure('public.has_tool(text)') is not null then
    execute 'select public.has_tool($1)' into v_reviewer using 'approvals';
  end if;

  v_host := exists (
    select 1 from public.events e where e.created_by = auth.uid()
  ) or exists (
    select 1
    from public.event_signups s
    where s.member_id = public.kos_current_member_id()
      and s.signup_role = 'organizer'
      and s.status in ('registered', 'confirmed', 'attended')
  );

  if not v_reviewer and not v_host then
    return jsonb_build_object('viewer', 'none', 'hours', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'viewer', case when v_reviewer then 'officer' else 'host' end,
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'member_id', v.member_id,
        'member_name', trim(both ' ' from coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
        'hours', v.hours,
        'activity', v.activity,
        'worked_on', v.worked_on,
        'event_id', v.event_id,
        'event_name', e.name,
        'source', v.source,
        'type_label', public.kos_volunteer_log_type(v.source, v.activity, v.notes),
        'status', v.status,
        'notes', v.notes,
        'created_at', v.created_at,
        'possible_duplicate', public.kos_volunteer_hours_possible_duplicate(
          v.id, v.member_id, v.worked_on, v.activity, v.event_id
        ),
        'duplicate_note', case
          when public.kos_volunteer_hours_possible_duplicate(
            v.id, v.member_id, v.worked_on, v.activity, v.event_id
          )
            then 'Possible duplicate of an approved log for the same day and the same activity or event.'
          else null
        end
      ) order by v.created_at)
      from public.volunteer_hours v
      join public.members m on m.id = v.member_id
      left join public.events e on e.id = v.event_id
      where v.status = 'pending'
        and coalesce(v.is_demo, false) = false
        and (
          v_reviewer
          or public.kos_is_event_hours_host(v.event_id)
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_pending_volunteer_hours() from public, anon;
grant execute on function public.list_pending_volunteer_hours() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Approve or reject. Same write as before so the Clover trigger runs:
--    status and approved change, volunteer_bonus is awarded or removed.
--    Charity reviewers may decide any pending log. Hosts stay limited to
--    events they host. A review note is optional.
-- ---------------------------------------------------------------------------
create or replace function public.decide_volunteer_hours(
  p_id uuid,
  p_approved boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_row public.volunteer_hours%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reviewer boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to review hours.');
  end if;

  select * into v_row from public.volunteer_hours where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That hours log was not found.');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'message', 'That hours log is already decided.');
  end if;

  v_reviewer := public.is_krewe_officer() or public.kos_can_review_charity_hours();
  if not v_reviewer and to_regprocedure('public.has_tool(text)') is not null then
    execute 'select public.has_tool($1)' into v_reviewer using 'approvals';
  end if;

  if not (
    v_reviewer
    or (v_row.event_id is not null and public.kos_is_event_hours_host(v_row.event_id))
  ) then
    return jsonb_build_object('ok', false, 'message', 'You can only confirm hours for events you host.');
  end if;

  if char_length(coalesce(v_note, '')) > 500 then
    return jsonb_build_object('ok', false, 'message', 'Keep the note under 500 characters.');
  end if;

  -- status and approved are the columns kos_volunteer_hours_clover_bonus
  -- listens to. Do not decide hours by writing a side table instead.
  update public.volunteer_hours
     set approved = coalesce(p_approved, false),
         status = case when coalesce(p_approved, false) then 'approved' else 'rejected' end,
         review_note = v_note,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id
     and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'status', case when coalesce(p_approved, false) then 'approved' else 'rejected' end
  );
end;
$$;

comment on function public.decide_volunteer_hours(uuid, boolean, text) is
  'Approve or reject a pending volunteer log. Officers, Approvals holders, Charity reviewers, and event hosts. The volunteer_hours status update keeps the Clover volunteer_bonus trigger.';

revoke all on function public.decide_volunteer_hours(uuid, boolean, text) from public, anon;
grant execute on function public.decide_volunteer_hours(uuid, boolean, text) to authenticated;

commit;
